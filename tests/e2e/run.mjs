#!/usr/bin/env node
/**
 * End-to-end checks against the real production build: `npm run build && npm run test:e2e`.
 *
 * Runs dist/ through scripts/serve.mjs, the same way production does, with a throwaway in-memory
 * MongoDB and a temporary audio folder. It never reads .env, and sets every value it depends on.
 *
 * The browser section needs Chrome or Edge (or CHROME_PATH). Without one it is reported as SKIPPED,
 * not as passed.
 */
import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { GridFSBucket, MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import puppeteer from "puppeteer-core";
import { fromCrossJSON, toJSONAsync } from "seroval";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.E2E_PORT || 4455);
const BASE = `http://localhost:${PORT}`;
const PASSWORD = `test-pass-${randomBytes(8).toString("hex")}`;
const E2E_SECRET = randomBytes(32).toString("hex");
const ADMIN_EMAIL = "admin@example.test";
const DB_NAME = "trounce_e2e";

// ---- Reporting ---------------------------------------------------------------------------------

const results = [];
let currentSection = "";

function section(name) {
  currentSection = name;
  console.log(`\n=== ${name} ===`);
}

function check(name, passed, detail = "") {
  results.push({ section: currentSection, name, passed });
  console.log(
    `${passed ? "  PASS" : "  FAIL"}  ${name}${!passed && detail ? `\n        ${detail}` : ""}`,
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- Environment -------------------------------------------------------------------------------

async function seedDatabase(uri) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB_NAME);
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const now = new Date();

  const user = (id, email, name, role) => ({
    id,
    email,
    name,
    role,
    passwordHash,
    phone: "9000000000",
    sessionSeason: "summer",
    batchTime: "morning",
    batchId: "summer-morning",
    createdAt: now,
  });

  await db
    .collection("users")
    .insertMany([
      user("admin-master", ADMIN_EMAIL, "Admin", "admin"),
      user("t1", "teacher1@example.test", "Teacher One", "teacher"),
      user("sA", "a@example.test", "Student A", "student"),
      user("sB", "b@example.test", "Student B", "student"),
      user("sC", "c@example.test", "Student C", "student"),
      user("sLock", "lock@example.test", "Lock Victim", "student"),
    ]);

  const waveform = Array.from({ length: 40 }, (_, i) => ({ v: 0.2 + (i % 7) / 10, kind: "clear" }));
  const attempt = (id, studentId, audioId, transcript, extra = {}) => ({
    id,
    studentId,
    moduleId: "weekend",
    prompt: "Prompt",
    transcript,
    audioId,
    audioUrl: `/api/audio/${audioId}`,
    durationSec: 30,
    targetDurationSec: 45,
    pronunciation: 80,
    vocabulary: 70,
    grammar: 75,
    fillerCount: 0,
    pauseCount: 1,
    feedback: "x",
    waveform,
    transcriptionStatus: "completed",
    createdAt: now,
    ...extra,
  });

  await db.collection("attempts").insertMany([
    attempt("att-B-1", "sB", "audio-seed-b", "STUDENT-B-PRIVATE-TRANSCRIPT", {
      teacherFeedback: "PRIVATE-TEACHER-NOTE",
    }),
    attempt("att-A-1", "sA", "audio-seed-a", "a transcript"),
  ]);

  await db.collection("messages").insertOne({
    id: "msg-B-1",
    studentId: "sB",
    teacherId: "t1",
    teacherName: "Teacher One",
    content: "private note for B",
    read: false,
    senderRole: "teacher",
    createdAt: now,
  });

  const bucket = new GridFSBucket(db, { bucketName: "audio_recordings" });
  for (const [audioId, mimeType] of [
    ["audio-seed-b", "audio/mp4"],
    ["audio-seed-a", "audio/webm"],
  ]) {
    await new Promise((resolve, reject) => {
      const upload = bucket.openUploadStream(`${audioId}.bin`, {
        metadata: { audioId, mimeType, createdAt: now },
      });
      upload.once("finish", resolve);
      upload.once("error", reject);
      upload.end(Buffer.from("0123456789".repeat(100)));
    });
  }

  return { client, db };
}

function startServer(env) {
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOST: "localhost",
      SESSION_SECRET: E2E_SECRET,
      ADMIN_EMAIL,
      ADMIN_INITIAL_PASSWORD: PASSWORD,
      WHISPER_SIDECAR_URL: "http://sidecar.invalid:9",
      TRUSTED_PROXY_HOPS: "1",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.logs = [];
  child.stdout.on("data", (chunk) => child.logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => child.logs.push(String(chunk)));
  child.exitInfo = null;
  child.exited = new Promise((resolve) =>
    child.on("exit", (code, signal) => {
      child.exitInfo = { code, signal };
      resolve();
    }),
  );
  return child;
}

async function waitForServer() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE}/login`, { redirect: "manual" });
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Server did not start");
}

async function stopServer(child) {
  child.kill();
  await Promise.race([child.exited, sleep(5000)]);
}

// ---- Calling server functions over HTTP --------------------------------------------------------

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

/**
 * Decodes the server-function response. Errors use a framework-specific tag that plain seroval can't
 * read, so they are picked out first.
 */
function decodeResponse(json) {
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
}

class ApiClient {
  constructor(ids, forwardedFor) {
    this.ids = ids;
    this.cookie = "";
    this.forwardedFor = forwardedFor;
  }

  /** Returns { value, error, status, text, setCookies } for a server function call. */
  async call(name, method, data) {
    const id = this.ids[name];
    if (!id) throw new Error(`Unknown server function: ${name}`);

    let url = `${BASE}/_serverFn/${id}`;
    const headers = {
      "x-tsr-serverFn": "true",
      accept: "application/json",
      "Sec-Fetch-Site": "same-origin",
      ...(this.cookie ? { cookie: this.cookie } : {}),
      ...(this.forwardedFor ? { "x-forwarded-for": this.forwardedFor } : {}),
    };
    const payload = await toJSONAsync(data === undefined ? {} : { data }, {
      refs: new Map(),
      plugins: [],
    });
    const init = { method, headers, redirect: "manual" };
    if (method === "GET") {
      if (data !== undefined) url += `?payload=${encodeURIComponent(JSON.stringify(payload))}`;
    } else {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(payload);
    }

    const res = await fetch(url, init);
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      const separator = pair.indexOf("=");
      const key = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (key.endsWith("_session")) this.cookie = value ? `${key}=${value}` : "";
    }

    const text = await res.text();
    let decoded;
    try {
      decoded = res.headers.get("x-tss-serialized")
        ? decodeResponse(JSON.parse(text))
        : { value: JSON.parse(text) };
    } catch {
      decoded = { value: text };
    }

    const error = decoded.error ?? (res.status >= 400 ? new Error(`HTTP ${res.status}`) : null);
    return {
      value: error ? undefined : decoded.value,
      error,
      status: res.status,
      text,
      setCookies,
    };
  }

  login(email, role = "student", password = PASSWORD) {
    return this.call("loginFn", "POST", { email, passwordPlain: password, role });
  }
}

const attemptPayload = (id, extra = {}) => ({
  studentId: "sA",
  moduleId: "weekend",
  result: {
    id,
    prompt: "p",
    durationSec: 10,
    targetDurationSec: 45,
    pronunciation: 90,
    vocabulary: 90,
    grammar: 90,
    fillerCount: 0,
    pauseCount: 0,
    feedback: "f",
    waveform: [{ v: 0.5, kind: "clear" }],
    ...extra,
  },
});

// ---- HTTP checks -------------------------------------------------------------------------------

async function runHttpChecks(db, ids) {
  const anon = new ApiClient(ids);
  const A = new ApiClient(ids);
  const B = new ApiClient(ids);
  const C = new ApiClient(ids);
  const T = new ApiClient(ids);
  const Admin = new ApiClient(ids);
  await A.login("a@example.test");
  await B.login("b@example.test");
  await C.login("c@example.test");
  await T.login("teacher1@example.test", "teacher");
  await Admin.login(ADMIN_EMAIL, "teacher");

  section("Authentication");
  check("Student login sets a session", Boolean(A.cookie));
  const badLogin = await new ApiClient(ids, "203.0.113.200").login(
    "a@example.test",
    "student",
    "wrong-password",
  );
  check(
    "Wrong password gives a clear, generic message",
    String(badLogin.error?.message).includes("Invalid email or password"),
    String(badLogin.error?.message),
  );
  const wrongPortal = await new ApiClient(ids, "203.0.113.201").login("a@example.test", "teacher");
  check("A student cannot sign in through the teacher portal", Boolean(wrongPortal.error));

  const loginRes = await new ApiClient(ids, "203.0.113.202").login("b@example.test");
  const sessionCookie = loginRes.setCookies.find((c) => c.startsWith("trounce_session=")) ?? "";
  check("Session cookie is HttpOnly", /HttpOnly/i.test(sessionCookie));
  check("Session cookie is Secure in production", /Secure/i.test(sessionCookie));
  check("Session cookie is SameSite=Lax", /SameSite=Lax/i.test(sessionCookie));

  const invalidEmail = await new ApiClient(ids).call("loginFn", "POST", {
    email: "not-an-email",
    passwordPlain: "x",
    role: "student",
  });
  check(
    "Validation errors are readable, not raw JSON",
    invalidEmail.error?.message === "Please enter a valid email address",
    String(invalidEmail.error?.message),
  );

  const crossSite = await fetch(`${BASE}/_serverFn/${ids.logoutFn}`, {
    method: "POST",
    headers: {
      "x-tsr-serverFn": "true",
      "content-type": "application/json",
      "Sec-Fetch-Site": "cross-site",
      cookie: A.cookie,
    },
    body: "{}",
  });
  check(
    "A cross-site request is blocked (CSRF)",
    crossSite.status === 403,
    `HTTP ${crossSite.status}`,
  );
  const noOrigin = await fetch(`${BASE}/_serverFn/${ids.logoutFn}`, {
    method: "POST",
    headers: { "x-tsr-serverFn": "true", "content-type": "application/json", cookie: A.cookie },
    body: "{}",
  });
  check(
    "A request with no origin information is blocked",
    noOrigin.status === 403,
    `HTTP ${noOrigin.status}`,
  );

  const logoutClient = new ApiClient(ids);
  await logoutClient.login("c@example.test");
  const logout = await logoutClient.call("logoutFn", "POST");
  check(
    "Logout clears the cookie at path /",
    logout.setCookies.some((c) => c.startsWith("trounce_session=;") && /Path=\//i.test(c)),
  );

  const session = await anon.call("getSessionFn", "GET");
  check("Anonymous session is null", session.value === null || session.value === undefined);

  const preDelete = await C.call("fetchStudentAttemptsFn", "GET", "sC");
  await Admin.call("deleteUserFn", "POST", { userId: "sC" });
  const postDelete = await C.call("fetchStudentAttemptsFn", "GET", "sC");
  check("Session works before the account is deleted", !preDelete.error);
  check(
    "Deleted user loses access immediately",
    Boolean(postDelete.error) && /sign in|session/i.test(String(postDelete.error.message)),
    String(postDelete.error?.message),
  );
  const deletedAudio = await fetch(`${BASE}/api/audio/audio-seed-a`, {
    headers: { cookie: C.cookie },
  });
  check("Deleted user cannot fetch audio", deletedAudio.status === 401);

  section("Authorization");
  let res = await fetch(`${BASE}/api/audio/audio-seed-b`);
  check("Anonymous user cannot download a recording", res.status === 401, `HTTP ${res.status}`);

  res = await fetch(`${BASE}/api/audio/audio-seed-b`, { headers: { cookie: A.cookie } });
  check("A student cannot download another student's recording", res.status === 404);

  res = await fetch(`${BASE}/api/audio/audio-seed-b`, { headers: { cookie: B.cookie } });
  check("A student can download their own recording", res.status === 200);
  check(
    "Recordings are never publicly cacheable",
    /private/.test(res.headers.get("cache-control") ?? "") &&
      !/public/.test(res.headers.get("cache-control") ?? ""),
    res.headers.get("cache-control"),
  );

  res = await fetch(`${BASE}/api/audio/audio-seed-b`, { headers: { cookie: T.cookie } });
  check("A teacher can download a student's recording", res.status === 200);

  const leaked = await A.call("fetchAttemptByIdFn", "GET", "att-B-1");
  check(
    "A student cannot read another student's attempt",
    Boolean(leaked.error) && !leaked.text.includes("STUDENT-B-PRIVATE-TRANSCRIPT"),
  );
  const own = await B.call("fetchAttemptByIdFn", "GET", "att-B-1");
  check("A student can read their own attempt", own.value?.id === "att-B-1");
  const asTeacher = await T.call("fetchAttemptByIdFn", "GET", "att-B-1");
  check("A teacher can read a student's attempt", asTeacher.value?.id === "att-B-1");

  await A.call("sendDirectMessageFn", "POST", {
    studentId: "sB",
    teacherName: "School Principal",
    teacherId: "t1",
    content: "INJECTED-MESSAGE",
  });
  check(
    "A student cannot inject a message into another student's inbox",
    (await db
      .collection("messages")
      .countDocuments({ studentId: "sB", content: "INJECTED-MESSAGE" })) === 0,
  );
  const ownThread = await db.collection("messages").findOne({ content: "INJECTED-MESSAGE" });
  check(
    "A student's message goes to their own thread with the real teacher name",
    ownThread?.studentId === "sA" && ownThread?.teacherName === "Teacher One",
    JSON.stringify({ s: ownThread?.studentId, t: ownThread?.teacherName }),
  );

  await A.call("markMessageReadFn", "POST", { messageId: "msg-B-1" });
  check(
    "A student cannot mark another student's message as read",
    (await db.collection("messages").findOne({ id: "msg-B-1" })).read === false,
  );

  await A.call("createFlagFn", "POST", { attemptId: "att-B-1", category: "x" });
  check(
    "A student cannot flag another student's attempt",
    !(await db.collection("attempts").findOne({ id: "att-B-1" })).isFlagged,
  );

  const roster = await A.call("fetchStudentRosterFn", "GET", {});
  check("A student cannot read the roster", Boolean(roster.error));
  const users = await A.call("fetchUsersFn", "GET");
  check("A student cannot list users", Boolean(users.error));
  const createAsStudent = await A.call("createUserFn", "POST", {
    name: "X Y",
    email: "x@example.test",
    role: "teacher",
    passwordPlain: "abcdef123",
  });
  check("A student cannot create users", Boolean(createAsStudent.error));
  const deleteAsTeacher = await T.call("deleteUserFn", "POST", { userId: "sB" });
  check("A teacher cannot delete users", Boolean(deleteAsTeacher.error));

  for (const [name, method, data] of [
    ["fetchModulesFn", "GET"],
    ["fetchAssignmentsFn", "GET"],
    ["warmupWhisperFn", "POST"],
    ["getAppSettingsFn", "GET"],
    ["saveAttemptFn", "POST", attemptPayload("anon")],
    ["streamTranscribeChunkFn", "POST", { audioBase64: "AAAA" }],
  ]) {
    const r = await anon.call(name, method, data);
    check(`Anonymous user is refused: ${name}`, Boolean(r.error));
  }

  await T.call("createUserFn", "POST", {
    name: "Fake Master",
    email: "shadanmd566@gmail.com",
    role: "teacher",
    passwordPlain: "abcdef123",
  });
  const fakeMaster = new ApiClient(ids, "203.0.113.203");
  await fakeMaster.login("shadanmd566@gmail.com", "teacher", "abcdef123");
  const escalate = await fakeMaster.call("updateAppSettingsFn", "POST", {
    liveTranscriptionEnabled: true,
  });
  check("A teacher account using the master email cannot change settings", Boolean(escalate.error));
  await db.collection("users").deleteOne({ email: "shadanmd566@gmail.com" });

  const asAdmin = await Admin.call("updateAppSettingsFn", "POST", {
    liveTranscriptionEnabled: false,
  });
  check("The configured master administrator can change settings", !asAdmin.error);

  const stranger = await B.call("getAppSettingsFn", "GET");
  check("Students do not see who changed settings", !("updatedBy" in (stranger.value ?? {})));

  section("Uploads and stored data");
  const validAudio = `data:audio/webm;codecs=opus;base64,${Buffer.alloc(3000, 1).toString("base64")}`;

  let saved = await A.call(
    "saveAttemptFn",
    "POST",
    attemptPayload("att-audio", { audioUrl: validAudio, transcript: "hi" }),
  );
  const audioUrl = saved.value?.audioUrl;
  check(
    "A valid recording is stored",
    /^\/api\/audio\/audio-/.test(audioUrl ?? ""),
    JSON.stringify(saved.value),
  );
  res = await fetch(`${BASE}${audioUrl}`, { headers: { cookie: A.cookie } });
  check("The saved recording is served to its owner", res.status === 200);
  check(
    "Audio responses are locked down",
    res.headers.get("content-security-policy") === "default-src 'none'; sandbox" &&
      res.headers.get("x-content-type-options") === "nosniff",
  );

  saved = await A.call(
    "saveAttemptFn",
    "POST",
    attemptPayload("att-html", {
      audioUrl: `data:text/html;base64,${Buffer.from("<script>alert(1)</script>".padEnd(2600)).toString("base64")}`,
    }),
  );
  check(
    "HTML uploaded as audio is rejected (stored XSS)",
    Boolean(saved.error) &&
      (await db.collection("attempts").countDocuments({ id: "att-html" })) === 0,
  );

  await A.call(
    "saveAttemptFn",
    "POST",
    attemptPayload("att-evil", { audioUrl: "https://evil.example/x.mp3", audioId: "audio-seed-b" }),
  );
  const evil = await db.collection("attempts").findOne({ id: "att-evil" });
  check(
    "A client-supplied audio URL and ID are ignored",
    evil && !evil.audioUrl && !evil.audioId,
    JSON.stringify({ u: evil?.audioUrl, i: evil?.audioId }),
  );

  const stolen = await fetch(`${BASE}/api/audio/audio-seed-b`, { headers: { cookie: A.cookie } });
  check("Claiming another student's audio ID does not grant access", stolen.status === 404);

  saved = await A.call("saveAttemptFn", "POST", attemptPayload("att-B-1"));
  check(
    "Saving over another student's attempt ID reports failure",
    Boolean(saved.error) &&
      (await db.collection("attempts").findOne({ id: "att-B-1" })).studentId === "sB",
  );

  const first = await A.call("saveAttemptFn", "POST", attemptPayload("att-retry"));
  const retried = await A.call("saveAttemptFn", "POST", attemptPayload("att-retry"));
  check(
    "Retrying a save is safe",
    first.value?.success === true &&
      retried.value?.success === true &&
      (await db.collection("attempts").countDocuments({ id: "att-retry" })) === 1,
  );

  const oversizeZod = await A.call("streamTranscribeChunkFn", "POST", {
    audioBase64: "A".repeat(25 * 1024 * 1024),
  });
  check("An oversized transcription clip is rejected", Boolean(oversizeZod.error));
  const oversizeHttp = await A.call("streamTranscribeChunkFn", "POST", {
    audioBase64: "A".repeat(40 * 1024 * 1024),
  });
  check(
    "A request over the body limit gets HTTP 413",
    oversizeHttp.status === 413,
    `HTTP ${oversizeHttp.status}`,
  );

  section("Audio streaming");
  const fetchAudio = (range) =>
    fetch(`${BASE}/api/audio/audio-seed-b`, {
      headers: { cookie: B.cookie, ...(range ? { range } : {}) },
    });
  const firstType = (await fetchAudio()).headers.get("content-type");
  const secondType = (await fetchAudio()).headers.get("content-type");
  check("Type is correct on first request", firstType === "audio/mp4", firstType);
  check(
    "Type is correct after the disk cache is populated",
    secondType === "audio/mp4",
    secondType,
  );

  res = await fetchAudio("bytes=-5");
  check(
    "Suffix range returns the last bytes",
    res.status === 206 && (await res.text()) === "56789",
  );
  res = await fetchAudio("bytes=990-5000");
  check(
    "An over-long range is clamped",
    res.status === 206 && res.headers.get("content-range") === "bytes 990-999/1000",
  );
  res = await fetchAudio("bytes=50-10");
  check("An inverted range gets 416", res.status === 416);
  res = await fetchAudio("bytes=5-9");
  check(
    "A normal range returns exactly those bytes",
    res.status === 206 && (await res.text()) === "56789",
  );
  res = await fetch(`${BASE}/api/audio/audio-seed-b`, {
    method: "HEAD",
    headers: { cookie: B.cookie },
  });
  check(
    "HEAD returns headers and no body",
    res.status === 200 && res.headers.get("content-length") === "1000" && (await res.text()) === "",
  );
  res = await fetch(`${BASE}/api/audio/audio-seed-b`, {
    method: "POST",
    headers: { cookie: B.cookie },
  });
  check("Other methods are refused", res.status === 405);
  for (const attack of ["..%2F..%2Fpackage", "..%5C..%5Cpackage", "%2e%2e%2fsecret"]) {
    res = await fetch(`${BASE}/api/audio/${attack}`, { headers: { cookie: T.cookie } });
    check(`Audio path traversal is refused: ${attack}`, res.status === 404, `HTTP ${res.status}`);
  }

  section("Rate limiting");
  const attacker = new ApiClient(ids, "198.51.100.1");
  for (let i = 0; i < 7; i++) await attacker.login("lock@example.test", "student", "wrong");
  const attackerNext = await attacker.login("lock@example.test", "student", PASSWORD);
  check(
    "Repeated attempts from one address are throttled",
    /Too many/.test(String(attackerNext.error?.message)),
    String(attackerNext.error?.message),
  );
  const victim = new ApiClient(ids, "198.51.100.2");
  await victim.login("lock@example.test");
  check("An attacker cannot lock the real user out from another address", Boolean(victim.cookie));

  const sprayIp = "198.51.100.3";
  let blocked = false;
  for (let i = 0; i < 70 && !blocked; i++) {
    const r = await new ApiClient(ids, sprayIp).login(
      `spray${i}@example.test`,
      "student",
      "Password1",
    );
    blocked = /Too many/.test(String(r.error?.message));
  }
  check("Trying many accounts from one address gets blocked", blocked);

  const forged = await new ApiClient(ids, `1.1.1.1, ${sprayIp}`).login(
    "spray-x@example.test",
    "student",
    "Password1",
  );
  check(
    "A forged X-Forwarded-For entry does not bypass the limit",
    /Too many/.test(String(forged.error?.message)),
  );

  const classroomIp = "198.51.100.4";
  await db.collection("users").insertMany(
    Array.from({ length: 40 }, (_, i) => ({
      id: `class${i}`,
      email: `class${i}@example.test`,
      name: `C${i}`,
      role: "student",
      passwordHash: "x",
      createdAt: new Date(),
    })),
  );
  const passwordHash = (await db.collection("users").findOne({ id: "sA" })).passwordHash;
  await db.collection("users").updateMany({ id: /^class/ }, { $set: { passwordHash } });
  let classroomOk = 0;
  for (let i = 0; i < 40; i++) {
    const c = new ApiClient(ids, classroomIp);
    await c.login(`class${i}@example.test`);
    if (c.cookie) classroomOk++;
  }
  check(
    "A whole class signing in from one shared address is not blocked",
    classroomOk === 40,
    `${classroomOk}/40`,
  );

  section("Error handling");
  const race = await Promise.all(
    [1, 2, 3].map(() =>
      T.call("createUserFn", "POST", {
        name: "Racer",
        email: "race@example.test",
        role: "student",
        passwordPlain: "abcdef123",
      }),
    ),
  );
  const raceText = race.map((r) => r.text).join(" ");
  check(
    "Exactly one concurrent duplicate account is created",
    race.filter((r) => !r.error).length === 1,
  );
  check("Database errors are not exposed", !/E11000|duplicate key|trounce_e2e/.test(raceText));
  check("No stack traces in error responses", !/node_modules|at async|\.js:\d+/.test(raceText));

  section("Headers, caching and compression");
  const clientDir = path.join(ROOT, "dist/client/assets");
  const devBuild = readdirSync(clientDir).some(
    (file) =>
      file.endsWith(".js") && readFileSync(path.join(clientDir, file), "utf8").includes("jsxDEV"),
  );
  check("The build is a production bundle, not a development one", !devBuild);

  res = await fetch(`${BASE}/login`, { headers: { "accept-encoding": "gzip" } });
  for (const header of [
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "strict-transport-security",
  ]) {
    check(`Page has ${header}`, Boolean(res.headers.get(header)));
  }
  check(
    "Pages are compressed",
    res.headers.get("content-encoding") === "gzip",
    res.headers.get("content-encoding"),
  );
  check(
    "Microphone is allowed for this site",
    /microphone=\(self\)/.test(res.headers.get("permissions-policy") ?? ""),
  );

  const html = await res.text();
  const assetPath = html.match(/\/assets\/[\w.-]+\.js/)?.[0];
  check("Page references a hashed asset", Boolean(assetPath));
  res = await fetch(`${BASE}${assetPath}`, { headers: { "accept-encoding": "br, gzip" } });
  check(
    "Hashed assets are cached for a year",
    /immutable/.test(res.headers.get("cache-control") ?? ""),
  );
  check("Assets are brotli compressed", res.headers.get("content-encoding") === "br");
  check("Assets also carry security headers", Boolean(res.headers.get("x-content-type-options")));

  res = await fetch(`${BASE}/sw.js`);
  check(
    "The service worker is never cached long-term",
    res.headers.get("cache-control") === "no-cache",
  );
  check(
    "The service worker has a JavaScript type",
    /javascript/.test(res.headers.get("content-type") ?? ""),
  );
  const swSource = await res.text();
  check(
    "The service worker carries a build ID",
    !swSource.includes("__BUILD_ID__") && /const BUILD_ID = "[0-9a-f]{12}"/.test(swSource),
  );

  res = await fetch(`${BASE}/icons/icon-192x192.png`, { headers: { "accept-encoding": "gzip" } });
  check("PNGs are not recompressed", !res.headers.get("content-encoding"));

  for (const attack of [
    "/..%2F..%2Fpackage.json",
    "/%2e%2e/%2e%2e/package.json",
    "/assets/..%2f..%2f..%2fpackage.json",
  ]) {
    res = await fetch(`${BASE}${attack}`, { redirect: "manual" });
    const body = await res.text();
    check(
      `Static path traversal is refused: ${attack}`,
      !body.includes('"srvx"') && !body.includes('"dependencies"'),
    );
  }

  res = await fetch(`${BASE}/api/health`);
  const health = await res.json();
  check("Health endpoint reports the database", res.status === 200 && health.database === true);
  check(
    "Health endpoint reveals nothing else",
    Object.keys(health).sort().join() === "database,status",
  );

  section("PWA manifest");
  res = await fetch(`${BASE}/manifest.webmanifest`);
  check(
    "Manifest has the correct type",
    /application\/manifest\+json/.test(res.headers.get("content-type") ?? ""),
  );
  const manifest = await res.json();
  for (const field of [
    "name",
    "short_name",
    "start_url",
    "scope",
    "display",
    "theme_color",
    "background_color",
    "icons",
    "id",
  ]) {
    check(`Manifest has ${field}`, Boolean(manifest[field]));
  }
  check("Display mode is standalone", manifest.display === "standalone");
  check(
    "Scope and start URL are the site root",
    manifest.scope === "/" && manifest.start_url === "/",
  );
  const sizes = manifest.icons.map((icon) => icon.sizes);
  for (const size of [
    "72x72",
    "96x96",
    "128x128",
    "144x144",
    "152x152",
    "192x192",
    "384x384",
    "512x512",
  ]) {
    check(`Manifest has a ${size} icon`, sizes.includes(size));
  }
  check(
    "Manifest has maskable icons",
    manifest.icons.filter((icon) => icon.purpose === "maskable").length >= 2,
  );
  for (const icon of manifest.icons) {
    const iconRes = await fetch(`${BASE}${icon.src}`);
    const bytes = Buffer.from(await iconRes.arrayBuffer());
    let valid = iconRes.status === 200;
    if (icon.type === "image/png") {
      const [w, h] = icon.sizes.split("x").map(Number);
      valid =
        valid &&
        bytes.toString("latin1", 1, 4) === "PNG" &&
        bytes.readUInt32BE(16) === w &&
        bytes.readUInt32BE(20) === h;
    }
    check(`Icon file is valid: ${icon.src}`, valid);
  }
  res = await fetch(`${BASE}/manifest.json`, { redirect: "manual" });
  check(
    "The duplicate manifest is gone",
    res.status !== 200 || !(res.headers.get("content-type") ?? "").includes("json"),
  );
}

// ---- Browser checks ----------------------------------------------------------------------------

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const FIREFOX_UA = "Mozilla/5.0 (Windows NT 10.0; rv:130.0) Gecko/20100101 Firefox/130.0";

const fireInstallPrompt = (page, outcome) =>
  page.evaluate((chosen) => {
    window.__promptCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = () => {
      window.__promptCalls++;
      return Promise.resolve();
    };
    event.userChoice = Promise.resolve({ outcome: chosen });
    window.dispatchEvent(event);
  }, outcome);

const bodyText = (page) => page.evaluate(() => document.body.innerText);

async function clickButtonWithText(page, text) {
  return page.evaluate((label) => {
    const target = [...document.querySelectorAll("button, a")].find(
      (el) => el.offsetParent !== null && el.textContent.trim().includes(label),
    );
    if (!target) return false;
    target.click();
    return true;
  }, text);
}

async function loginViaUi(page, email, roleButton) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  if (roleButton) await clickButtonWithText(page, roleButton);
  await page.type("input[type=email]", email);
  await page.type("input[type=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => {});
}

async function freshContext(browser, { userAgent, viewport, recorderHook } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.problems = [];
  page.on("console", (message) => {
    const isProblem = /Content Security Policy|Hydration|hydrat|Minified React error/i.test(
      message.text(),
    );
    if (message.type() === "error" && isProblem) {
      page.problems.push(message.text().slice(0, 200));
    }
  });
  page.on("pageerror", (error) => page.problems.push(`pageerror: ${error.message}`.slice(0, 200)));
  if (userAgent) await page.setUserAgent(userAgent);
  if (viewport) await page.setViewport(viewport);
  if (recorderHook) await page.evaluateOnNewDocument(recorderHook);
  return { context, page };
}

async function waitForServiceWorker(page) {
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg?.active?.state === "activated";
    },
    { timeout: 30000, polling: 250 },
  );
}

async function runBrowserChecks(browser, db, restartServer) {
  section("PWA: real browser");
  {
    // Chrome reports nothing useful for incognito windows, so this uses the normal profile.
    const page = await browser.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    const cdp = await page.createCDPSession();
    const manifest = await cdp.send("Page.getAppManifest");
    check(
      "Chrome reads the manifest without errors",
      manifest.errors.length === 0,
      JSON.stringify(manifest.errors),
    );
    const installability = await cdp.send("Page.getInstallabilityErrors");
    check(
      "Chrome reports the app is installable",
      installability.installabilityErrors.length === 0,
      JSON.stringify(installability.installabilityErrors),
    );
    await page.close();
  }
  {
    const { context, page } = await freshContext(browser);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });

    await waitForServiceWorker(page);
    check("The service worker registers and activates", true);
    await page.reload({ waitUntil: "networkidle2" });
    check(
      "The service worker controls the page",
      await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    );

    await page.type("input[type=email]", "a@example.test");
    await page.type("input[type=password]", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname.startsWith("/practice"), { timeout: 30000 });
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 30000 }).catch(() => {});
    await page.goto(`${BASE}/progress`, { waitUntil: "networkidle2" });

    const caches = await page.evaluate(async () => {
      const out = { names: [], urls: [], htmlPaths: [], leaks: [] };
      out.names = await caches.keys();
      for (const name of out.names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          out.urls.push(url.pathname);
          const response = await cache.match(request);
          if ((response.headers.get("content-type") || "").includes("text/html")) {
            out.htmlPaths.push(url.pathname);
          }
          const text = await response
            .clone()
            .text()
            .catch(() => "");
          if (text.includes("a@example.test") || text.includes("Student A"))
            out.leaks.push(url.pathname);
        }
      }
      return out;
    });
    check(
      "Caches contain build assets",
      caches.urls.some((u) => u.startsWith("/assets/")),
    );
    check(
      "Only the offline page is cached as HTML",
      caches.htmlPaths.join() === "/offline.html",
      caches.htmlPaths.join(),
    );
    check(
      "No API or server-function response is cached",
      !caches.urls.some((u) => /^\/(api|_serverFn)/.test(u)),
    );
    check("No private user data is in any cache", caches.leaks.length === 0, caches.leaks.join());
    check(
      "Caches are versioned by build",
      caches.names.some((n) => /^trounce-assets-[0-9a-f]{12}$/.test(n)),
      caches.names.join(),
    );

    await page.setOfflineMode(true);
    const offline = await page
      .goto(`${BASE}/practice`, { waitUntil: "domcontentloaded" })
      .catch(() => null);
    check(
      "Going offline shows the offline page",
      (await page.title()).includes("offline") && offline?.fromServiceWorker(),
      await page.title(),
    );
    check(
      "The offline page has a retry button",
      await page.evaluate(() => Boolean(document.getElementById("retry"))),
    );
    await page.setOfflineMode(false);
    await page.goto(`${BASE}/practice`, { waitUntil: "networkidle2" });
    check(
      "Coming back online returns to the app",
      page.url().includes("/practice") && !(await page.title()).includes("offline"),
    );

    check(
      "No CSP violations or page errors in this flow",
      page.problems.length === 0,
      page.problems.join(" | "),
    );
    await context.close();
  }

  section("PWA: install experience");
  {
    // Chrome only fires this event for a real user over time, so it is simulated here. Everything
    // the app does in response is real; the native dialog itself cannot be automated.
    const { context, page } = await freshContext(browser, {
      viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    });
    await loginViaUi(page, "a@example.test");
    check(
      "No install prompt is shown until the browser offers it",
      !(await bodyText(page)).includes("Get the Trounce app"),
    );

    await fireInstallPrompt(page, "dismissed");
    await page.waitForFunction(() => document.body.innerText.includes("Get the Trounce app"), {
      timeout: 5000,
    });
    check("Home screen shows the install card", true);
    check(
      "Bottom navigation shows an Install tab",
      await page.evaluate(() =>
        [...document.querySelectorAll("nav button")].some((b) => b.textContent.includes("Install")),
      ),
    );

    await clickButtonWithText(page, "Install App");
    await page.waitForFunction(() => window.__promptCalls === 1, { timeout: 3000 });
    check("Install App opens the browser's real prompt", true);

    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle2" });
    await fireInstallPrompt(page, "dismissed");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.trim() === "Install App",
        ),
      { timeout: 5000 },
    );
    check("Profile page offers Install App", true);
    await clickButtonWithText(page, "Install App");
    await page.waitForFunction(() => document.body.innerText.includes("install it any time"), {
      timeout: 3000,
    });
    check("Cancelling the prompt is handled gracefully", true);

    await fireInstallPrompt(page, "accepted");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.trim() === "Install App",
        ),
      { timeout: 5000 },
    );
    await clickButtonWithText(page, "Install App");
    await page.waitForFunction(() => document.body.innerText.includes("installed on this device"), {
      timeout: 3000,
    });
    check("Accepting changes the option to Installed", true);

    await page.goto(`${BASE}/practice`, { waitUntil: "networkidle2" });
    const afterInstall = await bodyText(page);
    check(
      "Install options disappear after installing",
      !afterInstall.includes("Get the Trounce app") &&
        !(await page.evaluate(() =>
          [...document.querySelectorAll("nav button")].some((b) =>
            b.textContent.includes("Install"),
          ),
        )),
    );

    await page.evaluate(() => localStorage.removeItem("trounce_pwa_installed"));
    await page.reload({ waitUntil: "networkidle2" });
    await fireInstallPrompt(page, "dismissed");
    await page.waitForFunction(() => document.body.innerText.includes("Get the Trounce app"), {
      timeout: 5000,
    });
    await clickButtonWithText(page, "Not now");
    await page.waitForFunction(() => !document.body.innerText.includes("Get the Trounce app"), {
      timeout: 3000,
    });
    check("The home card can be dismissed", true);
    await page.reload({ waitUntil: "networkidle2" });
    await fireInstallPrompt(page, "dismissed");
    await sleep(300);
    check(
      "A dismissed card stays away after reload",
      !(await bodyText(page)).includes("Get the Trounce app"),
    );
    check(
      "The navigation option remains after dismissing the card",
      await page.evaluate(() =>
        [...document.querySelectorAll("nav button")].some((b) => b.textContent.includes("Install")),
      ),
    );
    check("No page errors in this flow", page.problems.length === 0, page.problems.join(" | "));
    await context.close();
  }
  {
    const { context, page } = await freshContext(browser, {
      viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    });
    await loginViaUi(page, "teacher1@example.test", "Teacher / Admin");
    check("Teacher lands on the dashboard", page.url().includes("/dashboard"));
    await fireInstallPrompt(page, "accepted");
    await page.waitForFunction(() => document.body.innerText.includes("Get the Trounce app"), {
      timeout: 5000,
    });
    check("Teacher home screen shows the install card", true);

    await page.click('button[aria-label="Open navigation menu"]');
    const drawerRow = await page.waitForFunction(
      () =>
        [...document.querySelectorAll("nav button")].find(
          (b) => b.textContent.trim() === "Install App",
        ),
      { timeout: 3000 },
    );
    check("The navigation drawer has an Install App option", Boolean(drawerRow));
    await page.evaluate(() =>
      [...document.querySelectorAll("nav button")]
        .find((b) => b.textContent.trim() === "Install App")
        .click(),
    );
    await page.waitForFunction(() => window.__promptCalls === 1, { timeout: 3000 });
    check("The drawer option opens the browser's real prompt", true);
    await context.close();
  }
  {
    const { context, page } = await freshContext(browser, {
      viewport: { width: 1280, height: 800 },
    });
    await loginViaUi(page, "teacher1@example.test", "Teacher / Admin");
    await fireInstallPrompt(page, "accepted");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("header button")].some((b) =>
          b.textContent.includes("Install App"),
        ),
      { timeout: 5000 },
    );
    check("Desktop header has Install App, as there is no drawer there", true);
    await context.close();
  }
  {
    const { context, page } = await freshContext(browser, {
      userAgent: IPHONE_UA,
      viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.trim() === "Install App",
        ),
      { timeout: 5000 },
    );
    check("iPhone: sign-in page offers Install App with no native prompt", true);
    await clickButtonWithText(page, "Install App");
    await page.waitForSelector("dialog[open]", { timeout: 3000 });
    const steps = await page.evaluate(() => document.querySelector("dialog[open]").innerText);
    check(
      "iPhone: Add to Home Screen steps are shown",
      steps.includes("Add to Home Screen") && steps.includes("Share"),
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"), { timeout: 3000 });
    check("iPhone: the steps close with Escape", true);
    await context.close();
  }
  {
    const { context, page } = await freshContext(browser, {
      userAgent: ANDROID_UA,
      viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    });
    await loginViaUi(page, "a@example.test");
    await page.waitForFunction(() => document.body.innerText.includes("Get the Trounce app"), {
      timeout: 5000,
    });
    await clickButtonWithText(page, "Install App");
    await page.waitForSelector("dialog[open]", { timeout: 3000 });
    const steps = await page.evaluate(() => document.querySelector("dialog[open]").innerText);
    check("Android without a prompt: manual steps are shown", steps.includes("Add to Home screen"));
    await context.close();
  }
  {
    const { context, page } = await freshContext(browser, { userAgent: FIREFOX_UA });
    await loginViaUi(page, "a@example.test");
    check(
      "Unsupported browser: no promotional card",
      !(await bodyText(page)).includes("Get the Trounce app"),
    );
    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle2" });
    await clickButtonWithText(page, "Install App");
    await page.waitForSelector("dialog[open]", { timeout: 3000 });
    const message = await page.evaluate(() => document.querySelector("dialog[open]").innerText);
    check(
      "Unsupported browser: an honest explanation, not a dead button",
      message.includes("can't install") && message.includes("Chrome"),
    );
    await context.close();
  }
  {
    // Chrome's emulation does not cover display-mode, so the browser's answer is simulated here. This
    // checks how the app reacts; opening a really installed copy needs a real device.
    const standalone = () => {
      const realMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) =>
        query.includes("display-mode: standalone")
          ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} }
          : realMatchMedia(query);
    };
    const { context, page } = await freshContext(browser, {
      viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
      recorderHook: standalone,
    });
    await loginViaUi(page, "a@example.test");
    await fireInstallPrompt(page, "accepted");
    await sleep(300);
    const text = await bodyText(page);
    check(
      "Running as an app: no install option on the home screen",
      !text.includes("Get the Trounce app") && !text.includes("Install App"),
    );
    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle2" });
    check(
      "Running as an app: profile confirms it is installed",
      (await bodyText(page)).includes("installed on this device"),
    );
    await context.close();
  }

  section("Every page loads");
  const visitAll = async (page, paths) => {
    for (const pagePath of paths) {
      const response = await page.goto(`${BASE}${pagePath}`, { waitUntil: "networkidle2" });
      const text = await bodyText(page);
      check(
        `${pagePath} loads`,
        response.status() < 400 && !text.includes("This page didn't load"),
        `HTTP ${response.status()}: ${text.slice(0, 120)}`,
      );
    }
  };
  {
    const { context, page } = await freshContext(browser);
    await loginViaUi(page, ADMIN_EMAIL, "Teacher / Admin");
    await visitAll(page, [
      "/dashboard",
      "/assignments",
      "/flags",
      "/reports",
      "/users",
      "/settings",
      "/students/sB",
      "/result/att-B-1",
    ]);
    check(
      "The master administrator can open Settings",
      page.url().includes("/result/") &&
        (await page.goto(`${BASE}/settings`, { waitUntil: "networkidle2" })) &&
        page.url().includes("/settings"),
    );
    check(
      "No hydration, CSP or page errors for admin pages",
      page.problems.length === 0,
      page.problems.join(" | "),
    );
    await context.close();
  }
  {
    const { context, page } = await freshContext(browser);
    await loginViaUi(page, "teacher1@example.test", "Teacher / Admin");
    await visitAll(page, ["/dashboard", "/users"]);
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle2" });
    check("A teacher is redirected away from Settings", !page.url().includes("/settings"));
    await page.goto(`${BASE}/users`, { waitUntil: "networkidle2" });
    const deleteButtons = await page.evaluate(
      () =>
        [...document.querySelectorAll("button")].filter(
          (b) => b.textContent.includes("Delete") && b.offsetParent !== null,
        ).length,
    );
    check(
      "A teacher sees no Delete buttons, since only admins can delete",
      deleteButtons === 0,
      String(deleteButtons),
    );
    await context.close();
  }
  {
    const { context, page } = await freshContext(browser);
    await loginViaUi(page, "b@example.test");
    await visitAll(page, ["/practice", "/progress", "/profile", "/result/att-B-1", "/students/sB"]);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
    check("A student is redirected away from the dashboard", !page.url().includes("/dashboard"));
    const otherAttempt = await page.goto(`${BASE}/result/att-A-1`, { waitUntil: "networkidle2" });
    const otherText = await bodyText(page);
    check(
      "A student cannot open another student's result page",
      otherAttempt.status() >= 400 || otherText.includes("This page didn't load"),
      otherText.slice(0, 100),
    );
    check(
      "No hydration, CSP or page errors for student pages",
      page.problems.filter((p) => !p.startsWith("pageerror")).length === 0,
      page.problems.join(" | "),
    );
    await context.close();
  }
  {
    const { context, page } = await freshContext(browser);
    await page.goto(`${BASE}/practice`, { waitUntil: "networkidle2" });
    check("Signed-out visitors are sent to the sign-in page", page.url().includes("/login"));
    await loginViaUi(page, "b@example.test");
    await clickButtonWithText(page, "Sign out");
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 15000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {});
    check("Signing out lands on the sign-in page", page.url().includes("/login"));
    await page.goto(`${BASE}/practice`, { waitUntil: "networkidle2" });
    check("After signing out, the app stays signed out", page.url().includes("/login"));
    await context.close();
  }

  section("Recording flow: real microphone pipeline");
  const trackRecorder = () => {
    const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    window.__micTracks = [];
    if (original) {
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        window.__micTracks.push(...stream.getAudioTracks());
        return stream;
      };
    }
  };
  {
    const { context, page } = await freshContext(browser, { recorderHook: trackRecorder });
    await loginViaUi(page, "b@example.test");
    const before = await db.collection("attempts").countDocuments({ studentId: "sB" });

    await page.goto(`${BASE}/practice/hobby`, { waitUntil: "networkidle2" });
    check("Recording screen opens", await clickButtonWithText(page, "Tap"));
    await page.waitForFunction(() => window.__micTracks.length > 0, { timeout: 10000 });
    await sleep(2500);
    check(
      "The microphone is on while recording",
      await page.evaluate(() => window.__micTracks[0].readyState === "live"),
    );

    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.className.includes("bg-[#C1503B]"))
        .click();
    });
    await page.waitForFunction(() => location.pathname.startsWith("/result/"), { timeout: 45000 });
    check(
      "Finishing goes to the result screen only after saving",
      (await db.collection("attempts").countDocuments({ studentId: "sB" })) === before + 1,
    );
    check(
      "The microphone is released after stopping",
      await page.evaluate(() => window.__micTracks.every((t) => t.readyState === "ended")),
    );

    const attemptId = decodeURIComponent(page.url().split("/result/")[1]);
    const saved = await db.collection("attempts").findOne({ id: attemptId });
    check(
      "The attempt has server-stored audio",
      /^\/api\/audio\/audio-/.test(saved?.audioUrl ?? "") && saved?.audioSize > 0,
    );
    check(
      "The target duration came from the module",
      saved?.targetDurationSec === 45,
      String(saved?.targetDurationSec),
    );

    await page.waitForSelector("audio", { timeout: 10000 });
    const playable = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const audio = document.querySelector("audio");
          if (audio.readyState >= 1) return resolve(true);
          audio.addEventListener("loadedmetadata", () => resolve(true), { once: true });
          audio.addEventListener("error", () => resolve(false), { once: true });
          audio.load();
          setTimeout(() => resolve(false), 8000);
        }),
    );
    check("The browser can load the saved recording", playable);

    await clickButtonWithText(page, "Try Another Drill");
    await page.waitForFunction(() => !location.pathname.startsWith("/result"), { timeout: 15000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {});
    const hub = await page.evaluate(() => {
      const card = [...document.querySelectorAll("li")].find((el) =>
        el.textContent.includes("favorite hobby"),
      );
      return card?.innerText ?? "";
    });
    check(
      "The practice hub shows the drill as done straight away",
      /Done|done/.test(hub),
      hub.slice(0, 80),
    );

    await page.goto(`${BASE}/practice/hobby`, { waitUntil: "networkidle2" });
    await page.goto(`${BASE}/practice/hobby?leave=1`, { waitUntil: "networkidle2" });
    check(
      "No CSP violations or page errors while recording",
      page.problems.length === 0,
      page.problems.join(" | "),
    );
    await context.close();
  }
  {
    const denied = () => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    };
    const { context, page } = await freshContext(browser, { recorderHook: denied });
    await loginViaUi(page, "b@example.test");
    const before = await db.collection("attempts").countDocuments({ studentId: "sB" });
    await page.goto(`${BASE}/practice/opinion`, { waitUntil: "networkidle2" });
    await clickButtonWithText(page, "Tap");
    await page.waitForFunction(() => document.body.innerText.includes("Microphone access denied"), {
      timeout: 5000,
    });
    check("Mic denied: the student sees why", true);
    await sleep(1000);
    check(
      "Mic denied: recording does not start",
      !(await page.evaluate(() =>
        [...document.querySelectorAll("button")].some((b) => b.className.includes("bg-[#C1503B]")),
      )),
    );
    check(
      "Mic denied: nothing is saved, so no score is invented",
      (await db.collection("attempts").countDocuments({ studentId: "sB" })) === before,
    );
    await context.close();
  }
  {
    const { context, page } = await freshContext(browser, { recorderHook: trackRecorder });
    await loginViaUi(page, "b@example.test");
    const before = await db.collection("attempts").countDocuments({ studentId: "sB" });
    const saveFnId = loadServerFnIds().saveAttemptFn;
    let blockSave = true;
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (blockSave && request.url().includes(saveFnId)) request.abort("failed");
      else request.continue();
    });

    await page.goto(`${BASE}/practice/city`, { waitUntil: "networkidle2" });
    await clickButtonWithText(page, "Tap");
    await page.waitForFunction(() => window.__micTracks.length > 0, { timeout: 10000 });
    await sleep(2000);
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.className.includes("bg-[#C1503B]"))
        .click();
    });
    await page.waitForFunction(() => document.body.innerText.includes("hasn't been saved yet"), {
      timeout: 45000,
    });
    check(
      "Failed save: the student is told, and stays on the page",
      page.url().includes("/practice/city"),
    );
    check(
      "Failed save: nothing was stored yet",
      (await db.collection("attempts").countDocuments({ studentId: "sB" })) === before,
    );

    blockSave = false;
    await clickButtonWithText(page, "Try saving again");
    await page.waitForFunction(() => location.pathname.startsWith("/result/"), { timeout: 45000 });
    check(
      "Failed save: retrying recovers the same recording",
      (await db.collection("attempts").countDocuments({ studentId: "sB" })) === before + 1,
    );
    await context.close();
  }

  section("PWA: updates after a deployment");
  {
    const { context, page } = await freshContext(browser);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await waitForServiceWorker(page);
    await page.reload({ waitUntil: "networkidle2" });
    const oldCaches = await page.evaluate(() => caches.keys());

    await restartServer(true);

    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
    });
    await page.waitForFunction(() => document.body.innerText.includes("new version"), {
      timeout: 20000,
    });
    check("A new deployment is noticed and offered", true);
    check("The update is not forced on an open page", page.url().includes("/login"));

    const navigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
    await clickButtonWithText(page, "Refresh");
    await navigation;
    await page.waitForFunction(
      async (previous) => {
        const names = await caches.keys();
        return names.some((n) => n.startsWith("trounce-static-") && !previous.includes(n));
      },
      { timeout: 15000, polling: 250 },
      oldCaches,
    );
    const newCaches = await page.evaluate(() => caches.keys());
    const oldStatic = oldCaches.find((n) => n.startsWith("trounce-static-"));
    check(
      "Refreshing activates the new version",
      newCaches.some((n) => n.startsWith("trounce-static-") && n !== oldStatic),
    );
    check(
      "Caches from the old version are deleted",
      !newCaches.includes(oldStatic),
      newCaches.join(),
    );
    await context.close();
  }
}

// ---- Main --------------------------------------------------------------------------------------

async function main() {
  if (!existsSync(path.join(ROOT, "dist/server/server.js"))) {
    console.error('No build found. Run "npm run build" first.');
    process.exit(1);
  }

  const audioDir = mkdtempSync(path.join(tmpdir(), "trounce-e2e-audio-"));
  const swPath = path.join(ROOT, "dist/client/sw.js");
  const originalSw = readFileSync(swPath, "utf8");
  const mongod = await MongoMemoryServer.create({ binary: { version: "7.0.14" } });
  const uri = mongod.getUri();
  const { client, db } = await seedDatabase(uri);

  const serverEnv = { MONGODB_URI: uri, MONGODB_DB_NAME: DB_NAME, AUDIO_STORAGE_DIR: audioDir };
  let server = startServer(serverEnv);
  let browser;
  let browserStatus = "SKIPPED (no Chrome or Edge found; set CHROME_PATH)";

  try {
    await waitForServer();
    const ids = loadServerFnIds();
    console.log(`Production server running; ${Object.keys(ids).length} server functions found.`);

    await runHttpChecks(db, ids);

    const chrome = findChrome();
    if (chrome) {
      browser = await puppeteer.launch({
        executablePath: chrome,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-gpu",
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream",
          "--autoplay-policy=no-user-gesture-required",
        ],
      });
      browserStatus = "RAN";

      const restartServer = async (asNewDeployment) => {
        await stopServer(server);
        if (asNewDeployment) {
          writeFileSync(
            swPath,
            originalSw.replace(/const BUILD_ID = "[0-9a-f]+"/, 'const BUILD_ID = "aaaaaaaaaaaa"'),
          );
        }
        server = startServer(serverEnv);
        await waitForServer();
      };

      await runBrowserChecks(browser, db, restartServer);
    }

    section("Database outage");
    const A = new ApiClient(ids, "203.0.113.50");
    await A.login("a@example.test");
    await client.close();
    await mongod.stop();

    const audio = `data:audio/webm;base64,${Buffer.alloc(3000, 1).toString("base64")}`;
    const outage = await A.call(
      "saveAttemptFn",
      "POST",
      attemptPayload("att-outage", { audioUrl: audio }),
    );
    check(
      "A save during an outage reports failure, not false success",
      Boolean(outage.error),
      JSON.stringify(outage.value),
    );

    await sleep(6000);
    check(
      "The server process survives the outage",
      server.exitInfo === null,
      JSON.stringify(server.exitInfo),
    );
    const stillUp = await fetch(`${BASE}/login`, { redirect: "manual" }).then(
      (r) => r.status > 0,
      () => false,
    );
    check("The site keeps responding during the outage", stillUp);
    const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(20000) });
    check("Health endpoint reports the outage", health.status === 503);
    const internalLeak = /mongodb:\/\/|MongoServerSelection|ECONNREFUSED/.test(outage.text);
    check("Outage errors do not expose connection details", !internalLeak);
  } finally {
    writeFileSync(swPath, originalSw);
    await browser?.close().catch(() => {});
    await stopServer(server).catch(() => {});
    if (process.platform === "win32" && server.pid) {
      try {
        execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
      } catch {
        // Already stopped.
      }
    }
    await client.close().catch(() => {});
    await mongod.stop().catch(() => {});
    rmSync(audioDir, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Browser checks: ${browserStatus}`);
  console.log(
    `Result: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`,
  );
  for (const failure of failed) console.log(`  FAILED [${failure.section}] ${failure.name}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("E2E run aborted:", error);
  process.exit(1);
});
