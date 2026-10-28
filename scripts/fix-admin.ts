import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

async function run() {
  const client = new MongoClient("mongodb://127.0.0.1:27017/tarang");
  await client.connect();
  const db = client.db("tarang");

  // Check existing users
  const existing = await db.collection("users").find({}).toArray();
  console.log(
    "Existing users:",
    JSON.stringify(
      existing.map((u) => ({ email: u.email, role: u.role, name: u.name })),
      null,
      2,
    ),
  );

  // Upsert admin user
  const hash = await bcrypt.hash("tarang@123", 10);
  await db.collection("users").updateOne(
    { email: "admin@tarang.com" },
    {
      $set: {
        id: "admin-master",
        email: "admin@tarang.com",
        username: "admin",
        passwordHash: hash,
        name: "Shadan (Admin)",
        role: "admin",
        isAdmin: true,
        sessionSeason: "summer",
        batchTime: "morning",
        batchId: "summer-morning",
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );

  await db
    .collection("users")
    .createIndex({ email: 1 }, { unique: true })
    .catch(() => {});
  console.log("\n✅ Admin user upserted: admin@tarang.com / tarang@123");
  await client.close();
}

run().catch(console.error);
