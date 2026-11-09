import { randomUUID } from "crypto";
import type { Db } from "mongodb";
import { attemptScore, countFillerWords, weakestMetric } from "@/lib/scoring";
import type { AttemptResult, SaveAttemptPayload } from "@/types";
import { requireDb } from "../db/client";
import type { AssignmentDoc, AttemptDoc, ModuleDoc, StudentDoc, UserDoc } from "../db/schemas";
import { AppError, forbidden, notFound } from "../errors";
import { toAttemptResult } from "./attempt.mapper";
import { SettingsService } from "./settings.service";
import { StorageService } from "./storage.service";
import { invalidateRosterCache } from "./student.service";
import { TranscriptionService } from "./transcription.service";

const LOW_SCORE_THRESHOLD = 50;
const SEVERE_DROP_THRESHOLD = -10;
const MAX_ATTEMPTS_RETURNED = 500;

/**
 * The target length comes from the module or assignment on the server. Trusting the client would
 * let anyone claim a 100% completion score by sending a tiny target.
 */
async function resolveTargetDuration(
  db: Db,
  payload: SaveAttemptPayload,
  assignmentId: string | undefined,
): Promise<number | undefined> {
  if (assignmentId) {
    const assignment = await db
      .collection<AssignmentDoc>("assignments")
      .findOne({ id: assignmentId }, { projection: { durationSec: 1 } });
    if (assignment?.durationSec) return assignment.durationSec;
  } else if (payload.moduleId) {
    const module = await db
      .collection<ModuleDoc>("modules")
      .findOne({ id: payload.moduleId }, { projection: { durationSec: 1 } });
    if (module?.durationSec) return module.durationSec;
  }
  return payload.result.targetDurationSec;
}

/**
 * Updates the roster summary and creates a low-score flag. Failures are logged and do not fail the
 * save, because by this point the student's recording is already safely stored.
 */
async function updateStudentSummary(db: Db, attempt: AttemptDoc): Promise<void> {
  const score = attemptScore(attempt);
  const focus = weakestMetric(attempt);

  const previous = await db.collection<AttemptDoc>("attempts").findOne(
    { studentId: attempt.studentId, id: { $ne: attempt.id } },
    {
      sort: { createdAt: -1 },
      projection: {
        durationSec: 1,
        targetDurationSec: 1,
        pronunciation: 1,
        vocabulary: 1,
        grammar: 1,
      },
    },
  );
  const trendPct = previous ? score - attemptScore(previous) : 0;

  const user = await db
    .collection<UserDoc>("users")
    .findOne(
      { $or: [{ id: attempt.studentId }, { email: attempt.studentId.toLowerCase() }] },
      { projection: { name: 1, email: 1, sessionSeason: 1, batchTime: 1 } },
    );

  const isLowScore = score < LOW_SCORE_THRESHOLD;

  if (isLowScore) {
    const openFlag = await db
      .collection("flags")
      .findOne(
        { studentId: attempt.studentId, type: "low_score", status: "pending" },
        { projection: { _id: 1 } },
      );
    if (!openFlag) {
      await db.collection("flags").insertOne({
        id: `flag-${Date.now()}-${randomUUID().slice(0, 6)}`,
        studentId: attempt.studentId,
        studentName: user?.name ?? attempt.studentId,
        studentEmail: user?.email,
        attemptId: attempt.id,
        attemptPrompt: attempt.prompt,
        attemptDurationSec: attempt.durationSec,
        audioUrl: attempt.audioUrl,
        type: "low_score",
        category: "Low Fluency Score",
        studentNote: `Automated alert: Scored ${score}% on "${attempt.prompt?.substring(0, 40)}"`,
        status: "pending",
        scorePct: score,
        createdAt: new Date(),
      });
    }
  }

  const flagReason = isLowScore
    ? `${focus} ${score}% · Low Score`
    : trendPct <= SEVERE_DROP_THRESHOLD
      ? `Score down ${Math.abs(trendPct)}%`
      : undefined;

  const sessionSeason = user?.sessionSeason || "summer";
  const batchTime = user?.batchTime || "morning";

  // A single upsert avoids a race between checking for the document and inserting it.
  await db.collection<StudentDoc>("students").updateOne(
    { id: attempt.studentId },
    {
      $set: {
        name: user?.name ?? attempt.studentId,
        lastActive: "Today",
        scorePct: score,
        trendPct,
        focus,
        waveform: attempt.waveform,
        updatedAt: new Date(),
        ...(isLowScore ? { status: "flagged" as const } : {}),
        ...(flagReason ? { flagReason } : {}),
      },
      ...(flagReason ? {} : { $unset: { flagReason: "" } }),
      $setOnInsert: {
        sessionSeason,
        batchTime,
        batchId: `${sessionSeason}-${batchTime}`,
        ...(isLowScore ? {} : { status: "on-track" as const }),
      },
    },
    { upsert: true },
  );

  invalidateRosterCache();
}

/**
 * Runs the full-audio transcription pass. A student's own correction is never overwritten, and a
 * pass that produces nothing is recorded as failed instead of being reported as complete.
 */
async function runBackgroundTranscription(
  db: Db,
  attemptId: string,
  audioId: string,
  mimeType: string,
  prompt: string,
  isOnlyTranscript: boolean,
): Promise<void> {
  const attempts = db.collection<AttemptDoc>("attempts");
  let transcribed = false;

  try {
    const audio = await StorageService.getAudioBuffer(audioId);
    if (audio && audio.buffer.length > 2000) {
      const result = await TranscriptionService.transcribeAudio(
        audio.buffer,
        mimeType || audio.mimeType,
        prompt,
      );
      const text = result.transcript?.trim();
      if (text) {
        await attempts.updateOne(
          { id: attemptId, manuallyEdited: { $ne: true } },
          {
            $set: {
              transcript: text,
              fillerCount: result.fillerCount,
              pauseCount: result.pauseCount,
              transcriptionStatus: "completed",
            },
          },
        );
        transcribed = true;
      }
    }
  } catch (err) {
    console.warn("[AttemptService] Background transcription failed:", (err as Error).message);
  } finally {
    if (!transcribed && isOnlyTranscript) {
      await attempts
        .updateOne(
          { id: attemptId, transcriptionStatus: "processing" },
          { $set: { transcriptionStatus: "failed" } },
        )
        .catch(() => {});
    }
  }
}

export class AttemptService {
  /**
   * Fetch attempts for a given student with audio playback and transcripts
   */
  static async getStudentAttempts(studentId: string): Promise<AttemptResult[]> {
    const db = await requireDb();

    // Older records may have stored the student's email in place of their ID.
    const user = await db.collection<UserDoc>("users").findOne(
      {
        $or: [
          { id: studentId },
          { email: studentId.toLowerCase() },
          { username: studentId.toLowerCase() },
        ],
      },
      { projection: { id: 1, email: 1 } },
    );
    const ids = [...new Set([studentId, user?.id, user?.email].filter(Boolean) as string[])];

    const docs = await db
      .collection<AttemptDoc>("attempts")
      .find({ studentId: { $in: ids } })
      .sort({ createdAt: -1 })
      .limit(MAX_ATTEMPTS_RETURNED)
      .toArray();

    return docs.map(toAttemptResult);
  }

  /**
   * Stores the recording, then saves the attempt. Any failure is reported to the caller, so the
   * client can keep the recording and offer a retry. The same attempt ID may be sent again safely:
   * if the first try succeeded but its response was lost, the existing attempt is returned.
   */
  static async saveAttempt(
    payload: SaveAttemptPayload,
  ): Promise<{ success: boolean; id: string; audioUrl?: string }> {
    const db = await requireDb();
    const attempts = db.collection<AttemptDoc>("attempts");
    const attemptId = payload.result.id;

    const existing = await attempts.findOne(
      { id: attemptId },
      { projection: { studentId: 1, audioUrl: 1 } },
    );
    if (existing) {
      if (existing.studentId !== payload.studentId) {
        throw new AppError("This recording could not be saved. Please record it again.", 409);
      }
      return { success: true, id: attemptId, audioUrl: existing.audioUrl ?? undefined };
    }

    // Only inline audio is accepted. A client-supplied URL or ID is ignored: it could point to an
    // external site, or claim another student's recording.
    const dataUri = payload.result.audioUrl?.startsWith("data:")
      ? payload.result.audioUrl
      : undefined;
    const stored = dataUri
      ? await StorageService.saveAudio(dataUri, `student-${payload.studentId}-${Date.now()}.webm`)
      : null;

    const transcript = payload.result.transcript?.trim() || "";
    const assignmentId = payload.assignmentId || payload.result.assignmentId;
    const settings = stored ? await SettingsService.getSettings() : null;
    const willTranscribe = Boolean(stored && settings?.postTranscriptionEnabled !== false);

    const attemptDoc: AttemptDoc = {
      id: attemptId,
      studentId: payload.studentId,
      moduleId: payload.moduleId,
      assignmentId,
      assignmentTitle: payload.result.assignmentTitle,
      prompt: payload.result.prompt,
      transcript,
      // Left out entirely when there is no audio. The driver would store undefined as null.
      ...(stored
        ? {
            audioId: stored.audioId,
            audioUrl: stored.url,
            audioMimeType: stored.mimeType,
            audioSize: stored.size,
          }
        : {}),
      transcriptionStatus: willTranscribe && !transcript ? "processing" : "completed",
      durationSec: payload.result.durationSec,
      targetDurationSec: await resolveTargetDuration(db, payload, assignmentId),
      pronunciation: payload.result.pronunciation,
      vocabulary: payload.result.vocabulary,
      grammar: payload.result.grammar,
      fillerCount: payload.result.fillerCount ?? 0,
      pauseCount: payload.result.pauseCount ?? 0,
      feedback: payload.result.feedback,
      waveform: payload.result.waveform,
      createdAt: new Date(),
    };

    try {
      await attempts.insertOne(attemptDoc);
    } catch (err) {
      // Lost a race with a retry of this same attempt: remove our duplicate audio and succeed.
      if ((err as { code?: number }).code === 11000) {
        if (stored) void StorageService.deleteAudio(stored.audioId);
        const winner = await attempts.findOne(
          { id: attemptId, studentId: payload.studentId },
          { projection: { audioUrl: 1 } },
        );
        if (winner) return { success: true, id: attemptId, audioUrl: winner.audioUrl };
        throw new AppError("This recording could not be saved. Please record it again.", 409);
      }
      // Nothing references the stored audio, so don't leave it behind.
      if (stored) void StorageService.deleteAudio(stored.audioId);
      throw err;
    }

    // The attempt is saved. Everything below is best-effort and must not fail the request.
    await updateStudentSummary(db, attemptDoc).catch((err) => {
      console.error("[AttemptService] Could not update student summary:", (err as Error).message);
    });

    if (stored && willTranscribe) {
      void runBackgroundTranscription(
        db,
        attemptId,
        stored.audioId,
        stored.mimeType,
        attemptDoc.prompt,
        !transcript,
      ).catch((err) => {
        console.warn("[AttemptService] Background job error:", (err as Error).message);
      });
    }

    return { success: true, id: attemptId, audioUrl: stored?.url };
  }

  /**
   * Fetch attempt result by ID
   */
  static async getAttemptById(attemptId: string): Promise<AttemptResult> {
    const db = await requireDb();
    const doc = await db.collection<AttemptDoc>("attempts").findOne({ id: attemptId });
    if (!doc) throw notFound("This recording could not be found.");
    return toAttemptResult(doc);
  }

  /**
   * Save or update teacher feedback on an attempt, and on the student's other attempts at the same
   * assignment.
   */
  static async saveTeacherFeedback(attemptId: string, feedback: string): Promise<boolean> {
    const db = await requireDb();
    const attempts = db.collection<AttemptDoc>("attempts");

    const attempt = await attempts.findOne(
      { id: attemptId },
      { projection: { studentId: 1, assignmentId: 1 } },
    );
    if (!attempt) return false;

    await attempts.updateMany(
      attempt.assignmentId
        ? { studentId: attempt.studentId, assignmentId: attempt.assignmentId }
        : { id: attemptId },
      { $set: { teacherFeedback: feedback } },
    );
    return true;
  }

  /**
   * Update an attempt's transcript (students or teachers correcting transcription mistakes).
   * Automatically recalculates filler words, vocabulary metrics, and speech feedback.
   */
  static async updateTranscript(
    attemptId: string,
    newTranscript: string,
    requestingUserId: string,
    isFaculty: boolean = false,
  ): Promise<AttemptResult> {
    const db = await requireDb();
    const attempts = db.collection<AttemptDoc>("attempts");

    const attempt = await attempts.findOne({ id: attemptId });
    if (!attempt) throw notFound("This recording could not be found.");

    if (!isFaculty && attempt.studentId !== requestingUserId) {
      throw forbidden("You can only edit your own speaking attempt.");
    }

    const trimmed = newTranscript.trim();
    if (!trimmed) throw new AppError("Transcript cannot be empty.");

    const fillerCount = countFillerWords(trimmed);
    const words = trimmed.split(/\s+/).filter(Boolean);

    // Adjust vocabulary slightly based on word variety
    let vocabScore = attempt.vocabulary ?? 75;
    if (words.length > 10) {
      const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z]/g, "")));
      const diversity = uniqueWords.size / words.length;
      vocabScore = Math.min(98, Math.max(60, Math.round(55 + diversity * 40)));
    }

    // Fewer fillers means a higher fluency score
    const pronScore = Math.min(98, Math.max(50, 92 - Math.min(25, fillerCount * 4)));

    await attempts.updateOne(
      { id: attemptId },
      {
        $set: {
          transcript: trimmed,
          fillerCount,
          pronunciation: pronScore,
          vocabulary: vocabScore,
          transcriptionStatus: "completed",
          manuallyEdited: true,
        },
      },
    );

    invalidateRosterCache();
    return await this.getAttemptById(attemptId);
  }
}
