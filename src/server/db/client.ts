import { MongoClient, Db } from "mongodb";
import { env } from "@/config/env";
import { modules } from "@/lib/tarang-data";
import type { ModuleDoc, BatchDoc, UserDoc, StudentDoc, AssignmentDoc } from "./schemas";

declare global {
  var _mongoClient: MongoClient | undefined;
  var _mongoDb: Db | undefined;
  var _mongoSeeded: boolean | undefined;
  var _mongoIndexesEnsured: boolean | undefined;
}

/**
 * Ensures optimal compound and unique indexes exist for production performance.
 * Eliminates unindexed collection scans (COLLSCAN).
 */
export async function ensureDatabaseIndexes(db: Db) {
  try {
    // 1. Attempts indexes (critical for high-frequency student history & reports)
    const attemptsCol = db.collection("attempts");
    await attemptsCol.createIndex(
      { studentId: 1, createdAt: -1 },
      { name: "idx_attempts_student_created" },
    );
    await attemptsCol.createIndex(
      { assignmentId: 1, studentId: 1 },
      { name: "idx_attempts_assignment_student" },
    );
    await attemptsCol.createIndex({ id: 1 }, { unique: true, name: "uniq_attempts_id" });

    // 2. Users indexes (authentication and profile lookup)
    const usersCol = db.collection("users");
    await usersCol.createIndex({ email: 1 }, { unique: true, name: "uniq_users_email" });
    await usersCol.createIndex({ id: 1 }, { unique: true, name: "uniq_users_id" });
    await usersCol.createIndex({ username: 1 }, { sparse: true, name: "idx_users_username" });

    // 3. Flags indexes (faculty console and intervention queues)
    const flagsCol = db.collection("flags");
    await flagsCol.createIndex({ status: 1, createdAt: -1 }, { name: "idx_flags_status_created" });
    await flagsCol.createIndex(
      { studentId: 1, createdAt: -1 },
      { name: "idx_flags_student_created" },
    );
    await flagsCol.createIndex({ id: 1 }, { unique: true, name: "uniq_flags_id" });

    // 4. Students roster indexes
    const studentsCol = db.collection("students");
    await studentsCol.createIndex({ id: 1 }, { unique: true, name: "uniq_students_id" });
    await studentsCol.createIndex({ batchId: 1 }, { name: "idx_students_batch" });

    // 5. Batches & Messages indexes
    const batchesCol = db.collection("batches");
    await batchesCol.createIndex({ id: 1 }, { unique: true, name: "uniq_batches_id" });

    const messagesCol = db.collection("messages");
    await messagesCol.createIndex(
      { studentId: 1, createdAt: 1 },
      { name: "idx_messages_student_created" },
    );
    await messagesCol.createIndex({ id: 1 }, { unique: true, name: "uniq_messages_id" });

    // 6. Assignments indexes (fast lookup by batch and session)
    const assignmentsCol = db.collection("assignments");
    await assignmentsCol.createIndex({ id: 1 }, { unique: true, name: "uniq_assignments_id" });
    await assignmentsCol.createIndex({ batchId: 1 }, { name: "idx_assignments_batchId" });
    await assignmentsCol.createIndex(
      { targetSession: 1, targetBatch: 1 },
      { name: "idx_assignments_session_batch" },
    );

    console.log("[MongoDB] Production database compound indexes verified.");
  } catch (err) {
    console.warn("[MongoDB Index Warning]", (err as Error).message);
  }
}

/**
 * Returns the singleton MongoDB database instance with connection pooling
 */
export async function getDb(): Promise<Db | null> {
  if (global._mongoDb) {
    return global._mongoDb;
  }

  try {
    if (!global._mongoClient) {
      const isTestEnv =
        process.env.NODE_ENV === "test" || Boolean(process.env.VITEST) || process.env.CI === "true";
      global._mongoClient = new MongoClient(env.MONGODB_URI, {
        maxPoolSize: 50,
        minPoolSize: 5,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: isTestEnv ? 1500 : 5000,
        connectTimeoutMS: isTestEnv ? 1500 : 5000,
      });
      await global._mongoClient.connect();
    }

    global._mongoDb = global._mongoClient.db(env.MONGODB_DB_NAME);

    // Ensure production database indexes exist
    if (!global._mongoIndexesEnsured) {
      await ensureDatabaseIndexes(global._mongoDb);
      global._mongoIndexesEnsured = true;
    }

    // Auto-seed collections if empty
    if (!global._mongoSeeded) {
      await autoSeedDatabase(global._mongoDb);
      global._mongoSeeded = true;
    }

    return global._mongoDb;
  } catch (error) {
    console.warn("[MongoDB] Operating in resilient fallback mode:", (error as Error).message);
    return null;
  }
}

/**
 * Seeds default data into MongoDB if collections are empty
 */
export async function autoSeedDatabase(db: Db) {
  try {
    const modulesCol = db.collection<ModuleDoc>("modules");
    const moduleCount = await modulesCol.countDocuments();
    if (moduleCount === 0) {
      const moduleDocs: ModuleDoc[] = modules.map((m, idx) => ({
        id: m.id,
        title: m.title,
        prompt: m.prompt,
        difficulty: m.difficulty,
        durationSec: m.durationSec,
        completed: Boolean(m.completed),
        order: idx,
        createdAt: new Date(),
      }));
      await modulesCol.insertMany(moduleDocs);
    }

    // Ensure real admin account exists if users collection is empty
    const usersCol = db.collection<UserDoc>("users");
    const userCount = await usersCol.countDocuments();
    if (userCount === 0) {
      const bcrypt = (await import("bcryptjs")).default;
      const adminEmail = env.ADMIN_EMAIL;
      const adminPassword = env.ADMIN_INITIAL_PASSWORD;
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await usersCol.insertOne({
        id: "admin-master",
        email: adminEmail.toLowerCase(),
        username: "admin",
        passwordHash,
        name: "Shadan (Admin)",
        phone: "9876543210",
        role: "admin",
        sessionSeason: "summer",
        batchTime: "morning",
        batchId: "summer-morning",
        createdAt: new Date(),
      });
    } else {
      await usersCol.updateOne(
        { id: "admin-master", phone: { $exists: false } },
        { $set: { phone: "9876543210" } },
      );
    }

    const realUsers = await usersCol.find({}).toArray();
    const realUserIds = new Set(realUsers.map((u) => u.id));
    const realEmails = new Set(realUsers.map((u) => u.email.toLowerCase()));

    const studentsCol = db.collection<StudentDoc>("students");
    // Remove any student doc where id is neither a real user ID nor a real email
    const allStudents = await studentsCol.find({}).toArray();
    for (const st of allStudents) {
      if (!realUserIds.has(st.id) && !realEmails.has(st.id.toLowerCase())) {
        await studentsCol.deleteOne({ _id: st._id });
      }
    }

    const batchesCol = db.collection<BatchDoc>("batches");
    const batchCount = await batchesCol.countDocuments();
    if (batchCount === 0) {
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

    // Auto-seed default homework assignments if collection is empty
    const assignmentsCol = db.collection<AssignmentDoc>("assignments");
    const assignmentCount = await assignmentsCol.countDocuments();
    if (assignmentCount === 0) {
      const twoDaysFromNow = new Date(Date.now() + 86400000 * 2).toISOString();
      const fourDaysFromNow = new Date(Date.now() + 86400000 * 4).toISOString();
      const fiveDaysFromNow = new Date(Date.now() + 86400000 * 5).toISOString();
      const sixDaysFromNow = new Date(Date.now() + 86400000 * 6).toISOString();

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
          teacherId: "teacher-1",
          teacherName: "Mr. Sharma",
          dueDate: twoDaysFromNow,
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
          teacherId: "teacher-1",
          teacherName: "Mr. Sharma",
          dueDate: fourDaysFromNow,
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
          teacherId: "teacher-1",
          teacherName: "Mr. Sharma",
          dueDate: fiveDaysFromNow,
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
          teacherId: "teacher-1",
          teacherName: "Mr. Sharma",
          dueDate: sixDaysFromNow,
          createdAt: new Date(),
        },
      ]);
      console.log("[MongoDB] Default homework assignments auto-seeded.");
    }
  } catch (err) {
    console.warn("[MongoDB Auto-Seed Warning]", (err as Error).message);
  }
}
