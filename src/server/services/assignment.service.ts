import { getDb } from "../db/client";
import type { AssignmentDoc, SessionSeason, BatchTime } from "../db/schemas";

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
}
