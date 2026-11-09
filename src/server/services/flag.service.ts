import { randomUUID } from "crypto";
import type { Filter } from "mongodb";
import { attemptScore } from "@/lib/scoring";
import type { CreateFlagInput, FlagItem, ResolveFlagInput } from "@/types";
import { requireDb } from "../db/client";
import type { AttemptDoc, FlagDoc, StudentDoc, UserDoc } from "../db/schemas";
import { forbidden } from "../errors";
import { MessageService } from "./message.service";
import { invalidateRosterCache } from "./student.service";

const MAX_FLAGS_RETURNED = 500;

function toFlagItem(doc: FlagDoc): FlagItem {
  return {
    id: doc.id,
    studentId: doc.studentId,
    studentName: doc.studentName,
    studentEmail: doc.studentEmail,
    attemptId: doc.attemptId,
    attemptPrompt: doc.attemptPrompt,
    attemptDurationSec: doc.attemptDurationSec,
    audioUrl: doc.audioUrl,
    type: doc.type,
    category: doc.category,
    studentNote: doc.studentNote,
    teacherFeedback: doc.teacherFeedback,
    status: doc.status,
    scorePct: doc.scorePct,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    resolvedAt: doc.resolvedAt ? new Date(doc.resolvedAt).toISOString() : undefined,
    resolvedBy: doc.resolvedBy,
  };
}

export class FlagService {
  /**
   * Create a flag (student help request or automated alert).
   * The linked attempt must belong to the student the flag is for.
   */
  static async createFlag(
    input: CreateFlagInput & { studentId: string; studentName?: string; studentEmail?: string },
  ): Promise<FlagItem> {
    const db = await requireDb();
    const attempts = db.collection<AttemptDoc>("attempts");
    const flags = db.collection<FlagDoc>("flags");

    let studentName = input.studentName || "Student";
    let studentEmail = input.studentEmail;

    const user = await db
      .collection<UserDoc>("users")
      .findOne(
        { $or: [{ id: input.studentId }, { email: input.studentId.toLowerCase() }] },
        { projection: { name: 1, email: 1 } },
      );
    if (user) {
      studentName = user.name;
      studentEmail = user.email;
    }

    let attemptPrompt: string | undefined;
    let attemptDurationSec: number | undefined;
    let audioUrl: string | undefined;
    let scorePct: number | undefined;

    if (input.attemptId) {
      const attempt = await attempts.findOne({ id: input.attemptId });
      if (attempt) {
        if (attempt.studentId !== input.studentId && attempt.studentId !== studentEmail) {
          throw forbidden("You can only flag your own recordings.");
        }

        // Repeated submissions for the same recording return the open request.
        const openFlag = await flags.findOne({
          attemptId: input.attemptId,
          studentId: input.studentId,
          status: "pending",
          type: input.type || "student_request",
        });
        if (openFlag) return toFlagItem(openFlag);

        attemptPrompt = attempt.prompt;
        attemptDurationSec = attempt.durationSec;
        audioUrl = attempt.audioUrl;
        scorePct = attemptScore(attempt);

        await attempts.updateOne(
          { id: attempt.id },
          {
            $set: {
              isFlagged: true,
              flagStatus: "pending",
              flagReason: input.category || "Flagged for teacher review",
            },
          },
        );
      }
    }

    const now = new Date();
    const flagDoc: FlagDoc = {
      id: `flag-${Date.now()}-${randomUUID().slice(0, 6)}`,
      studentId: input.studentId,
      studentName,
      studentEmail,
      attemptId: input.attemptId,
      attemptPrompt,
      attemptDurationSec,
      audioUrl,
      type: input.type || "student_request",
      category: input.category || "General Feedback",
      studentNote: input.studentNote,
      status: "pending",
      scorePct,
      createdAt: now,
    };

    await flags.insertOne(flagDoc);

    // Update student status so the dashboard and flags page register it
    const flagReasonLabel =
      flagDoc.type === "student_request"
        ? `Help Request: ${input.category || "Guidance"}`
        : flagDoc.type === "low_score"
          ? `Low Score: ${scorePct ?? 0}%`
          : input.category || "Needs Attention";

    await db
      .collection<StudentDoc>("students")
      .updateOne(
        { id: input.studentId },
        { $set: { status: "flagged", flagReason: flagReasonLabel, updatedAt: now } },
      );

    invalidateRosterCache();
    return toFlagItem(flagDoc);
  }

  /**
   * Fetch flags with optional filters
   */
  static async getFlags(filter?: {
    status?: "all" | "pending" | "resolved" | "dismissed";
    type?: string;
    studentId?: string;
  }): Promise<FlagItem[]> {
    const db = await requireDb();

    const query: Filter<FlagDoc> = {};
    if (filter?.status && filter.status !== "all") query.status = filter.status;
    if (filter?.type && filter.type !== "all") query.type = filter.type as FlagDoc["type"];
    if (filter?.studentId) query.studentId = filter.studentId;

    const docs = await db
      .collection<FlagDoc>("flags")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(MAX_FLAGS_RETURNED)
      .toArray();

    return docs.map(toFlagItem);
  }

  /**
   * Resolve a flag, save feedback to the attempt, and notify the student
   */
  static async resolveFlag(
    input: ResolveFlagInput & { teacherId: string; teacherName: string },
  ): Promise<boolean> {
    const db = await requireDb();
    const flags = db.collection<FlagDoc>("flags");

    const flag = await flags.findOne({ id: input.flagId });
    if (!flag) return false;

    const now = new Date();
    const resolvedStatus = input.status || "resolved";
    const feedback = input.teacherFeedback?.trim();

    await flags.updateOne(
      { id: input.flagId },
      {
        $set: {
          status: resolvedStatus,
          teacherFeedback: input.teacherFeedback,
          resolvedAt: now,
          resolvedBy: input.teacherName,
        },
      },
    );

    if (flag.attemptId) {
      await db.collection<AttemptDoc>("attempts").updateOne(
        { id: flag.attemptId },
        {
          $set: {
            flagStatus: resolvedStatus,
            ...(feedback ? { teacherFeedback: input.teacherFeedback } : {}),
          },
        },
      );
    }

    if (feedback) {
      await MessageService.sendMessage({
        studentId: flag.studentId,
        teacherId: input.teacherId,
        teacherName: input.teacherName,
        content: `[Teacher Feedback on your Flagged Recording] ${feedback}`,
        senderRole: "teacher",
      });
    }

    const remainingPending = await flags.countDocuments({
      studentId: flag.studentId,
      status: "pending",
    });

    if (remainingPending === 0) {
      await db
        .collection<StudentDoc>("students")
        .updateOne(
          { id: flag.studentId },
          { $set: { status: "on-track", updatedAt: now }, $unset: { flagReason: "" } },
        );
    }

    invalidateRosterCache();
    return true;
  }
}
