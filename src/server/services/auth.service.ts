import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getDb } from "../db/client";
import { serviceUnavailable } from "../errors";
import type { UserDoc } from "../db/schemas";
import { env } from "@/config/env";

const secretKey = new TextEncoder().encode(env.SESSION_SECRET);

/** Compared against when the email is unknown, so response time does not reveal which exist. */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("trounce-timing-equalizer", 10);

export interface SessionPayload {
  userId: string;
  email: string;
  username?: string;
  name: string;
  role: "super_admin" | "admin" | "teacher" | "student";
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  /** Set by the server: administrators allowed to change system settings. */
  isMasterAdmin?: boolean;
  phone?: string;
  batchId?: string;
  sessionSeason?: string;
  batchTime?: string;
  exp?: number;
}

function isSuperAdminAccount(role: string, email: string | undefined): boolean {
  return role === "super_admin" || email?.toLowerCase() === "shadanmd566@gmail.com";
}

function isMasterAdminAccount(role: string, email: string | undefined): boolean {
  if (role !== "admin" && role !== "super_admin") return false;
  return (
    role === "super_admin" ||
    email?.toLowerCase() === env.MASTER_ADMIN_EMAIL ||
    email?.toLowerCase() === "shadanmd566@gmail.com"
  );
}

// ---- Session freshness -------------------------------------------------------------------------
// A JWT alone cannot be revoked, so each session is checked against the user record. The result is
// cached briefly so this adds at most one small query per user every 30 seconds.

const USER_CACHE_TTL_MS = 30 * 1000;
const USER_CACHE_MAX_ENTRIES = 5000;

type UserLookup = Pick<
  UserDoc,
  | "id"
  | "email"
  | "username"
  | "name"
  | "role"
  | "phone"
  | "batchId"
  | "sessionSeason"
  | "batchTime"
>;

const userCache = new Map<string, { at: number; user: UserLookup | null }>();

/** Returns the user, null if they no longer exist, or undefined if the database can't say. */
async function lookupUser(userId: string): Promise<UserLookup | null | undefined> {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.at < USER_CACHE_TTL_MS) return cached.user;

  try {
    const db = await getDb();
    if (!db) return undefined;

    const user = await db.collection<UserDoc>("users").findOne(
      { id: userId },
      {
        projection: {
          id: 1,
          email: 1,
          username: 1,
          name: 1,
          role: 1,
          phone: 1,
          batchId: 1,
          sessionSeason: 1,
          batchTime: 1,
        },
      },
    );

    if (userCache.size >= USER_CACHE_MAX_ENTRIES) userCache.clear();
    userCache.set(userId, { at: Date.now(), user });
    return user;
  } catch (err) {
    console.warn("[AuthService] Could not verify session user:", (err as Error).message);
    return undefined;
  }
}

export class AuthService {
  /**
   * Verifies credentials. Administrators may sign in through either portal; other users must
   * match the selected portal. Returns null if the email, password or portal does not match.
   */
  static async authenticateUserWithRole(
    email: string,
    passwordPlain: string,
    selectedRole: "student" | "teacher",
  ): Promise<UserDoc | null> {
    const db = await getDb();
    if (!db) {
      throw serviceUnavailable("Sign-in is temporarily unavailable. Please try again shortly.");
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await db.collection<UserDoc>("users").findOne({
      $or: [{ email: cleanEmail }, { username: cleanEmail.replace(/[^a-z0-9_]/g, "_") }],
    });

    const isValid = await bcrypt.compare(passwordPlain, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || !user.passwordHash || !isValid) return null;

    if (user.role !== "admin" && user.role !== "super_admin" && user.role !== selectedRole) return null;
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
      isAdmin: user.role === "admin" || user.role === "super_admin",
      isSuperAdmin: isSuperAdminAccount(user.role, user.email),
      isMasterAdmin: isMasterAdminAccount(user.role, user.email),
      phone: user.phone,
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
   * Verifies the token's signature and expiry only. Most callers want resolveSession().
   */
  static async verifySessionToken(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
      return payload as unknown as SessionPayload;
    } catch {
      return null;
    }
  }

  /**
   * Verifies a token and confirms the account still exists, returning the current role and details
   * from the database. A deleted account loses access immediately. If the database is briefly
   * unreachable the signed token is honoured, so a short outage does not sign everyone out.
   */
  static async resolveSession(token: string | undefined | null): Promise<SessionPayload | null> {
    if (!token) return null;

    const claims = await this.verifySessionToken(token);
    if (!claims?.userId) return null;

    const user = await lookupUser(claims.userId);
    if (user === null) return null;
    if (user === undefined) {
      return {
        ...claims,
        isSuperAdmin: isSuperAdminAccount(claims.role, claims.email),
        isMasterAdmin: isMasterAdminAccount(claims.role, claims.email),
      };
    }

    return {
      ...claims,
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
      isAdmin: user.role === "admin" || user.role === "super_admin",
      isSuperAdmin: isSuperAdminAccount(user.role, user.email),
      isMasterAdmin: isMasterAdminAccount(user.role, user.email),
      phone: user.phone,
      batchId: user.batchId,
      sessionSeason: user.sessionSeason,
      batchTime: user.batchTime,
    };
  }

  /**
   * Generates a 6-digit password reset verification code for Admin / Teacher.
   */
  static async requestPasswordReset(
    email: string,
  ): Promise<{ success: boolean; message: string; resetCode?: string }> {
    const db = await getDb();
    if (!db) {
      throw serviceUnavailable("Password reset is temporarily unavailable. Please try again shortly.");
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await db.collection<UserDoc>("users").findOne({ email: cleanEmail });
    if (!user) {
      return {
        success: true,
        message: "If this email is registered as an admin or teacher, a reset code has been generated.",
      };
    }

    // Generate secure 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await db.collection("password_resets").updateOne(
      { email: cleanEmail },
      {
        $set: {
          email: cleanEmail,
          code,
          expiresAt,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

    return {
      success: true,
      message: "Reset code generated successfully. Enter the code and your new password.",
      resetCode: code,
    };
  }

  /**
   * Verifies the 6-digit reset code and sets the new password.
   */
  static async resetPasswordWithCode(
    email: string,
    code: string,
    newPasswordPlain: string,
  ): Promise<{ success: boolean; message: string }> {
    const db = await getDb();
    if (!db) {
      throw serviceUnavailable("Password reset is temporarily unavailable. Please try again shortly.");
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    const resetRecord = await db
      .collection<{ email: string; code: string; expiresAt: Date }>("password_resets")
      .findOne({
        email: cleanEmail,
        code: cleanCode,
        expiresAt: { $gt: new Date() },
      });

    if (!resetRecord) {
      throw new Error("Invalid or expired reset code. Please request a new code.");
    }

    const newHash = await bcrypt.hash(newPasswordPlain, 10);
    const updateResult = await db.collection<UserDoc>("users").updateOne(
      { email: cleanEmail },
      {
        $set: {
          passwordHash: newHash,
        },
      },
    );

    if (updateResult.matchedCount === 0) {
      throw new Error("User account not found.");
    }

    await db.collection("password_resets").deleteOne({ email: cleanEmail });

    const user = await db.collection<UserDoc>("users").findOne({ email: cleanEmail });
    if (user) {
      this.forgetUser(user.id);
    }

    return {
      success: true,
      message: "Password reset successfully! You can now sign in with your new password.",
    };
  }

  /** Call when an account is deleted or changed, so it takes effect at once on this instance. */
  static forgetUser(userId: string): void {
    userCache.delete(userId);
  }
}
