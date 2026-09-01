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

  console.log("Seeding students collection with session and batch tags...");
  const studentsCol = db.collection("students");
  await studentsCol.deleteMany({});
  await studentsCol.insertMany(
    studentRoster.map((s, idx) => {
      // Distribute students evenly across batches
      const batchObj = allBatches[idx % allBatches.length];
      return {
        ...s,
        sessionSeason: batchObj.season,
        batchTime: batchObj.time,
        batchId: batchObj.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
  );
  await studentsCol.createIndex({ id: 1 }, { unique: true });
  await studentsCol.createIndex({ batchId: 1, status: 1 });
  await studentsCol.createIndex({ sessionSeason: 1, batchTime: 1 });

  console.log("Seeding batches collection with all 8 batches...");
  const batchesCol = db.collection("batches");
  await batchesCol.deleteMany({});
  await batchesCol.insertMany(
    allBatches.map((b) => {
      const count = studentRoster.filter(
        (_, idx) => allBatches[idx % allBatches.length].id === b.id,
      ).length;
      return {
        ...b,
        studentCount: count,
        createdAt: new Date(),
      };
    }),
  );
  await batchesCol.createIndex({ id: 1 }, { unique: true });
  await batchesCol.createIndex({ season: 1, time: 1 });

  console.log("Seeding users collection...");
  const usersCol = db.collection("users");
  await usersCol.deleteMany({});

  const defaultPasswordHash = await bcrypt.hash("password123", 10);
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "Admin@Tarang2026!";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@tarang.in";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  // 1. Create Admin Account (full permissions)
  await usersCol.insertOne({
    id: "admin-1",
    email: adminEmail,
    username: "admin_master",
    passwordHash: adminPasswordHash,
    name: "System Administrator",
    role: "admin",
    sessionSeason: "summer",
    batchTime: "morning",
    batchId: "summer-morning",
    createdAt: new Date(),
  });

  // 2. Create Teacher Account
  await usersCol.insertOne({
    id: "teacher-1",
    email: "teacher@tarang.in",
    username: "sharma_sir",
    passwordHash: defaultPasswordHash,
    name: "Mr. Sharma",
    role: "teacher",
    sessionSeason: "summer",
    batchTime: "morning",
    batchId: "summer-morning",
    createdAt: new Date(),
  });

  // 3. Create Students corresponding to the roster
  const studentUsers = studentRoster.map((s, idx) => {
    const slug = s.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const email =
      slug === "priyasharma"
        ? "priya@tarang.in"
        : slug === "amankumar"
          ? "aman@tarang.in"
          : `${slug}@tarang.in`;
    const batchObj = allBatches[idx % allBatches.length];
    return {
      id: s.id,
      email,
      username: s.name.toLowerCase().replace(/\s+/g, "_"),
      passwordHash: defaultPasswordHash,
      name: s.name,
      role: "student",
      sessionSeason: batchObj.season,
      batchTime: batchObj.time,
      batchId: batchObj.id,
      createdAt: new Date(),
    };
  });

  await usersCol.insertMany(studentUsers);
  await usersCol.createIndex({ email: 1 }, { unique: true });
  await usersCol.createIndex({ username: 1 }, { sparse: true });

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
      id: "attempt-priya-1",
      studentId: "priya-s",
      moduleId: "module-1",
      assignmentId: "hw-1",
      prompt: "Introduce yourself in 60 seconds, mentioning your career goals.",
      transcript:
        "Good morning everyone. My name is Priya Sharma from Patna. I completed my Bachelor of Computer Applications last year and I am currently preparing for tech consulting roles. I am working diligently on Tarang to eliminate hesitations and improve my pitch inflection.",
      audioUrl: sampleAudioUri,
      durationSec: 42,
      pronunciation: 88,
      vocabulary: 92,
      grammar: 85,
      fillerCount: 1,
      pauseCount: 2,
      feedback:
        "Strong vowel resonance and confident delivery. Slightly elongated pause before 'consulting'. Keep practicing daily drills.",
      waveform: Array.from({ length: 40 }, (_, i) => ({
        v: 0.3 + Math.abs(Math.sin(i * 0.45)) * 0.6,
        kind: i % 12 === 0 ? ("hesitation" as const) : ("clear" as const),
      })),
      createdAt: new Date(Date.now() - 3600 * 1000 * 4), // 4 hours ago
    },
    {
      id: "attempt-priya-2",
      studentId: "priya-s",
      moduleId: "module-2",
      prompt: "Describe your favorite hobby and why it inspires you.",
      transcript:
        "One of my absolute favorite activities is classical singing. When I practice raagas in the morning, it helps me control my breath cadence, which um actually helps my spoken English pacing as well.",
      audioUrl: sampleAudioUri,
      durationSec: 38,
      pronunciation: 84,
      vocabulary: 89,
      grammar: 86,
      fillerCount: 1,
      pauseCount: 1,
      feedback:
        "Smooth pacing. Breath control is noticeably effective. Minor filler word 'um' detected at 0:18.",
      waveform: Array.from({ length: 36 }, (_, i) => ({
        v: 0.25 + Math.abs(Math.cos(i * 0.5)) * 0.65,
        kind: i === 18 ? ("filler" as const) : ("clear" as const),
      })),
      createdAt: new Date(Date.now() - 86400 * 1000 * 2), // 2 days ago
    },
    {
      id: "attempt-aman-1",
      studentId: "aman-k",
      moduleId: "module-1",
      assignmentId: "hw-2",
      prompt: "Explain how technology changes learning in tier-2 cities.",
      transcript:
        "Hello sir. Technology has completely transformed coaching in Bihar. Earlier we had to travel to Delhi for guidance, but now with mobile apps like Tarang, we can practice speaking daily right from our rooms.",
      audioUrl: sampleAudioUri,
      durationSec: 45,
      pronunciation: 79,
      vocabulary: 82,
      grammar: 76,
      fillerCount: 3,
      pauseCount: 4,
      feedback: "Good enthusiasm. Be mindful of ending consonants in 'transformed' and 'guidance'.",
      waveform: Array.from({ length: 38 }, (_, i) => ({
        v: 0.35 + Math.abs(Math.sin(i * 0.6)) * 0.55,
        kind: i % 8 === 0 ? ("hesitation" as const) : ("clear" as const),
      })),
      createdAt: new Date(Date.now() - 3600 * 1000 * 12),
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
