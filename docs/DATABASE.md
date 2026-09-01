# Database Design & Schemas (MongoDB) — Tarang

## 1. Database Overview

- **Engine**: MongoDB Community / Enterprise 6.0+ or 7.0+
- **Database Name**: `tarang`
- **Default Local Connection URI**: `mongodb://localhost:27017/tarang`

---

## 2. Collections & Document Schemas

### 2.1 Collection: `users`

Stores user identity, role assignments, and batch associations.

```typescript
export interface UserDocument {
  _id?: ObjectId;
  id: string; // e.g. "priya-s", "teacher-sharma"
  name: string; // e.g. "Priya S."
  email?: string;
  role: "student" | "teacher";
  batchId?: string; // e.g. "batch-x-a"
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.2 Collection: `modules`

Stores speaking practice prompts, difficulty levels, and time constraints.

```typescript
export interface ModuleDocument {
  _id?: ObjectId;
  id: string; // e.g. "hobby", "city", "debate"
  title: string; // "Talk about your favorite hobby"
  prompt: string; // "Tell me about your favorite hobby..."
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  durationSec: number; // e.g. 45, 60, 90
  completed?: boolean;
  order: number;
  createdAt: Date;
}
```

### 2.3 Collection: `students`

Stores teacher-facing roster metadata, status classifications, and aggregate metrics.

```typescript
export interface WaveformSegment {
  timeSec: number;
  amplitude: number; // 0.0 to 1.0
  kind: "clear" | "pause" | "filler";
}

export interface StudentDocument {
  _id?: ObjectId;
  id: string; // "priya-s"
  name: string; // "Priya S."
  batchId: string; // "batch-x-a"
  status: "on-track" | "nudge" | "flagged";
  focus: "—" | "Vocab" | "Pron" | "Grammar" | "Fluency";
  lastActive: string; // "Today", "Yesterday", "8d ago"
  lastActiveDate: Date;
  scorePct: number; // 0 to 100
  trendPct: number; // e.g. +4, -6
  inactiveDays?: number;
  flagReason?: string;
  waveform: WaveformSegment[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.4 Collection: `attempts`

Stores individual student audio practice attempts and diagnostic waveforms.

```typescript
export interface AttemptDocument {
  _id?: ObjectId;
  id: string; // "att-12345"
  studentId: string; // "priya-s"
  moduleId: string; // "hobby"
  prompt: string;
  durationSec: number;
  pronunciation: number; // 0 to 100
  vocabulary: number; // 0 to 100
  grammar: number; // 0 to 100
  fillerCount: number;
  pauseCount: number;
  feedback: string;
  waveform: WaveformSegment[];
  createdAt: Date;
}
```

### 2.5 Collection: `batches`

Defines institute classrooms and cohorts.

```typescript
export interface BatchDocument {
  _id?: ObjectId;
  id: string; // "batch-x-a"
  name: string; // "Batch X-A"
  institute: string; // "Sharma Coaching, Patna"
  year: string; // "2025"
  studentCount: number;
  createdAt: Date;
}
```

---

## 3. Database Indexes

To ensure sub-millisecond query performance:

```javascript
// Index on students collection for batch scanning and status filtering
db.students.createIndex({ batchId: 1, status: 1 });
db.students.createIndex({ id: 1 }, { unique: true });
db.students.createIndex({ lastActiveDate: -1 });

// Index on attempts collection for student history lookup
db.attempts.createIndex({ studentId: 1, createdAt: -1 });
db.attempts.createIndex({ id: 1 }, { unique: true });

// Index on modules collection
db.modules.createIndex({ order: 1 });
db.modules.createIndex({ id: 1 }, { unique: true });
```

---

## 4. Auto-Seeding & Resilience Strategy

When `getDb()` connects for the first time, it performs a document count check on `modules` and `students`. If empty, it automatically populates the default curriculum modules and starter student roster from [src/lib/tarang-data.ts](file:///e:/Project/Working/t-trounce/signal-speak-studio-main/src/lib/tarang-data.ts), ensuring zero-configuration startup for developers.
