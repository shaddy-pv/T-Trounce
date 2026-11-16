import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { requireDb } from "../db/client";
import type { UserDoc, StudentDoc, AttemptDoc, SessionSeason, BatchTime } from "../db/schemas";
import { AppError } from "../errors";
import { AuthService } from "./auth.service";
import { invalidateRosterCache } from "./student.service";
import { StorageService } from "./storage.service";

export interface UserPublic {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: "super_admin" | "admin" | "teacher" | "student";
  sessionSeason?: SessionSeason;
  batchTime?: BatchTime;
  batchId?: string;
  createdAt?: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  role: "teacher" | "student" | "admin";
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
   * Delete a user by ID from users, students, attempts and flags.
   * Super Admin can delete admins, teachers, and students.
   * Admin can delete teachers and students, but cannot delete admins or super admins.
   * Super Admin account itself is protected from deletion.
   */
  static async deleteUser(
    userId: string,
    requester?: { userId?: string; role?: string; isSuperAdmin?: boolean },
  ): Promise<boolean> {
    const db = await requireDb();

    const targetUser = await db
      .collection<UserDoc>("users")
      .findOne({ id: userId });

    if (!targetUser) return false;

    // Self-protection
    if (requester?.userId === userId) {
      throw new AppError("You cannot delete your own account.", 400);
    }

    // Super Admin cannot be deleted
    if (
      targetUser.role === "super_admin" ||
      targetUser.email.toLowerCase() === "shadanmd566@gmail.com"
    ) {
      throw new AppError("Super administrator account is permanently protected.", 403);
    }

    const isRequesterSuper =
      requester?.role === "super_admin" ||
      requester?.isSuperAdmin ||
      requester?.userId === "admin-master";

    // Regular admin cannot delete other administrators
    if (targetUser.role === "admin" && !isRequesterSuper) {
      throw new AppError(
        "Administrator accounts cannot be deleted without Super Administrator authorization.",
        403,
      );
    }

    // Delete user doc and student doc
    await db.collection<UserDoc>("users").deleteOne({ id: userId });
    await db.collection<StudentDoc>("students").deleteOne({ id: userId });

    // Clean up attempts & GridFS audio for this user
    const userAttempts = await db
      .collection<AttemptDoc>("attempts")
      .find({ studentId: userId }, { projection: { id: 1, audioId: 1 } })
      .toArray();

    for (const att of userAttempts) {
      if (att.audioId) {
        await StorageService.deleteAudio(att.audioId).catch(() => {});
      }
    }
    await db.collection("attempts").deleteMany({ studentId: userId });
    await db.collection("flags").deleteMany({ studentId: userId });
    await db.collection("messages").deleteMany({ studentId: userId });

    AuthService.forgetUser(userId);
    invalidateRosterCache();
    return true;
  }

  /**
   * Updates a user's role (Super Admin freedom: promote any user/teacher to admin or student).
   */
  static async updateUserRole(
    userId: string,
    newRole: "super_admin" | "admin" | "teacher" | "student",
    requester?: { userId?: string; role?: string; isSuperAdmin?: boolean },
  ): Promise<boolean> {
    const isRequesterSuper =
      requester?.role === "super_admin" ||
      requester?.isSuperAdmin ||
      requester?.userId === "admin-master";

    if (!isRequesterSuper) {
      throw new AppError("Only the Super Administrator can change user roles.", 403);
    }

    const db = await requireDb();
    const targetUser = await db.collection<UserDoc>("users").findOne({ id: userId });
    if (!targetUser) {
      throw new AppError("User not found.", 404);
    }

    if (targetUser.email.toLowerCase() === "shadanmd566@gmail.com" && newRole !== "super_admin") {
      throw new AppError("The primary Super Administrator role cannot be changed.", 400);
    }

    await db.collection<UserDoc>("users").updateOne(
      { id: userId },
      { $set: { role: newRole, updatedAt: new Date() } },
    );

    // If changed to student, ensure student document exists
    if (newRole === "student") {
      await db.collection<StudentDoc>("students").updateOne(
        { id: userId },
        {
          $setOnInsert: {
            id: userId,
            name: targetUser.name,
            phone: targetUser.phone,
            status: "on-track",
            focus: "General",
            lastActive: "Never",
            scorePct: 0,
            trendPct: 0,
            waveform: [],
            sessionSeason: targetUser.sessionSeason,
            batchTime: targetUser.batchTime,
            batchId: targetUser.batchId,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }

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
        { id: userId, role: { $in: ["teacher", "admin", "super_admin"] } },
        { projection: { id: 1, name: 1 } },
      );
    return user ? { id: user.id, name: user.name } : null;
  }
}
