import { randomUUID } from "crypto";
import type { Filter } from "mongodb";
import { attemptScore } from "@/lib/scoring";
import { getDb, requireDb } from "../db/client";
import type { AssignmentDoc, AttemptDoc, SessionSeason, BatchTime, UserDoc } from "../db/schemas";
import { MessageService } from "./message.service";
import { StorageService } from "./storage.service";
import { StudentService } from "./student.service";

export interface AssignmentPublic {
  id: string;
  title: string;
  instructions: string;
  prompt: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  durationSec: number;
  targetSession: SessionSeason;
  targetBatch: BatchTime;
  batchId: string;
  teacherId: string;
  teacherName: string;
  dueDate?: string;
  createdAt: string;
}

export interface CreateAssignmentInput {
  title: string;
  instructions: string;
  prompt: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  durationSec: number;
  targetSession: SessionSeason;
  targetBatch: BatchTime;
  teacherId: string;
  teacherName: string;
  dueDate?: string;
}

function toPublic(doc: AssignmentDoc): AssignmentPublic {
  return {
    id: doc.id,
    title: doc.title,
    instructions: doc.instructions,
    prompt: doc.prompt,
    difficulty: doc.difficulty,
    durationSec: doc.durationSec,
    targetSession: doc.targetSession,
    targetBatch: doc.targetBatch,
    batchId: doc.batchId,
    teacherId: doc.teacherId,
    teacherName: doc.teacherName,
    dueDate: doc.dueDate,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
  };
}

function toSubmission(
  att: AttemptDoc,
  student: { id: string; name: string; phone?: string },
): AssignmentSubmissionItem {
  return {
    studentId: student.id,
    studentName: student.name,
    phone: student.phone,
    scorePct: attemptScore(att),
    submittedAt: att.createdAt ? new Date(att.createdAt).toISOString() : new Date().toISOString(),
    audioUrl: att.audioUrl,
    transcript: att.transcript,
    attemptId: att.id,
    durationSec: att.durationSec,
  };
}

export class AssignmentService {
  /**
   * List assignments filtered by batch or session/batch
   */
  static async listAssignments(filter?: {
    batchId?: string;
    session?: SessionSeason;
    batch?: BatchTime;
  }): Promise<AssignmentPublic[]> {
    const db = await requireDb();

    const query: Filter<AssignmentDoc> = {};
    if (filter?.batchId) {
      query.batchId = filter.batchId;
    } else {
      if (filter?.session) query.targetSession = filter.session;
      if (filter?.batch) query.targetBatch = filter.batch;
    }

    const docs = await db
      .collection<AssignmentDoc>("assignments")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map(toPublic);
  }

  /**
   * Create a new homework assignment targeted to a specific session and batch
   */
  static async createAssignment(input: CreateAssignmentInput): Promise<AssignmentPublic> {
    const db = await requireDb();

    const newDoc: AssignmentDoc = {
      id: `hw-${Date.now()}-${randomUUID().slice(0, 6)}`,
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      prompt: input.prompt.trim(),
      difficulty: input.difficulty,
      durationSec: input.durationSec,
      targetSession: input.targetSession,
      targetBatch: input.targetBatch,
      batchId: `${input.targetSession}-${input.targetBatch}`,
      teacherId: input.teacherId,
      teacherName: input.teacherName,
      dueDate: input.dueDate,
      createdAt: new Date(),
    };

    await db.collection<AssignmentDoc>("assignments").insertOne(newDoc);
    return toPublic(newDoc);
  }

  /**
   * Fetch a single assignment by ID
   */
  static async getAssignmentById(id: string): Promise<AssignmentPublic | null> {
    const db = await getDb();
    if (!db) return null;

    const doc = await db.collection<AssignmentDoc>("assignments").findOne({ id });
    return doc ? toPublic(doc) : null;
  }

  /**
   * Delete an assignment along with the attempts submitted for it and their audio recordings
   */
  static async deleteAssignment(id: string): Promise<boolean> {
    const db = await requireDb();
    const attempts = db.collection<AttemptDoc>("attempts");

    const withAudio = await attempts
      .find({ assignmentId: id, audioId: { $exists: true } }, { projection: { audioId: 1 } })
      .toArray();

    await db.collection<AssignmentDoc>("assignments").deleteOne({ id });
    await attempts.deleteMany({ assignmentId: id });

    await Promise.all(
      withAudio.map((attempt) =>
        attempt.audioId ? StorageService.deleteAudio(attempt.audioId) : undefined,
      ),
    );
    return true;
  }

  /**
   * Fetch submissions and pending students for a specific assignment
   */
  static async getAssignmentSubmissions(id: string): Promise<AssignmentSubmissionsData | null> {
    const assignment = await this.getAssignmentById(id);
    if (!assignment) return null;

    const db = await requireDb();

    const cohortStudents = await StudentService.getRoster({
      session: assignment.targetSession,
      batch: assignment.targetBatch,
    });

    const attempts = await db
      .collection<AttemptDoc>("attempts")
      .find({ assignmentId: id })
      .project<AttemptDoc>({ waveform: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    // Attempts are sorted newest first, so the first one seen for a student is their latest.
    const latestByStudent = new Map<string, AttemptDoc>();
    for (const att of attempts) {
      if (att.studentId && !latestByStudent.has(att.studentId)) {
        latestByStudent.set(att.studentId, att);
      }
    }

    const completed: AssignmentSubmissionItem[] = [];
    const pending: AssignmentPendingItem[] = [];

    for (const student of cohortStudents) {
      const att = latestByStudent.get(student.id);
      if (att) {
        completed.push(toSubmission(att, student));
        latestByStudent.delete(student.id);
      } else {
        pending.push({
          studentId: student.id,
          studentName: student.name,
          phone: student.phone,
          lastActive: student.lastActive,
          status: student.status,
        });
      }
    }

    // Submissions from students outside the target batch, such as those who changed batch.
    if (latestByStudent.size > 0) {
      const otherIds = [...latestByStudent.keys()];
      const users = await db
        .collection<UserDoc>("users")
        .find({ id: { $in: otherIds } }, { projection: { id: 1, name: 1, phone: 1 } })
        .toArray();
      const usersById = new Map(users.map((u) => [u.id, u]));

      for (const [studentId, att] of latestByStudent) {
        const user = usersById.get(studentId);
        completed.push(
          toSubmission(att, { id: studentId, name: user?.name ?? "Student", phone: user?.phone }),
        );
      }
    }

    const totalStudents = completed.length + pending.length;
    return {
      assignment,
      completed,
      pending,
      totalStudents,
      completedCount: completed.length,
      pendingCount: pending.length,
      submissionRate: totalStudents > 0 ? Math.round((completed.length / totalStudents) * 100) : 0,
    };
  }

  /**
   * Delivers a homework reminder to a student's in-app inbox, or to every student who has not yet
   * submitted. Students see these on their practice screen.
   */
  static async sendReminder(input: {
    assignmentId: string;
    studentId?: string;
    channel?: "whatsapp" | "in-app" | "both";
    teacherId: string;
    teacherName: string;
  }): Promise<{ success: boolean; message: string; delivered: number; timestamp: string }> {
    const submissions = await this.getAssignmentSubmissions(input.assignmentId);
    const title = submissions?.assignment.title ?? "Speaking Homework";

    const recipients = input.studentId
      ? [input.studentId]
      : (submissions?.pending ?? []).map((student) => student.studentId);

    const delivered = await MessageService.sendToMany(recipients, {
      teacherId: input.teacherId,
      teacherName: input.teacherName,
      content: `Reminder: Please submit your speaking homework "${title}".`,
      senderRole: "teacher",
    });

    return {
      success: true,
      delivered,
      message: input.studentId
        ? "Reminder sent to the student's inbox."
        : `Reminder sent to ${delivered} pending student${delivered === 1 ? "" : "s"}.`,
      timestamp: new Date().toISOString(),
    };
  }
}

export interface AssignmentSubmissionItem {
  studentId: string;
  studentName: string;
  phone?: string;
  scorePct: number;
  submittedAt: string;
  audioUrl?: string;
  transcript?: string;
  attemptId?: string;
  durationSec?: number;
}

export interface AssignmentPendingItem {
  studentId: string;
  studentName: string;
  phone?: string;
  lastActive: string;
  status: import("@/types").StudentStatus;
}

export interface AssignmentSubmissionsData {
  assignment: AssignmentPublic;
  completed: AssignmentSubmissionItem[];
  pending: AssignmentPendingItem[];
  totalStudents: number;
  completedCount: number;
  pendingCount: number;
  submissionRate: number;
}
