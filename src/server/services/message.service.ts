import { randomUUID } from "crypto";
import type { CreateMessageInput, DirectMessagePublic } from "@/types";
import { requireDb } from "../db/client";
import type { DirectMessageDoc } from "../db/schemas";

const MAX_MESSAGES_RETURNED = 200;

function toPublic(doc: DirectMessageDoc): DirectMessagePublic {
  return {
    id: doc.id,
    studentId: doc.studentId,
    teacherId: doc.teacherId,
    teacherName: doc.teacherName,
    content: doc.content,
    read: doc.read,
    senderRole: doc.senderRole || "teacher",
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

function buildDoc(input: CreateMessageInput): DirectMessageDoc {
  return {
    id: `msg-${Date.now()}-${randomUUID().slice(0, 8)}`,
    studentId: input.studentId,
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    content: input.content,
    read: false,
    senderRole: input.senderRole || "teacher",
    createdAt: new Date(),
  };
}

export class MessageService {
  /**
   * Send a direct message to a student
   */
  static async sendMessage(input: CreateMessageInput): Promise<DirectMessagePublic> {
    const db = await requireDb();
    const doc = buildDoc(input);
    await db.collection<DirectMessageDoc>("messages").insertOne(doc);
    return toPublic(doc);
  }

  /**
   * Send the same message to several students' inboxes in one write
   */
  static async sendToMany(studentIds: string[], template: Omit<CreateMessageInput, "studentId">) {
    if (studentIds.length === 0) return 0;
    const db = await requireDb();
    const docs = studentIds.map((studentId) => buildDoc({ ...template, studentId }));
    const result = await db.collection<DirectMessageDoc>("messages").insertMany(docs);
    return result.insertedCount;
  }

  /**
   * Get a student's messages, newest first
   */
  static async getMessagesForStudent(studentId: string): Promise<DirectMessagePublic[]> {
    const db = await requireDb();
    const docs = await db
      .collection<DirectMessageDoc>("messages")
      .find({ studentId })
      .sort({ createdAt: -1 })
      .limit(MAX_MESSAGES_RETURNED)
      .toArray();
    return docs.map(toPublic);
  }

  /**
   * Mark a message as read. When ownerStudentId is given, it only applies to that student's own
   * messages, so one student cannot change another's inbox.
   */
  static async markMessageRead(messageId: string, ownerStudentId?: string): Promise<boolean> {
    const db = await requireDb();
    const result = await db
      .collection<DirectMessageDoc>("messages")
      .updateOne(
        { id: messageId, ...(ownerStudentId ? { studentId: ownerStudentId } : {}) },
        { $set: { read: true } },
      );
    return result.matchedCount > 0;
  }
}
