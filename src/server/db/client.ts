import { MongoClient, Db } from "mongodb";
import { env } from "@/config/env";
import { modules } from "@/lib/tarang-data";
import type { ModuleDoc, BatchDoc, UserDoc, StudentDoc } from "./schemas";

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

    // Clean up legacy mock dummy students that are not registered in the users collection
    const usersCol = db.collection<UserDoc>("users");
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
        name: "Summer — Morning Batch",
        institution: "Sharma Coaching, Patna",
        teacherName: "Mr. Sharma",
        studentCount: 0,
        createdAt: new Date(),
      });
    }
  } catch (err) {
    console.warn("[MongoDB Auto-Seed Warning]", (err as Error).message);
  }
}

