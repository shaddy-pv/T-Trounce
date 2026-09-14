import { getDb } from "../db/client";
import type { FlagDoc, AttemptDoc, UserDoc, StudentDoc } from "../db/schemas";
import type { FlagItem, CreateFlagInput, ResolveFlagInput } from "@/types";
import { MessageService } from "./message.service";
import { randomUUID } from "crypto";

export class FlagService {
  /**
   * Create a flag (Student help request or automated alert)
   */
  static async createFlag(
    input: CreateFlagInput & { studentId: string; studentName?: string; studentEmail?: string },
  ): Promise<FlagItem> {
    const db = await getDb();
    if (!db) throw new Error("Database not connected");

    let studentName = input.studentName || "Student";
    let studentEmail = input.studentEmail;

    const user = await db.collection<UserDoc>("users").findOne({
      $or: [{ id: input.studentId }, { email: input.studentId.toLowerCase() }],
    });
    if (user) {
      studentName = user.name;
      studentEmail = user.email;
    }

    let attemptPrompt: string | undefined;
    let attemptDurationSec: number | undefined;
    let audioUrl: string | undefined;
    let scorePct: number | undefined;

    if (input.attemptId) {
      const attempt = await db.collection<AttemptDoc>("attempts").findOne({ id: input.attemptId });
      if (attempt) {
        attemptPrompt = attempt.prompt;
        attemptDurationSec = attempt.durationSec;
        audioUrl = attempt.audioUrl;
        scorePct =
          attempt.targetDurationSec && attempt.targetDurationSec > 0
            ? Math.min(100, Math.round((attempt.durationSec / attempt.targetDurationSec) * 100))
            : Math.round(
                ((attempt.pronunciation ?? 70) +
                  (attempt.vocabulary ?? 70) +
                  (attempt.grammar ?? 70)) /
                  3,
              );

        // Mark attempt as flagged
        await db.collection<AttemptDoc>("attempts").updateOne(
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

    const flagId = `flag-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const now = new Date();

    const flagDoc: FlagDoc = {
      id: flagId,
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

    await db.collection<FlagDoc>("flags").insertOne(flagDoc);

    // Update student status in students collection so dashboard and flags register it
    const flagReasonLabel =
      input.type === "student_request"
        ? `Help Request: ${input.category || "Guidance"}`
        : input.type === "low_score"
          ? `Low Score: ${scorePct ?? 0}%`
          : input.category || "Needs Attention";

    await db.collection<StudentDoc>("students").updateOne(
      { id: input.studentId },
      {
        $set: {
          status: "flagged",
          flagReason: flagReasonLabel,
          updatedAt: now,
        },
      },
      { upsert: false },
    );

    return {
      id: flagDoc.id,
      studentId: flagDoc.studentId,
      studentName: flagDoc.studentName,
      studentEmail: flagDoc.studentEmail,
      attemptId: flagDoc.attemptId,
      attemptPrompt: flagDoc.attemptPrompt,
      attemptDurationSec: flagDoc.attemptDurationSec,
      audioUrl: flagDoc.audioUrl,
      type: flagDoc.type,
      category: flagDoc.category,
      studentNote: flagDoc.studentNote,
      status: flagDoc.status,
      scorePct: flagDoc.scorePct,
      createdAt: flagDoc.createdAt.toISOString(),
    };
  }

  /**
   * Fetch all flags with optional status filter
   */
  static async getFlags(filter?: {
    status?: "all" | "pending" | "resolved" | "dismissed";
    type?: string;
    studentId?: string;
  }): Promise<FlagItem[]> {
    const db = await getDb();
    if (!db) return [];

    const query: import("mongodb").Filter<FlagDoc> = {};
    if (filter?.status && filter.status !== "all") {
      query.status = filter.status;
    }
    if (filter?.type && filter.type !== "all") {
      query.type = filter.type as import("../db/schemas").FlagDoc["type"];
    }
    if (filter?.studentId) {
      query.studentId = filter.studentId;
    }

    const docs = await db
      .collection<FlagDoc>("flags")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => ({
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
    }));
  }

  /**
   * Resolve a flag, save feedback to attempt, and notify student
   */
  static async resolveFlag(
    input: ResolveFlagInput & { teacherId: string; teacherName: string },
  ): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    const flag = await db.collection<FlagDoc>("flags").findOne({ id: input.flagId });
    if (!flag) return false;

    const now = new Date();
    const resolvedStatus = input.status || "resolved";

    await db.collection<FlagDoc>("flags").updateOne(
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

    // If linked to an attempt, persist teacher feedback on the attempt
    if (flag.attemptId) {
      await db.collection<AttemptDoc>("attempts").updateOne(
        { id: flag.attemptId },
        {
          $set: {
            flagStatus: resolvedStatus,
            ...(input.teacherFeedback ? { teacherFeedback: input.teacherFeedback } : {}),
          },
        },
      );
    }

    // Send direct note to student if teacher wrote feedback
    if (input.teacherFeedback && input.teacherFeedback.trim()) {
      await MessageService.sendMessage({
        studentId: flag.studentId,
        teacherId: input.teacherId,
        teacherName: input.teacherName,
        content: `[Teacher Feedback on your Flagged Recording] ${input.teacherFeedback.trim()}`,
        senderRole: "teacher",
      });
    }

    // Check if student has remaining pending flags
    const remainingPending = await db
      .collection<FlagDoc>("flags")
      .countDocuments({ studentId: flag.studentId, status: "pending" });

    if (remainingPending === 0) {
      await db.collection<StudentDoc>("students").updateOne(
        { id: flag.studentId },
        {
          $set: {
            status: "on-track",
            flagReason: undefined,
            updatedAt: now,
          },
        },
      );
    }

    return true;
  }
}
