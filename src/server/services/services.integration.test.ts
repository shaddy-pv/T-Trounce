import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Db } from "mongodb";
import { autoSeedDatabase, getDb } from "../db/client";
import { AppError } from "../errors";
import type { AttemptDoc, UserDoc } from "../db/schemas";
import { AssignmentService } from "./assignment.service";
import { AttemptService } from "./attempt.service";
import { AuthService } from "./auth.service";
import { FlagService } from "./flag.service";
import { MessageService } from "./message.service";
import { SettingsService } from "./settings.service";
import { StorageService } from "./storage.service";
import { StudentService, invalidateRosterCache } from "./student.service";
import { UserService } from "./user.service";

/**
 * These run against a real MongoDB (see tests/vitest-global-setup.ts), because most of the behaviour
 * that matters here is what actually ends up stored.
 */
let db: Db;

const WAVEFORM = Array.from({ length: 40 }, (_, i) => ({
  v: 0.2 + (i % 7) / 10,
  kind: "clear" as const,
}));

const AUDIO_DATA_URI = `data:audio/webm;codecs=opus;base64,${Buffer.alloc(3000, 7).toString("base64")}`;

function attemptPayload(id: string, studentId: string, overrides: Record<string, unknown> = {}) {
  return {
    studentId,
    moduleId: "hobby",
    result: {
      id,
      prompt: "Tell me about your hobby",
      durationSec: 30,
      pronunciation: 80,
      vocabulary: 70,
      grammar: 75,
      fillerCount: 0,
      pauseCount: 1,
      feedback: "ok",
      waveform: WAVEFORM,
      ...overrides,
    },
  };
}

async function makeUser(
  id: string,
  role: UserDoc["role"] = "student",
  extra: Partial<UserDoc> = {},
) {
  await db.collection<UserDoc>("users").insertOne({
    id,
    email: `${id}@example.test`.toLowerCase(),
    name: `Name ${id}`,
    role,
    passwordHash: "x",
    sessionSeason: "summer",
    batchTime: "morning",
    batchId: "summer-morning",
    createdAt: new Date(),
    ...extra,
  });
}

beforeEach(async () => {
  const connected = await getDb();
  if (!connected) throw new Error("Test database is not available");
  db = connected;

  for (const name of [
    "users",
    "students",
    "attempts",
    "flags",
    "messages",
    "assignments",
    "settings",
    "modules",
  ]) {
    await db.collection(name).deleteMany({});
  }
  await db.collection("modules").insertOne({ id: "hobby", durationSec: 45, order: 0 });
  invalidateRosterCache();
});

describe("AttemptService.saveAttempt", () => {
  it("stores audio with a server-generated URL", async () => {
    await makeUser("s1");
    const res = await AttemptService.saveAttempt(
      attemptPayload("a1", "s1", { audioUrl: AUDIO_DATA_URI, transcript: "hello" }),
    );

    const saved = await db.collection<AttemptDoc>("attempts").findOne({ id: "a1" });
    expect(res.success).toBe(true);
    expect(saved?.audioUrl).toMatch(/^\/api\/audio\/audio-/);
    expect(saved?.audioMimeType).toBe("audio/webm");
    expect(saved?.audioSize).toBe(3000);
  });

  it("is idempotent: retrying the same save does not create a duplicate", async () => {
    await makeUser("s1");
    const first = await AttemptService.saveAttempt(attemptPayload("a1", "s1"));
    const retry = await AttemptService.saveAttempt(attemptPayload("a1", "s1"));

    expect(retry).toEqual({ success: true, id: "a1", audioUrl: first.audioUrl });
    expect(await db.collection("attempts").countDocuments({ id: "a1" })).toBe(1);
  });

  it("survives concurrent retries of the same attempt", async () => {
    await makeUser("s1");
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        AttemptService.saveAttempt(attemptPayload("a1", "s1", { audioUrl: AUDIO_DATA_URI })),
      ),
    );

    expect(results.every((r) => r.success)).toBe(true);
    expect(await db.collection("attempts").countDocuments({ id: "a1" })).toBe(1);
  });

  it("reports failure if the ID belongs to another student, leaving their attempt untouched", async () => {
    await makeUser("s1");
    await makeUser("s2");
    await AttemptService.saveAttempt(attemptPayload("a1", "s1"));

    await expect(AttemptService.saveAttempt(attemptPayload("a1", "s2"))).rejects.toBeInstanceOf(
      AppError,
    );
    const saved = await db.collection<AttemptDoc>("attempts").findOne({ id: "a1" });
    expect(saved?.studentId).toBe("s1");
  });

  it("ignores a client-supplied audio URL or ID", async () => {
    await makeUser("s1");
    await AttemptService.saveAttempt(
      attemptPayload("a1", "s1", {
        audioUrl: "https://evil.example/x.mp3",
        audioId: "someone-elses-audio",
      }),
    );

    const saved = await db.collection<AttemptDoc>("attempts").findOne({ id: "a1" });
    expect(saved?.audioUrl).toBeUndefined();
    expect(saved?.audioId).toBeUndefined();
  });

  it("rejects HTML uploaded as audio and saves nothing", async () => {
    await makeUser("s1");
    const html = `data:text/html;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`;

    await expect(
      AttemptService.saveAttempt(attemptPayload("a1", "s1", { audioUrl: html })),
    ).rejects.toThrow(/Unsupported audio/);
    expect(await db.collection("attempts").countDocuments({ id: "a1" })).toBe(0);
  });

  it("takes the target duration from the server, not the client", async () => {
    await makeUser("s1");
    await AttemptService.saveAttempt(attemptPayload("a1", "s1", { targetDurationSec: 1 }));

    const saved = await db.collection<AttemptDoc>("attempts").findOne({ id: "a1" });
    expect(saved?.targetDurationSec).toBe(45);
  });

  it("creates one low-score flag, however many low attempts follow", async () => {
    await makeUser("s1");
    await AttemptService.saveAttempt(attemptPayload("a1", "s1", { durationSec: 5 }));
    await AttemptService.saveAttempt(attemptPayload("a2", "s1", { durationSec: 5 }));

    expect(
      await db.collection("flags").countDocuments({ studentId: "s1", type: "low_score" }),
    ).toBe(1);
  });

  it("marks the transcript failed, not complete, when no engine produced one", async () => {
    await makeUser("s1");
    await AttemptService.saveAttempt(attemptPayload("a1", "s1", { audioUrl: AUDIO_DATA_URI }));

    await expect
      .poll(
        async () =>
          (await db.collection<AttemptDoc>("attempts").findOne({ id: "a1" }))?.transcriptionStatus,
        { timeout: 10000 },
      )
      .toBe("failed");
  });
});

describe("AttemptService.updateTranscript", () => {
  it("only lets a student edit their own attempt", async () => {
    await makeUser("s1");
    await makeUser("s2");
    await AttemptService.saveAttempt(attemptPayload("a1", "s1"));

    await expect(AttemptService.updateTranscript("a1", "hacked", "s2")).rejects.toThrow(
      /Forbidden/,
    );
    const updated = await AttemptService.updateTranscript("a1", "um my real words", "s1");
    expect(updated.transcript).toBe("um my real words");
    expect(updated.fillerCount).toBe(1);
  });
});

describe("Session revocation", () => {
  it("ends access as soon as the account is deleted", async () => {
    await makeUser("s1");
    const user = await db.collection<UserDoc>("users").findOne({ id: "s1" });
    const token = await AuthService.createSessionToken(user!);

    expect((await AuthService.resolveSession(token))?.userId).toBe("s1");
    await UserService.deleteUser("s1");

    expect(await AuthService.resolveSession(token)).toBeNull();
    // The signature on its own is still valid, which is exactly why the database check is needed.
    expect(await AuthService.verifySessionToken(token)).not.toBeNull();
  });

  it("uses the current role from the database, not the role in the token", async () => {
    await makeUser("t1", "teacher");
    const user = await db.collection<UserDoc>("users").findOne({ id: "t1" });
    const token = await AuthService.createSessionToken(user!);

    await db.collection("users").updateOne({ id: "t1" }, { $set: { role: "student" } });
    AuthService.forgetUser("t1");

    expect((await AuthService.resolveSession(token))?.role).toBe("student");
  });

  it("grants master admin only to an admin account with the configured email", async () => {
    const email = process.env.ADMIN_EMAIL as string;

    await makeUser("fake", "teacher", { email });
    const asTeacher = await db.collection<UserDoc>("users").findOne({ id: "fake" });
    const teacherSession = await AuthService.resolveSession(
      await AuthService.createSessionToken(asTeacher!),
    );
    expect(teacherSession?.isMasterAdmin).toBe(false);

    await db.collection("users").updateOne({ id: "fake" }, { $set: { role: "admin" } });
    AuthService.forgetUser("fake");
    const adminSession = await AuthService.resolveSession(
      await AuthService.createSessionToken({ ...asTeacher!, role: "admin" }),
    );
    expect(adminSession?.isMasterAdmin).toBe(true);
  });

  it("rejects a token signed with another algorithm or secret", async () => {
    const { SignJWT } = await import("jose");
    const forged = await new SignJWT({ userId: "s1", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("wrong-secret-wrong-secret-wrong-secret"));
    expect(await AuthService.verifySessionToken(forged)).toBeNull();
    expect(await AuthService.resolveSession(forged)).toBeNull();
  });
});

describe("AuthService.authenticateUserWithRole", () => {
  beforeEach(async () => {
    await makeUser("s1", "student", { passwordHash: await bcrypt.hash("correct-password", 4) });
    await makeUser("a1", "admin", { passwordHash: await bcrypt.hash("correct-password", 4) });
  });

  it("accepts correct credentials regardless of email case", async () => {
    const user = await AuthService.authenticateUserWithRole(
      "S1@EXAMPLE.TEST",
      "correct-password",
      "student",
    );
    expect(user?.id).toBe("s1");
  });

  it("rejects a wrong password, an unknown email and the wrong portal", async () => {
    expect(
      await AuthService.authenticateUserWithRole("s1@example.test", "wrong", "student"),
    ).toBeNull();
    expect(
      await AuthService.authenticateUserWithRole("nobody@example.test", "x", "student"),
    ).toBeNull();
    expect(
      await AuthService.authenticateUserWithRole("s1@example.test", "correct-password", "teacher"),
    ).toBeNull();
  });

  it("lets administrators use either portal", async () => {
    const user = await AuthService.authenticateUserWithRole(
      "a1@example.test",
      "correct-password",
      "student",
    );
    expect(user?.role).toBe("admin");
  });
});

describe("UserService", () => {
  const input = {
    name: "New Student",
    email: "new@example.test",
    role: "student" as const,
    passwordPlain: "secret123",
  };

  it("gives a concurrent duplicate a clean message, without database details", async () => {
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => UserService.createUser(input)));
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(3);
    for (const failure of rejected) {
      expect(failure.reason).toBeInstanceOf(AppError);
      expect(failure.reason.message).toContain("already exists");
      expect(failure.reason.message).not.toMatch(/E11000|collection|index/);
    }
    expect(await db.collection("users").countDocuments({ email: input.email })).toBe(1);
  });

  it("starts a new student with no score, not an invented one", async () => {
    const created = await UserService.createUser(input);
    const row = await StudentService.getStudentById(created.id);

    expect(row?.scorePct).toBe(0);
    expect(row?.lastActive).toBe("Never");
    expect(row?.waveform).toEqual([]);
  });

  it("shows a new student on the roster immediately", async () => {
    expect(await StudentService.getRoster()).toHaveLength(0);
    await UserService.createUser(input);
    expect(await StudentService.getRoster()).toHaveLength(1);
  });

  it("never returns password hashes", async () => {
    await UserService.createUser(input);
    expect(JSON.stringify(await UserService.listUsers())).not.toContain("passwordHash");
  });

  it("refuses to delete an administrator", async () => {
    await makeUser("a1", "admin");
    await expect(UserService.deleteUser("a1")).rejects.toThrow(/cannot be deleted/);
    expect(await db.collection("users").countDocuments({ id: "a1" })).toBe(1);
  });
});

describe("StudentService", () => {
  it("shows the same status on the roster and on the student page", async () => {
    await makeUser("s1");
    await AttemptService.saveAttempt(attemptPayload("a1", "s1", { durationSec: 40 }));
    await FlagService.createFlag({ studentId: "s1", attemptId: "a1", type: "student_request" });
    invalidateRosterCache();

    const [fromRoster] = await StudentService.getRoster();
    const fromDetail = await StudentService.getStudentById("s1");

    expect(fromRoster.status).toBe("flagged");
    expect(fromDetail?.status).toBe("flagged");
    expect(fromDetail?.flagReason).toBe(fromRoster.flagReason);
    expect(fromDetail?.scorePct).toBe(fromRoster.scorePct);
  });

  it("uses each student's two latest attempts, across many attempts", async () => {
    await makeUser("s1");
    const older = new Date(Date.now() - 60000);
    await db.collection("attempts").insertMany(
      Array.from({ length: 20 }, (_, i) => ({
        id: `old-${i}`,
        studentId: "s1",
        durationSec: 10,
        targetDurationSec: 100,
        pronunciation: 70,
        vocabulary: 70,
        grammar: 70,
        waveform: WAVEFORM,
        createdAt: older,
      })),
    );
    await db.collection("attempts").insertOne({
      id: "latest",
      studentId: "s1",
      durationSec: 90,
      targetDurationSec: 100,
      pronunciation: 70,
      vocabulary: 70,
      grammar: 70,
      waveform: WAVEFORM,
      createdAt: new Date(),
    });

    const [row] = await StudentService.getRoster();
    expect(row.scorePct).toBe(90);
    expect(row.trendPct).toBe(80);
    expect(row.lastActive).toBe("Today");
  });

  it("returns a real waveform unchanged, including a flat one from a quiet recording", async () => {
    await makeUser("s1");
    const flat = Array.from({ length: 40 }, () => ({ v: 0.08, kind: "pause" as const }));
    await AttemptService.saveAttempt(attemptPayload("a1", "s1", { waveform: flat }));
    invalidateRosterCache();

    const [row] = await StudentService.getRoster();
    expect(row.waveform).toEqual(flat);
  });

  it("includes teacher feedback in the profile, so saved notes are not lost on reload", async () => {
    await makeUser("s1");
    await AttemptService.saveAttempt(attemptPayload("a1", "s1"));
    await AttemptService.saveTeacherFeedback("a1", "Great rhythm");

    const profile = await StudentService.getStudentProfile("s1");
    expect(profile?.attempts[0].teacherFeedback).toBe("Great rhythm");
  });
});

describe("FlagService", () => {
  it("refuses to flag another student's attempt", async () => {
    await makeUser("s1");
    await makeUser("s2");
    await AttemptService.saveAttempt(attemptPayload("a1", "s1"));

    await expect(FlagService.createFlag({ studentId: "s2", attemptId: "a1" })).rejects.toThrow(
      /Forbidden/,
    );
    const attempt = await db.collection<AttemptDoc>("attempts").findOne({ id: "a1" });
    expect(attempt?.isFlagged).toBeUndefined();
  });

  it("does not create a second open request for the same recording", async () => {
    await makeUser("s1");
    await AttemptService.saveAttempt(attemptPayload("a1", "s1", { durationSec: 40 }));

    const first = await FlagService.createFlag({ studentId: "s1", attemptId: "a1" });
    const second = await FlagService.createFlag({ studentId: "s1", attemptId: "a1" });
    expect(second.id).toBe(first.id);
  });

  it("clears the reason and restores the status once the last flag is resolved", async () => {
    await makeUser("s1");
    await db.collection("students").insertOne({ id: "s1", status: "on-track" });
    await AttemptService.saveAttempt(attemptPayload("a1", "s1", { durationSec: 40 }));
    const flag = await FlagService.createFlag({ studentId: "s1", attemptId: "a1" });

    await FlagService.resolveFlag({ flagId: flag.id, teacherId: "t", teacherName: "T" });

    const student = await db.collection("students").findOne({ id: "s1" });
    expect(student?.status).toBe("on-track");
    expect(student).not.toHaveProperty("flagReason");
  });
});

describe("MessageService", () => {
  it("only marks a message read for the student it belongs to", async () => {
    const msg = await MessageService.sendMessage({
      studentId: "s1",
      teacherId: "t",
      teacherName: "T",
      content: "hi",
    });

    expect(await MessageService.markMessageRead(msg.id, "s2")).toBe(false);
    expect((await MessageService.getMessagesForStudent("s1"))[0].read).toBe(false);

    expect(await MessageService.markMessageRead(msg.id, "s1")).toBe(true);
    expect((await MessageService.getMessagesForStudent("s1"))[0].read).toBe(true);
  });
});

describe("AssignmentService", () => {
  const assignment = {
    title: "Homework",
    instructions: "Speak",
    prompt: "Say something",
    difficulty: "Beginner" as const,
    durationSec: 60,
    targetSession: "summer" as const,
    targetBatch: "morning" as const,
    teacherId: "t",
    teacherName: "T",
  };

  it("does not show unrelated students when the target batch is empty", async () => {
    await makeUser("other", "student", { sessionSeason: "winter", batchTime: "evening" });
    const created = await AssignmentService.createAssignment(assignment);

    const data = await AssignmentService.getAssignmentSubmissions(created.id);
    expect(data?.pending).toHaveLength(0);
    expect(data?.totalStudents).toBe(0);
  });

  it("shows the real name of a student who submitted from another batch", async () => {
    await makeUser("moved", "student", { sessionSeason: "winter", batchTime: "evening" });
    const created = await AssignmentService.createAssignment(assignment);
    await AttemptService.saveAttempt({
      ...attemptPayload("a1", "moved"),
      assignmentId: created.id,
    });

    const data = await AssignmentService.getAssignmentSubmissions(created.id);
    expect(data?.completed[0].studentName).toBe("Name moved");
  });

  it("delivers reminders to the inboxes of students who have not submitted", async () => {
    await makeUser("done");
    await makeUser("pending1");
    await makeUser("pending2");
    const created = await AssignmentService.createAssignment(assignment);
    await AttemptService.saveAttempt({ ...attemptPayload("a1", "done"), assignmentId: created.id });

    const res = await AssignmentService.sendReminder({
      assignmentId: created.id,
      teacherId: "t",
      teacherName: "T",
    });

    expect(res.delivered).toBe(2);
    expect(await MessageService.getMessagesForStudent("pending1")).toHaveLength(1);
    expect(await MessageService.getMessagesForStudent("done")).toHaveLength(0);
  });

  it("removes attempt audio when an assignment is deleted", async () => {
    await makeUser("s1");
    const created = await AssignmentService.createAssignment(assignment);
    const saved = await AttemptService.saveAttempt({
      ...attemptPayload("a1", "s1", { audioUrl: AUDIO_DATA_URI, transcript: "hi" }),
      assignmentId: created.id,
    });
    const audioId = saved.audioUrl!.split("/").pop()!;

    await AssignmentService.deleteAssignment(created.id);

    expect(await db.collection("attempts").countDocuments({ assignmentId: created.id })).toBe(0);
    expect(await StorageService.getAudioStream(audioId)).toBeNull();
  });
});

describe("SettingsService", () => {
  it("does not create duplicates on concurrent first reads", async () => {
    await Promise.all(Array.from({ length: 8 }, () => SettingsService.getSettings()));
    expect(await db.collection("settings").countDocuments({ id: "global" })).toBe(1);
  });

  it("saves changes and keeps defaults for what was not changed", async () => {
    await SettingsService.updateSettings({ liveTranscriptionEnabled: true }, "admin");
    const settings = await SettingsService.getSettings();
    expect(settings.liveTranscriptionEnabled).toBe(true);
    expect(settings.postTranscriptionEnabled).toBe(true);
    expect(settings.updatedBy).toBe("admin");
  });
});

describe("First-run setup", () => {
  it("seeds a fresh database exactly once, and deleted homework does not come back", async () => {
    await db.collection("_meta").deleteMany({});
    await db.collection("batches").deleteMany({});

    await Promise.all([autoSeedDatabase(db), autoSeedDatabase(db), autoSeedDatabase(db)]);
    expect(await db.collection("users").countDocuments({ role: "admin" })).toBe(1);
    expect(await db.collection("assignments").countDocuments()).toBe(4);

    await db.collection("assignments").deleteMany({});
    await autoSeedDatabase(db);
    expect(await db.collection("assignments").countDocuments()).toBe(0);
  });

  it("does not add demo homework or delete students on an existing database", async () => {
    await db.collection("_meta").deleteMany({});
    await makeUser("real");
    await db.collection("students").insertOne({ id: "no-matching-user", status: "on-track" });

    await autoSeedDatabase(db);

    expect(await db.collection("assignments").countDocuments()).toBe(0);
    expect(await db.collection("students").countDocuments({ id: "no-matching-user" })).toBe(1);
  });
});
