import dns from "node:dns";
import { MongoClient, Db } from "mongodb";
import { env } from "@/config/env";
import { modules } from "@/lib/tarang-data";
import { serviceUnavailable } from "../errors";
import type { ModuleDoc, BatchDoc, UserDoc, AssignmentDoc } from "./schemas";

// Ensure Node.js can resolve MongoDB Atlas SRV records, especially on Windows where
// the default stub resolver points to 127.0.0.1 and causes querySrv ECONNREFUSED.
try {
  const currentServers = dns.getServers();
  if (!currentServers.length || currentServers.includes("127.0.0.1")) {
    dns.setServers(["8.8.8.8", "1.1.1.1", ...currentServers.filter((s) => s !== "127.0.0.1")]);
  }
} catch {
  // Ignore in restricted environments
}

declare global {
  var _mongoClient: MongoClient | undefined;
  var _mongoDb: Db | undefined;
  var _mongoInit: Promise<Db> | undefined;
  var _mongoLastFailureAt: number | undefined;
}

/** After a failed connection, callers fail fast for this long instead of each waiting 5s. */
const RECONNECT_BACKOFF_MS = 3000;

type IndexSpec = readonly [
  collection: string,
  keys: Record<string, 1 | -1>,
  options: { name: string; unique?: boolean; sparse?: boolean },
];

const INDEXES: readonly IndexSpec[] = [
  // Attempts: student history, reports and homework lookups
  ["attempts", { studentId: 1, createdAt: -1 }, { name: "idx_attempts_student_created" }],
  ["attempts", { assignmentId: 1, studentId: 1 }, { name: "idx_attempts_assignment_student" }],
  ["attempts", { id: 1 }, { unique: true, name: "uniq_attempts_id" }],
  ["attempts", { audioId: 1 }, { sparse: true, name: "idx_attempts_audio" }],
  // Users: authentication and profile lookup
  ["users", { email: 1 }, { unique: true, name: "uniq_users_email" }],
  ["users", { id: 1 }, { unique: true, name: "uniq_users_id" }],
  ["users", { username: 1 }, { sparse: true, name: "idx_users_username" }],
  // Flags: faculty console and intervention queues
  ["flags", { status: 1, createdAt: -1 }, { name: "idx_flags_status_created" }],
  ["flags", { studentId: 1, createdAt: -1 }, { name: "idx_flags_student_created" }],
  ["flags", { id: 1 }, { unique: true, name: "uniq_flags_id" }],
  // Roster
  ["students", { id: 1 }, { unique: true, name: "uniq_students_id" }],
  ["students", { batchId: 1 }, { name: "idx_students_batch" }],
  ["batches", { id: 1 }, { unique: true, name: "uniq_batches_id" }],
  // Messages
  ["messages", { studentId: 1, createdAt: 1 }, { name: "idx_messages_student_created" }],
  ["messages", { id: 1 }, { unique: true, name: "uniq_messages_id" }],
  // Assignments
  ["assignments", { id: 1 }, { unique: true, name: "uniq_assignments_id" }],
  ["assignments", { batchId: 1 }, { name: "idx_assignments_batchId" }],
  ["assignments", { targetSession: 1, targetBatch: 1 }, { name: "idx_assignments_session_batch" }],
  // Curriculum and settings: prevents duplicates from concurrent first-run writes
  ["modules", { id: 1 }, { unique: true, name: "uniq_modules_id" }],
  ["settings", { id: 1 }, { unique: true, name: "uniq_settings_id" }],
  // Audio lookups by id
  ["audio_recordings.files", { "metadata.audioId": 1 }, { name: "idx_audio_files_audio_id" }],
];

/**
 * Ensures indexes exist. Each is created independently, so one failure (such as existing
 * duplicates blocking a unique index) is logged without skipping the others.
 */
export async function ensureDatabaseIndexes(db: Db) {
  const results = await Promise.allSettled(
    INDEXES.map(([collection, keys, options]) =>
      db.collection(collection).createIndex(keys, options),
    ),
  );
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.warn(
        `[MongoDB] Could not create index ${INDEXES[i][2].name}:`,
        (result.reason as Error).message,
      );
    }
  });
}

async function connectAndPrepare(): Promise<Db> {
  const isTestEnv =
    process.env.NODE_ENV === "test" || Boolean(process.env.VITEST) || process.env.CI === "true";

  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: isTestEnv ? 1500 : 5000,
      connectTimeoutMS: isTestEnv ? 1500 : 5000,
    });
  }

  try {
    await global._mongoClient.connect();
  } catch (error) {
    // Drop the failed client so the next attempt starts clean.
    const failed = global._mongoClient;
    global._mongoClient = undefined;
    await failed.close().catch(() => {});
    throw error;
  }

  const db = global._mongoClient.db(env.MONGODB_DB_NAME);
  await ensureDatabaseIndexes(db);
  await autoSeedDatabase(db);
  return db;
}

/**
 * Returns the shared database instance, or null if MongoDB is unreachable.
 * Concurrent callers share one initialization, and a failure is retried on a later call.
 */
export async function getDb(): Promise<Db | null> {
  if (global._mongoDb) return global._mongoDb;

  if (
    global._mongoLastFailureAt &&
    Date.now() - global._mongoLastFailureAt < RECONNECT_BACKOFF_MS
  ) {
    return null;
  }

  if (!global._mongoInit) {
    global._mongoInit = connectAndPrepare().finally(() => {
      global._mongoInit = undefined;
    });
  }

  try {
    global._mongoDb = await global._mongoInit;
    global._mongoLastFailureAt = undefined;
    return global._mongoDb;
  } catch (error) {
    global._mongoLastFailureAt = Date.now();
    console.warn("[MongoDB] Connection unavailable:", (error as Error).message);
    return null;
  }
}

/** For operations that cannot do anything useful without the database. */
export async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw serviceUnavailable();
  return db;
}

/**
 * First-run setup. An atomic marker document ensures this runs once per database, even with
 * several instances starting together, and never again after that. Demo homework is only added
 * to a brand-new database, so deleted assignments do not come back on the next restart.
 */
export async function autoSeedDatabase(db: Db) {
  const SEED_MARKER = "seed-v1";

  try {
    const meta = db.collection<{ _id: string; at: Date }>("_meta");
    const claim = await meta.updateOne(
      { _id: SEED_MARKER },
      { $setOnInsert: { at: new Date() } },
      { upsert: true },
    );
    if (claim.upsertedCount === 0) return; // Already done, by this or another instance.

    const usersCol = db.collection<UserDoc>("users");
    const isFreshDatabase = (await usersCol.countDocuments({}, { limit: 1 })) === 0;

    const modulesCol = db.collection<ModuleDoc>("modules");
    if ((await modulesCol.countDocuments({}, { limit: 1 })) === 0) {
      await modulesCol.insertMany(
        modules.map((m, idx): ModuleDoc => ({
          id: m.id,
          title: m.title,
          prompt: m.prompt,
          difficulty: m.difficulty,
          durationSec: m.durationSec,
          completed: false,
          order: idx,
          createdAt: new Date(),
        })),
      );
    }

    if (isFreshDatabase) {
      if (env.ADMIN_EMAIL && env.ADMIN_INITIAL_PASSWORD) {
        const bcrypt = (await import("bcryptjs")).default;
        await usersCol.insertOne({
          id: "admin-master",
          email: env.ADMIN_EMAIL.toLowerCase(),
          username: "admin",
          passwordHash: await bcrypt.hash(env.ADMIN_INITIAL_PASSWORD, 10),
          name: "Shadan (Admin)",
          role: "admin",
          sessionSeason: "summer",
          batchTime: "morning",
          batchId: "summer-morning",
          createdAt: new Date(),
        });
      } else {
        console.error(
          "[MongoDB] No admin account was created: set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD, then seed again.",
        );
        await meta.deleteOne({ _id: SEED_MARKER }); // Allow a retry once they are configured.
      }
    }

    const batchesCol = db.collection<BatchDoc>("batches");
    if ((await batchesCol.countDocuments({}, { limit: 1 })) === 0) {
      await batchesCol.insertOne({
        id: "summer-morning",
        season: "summer",
        time: "morning",
        name: "Summer · Morning Batch",
        institution: "Sharma Coaching, Patna",
        teacherName: "Mr. Sharma",
        studentCount: 0,
        createdAt: new Date(),
      });
    }

    const assignmentsCol = db.collection<AssignmentDoc>("assignments");
    if (isFreshDatabase && (await assignmentsCol.countDocuments({}, { limit: 1 })) === 0) {
      const daysFromNow = (days: number) => new Date(Date.now() + 86400000 * days).toISOString();
      const teacher = { teacherId: "teacher-1", teacherName: "Mr. Sharma" };

      await assignmentsCol.insertMany([
        {
          id: "hw-1",
          title: "Summer Introduction & Goal Pitch",
          instructions:
            "Speak clearly for 60 seconds without filler sounds (um, uh, matlab). State your name, background, and career aspirations.",
          prompt:
            "Hello everyone, my name is Priya Sharma. I am practicing with Tarang to improve my English fluency and confidence for upcoming interviews.",
          difficulty: "Beginner",
          durationSec: 60,
          targetSession: "summer",
          targetBatch: "morning",
          batchId: "summer-morning",
          ...teacher,
          dueDate: daysFromNow(2),
          createdAt: new Date(),
        },
        {
          id: "hw-1b",
          title: "Summer Pronunciation Focus: Sibilants & Vowels",
          instructions:
            "Read the dialogue focusing on /s/ and /sh/ clarity without dropping trailing consonants.",
          prompt:
            "She sells sea shells on the sea shore, and the shells she sells are sea shells I am sure.",
          difficulty: "Intermediate",
          durationSec: 45,
          targetSession: "summer",
          targetBatch: "morning",
          batchId: "summer-morning",
          ...teacher,
          dueDate: daysFromNow(4),
          createdAt: new Date(),
        },
        {
          id: "hw-2",
          title: "Debate: Urban vs Rural Opportunities",
          instructions:
            "Present a structured 90-second perspective on why tier-2/3 cities in India are emerging as technology and coaching hubs.",
          prompt:
            "In today's interconnected world, geography is no longer a barrier to quality education and tech careers...",
          difficulty: "Intermediate",
          durationSec: 90,
          targetSession: "summer",
          targetBatch: "evening",
          batchId: "summer-evening",
          ...teacher,
          dueDate: daysFromNow(5),
          createdAt: new Date(),
        },
        {
          id: "hw-3",
          title: "Autumn Speaking Drill: Customer Consultation",
          instructions:
            "Simulate a polite client conversation explaining a project update with zero hesitations.",
          prompt:
            "Good morning. I am calling to provide an update regarding your application status...",
          difficulty: "Advanced",
          durationSec: 75,
          targetSession: "autumn",
          targetBatch: "morning",
          batchId: "autumn-morning",
          ...teacher,
          dueDate: daysFromNow(6),
          createdAt: new Date(),
        },
      ]);
    }
  } catch (err) {
    console.warn("[MongoDB] First-run setup warning:", (err as Error).message);
  }
}
