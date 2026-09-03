import { getDb } from "../db/client";
import type { AttemptDoc, StudentDoc, ModuleDoc, UserDoc } from "../db/schemas";
import type { AttemptResult, SaveAttemptPayload } from "@/types";
import { makeSampleWaveform } from "@/components/tarang/Waveform";
import { StorageService } from "./storage.service";
import { TranscriptionService } from "./transcription.service";

export class AttemptService {
  /**
   * Fetch attempts for a given student with audio playback and transcripts
   */
  static async getStudentAttempts(studentId: string): Promise<AttemptResult[]> {
    try {
      const db = await getDb();
      if (db) {
        // Also support finding attempts if studentId was passed as email or username
        let searchId = studentId;
        const user = await db.collection<UserDoc>("users").findOne({
          $or: [
            { id: studentId },
            { email: studentId.toLowerCase() },
            { username: studentId.toLowerCase() },
          ],
        });
        if (user) {
          searchId = user.id;
        }

        const docs = await db
          .collection<AttemptDoc>("attempts")
          .find({ $or: [{ studentId }, { studentId: searchId }] })
          .sort({ createdAt: -1 })
          .toArray();

        return docs.map((doc) => ({
          id: doc.id,
          studentId: doc.studentId,
          moduleId: doc.moduleId,
          assignmentId: doc.assignmentId,
          assignmentTitle: doc.assignmentTitle,
          prompt: doc.prompt,
          transcript: doc.transcript || "",
          audioId: doc.audioId,
          audioUrl: doc.audioUrl,
          audioMimeType: doc.audioMimeType,
          audioSize: doc.audioSize,
          transcriptionStatus: doc.transcriptionStatus || "completed",
          durationSec: doc.durationSec,
          targetDurationSec: doc.targetDurationSec,
          pronunciation: doc.pronunciation,
          vocabulary: doc.vocabulary,
          grammar: doc.grammar,
          fillerCount: doc.fillerCount,
          pauseCount: doc.pauseCount,
          feedback: doc.feedback,
          teacherFeedback: doc.teacherFeedback,
          waveform: doc.waveform,
          createdAt: doc.createdAt
            ? new Date(doc.createdAt).toISOString()
            : new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.error("[AttemptService.getStudentAttempts Error]", err);
    }
    return [];
  }

  /**
   * Save student practice/homework attempt, store audio persistently, and generate transcript
   */
  static async saveAttempt(
    payload: SaveAttemptPayload,
  ): Promise<{ success: boolean; id: string; audioUrl?: string }> {
    try {
      const db = await getDb();
      if (db) {
        let finalAudioUrl = payload.result.audioUrl;
        let audioId = payload.result.audioId;
        let audioMimeType = payload.result.audioMimeType || "audio/webm";
        let audioSize = payload.result.audioSize || 0;
        let transcript = payload.result.transcript?.trim() || "";
        let fillerCount = payload.result.fillerCount ?? 0;
        let pauseCount = payload.result.pauseCount ?? 0;
        let transcriptionStatus: "completed" | "failed" = "completed";

        // 1. If audio is provided as Base64 Data URI or binary string, store in GridFS / disk
        if (
          payload.result.audioUrl &&
          (payload.result.audioUrl.startsWith("data:") || payload.result.audioUrl.length > 200)
        ) {
          try {
            console.log(
              `[AttemptService] Persisting audio recording for student ${payload.studentId}...`,
            );
            const stored = await StorageService.saveAudio(
              payload.result.audioUrl,
              `student-${payload.studentId}-${Date.now()}.webm`,
              audioMimeType,
            );
            audioId = stored.audioId;
            finalAudioUrl = stored.url;
            audioMimeType = stored.mimeType;
            audioSize = stored.size;
            console.log(
              `[AttemptService] Audio stored successfully at permanent URL: ${finalAudioUrl} (${audioSize} bytes)`,
            );

            // 2. Server-side Transcription Pipeline
            if (
              !transcript ||
              transcript.startsWith("Spoken response recorded by") ||
              transcript.startsWith("Speech Practice")
            ) {
              const audioBufferRes = await StorageService.getAudioBuffer(audioId);
              if (audioBufferRes) {
                console.log(
                  `[AttemptService] Running server transcription for audio ${audioId}...`,
                );
                const transRes = await TranscriptionService.transcribeAudio(
                  audioBufferRes.buffer,
                  audioBufferRes.mimeType,
                  payload.result.prompt,
                );
                transcript = transRes.transcript;
                fillerCount = transRes.fillerCount;
                pauseCount = transRes.pauseCount;
                transcriptionStatus = transRes.status;
                console.log(
                  `[AttemptService] Transcription generated (${transRes.engineUsed}): "${transcript.substring(0, 60)}..."`,
                );
              }
            } else {
              // Real verbatim transcript captured from student's speech
              fillerCount = TranscriptionService.countFillers(transcript);
              transcriptionStatus = "completed";
              console.log(
                `[AttemptService] Using verbatim student speech transcript: "${transcript}"`,
              );
            }
          } catch (storageErr) {
            console.error("[AttemptService] Audio persistence failed, falling back:", storageErr);
          }
        }

        const attemptDoc: AttemptDoc = {
          id: payload.result.id,
          studentId: payload.studentId,
          moduleId: payload.moduleId,
          assignmentId: payload.assignmentId || payload.result.assignmentId,
          assignmentTitle: payload.result.assignmentTitle,
          prompt: payload.result.prompt,
          transcript: transcript || "",
          audioId,
          audioUrl: finalAudioUrl,
          audioMimeType,
          audioSize,
          transcriptionStatus,
          durationSec: payload.result.durationSec,
          targetDurationSec: payload.result.targetDurationSec,
          pronunciation: payload.result.pronunciation,
          vocabulary: payload.result.vocabulary,
          grammar: payload.result.grammar,
          fillerCount,
          pauseCount,
          feedback: payload.result.feedback,
          waveform: payload.result.waveform,
          createdAt: new Date(),
        };

        await db.collection<AttemptDoc>("attempts").insertOne(attemptDoc);

        // Compute completion percentage score based on recorded duration vs target duration (same as student dashboard)
        const avgScore =
          payload.result.targetDurationSec && payload.result.targetDurationSec > 0
            ? Math.min(
                100,
                Math.round((payload.result.durationSec / payload.result.targetDurationSec) * 100),
              )
            : Math.round(
                (payload.result.pronunciation +
                  payload.result.vocabulary +
                  payload.result.grammar) /
                  3,
              );

        // Derive the weakest metric to show as "focus" area for the teacher
        const { pronunciation, vocabulary, grammar } = payload.result;
        let focus = "—";
        const minScore = Math.min(pronunciation, vocabulary, grammar);
        if (minScore === pronunciation) focus = "Pronunciation";
        else if (minScore === vocabulary) focus = "Vocabulary";
        else focus = "Grammar";

        // Compute trendPct from previous attempt's completion score (if one exists)
        const prevAttempt = await db
          .collection<AttemptDoc>("attempts")
          .findOne(
            { studentId: payload.studentId, id: { $ne: payload.result.id } },
            { sort: { createdAt: -1 } },
          );
        let prevScore = avgScore;
        if (prevAttempt) {
          if (prevAttempt.targetDurationSec && prevAttempt.targetDurationSec > 0) {
            prevScore = Math.min(
              100,
              Math.round((prevAttempt.durationSec / prevAttempt.targetDurationSec) * 100),
            );
          } else {
            prevScore = Math.round(
              ((prevAttempt.pronunciation ?? 70) +
                (prevAttempt.vocabulary ?? 70) +
                (prevAttempt.grammar ?? 70)) /
                3,
            );
          }
        }
        const trendPct = avgScore - prevScore;

        // Check if student doc exists in students collection; if not, sync from users collection
        const studentExists = await db
          .collection<StudentDoc>("students")
          .findOne({ id: payload.studentId });

        if (!studentExists) {
          const userDoc = await db.collection<UserDoc>("users").findOne({
            $or: [{ id: payload.studentId }, { email: payload.studentId.toLowerCase() }],
          });
          const studentName = userDoc ? userDoc.name : payload.studentId;
          const sessionSeason = userDoc?.sessionSeason || "summer";
          const batchTime = userDoc?.batchTime || "morning";

          await db.collection<StudentDoc>("students").insertOne({
            id: payload.studentId,
            name: studentName,
            status: "on-track",
            focus,
            lastActive: "Today",
            scorePct: avgScore,
            trendPct,
            waveform:
              payload.result.waveform.length > 0
                ? payload.result.waveform
                : makeSampleWaveform(10, 40, 0.2),
            sessionSeason,
            batchTime,
            batchId: `${sessionSeason}-${batchTime}`,
            updatedAt: new Date(),
          });
        } else {
          // Build flagReason from real data: inactivity days + current score
          const inactiveDays = 0; // just submitted so always 0 here
          const flagReason =
            avgScore < 50
              ? `${focus} ${avgScore}% · Score low`
              : trendPct <= -10
                ? `Score down ${Math.abs(trendPct)}%`
                : inactiveDays > 4
                  ? `Inactive ${inactiveDays}d`
                  : undefined;

          await db.collection<StudentDoc>("students").updateOne(
            { id: payload.studentId },
            {
              $set: {
                lastActive: "Today",
                scorePct: avgScore,
                trendPct,
                focus,
                ...(flagReason !== undefined ? { flagReason } : {}),
                waveform: payload.result.waveform,
                updatedAt: new Date(),
              },
            },
          );
        }

        return { success: true, id: payload.result.id, audioUrl: finalAudioUrl };
      }
    } catch (err) {
      console.error("[AttemptService.saveAttempt Error]", err);
    }
    return { success: true, id: payload.result.id };
  }

  /**
   * Fetch attempt result by ID
   */
  static async getAttemptById(attemptId: string): Promise<AttemptResult> {
    try {
      const db = await getDb();
      if (db) {
        const doc = await db.collection<AttemptDoc>("attempts").findOne({ id: attemptId });
        if (doc) {
          return {
            id: doc.id,
            studentId: doc.studentId,
            moduleId: doc.moduleId,
            assignmentId: doc.assignmentId,
            assignmentTitle: doc.assignmentTitle,
            prompt: doc.prompt,
            transcript: doc.transcript || "",
            audioId: doc.audioId,
            audioUrl: doc.audioUrl,
            audioMimeType: doc.audioMimeType,
            audioSize: doc.audioSize,
            transcriptionStatus: doc.transcriptionStatus || "completed",
            durationSec: doc.durationSec,
            targetDurationSec: doc.targetDurationSec,
            pronunciation: doc.pronunciation,
            vocabulary: doc.vocabulary,
            grammar: doc.grammar,
            fillerCount: doc.fillerCount,
            pauseCount: doc.pauseCount,
            feedback: doc.feedback,
            teacherFeedback: doc.teacherFeedback,
            waveform: doc.waveform,
            createdAt: doc.createdAt
              ? new Date(doc.createdAt).toISOString()
              : new Date().toISOString(),
          };
        }
      }
    } catch (err) {
      console.error("[AttemptService.getAttemptById Error]", err);
    }
    throw new Error(`Attempt with ID "${attemptId}" was not found.`);
  }

  /**
   * Save or update teacher feedback on an attempt (and sync to all attempts of that assignment for the student)
   */
  static async saveTeacherFeedback(attemptId: string, feedback: string): Promise<boolean> {
    try {
      const db = await getDb();
      if (db) {
        const attempt = await db.collection<AttemptDoc>("attempts").findOne({ id: attemptId });
        if (attempt) {
          await db
            .collection<AttemptDoc>("attempts")
            .updateOne({ id: attemptId }, { $set: { teacherFeedback: feedback } });
          if (attempt.assignmentId) {
            await db
              .collection<AttemptDoc>("attempts")
              .updateMany(
                { studentId: attempt.studentId, assignmentId: attempt.assignmentId },
                { $set: { teacherFeedback: feedback } },
              );
          }
          return true;
        }
      }
    } catch (err) {
      console.error("[AttemptService.saveTeacherFeedback Error]", err);
    }
    return false;
  }
}
