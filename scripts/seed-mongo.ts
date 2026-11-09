/**
 * Resets a database to a clean development state.
 *
 * THIS DELETES ALL DATA in the core collections, including users and student recordings, so it
 * refuses to run unless explicitly confirmed, and never runs with NODE_ENV=production.
 *
 *   npm run db:seed -- --confirm-wipe
 */
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { modules } from "../src/lib/tarang-data";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/trounce";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "trounce";

/** Shows where the script will write, without printing any credentials. */
function describeTarget(uri: string): string {
  try {
    const { protocol, host } = new URL(uri);
    return `${protocol}//${host}`;
  } catch {
    return "(unparseable connection string)";
  }
}

function assertSafeToRun(): void {
  const target = `${describeTarget(MONGODB_URI)} database "${MONGODB_DB_NAME}"`;

  if (process.env.NODE_ENV === "production") {
    console.error(`Refusing to run with NODE_ENV=production. Target was ${target}.`);
    process.exit(1);
  }
  if (!process.argv.includes("--confirm-wipe")) {
    console.error(
      `This deletes ALL users, students, attempts and assignments in ${target}.\n` +
        `If that is what you want, run: npm run db:seed -- --confirm-wipe`,
    );
    process.exit(1);
  }
}

const SEASONS = ["summer", "autumn", "winter", "spring"] as const;
const TIMES = ["morning", "evening"] as const;

async function main() {
  assertSafeToRun();

  console.log(`Connecting to ${describeTarget(MONGODB_URI)}, database "${MONGODB_DB_NAME}"...`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);

  console.log("Seeding modules...");
  const modulesCol = db.collection("modules");
  await modulesCol.deleteMany({});
  await modulesCol.insertMany(
    modules.map((m, idx) => ({ ...m, completed: false, order: idx, createdAt: new Date() })),
  );

  console.log("Clearing students, attempts, flags, messages and assignments...");
  for (const name of ["students", "attempts", "flags", "messages", "assignments", "_meta"]) {
    await db.collection(name).deleteMany({});
  }

  console.log("Seeding batches (4 sessions x 2 batches)...");
  const batchesCol = db.collection("batches");
  await batchesCol.deleteMany({});
  await batchesCol.insertMany(
    SEASONS.flatMap((season) =>
      TIMES.map((time) => ({
        id: `${season}-${time}`,
        season,
        time,
        name: `${season[0].toUpperCase()}${season.slice(1)} · ${time[0].toUpperCase()}${time.slice(1)} Batch`,
        institution: "Sharma Coaching, Patna",
        teacherName: "Mr. Sharma",
        studentCount: 0,
        createdAt: new Date(),
      })),
    ),
  );

  console.log("Seeding admin user...");
  const usersCol = db.collection("users");
  await usersCol.deleteMany({});

  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "";
  const adminEmail = process.env.ADMIN_EMAIL || "";
  if (adminPassword && adminEmail) {
    await usersCol.insertOne({
      id: "admin-master",
      email: adminEmail.toLowerCase(),
      username: "admin",
      passwordHash: await bcrypt.hash(adminPassword, 10),
      name: "Shadan (Admin)",
      role: "admin",
      sessionSeason: "summer",
      batchTime: "morning",
      batchId: "summer-morning",
      createdAt: new Date(),
    });
  } else {
    console.warn("ADMIN_EMAIL or ADMIN_INITIAL_PASSWORD is not set, so no admin was created.");
  }

  console.log("Done. Indexes are created when the app next connects.");
  await client.close();
}

main().catch((err) => {
  console.error("Seeding failed:", (err as Error).message);
  process.exit(1);
});
