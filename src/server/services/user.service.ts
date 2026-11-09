import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { requireDb } from "../db/client";
import type { UserDoc, StudentDoc, SessionSeason, BatchTime } from "../db/schemas";
import { AppError } from "../errors";
import { AuthService } from "./auth.service";
import { invalidateRosterCache } from "./student.service";

export interface UserPublic {
  id: string;
  email: string;
  phone?: string;
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
  phone?: string;
  role: "teacher" | "student";
  passwordPlain: string;
  sessionSeason?: SessionSeason;
  batchTime?: BatchTime;
  batchId?: string;
}

export class UserService {
  /**
   * Fetch all users. Password hashes are never loaded.
   */
  static async listUsers(): Promise<UserPublic[]> {
    const db = await requireDb();
    const users = await db
      .collection<UserDoc>("users")
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      phone: u.phone,
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
    const db = await requireDb();
    const usersCol = db.collection<UserDoc>("users");

    const cleanEmail = input.email.trim().toLowerCase();
    const duplicateError = () =>
      new AppError(`A user with email ${cleanEmail} already exists.`, 409);

    if (await usersCol.findOne({ email: cleanEmail }, { projection: { _id: 1 } })) {
      throw duplicateError();
    }

    const cleanPhone = input.phone?.trim() || undefined;
    const sessionSeason = input.sessionSeason || "summer";
    const batchTime = input.batchTime || "morning";
    const batchId = input.batchId || `${sessionSeason}-${batchTime}`;

    const newUserDoc: UserDoc = {
      id: `${input.role}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      email: cleanEmail,
      phone: cleanPhone,
      name: input.name.trim(),
      role: input.role,
      passwordHash: await bcrypt.hash(input.passwordPlain, 10),
      sessionSeason,
      batchTime,
      batchId,
      createdAt: new Date(),
    };

    try {
      await usersCol.insertOne(newUserDoc);
    } catch (err) {
      // The unique index is the real guarantee when two requests race past the check above.
      if ((err as { code?: number }).code === 11000) throw duplicateError();
      throw err;
    }

    if (input.role === "student") {
      const newStudentDoc: StudentDoc = {
        id: newUserDoc.id,
        name: newUserDoc.name,
        phone: cleanPhone,
        status: "on-track",
        focus: "Introductory module practice",
        lastActive: "Never",
        scorePct: 0,
        trendPct: 0,
        waveform: [],
        sessionSeason,
        batchTime,
        batchId,
        updatedAt: new Date(),
      };
      try {
        await db.collection<StudentDoc>("students").insertOne(newStudentDoc);
      } catch (err) {
        // Don't leave a half-created account behind.
        await usersCol.deleteOne({ id: newUserDoc.id }).catch(() => {});
        throw err;
      }
    }

    invalidateRosterCache();

    return {
      id: newUserDoc.id,
      email: newUserDoc.email,
      phone: newUserDoc.phone,
      name: newUserDoc.name,
      role: newUserDoc.role,
      sessionSeason: newUserDoc.sessionSeason,
      batchTime: newUserDoc.batchTime,
      batchId: newUserDoc.batchId,
      createdAt: newUserDoc.createdAt.toISOString(),
    };
  }

  /**
   * Delete a user by ID from both users and students collections, ending their access immediately.
   */
  static async deleteUser(userId: string): Promise<boolean> {
    const db = await requireDb();

    // Safety check: protect administrator accounts from deletion
    const user = await db
      .collection<UserDoc>("users")
      .findOne({ id: userId }, { projection: { role: 1 } });
    if (user?.role === "admin") {
      throw new AppError("Administrator accounts cannot be deleted directly.", 403);
    }

    await db.collection<UserDoc>("users").deleteOne({ id: userId });
    await db.collection<StudentDoc>("students").deleteOne({ id: userId });

    AuthService.forgetUser(userId);
    invalidateRosterCache();
    return true;
  }

  /** Finds a teacher or admin by ID, used to attach a real name to a student's reply. */
  static async findFaculty(userId: string): Promise<{ id: string; name: string } | null> {
    const db = await requireDb();
    const user = await db
      .collection<UserDoc>("users")
      .findOne(
        { id: userId, role: { $in: ["teacher", "admin"] } },
        { projection: { id: 1, name: 1 } },
      );
    return user ? { id: user.id, name: user.name } : null;
  }
}
