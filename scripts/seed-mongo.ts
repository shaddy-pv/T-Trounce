import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { modules, studentRoster } from "../src/lib/tarang-data";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tarang";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "tarang";

async function main() {
  console.log(`Connecting to MongoDB at ${MONGODB_URI}...`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);

  console.log("Seeding modules collection...");
  const modulesCol = db.collection("modules");
  await modulesCol.deleteMany({});
  await modulesCol.insertMany(
    modules.map((m, idx) => ({
      ...m,
      order: idx + 1,
      createdAt: new Date(),
    })),
  );
  await modulesCol.createIndex({ id: 1 }, { unique: true });

  // Define the 4 Sessions x 2 Batches
  const allBatches = [
    {
      id: "summer-morning",
      season: "summer",
      time: "morning",
      name: "Summer — Morning Batch",
      institution: "Sharma Coaching, Patna",
      teacherName: "Mr. Sharma",
    },
    {
      id: "summer-evening",
      season: "summer",
      time: "evening",
      name: "Summer — Evening Batch",
      institution: "Sharma Coaching, Patna",
      teacherName: "Mr. Sharma",
    },
    {
      id: "autumn-morning",
      season: "autumn",
      time: "morning",
      name: "Autumn — Morning Batch",
      institution: "Sharma Coaching, Patna",
      teacherName: "Mr. Sharma",
    },
    {
      id: "autumn-evening",
      season: "autumn",
      time: "evening",
      name: "Autumn — Evening Batch",
      institution: "Sharma Coaching, Patna",
      teacherName: "Mrs. Mehta",
    },
    {
      id: "winter-morning",
      season: "winter",
      time: "morning",
      name: "Winter — Morning Batch",
      institution: "Sharma Coaching, Patna",
      teacherName: "Mrs. Mehta",
    },
    {
      id: "winter-evening",
      season: "winter",
      time: "evening",
      name: "Winter — Evening Batch",
      institution: "Sharma Coaching, Patna",
      teacherName: "Mrs. Mehta",
    },
    {
      id: "spring-morning",
      season: "spring",
      time: "morning",
      name: "Spring — Morning Batch",
      institution: "Sharma Coaching, Patna",
      teacherName: "Mr. Sharma",
    },
    {
      id: "spring-evening",
      season: "spring",
      time: "evening",
      name: "Spring — Evening Batch",
      institution: "Sharma Coaching, Patna",
      teacherName: "Mrs. Mehta",
    },
  ];

  console.log("Setting up students collection...");
  const studentsCol = db.collection("students");
  await studentsCol.deleteMany({});
  await studentsCol.insertOne({
    id: "admin-shadan",
    name: "Shadan (Admin)",
    status: "on-track",
    focus: "Fluency & Speech Mastery",
    lastActive: "Today",
    scorePct: 95,
    trendPct: 5,
    waveform: [],
    sessionSeason: "summer",
    batchTime: "morning",
    batchId: "summer-morning",
    updatedAt: new Date(),
  });
  await studentsCol.createIndex({ id: 1 }, { unique: true });
  await studentsCol.createIndex({ batchId: 1, status: 1 });
  await studentsCol.createIndex({ sessionSeason: 1, batchTime: 1 });

  console.log("Setting up batches collection with all 8 cohorts...");
  const batchesCol = db.collection("batches");
  await batchesCol.deleteMany({});
  await batchesCol.insertMany(
    allBatches.map((b) => ({
      ...b,
      studentCount: 0,
      createdAt: new Date(),
    })),
  );
  await batchesCol.createIndex({ id: 1 }, { unique: true });
  await batchesCol.createIndex({ season: 1, time: 1 });

  console.log("Seeding real admin user...");
  const usersCol = db.collection("users");
  await usersCol.deleteMany({});

  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "";
  const adminEmail = process.env.ADMIN_EMAIL || "";
  if (adminPassword && adminEmail) {
    const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

    // Create Real Admin Account with full privileges
    await usersCol.insertOne({
      id: "admin-master",
      email: adminEmail.toLowerCase(),
      username: "admin",
      passwordHash: adminPasswordHash,
      name: "Shadan (Admin)",
      role: "admin",
      sessionSeason: "summer",
      batchTime: "morning",
      batchId: "summer-morning",
      createdAt: new Date(),
    });
    await usersCol.createIndex({ email: 1 }, { unique: true });
    await usersCol.createIndex({ username: 1 }, { sparse: true });
  }

  console.log("Seeding assignments / homework collection...");
  const assignmentsCol = db.collection("assignments");
  await assignmentsCol.deleteMany({});

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
      dueDate: "Tomorrow by 8:00 PM",
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
      dueDate: "Thursday by 6:00 PM",
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
      dueDate: "Friday by 6:00 PM",
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
      dueDate: "This Sunday",
      createdAt: new Date(),
    },
  ]);
  await assignmentsCol.createIndex({ batchId: 1 });
  await assignmentsCol.createIndex({ targetSession: 1, targetBatch: 1 });

  console.log("Seeding attempts collection with audio playback & transcripts...");
  const attemptsCol = db.collection("attempts");
  await attemptsCol.deleteMany({});

  function makeSampleWavDataUri(durationSec: number = 4, freq: number = 320): string {
    const sampleRate = 8000;
    const numSamples = sampleRate * durationSec;
    const buffer = new ArrayBuffer(44 + numSamples);
    const view = new DataView(buffer);
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + numSamples, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, numSamples, true);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const s1 = Math.sin(2 * Math.PI * freq * t);
      const s2 = 0.4 * Math.sin(2 * Math.PI * (freq * 1.5) * t);
      const modulation = 0.5 * (1 + 0.4 * Math.sin(2 * Math.PI * 3 * t));
      const val = Math.floor(128 + 90 * modulation * (0.7 * s1 + 0.3 * s2));
      view.setUint8(44 + i, Math.max(0, Math.min(255, val)));
    }
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:audio/wav;base64,${Buffer.from(binary, "binary").toString("base64")}`;
  }

  const sampleAudioUri = makeSampleWavDataUri(5, 360);

  await attemptsCol.insertMany([
    {
      id: "attempt-admin-1",
      studentId: "admin-shadan",
      moduleId: "module-1",
      prompt: "Introduce yourself and describe your vision for Tarang.",
      transcript:
        "Hello everyone, my name is Shadan. I am testing the full audio recording and phonetic evaluation pipeline on Tarang to ensure students achieve speech clarity.",
      audioUrl: sampleAudioUri,
      durationSec: 45,
      pronunciation: 95,
      vocabulary: 92,
      grammar: 94,
      fillerCount: 0,
      pauseCount: 1,
      feedback: "Exceptional projection, unbroken rhythm, and confident phonetic cadence.",
      waveform: Array.from({ length: 40 }, (_, i) => ({
        v: 0.35 + Math.abs(Math.sin(i * 0.45)) * 0.6,
        kind: "clear" as const,
      })),
      createdAt: new Date(),
    },
  ]);
  await attemptsCol.createIndex({ studentId: 1, createdAt: -1 });

  console.log("Database seeded successfully!");
  await client.close();
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
