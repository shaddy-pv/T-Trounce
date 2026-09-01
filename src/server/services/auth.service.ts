import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getDb } from "../db/client";
import type { UserDoc } from "../db/schemas";
import { env } from "@/config/env";

const secretKey = new TextEncoder().encode(env.SESSION_SECRET);

export interface SessionPayload {
  userId: string;
  email: string;
  username?: string;
  name: string;
  role: "admin" | "teacher" | "student";
  isAdmin?: boolean;
  batchId?: string;
  sessionSeason?: string;
  batchTime?: string;
  exp?: number;
}

export class AuthService {
  /**
   * Verifies credentials using email (case-insensitive) and validates password against hash.
   * Returns null if user is not found or password does not match.
   */
  static async authenticateUserWithRole(
    emailOrIdentifier: string,
    passwordPlain: string,
    selectedRole: "student" | "teacher",
  ): Promise<UserDoc | null> {
    const db = await getDb();
    if (!db) {
      throw new Error("Database service unavailable. Please check MongoDB connection.");
    }

    const cleanEmail = emailOrIdentifier.trim().toLowerCase();

    // Find user by email or username
    const user = await db.collection<UserDoc>("users").findOne({
      $or: [
        { email: cleanEmail },
        { username: cleanEmail.replace(/[^a-z0-9_]/g, "_") },
        { name: emailOrIdentifier.trim() },
      ],
    });

    if (!user || !user.passwordHash) {
      return null;
    }

    const isValid = await bcrypt.compare(passwordPlain, user.passwordHash);
    if (!isValid) {
      return null;
    }

    // Role verification
    if (user.role === "admin") {
      return {
        ...user,
        role: selectedRole === "student" ? "student" : "admin",
      };
    }

    // Ensure user role matches selected portal
    if (user.role !== selectedRole) {
      return null;
    }

    return user;
  }

  /**
   * Generates a signed JWT session token valid for 7 days.
   */
  static async createSessionToken(user: UserDoc): Promise<string> {
    const payload: SessionPayload = {
      userId: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
      isAdmin: user.role === "admin",
      batchId: user.batchId,
      sessionSeason: user.sessionSeason,
      batchTime: user.batchTime,
    };

    return new SignJWT(payload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secretKey);
  }

  /**
   * Verifies the token signature and expiration, returning the validated session payload.
   */
  static async verifySessionToken(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, secretKey);
      return payload as unknown as SessionPayload;
    } catch {
      return null;
    }
  }
}
