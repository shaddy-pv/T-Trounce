import { MongoClient, Db } from "mongodb";
import { env } from "@/config/env";
import { modules, studentRoster } from "@/lib/tarang-data";
import type { ModuleDoc, StudentDoc, BatchDoc } from "./schemas";

declare global {
  var _mongoClient: MongoClient | undefined;
  var _mongoDb: Db | undefined;
  var _mongoSeeded: boolean | undefined;
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
      global._mongoClient = new MongoClient(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 2000,
        connectTimeoutMS: 2000,
      });
      await global._mongoClient.connect();
    }

    global._mongoDb = global._mongoClient.db(env.MONGODB_DB_NAME);

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

    const studentsCol = db.collection<StudentDoc>("students");
    const studentCount = await studentsCol.countDocuments();
    if (studentCount === 0) {
      const studentDocs: StudentDoc[] = studentRoster.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        focus: s.focus,
        lastActive: s.lastActive,
        scorePct: s.scorePct,
        trendPct: s.trendPct,
        waveform: s.waveform,
        inactiveDays: s.inactiveDays,
        flagReason: s.flagReason,
        batchId: "batch-class-xa",
        updatedAt: new Date(),
      }));
      await studentsCol.insertMany(studentDocs);
    }

    const batchesCol = db.collection<BatchDoc>("batches");
    const batchCount = await batchesCol.countDocuments();
    if (batchCount === 0) {
      await batchesCol.insertOne({
        id: "batch-class-xa",
        season: "summer",
        time: "morning",
        name: "Class X-A",
        institution: "Sharma Coaching, Patna",
        teacherName: "Mrs. Mehta",
        studentCount: studentRoster.length,
        createdAt: new Date(),
      });
    }
  } catch (err) {
    console.warn("[MongoDB Auto-Seed Warning]", (err as Error).message);
  }
}
