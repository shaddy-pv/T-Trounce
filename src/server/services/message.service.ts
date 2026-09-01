import { getDb } from "../db/client";
import type { DirectMessageDoc } from "../db/schemas";
import type { DirectMessagePublic, CreateMessageInput } from "@/types";
import { randomUUID } from "crypto";

export class MessageService {
  /**
   * Send a direct message to a student
   */
  static async sendMessage(input: CreateMessageInput): Promise<DirectMessagePublic> {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    const messageId = `msg-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const now = new Date();

    const doc: DirectMessageDoc = {
      id: messageId,
      studentId: input.studentId,
      teacherId: input.teacherId,
      teacherName: input.teacherName,
      content: input.content,
      read: false,
      senderRole: input.senderRole || "teacher",
      createdAt: now,
    };

    await db.collection<DirectMessageDoc>("messages").insertOne(doc);

    return {
      id: doc.id,
      studentId: doc.studentId,
      teacherId: doc.teacherId,
      teacherName: doc.teacherName,
      content: doc.content,
      read: doc.read,
      senderRole: doc.senderRole || "teacher",
      createdAt: doc.createdAt.toISOString(),
    };
  }

  /**
   * Get all messages for a specific student, sorted by newest first
   */
  static async getMessagesForStudent(studentId: string): Promise<DirectMessagePublic[]> {
    const db = await getDb();
    if (!db) return [];

    const docs = await db
      .collection<DirectMessageDoc>("messages")
      .find({ studentId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => ({
      id: doc.id,
      studentId: doc.studentId,
      teacherId: doc.teacherId,
      teacherName: doc.teacherName,
      content: doc.content,
      read: doc.read,
      senderRole: doc.senderRole || "teacher",
      createdAt: doc.createdAt.toISOString(),
    }));
  }

  /**
   * Mark a specific message as read
   */
  static async markMessageRead(messageId: string): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    const result = await db
      .collection<DirectMessageDoc>("messages")
      .updateOne({ id: messageId }, { $set: { read: true } });

    return result.modifiedCount > 0;
  }
}
