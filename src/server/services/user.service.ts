import bcrypt from "bcryptjs";
import { getDb } from "../db/client";
import type { UserDoc, StudentDoc, SessionSeason, BatchTime } from "../db/schemas";
import { makeSampleWaveform } from "@/components/tarang/Waveform";

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  role: "admin" | "teacher" | "student";
  sessionSeason?: SessionSeason;
  batchTime?: BatchTime;
  batchId?: string;
  createdAt?: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: "teacher" | "student";
  passwordPlain: string;
  sessionSeason?: SessionSeason;
  batchTime?: BatchTime;
  batchId?: string;
}

export class UserService {
  /**
   * Fetch all users from the database.
   */
  static async listUsers(): Promise<UserPublic[]> {
    const db = await getDb();
    if (!db) return [];
    const users = await db.collection<UserDoc>("users").find({}).sort({ createdAt: -1 }).toArray();

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      sessionSeason: u.sessionSeason,
      batchTime: u.batchTime,
      batchId: u.batchId,
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : undefined,
    }));
  }

  /**
   * Directly creates a new user (Teacher or Student) with a permanent password.
   */
  static async createUser(input: CreateUserInput): Promise<UserPublic> {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not connected");
    }

    const cleanEmail = input.email.trim().toLowerCase();
    const existing = await db.collection<UserDoc>("users").findOne({ email: cleanEmail });
    if (existing) {
      throw new Error(`A user with email ${cleanEmail} already exists`);
    }

    const passwordHash = await bcrypt.hash(input.passwordPlain, 10);
    const userId = `${input.role}-${Date.now()}`;
    const sessionSeason = input.sessionSeason || "summer";
    const batchTime = input.batchTime || "morning";
    const batchId = input.batchId || `${sessionSeason}-${batchTime}`;

    const newUserDoc: UserDoc = {
      id: userId,
      email: cleanEmail,
      name: input.name.trim(),
      role: input.role,
      passwordHash,
      sessionSeason,
      batchTime,
      batchId,
      createdAt: new Date(),
    };

    await db.collection<UserDoc>("users").insertOne(newUserDoc);

    // If the new user is a student, also create an entry in the students roster collection
    if (input.role === "student") {
      const newStudentDoc: StudentDoc = {
        id: userId,
        name: input.name.trim(),
        status: "on-track",
        focus: "Introductory module practice",
        lastActive: "Today",
        scorePct: 85,
        trendPct: 0,
        waveform: makeSampleWaveform(10, 40, 0.2),
        sessionSeason,
        batchTime,
        batchId,
        updatedAt: new Date(),
      };
      await db.collection<StudentDoc>("students").insertOne(newStudentDoc);
    }

    return {
      id: newUserDoc.id,
      email: newUserDoc.email,
      name: newUserDoc.name,
      role: newUserDoc.role,
      sessionSeason: newUserDoc.sessionSeason,
      batchTime: newUserDoc.batchTime,
      batchId: newUserDoc.batchId,
      createdAt: newUserDoc.createdAt.toISOString(),
    };
  }

  /**
   * Delete a user by ID from both users and students collections.
   */
  static async deleteUser(userId: string): Promise<boolean> {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not connected");
    }

    // Safety check: protect administrator accounts from self-deletion
    const user = await db.collection<UserDoc>("users").findOne({ id: userId });
    if (user?.role === "admin") {
      throw new Error("Administrator accounts cannot be deleted directly.");
    }

    await db.collection<UserDoc>("users").deleteOne({ id: userId });
    await db.collection<StudentDoc>("students").deleteOne({ id: userId });

    return true;
  }
}
