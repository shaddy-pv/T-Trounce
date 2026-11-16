#!/usr/bin/env node
/**
 * Real User End-to-End Simulation Test:
 * Tests the entire user workflow mimicking a real student and a real teacher:
 * 1. Login & session cookies
 * 2. Student practice submission
 * 3. Student flagging / help request
 * 4. Teacher dashboard verification (Needs Attention)
 * 5. Teacher flag resolution & feedback
 * 6. CRUCIAL TEST: Page reload / fresh fetch — verifying flag does NOT reappear!
 * 7. Teacher academic alert status resolution & page refresh verification
 * 8. Teacher Direct Messaging & Student Inbox read
 * 9. Homework Assignment creation & retrieval
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { MongoClient, ObjectId } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import { toJSONAsync, fromCrossJSON } from "seroval";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 5588;
const BASE = `http://localhost:${PORT}`;
const SESSION_SECRET = "sim-secret-" + randomBytes(32).toString("hex");
const ADMIN_EMAIL = "admin@trounce.test";
const TEACHER_EMAIL = "teacher@trounce.test";
const STUDENT_EMAIL = "student@trounce.test";
const PASSWORD = "Password123!@#";
const DB_NAME = "trounce_user_sim";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadServerFnIds() {
  const dir = path.join(ROOT, "dist/server/assets");
  const ids = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const source = readFileSync(path.join(dir, file), "utf8");
    for (const m of source.matchAll(/id:\s*"([0-9a-f]{64})",\s*name:\s*"(\w+)"/g)) ids[m[2]] = m[1];
    for (const m of source.matchAll(/name:\s*"(\w+)",\s*id:\s*"([0-9a-f]{64})"/g)) ids[m[1]] = m[2];
  }
  return ids;
}

function parseCookie(res) {
  const raw = res.headers.get("set-cookie");
  if (!raw) return "";
  const match = raw.match(/trounce_session=([^;]+)/);
  return match ? `trounce_session=${match[1]}` : "";
}

function decodeResponse(json) {
  try {
    const keys = json?.p?.k;
    if (json?.t === 10 && Array.isArray(keys)) {
      const encodedError = json.p.v[keys.indexOf("error")];
      if (encodedError?.c === "$TSR/Error") {
        return { error: new Error(encodedError.s?.message?.s ?? "Unknown error") };
      }
    }
    const parsed = fromCrossJSON(json, { refs: new Map(), plugins: [] });
    if (parsed && typeof parsed === "object" && "result" in parsed) return { value: parsed.result };
    return { value: parsed };
  } catch {
    return { raw: json };
  }
}

async function callFn(ids, name, method, data, cookie = "") {
  const id = ids[name];
  if (!id) throw new Error(`Unknown server function: ${name}`);

  let url = `${BASE}/_serverFn/${id}`;
  const headers = {
    "x-tsr-serverFn": "true",
    accept: "application/json",
    "Sec-Fetch-Site": "same-origin",
    ...(cookie ? { cookie } : {}),
  };
  const payload = await toJSONAsync(data === undefined ? {} : { data }, {
    refs: new Map(),
    plugins: [],
  });
  const init = { method, headers };
  if (method === "GET") {
    if (data !== undefined) url += `?payload=${encodeURIComponent(JSON.stringify(payload))}`;
  } else {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(payload);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: res.ok, status: res.status, text };
  }

  const decoded = decodeResponse(json);
  const value = decoded.value ?? decoded.raw ?? decoded.error;
  return { ok: res.ok && !decoded.error, status: res.status, value, error: decoded.error, setCookie: parseCookie(res) };
}

async function runSimulation() {
  console.log("================================================================================");
  console.log("🧪 REAL USER SIMULATION TEST (Teacher & Student Lifecycle & Refresh Check)");
  console.log("================================================================================");

  // 1. Setup in-memory DB
  const mongod = await MongoMemoryServer.create({ binary: { version: "7.0.14" } });
  const uri = mongod.getUri();
  const audioDir = mkdtempSync(path.join(tmpdir(), "trounce-sim-audio-"));

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB_NAME);

  const passwordHash = await bcrypt.hash(PASSWORD, 8);
  const now = new Date();

  // Create accounts
  await db.collection("users").insertMany([
    {
      id: "admin-1",
      email: ADMIN_EMAIL,
      name: "Admin User",
      role: "admin",
      passwordHash,
      createdAt: now,
    },
    {
      id: "teacher-1",
      email: TEACHER_EMAIL,
      name: "Teacher Aarti",
      role: "teacher",
      passwordHash,
      createdAt: now,
    },
    {
      id: "student-1",
      email: STUDENT_EMAIL,
      name: "Rahul Verma",
      role: "student",
      batchId: "batch-morning",
      sessionSeason: "summer",
      batchTime: "morning",
      passwordHash,
      createdAt: now,
    },
  ]);

  await db.collection("students").insertOne({
    id: "student-1",
    name: "Rahul Verma",
    email: STUDENT_EMAIL,
    batchId: "batch-morning",
    status: "on-track",
    streakDays: 3,
    totalAttempts: 1,
    createdAt: now,
  });

  await db.collection("modules").insertOne({
    id: "mod-intro",
    title: "Self Introduction Drill",
    category: "Fluency",
    targetDurationSeconds: 30,
    text: "Introduce yourself in three clear spoken English sentences.",
    order: 1,
    createdAt: now,
  });

  await client.close();

  // 2. Start production server
  const ids = loadServerFnIds();
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOST: "localhost",
      SESSION_SECRET,
      ADMIN_EMAIL,
      ADMIN_INITIAL_PASSWORD: PASSWORD,
      MONGODB_URI: uri,
      MONGODB_DB_NAME: DB_NAME,
      AUDIO_STORAGE_DIR: audioDir,
      TRUSTED_PROXY_HOPS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stderr.on("data", (d) => console.error("[Server Error]", String(d).trim()));

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/login`);
      if (res.status === 200) break;
    } catch {
      await sleep(200);
    }
  }
  console.log("✅ Production Server running on port", PORT);

  let passedAll = true;
  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
    } else {
      console.error(`  FAIL: ${message}`);
      passedAll = false;
    }
  }

  // --- Step 1: Teacher & Student Log In ---
  console.log("\n[Step 1] Real Logins via loginFn:");
  const teacherLogin = await callFn(ids, "loginFn", "POST", {
    email: TEACHER_EMAIL,
    passwordPlain: PASSWORD,
    role: "teacher",
  });
  assert(teacherLogin.ok && teacherLogin.setCookie, "Teacher successfully logged in with JWT cookie");
  const teacherCookie = teacherLogin.setCookie;

  const studentLogin = await callFn(ids, "loginFn", "POST", {
    email: STUDENT_EMAIL,
    passwordPlain: PASSWORD,
    role: "student",
  });
  assert(studentLogin.ok && studentLogin.setCookie, "Student successfully logged in with JWT cookie");
  const studentCookie = studentLogin.setCookie;

  // --- Step 2: Student Fetches Curriculum & Submits Practice with Low Score ---
  console.log("\n[Step 2] Student Practices & Submits Recording with Low Score:");
  const modulesRes = await callFn(ids, "fetchModulesFn", "GET", undefined, studentCookie);
  assert(modulesRes.ok && modulesRes.value.length > 0, "Student fetched curriculum modules");

  const dummyAudio = Buffer.from("RIFF" + "spoken_audio_sample_bytes".repeat(20)).toString("base64");
  const saveAttemptRes = await callFn(
    ids,
    "saveAttemptFn",
    "POST",
    {
      moduleId: "mod-intro",
      result: {
        id: "attempt-user-sim-1",
        prompt: "Introduce yourself in three clear spoken English sentences.",
        durationSec: 25,
        pronunciation: 40,
        vocabulary: 48,
        grammar: 38,
        fillerCount: 4,
        pauseCount: 3,
        feedback: "Focus on fluency and verb forms.",
        waveform: [{ v: 0.2 }, { v: 0.3 }, { v: 0.1 }],
      },
    },
    studentCookie
  );
  assert(saveAttemptRes.ok && saveAttemptRes.value.id, `Practice attempt saved with ID: ${saveAttemptRes.value?.id}`);
  const attemptId = saveAttemptRes.value.id;

  // --- Step 3: Student Flags the Recording (Requests Guidance) ---
  console.log("\n[Step 3] Student Creates a Help Request Flag on Attempt:");
  const flagRes = await callFn(
    ids,
    "createFlagFn",
    "POST",
    {
      attemptId,
      category: "Pronunciation help needed",
    },
    studentCookie
  );
  assert(flagRes.ok && flagRes.value.id, `Flag created with ID: ${flagRes.value?.id}`);
  const flagId = flagRes.value.id;

  // --- Step 4: Teacher Views Dashboard & Flags Page ---
  console.log("\n[Step 4] Teacher Views Roster & Flags:");
  const rosterBefore = await callFn(ids, "fetchStudentRosterFn", "GET", undefined, teacherCookie);
  const studentRowBefore = rosterBefore.value.find((s) => s.id === "student-1");
  assert(studentRowBefore?.status === "flagged", `Teacher sees student marked as FLAGGED (Reason: ${studentRowBefore?.flagReason})`);

  const flagsBefore = await callFn(ids, "fetchFlagsFn", "GET", { status: "pending" }, teacherCookie);
  assert(flagsBefore.value.some((f) => f.id === flagId), "Teacher sees student's pending flag in /flags");

  // --- Step 5: Teacher Resolves the Flag with Feedback ---
  console.log("\n[Step 5] Teacher Resolves the Flag with Feedback Note:");
  const resolveRes = await callFn(
    ids,
    "resolveFlagFn",
    "POST",
    {
      flagId,
      status: "resolved",
      teacherFeedback: "Good attempt Rahul! Pay attention to your verb tenses ('I am learning'). Keep it up!",
    },
    teacherCookie
  );
  assert(resolveRes.ok, "Teacher successfully resolved the flag");

  // --- Step 6: CRUCIAL REFRESH TEST (F5 / Fresh Server Fetch) ---
  console.log("\n[Step 6] 🔍 CRUCIAL REFRESH TEST: Page reload after resolving flag:");
  const flagsAfterRefresh = await callFn(ids, "fetchFlagsFn", "GET", { status: "pending" }, teacherCookie);
  assert(!flagsAfterRefresh.value.some((f) => f.id === flagId), "After refresh: Resolved flag is NOT in pending flags list");

  const rosterAfterRefresh = await callFn(ids, "fetchStudentRosterFn", "GET", undefined, teacherCookie);
  const studentRowAfterRefresh = rosterAfterRefresh.value.find((s) => s.id === "student-1");
  console.log("  [DEBUG studentRowAfterRefresh]:", JSON.stringify(studentRowAfterRefresh, null, 2));
  assert(
    studentRowAfterRefresh?.status === "on-track",
    `After refresh: Student status is ON-TRACK (Current status: ${studentRowAfterRefresh?.status}) — FLAG DID NOT REAPPEAR! 🎉`
  );

  // --- Step 7: Teacher Updates Student Status & Refreshes (Academic Alert resolve) ---
  console.log("\n[Step 7] Teacher Explicitly Sets Status to on-track & Refreshes:");
  const updateStatusRes = await callFn(
    ids,
    "updateStudentStatusFn",
    "POST",
    { studentId: "student-1", status: "on-track" },
    teacherCookie
  );
  assert(updateStatusRes.ok, "Teacher updated student status to on-track");

  const rosterAfterSecondRefresh = await callFn(ids, "fetchStudentRosterFn", "GET", undefined, teacherCookie);
  const studentRowAfterSecond = rosterAfterSecondRefresh.value.find((s) => s.id === "student-1");
  assert(
    studentRowAfterSecond?.status === "on-track",
    `After second refresh: Student remains firmly ON-TRACK (status: ${studentRowAfterSecond?.status})`
  );

  // --- Step 8: Direct Messaging Teacher -> Student ---
  console.log("\n[Step 8] Teacher sends Direct Note, Student Reads & Marks Read:");
  const sendMsgRes = await callFn(
    ids,
    "sendDirectMessageFn",
    "POST",
    { studentId: "student-1", content: "Great progress today in session!" },
    teacherCookie
  );
  assert(sendMsgRes.ok && sendMsgRes.value.id, "Teacher sent direct note message");
  const msgId = sendMsgRes.value.id;

  const studentInbox = await callFn(ids, "fetchStudentMessagesFn", "GET", "student-1", studentCookie);
  assert(studentInbox.value.some((m) => m.id === msgId), "Student received message in inbox");

  const markReadRes = await callFn(ids, "markMessageReadFn", "POST", { messageId: msgId }, studentCookie);
  assert(markReadRes.ok, "Student marked message as read");

  const studentInboxAfter = await callFn(ids, "fetchStudentMessagesFn", "GET", "student-1", studentCookie);
  const readMsg = studentInboxAfter.value.find((m) => m.id === msgId);
  assert(readMsg?.read === true, "Message read status updated to true");

  // --- Step 9: Homework Assignment Creation & Fetch ---
  console.log("\n[Step 9] Teacher Creates Homework Assignment & Student Fetches:");
  const createAssignRes = await callFn(
    ids,
    "createAssignmentFn",
    "POST",
    {
      title: "Homework 1: Daily Routine",
      instructions: "Speak clearly and describe your day from morning to night.",
      prompt: "Describe your daily routine in 4 sentences.",
      difficulty: "Beginner",
      durationSec: 30,
      targetSession: "summer",
      targetBatch: "morning",
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
    },
    teacherCookie
  );
  assert(createAssignRes.ok && createAssignRes.value?.id, `Assignment created with ID: ${createAssignRes.value?.id}`);

  const studentAssignments = await callFn(ids, "fetchAssignmentsFn", "GET", undefined, studentCookie);
  assert(studentAssignments.value.some((a) => a.title === "Homework 1: Daily Routine"), "Student can view newly assigned homework");

  // Clean shutdown
  child.kill();
  await mongod.stop();
  rmSync(audioDir, { recursive: true, force: true });

  console.log("================================================================================");
  if (passedAll) {
    console.log("🎉 ALL USER WORKFLOW APIS TESTED & PASSED 100%!");
  } else {
    console.error("❌ SOME USER TESTS FAILED.");
    process.exit(1);
  }
  console.log("================================================================================");
}

runSimulation().catch((err) => {
  console.error("Fatal simulation error:", err);
  process.exit(1);
});
