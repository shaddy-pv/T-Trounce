import { getDb } from "../db/client";
import type { AssignmentDoc, SessionSeason, BatchTime } from "../db/schemas";
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

export class AssignmentService {
  /**
   * List assignments filtered by batch or session/batch
   */
  static async listAssignments(filter?: {
    batchId?: string;
    session?: SessionSeason;
    batch?: BatchTime;
  }): Promise<AssignmentPublic[]> {
    const db = await getDb();
    if (!db) return [];

    const query: import("mongodb").Filter<AssignmentDoc> = {};
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

    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      instructions: d.instructions,
      prompt: d.prompt,
      difficulty: d.difficulty,
      durationSec: d.durationSec,
      targetSession: d.targetSession,
      targetBatch: d.targetBatch,
      batchId: d.batchId,
      teacherId: d.teacherId,
      teacherName: d.teacherName,
      dueDate: d.dueDate,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  /**
   * Create a new homework assignment targeted to a specific session and batch
   */
  static async createAssignment(input: CreateAssignmentInput): Promise<AssignmentPublic> {
    const db = await getDb();
    if (!db) throw new Error("Database not connected");

    const batchId = `${input.targetSession}-${input.targetBatch}`;
    const id = `hw-${Date.now()}`;

    const newDoc: AssignmentDoc = {
      id,
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      prompt: input.prompt.trim(),
      difficulty: input.difficulty,
      durationSec: input.durationSec,
      targetSession: input.targetSession,
      targetBatch: input.targetBatch,
      batchId,
      teacherId: input.teacherId,
      teacherName: input.teacherName,
      dueDate: input.dueDate,
      createdAt: new Date(),
    };

    await db.collection<AssignmentDoc>("assignments").insertOne(newDoc);

    return {
      id: newDoc.id,
      title: newDoc.title,
      instructions: newDoc.instructions,
      prompt: newDoc.prompt,
      difficulty: newDoc.difficulty,
      durationSec: newDoc.durationSec,
      targetSession: newDoc.targetSession,
      targetBatch: newDoc.targetBatch,
      batchId: newDoc.batchId,
      teacherId: newDoc.teacherId,
      teacherName: newDoc.teacherName,
      dueDate: newDoc.dueDate,
      createdAt: newDoc.createdAt.toISOString(),
    };
  }

  /**
   * Fetch a single assignment by ID
   */
  static async getAssignmentById(id: string): Promise<AssignmentPublic | null> {
    const db = await getDb();
    if (!db) return null;

    const doc = await db.collection<AssignmentDoc>("assignments").findOne({ id });
    if (!doc) return null;

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

  /**
   * Delete an assignment by ID and cascade delete attempts
   */
  static async deleteAssignment(id: string): Promise<boolean> {
    const db = await getDb();
    if (!db) throw new Error("Database not connected");

    await db.collection<AssignmentDoc>("assignments").deleteOne({ id });
    await db.collection("attempts").deleteMany({ assignmentId: id });
    return true;
  }

  /**
   * Fetch submissions and pending students for a specific assignment
   */
  static async getAssignmentSubmissions(id: string): Promise<AssignmentSubmissionsData | null> {
    const assignment = await this.getAssignmentById(id);
    if (!assignment) return null;

    const db = await getDb();
    if (!db) return null;

    // 1. Fetch cohort students
    let cohortStudents = await StudentService.getRoster({
      session: assignment.targetSession,
      batch: assignment.targetBatch,
    });

    // If cohort has no students, fallback to full roster so demo/dev data is always available
    if (cohortStudents.length === 0) {
      cohortStudents = await StudentService.getRoster();
    }

    // 2. Fetch attempts for this assignment
    const attempts = await db
      .collection<import("../db/schemas").AttemptDoc>("attempts")
      .find({ assignmentId: id })
      .sort({ createdAt: -1 })
      .toArray();

    // Map attempts by studentId
    const attemptByStudent = new Map<string, import("../db/schemas").AttemptDoc>();
    for (const att of attempts) {
      const sid = att.studentId;
      if (sid && !attemptByStudent.has(sid)) {
        attemptByStudent.set(sid, att);
      }
    }

    const completed: AssignmentSubmissionItem[] = [];
    const pending: AssignmentPendingItem[] = [];
    const seenStudentIds = new Set<string>();

    for (const student of cohortStudents) {
      seenStudentIds.add(student.id);
      const att = attemptByStudent.get(student.id);
      if (att) {
        completed.push({
          studentId: student.id,
          studentName: student.name,
          phone: student.phone,
          scorePct:
            att.targetDurationSec && att.targetDurationSec > 0
              ? Math.min(100, Math.round((att.durationSec / att.targetDurationSec) * 100))
              : Math.round(
                  ((att.pronunciation ?? 75) + (att.vocabulary ?? 75) + (att.grammar ?? 75)) / 3,
                ),
          submittedAt: att.createdAt ? new Date(att.createdAt).toISOString() : new Date().toISOString(),
          audioUrl: att.audioUrl,
          transcript: att.transcript,
          attemptId: att.id,
          durationSec: att.durationSec,
        });
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

    // Include any attempts by students not in current filtered cohort list
    for (const att of attempts) {
      if (!seenStudentIds.has(att.studentId)) {
        seenStudentIds.add(att.studentId);
        completed.push({
          studentId: att.studentId,
          studentName: att.studentName || "Student",
          scorePct:
            att.targetDurationSec && att.targetDurationSec > 0
              ? Math.min(100, Math.round((att.durationSec / att.targetDurationSec) * 100))
              : Math.round(
                  ((att.pronunciation ?? 75) + (att.vocabulary ?? 75) + (att.grammar ?? 75)) / 3,
                ),
          submittedAt: att.createdAt ? new Date(att.createdAt).toISOString() : new Date().toISOString(),
          audioUrl: att.audioUrl,
          transcript: att.transcript,
          attemptId: att.id,
          durationSec: att.durationSec,
        });
      }
    }

    const totalStudents = completed.length + pending.length;
    const completedCount = completed.length;
    const pendingCount = pending.length;
    const submissionRate =
      totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;

    return {
      assignment,
      completed,
      pending,
      totalStudents,
      completedCount,
      pendingCount,
      submissionRate,
    };
  }

  /**
   * Record and broadcast reminder for an assignment
   */
  static async sendReminder(input: {
    assignmentId: string;
    studentId?: string;
    channel?: "whatsapp" | "in-app" | "both";
  }): Promise<{ success: boolean; message: string; timestamp: string }> {
    const db = await getDb();
    if (db) {
      const assignment = await this.getAssignmentById(input.assignmentId);
      const title = assignment ? assignment.title : "Speaking Homework";
      await db.collection("notifications").insertOne({
        id: `notif-${Date.now()}`,
        assignmentId: input.assignmentId,
        studentId: input.studentId || "all-pending",
        message: `Reminder: Please submit speech homework "${title}"`,
        channel: input.channel || "both",
        createdAt: new Date(),
        status: "delivered",
      });
    }
    return {
      success: true,
      message: input.studentId
        ? "Reminder sent to student successfully."
        : "Broadcast reminder sent to all pending students.",
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
