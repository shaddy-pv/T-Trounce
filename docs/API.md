# Server Functions & API Specification — Tarang

## 1. Overview

Tarang utilizes **TanStack Start Server Functions** (`createServerFn`) to provide type-safe RPC contracts between the React client and the Node.js / MongoDB backend.

---

## 2. Server Functions Contracts

### 2.1 Student Operations

#### `getModules`

- **Method**: Server Function (GET equivalent)
- **Input**: `void`
- **Output**: `Promise<ModuleDocument[]>`
- **Description**: Returns all practice modules ordered by curriculum sequence.

#### `getModuleById`

- **Method**: Server Function
- **Input**: `{ data: { moduleId: string } }`
- **Output**: `Promise<ModuleDocument | null>`
- **Description**: Returns specific module prompt and configuration.

#### `createAttempt`

- **Method**: Server Function (POST equivalent)
- **Input**:
  ```typescript
  {
    data: {
      studentId: string;
      moduleId: string;
      prompt: string;
      durationSec: number;
      pronunciation: number;
      vocabulary: number;
      grammar: number;
      fillerCount: number;
      pauseCount: number;
      feedback: string;
      waveform: WaveformSegment[];
    }
  }
  ```
- **Output**: `Promise<{ success: boolean; attemptId: string }>`
- **Description**: Saves student audio attempt and updates student aggregate metrics in MongoDB.

#### `getAttemptById`

- **Method**: Server Function
- **Input**: `{ data: { attemptId: string } }`
- **Output**: `Promise<AttemptResult | null>`
- **Description**: Returns diagnostic details for `/result/:attemptId`.

---

### 2.2 Teacher & Batch Operations

#### `getStudentRoster`

- **Method**: Server Function
- **Input**: `{ data?: { batchId?: string } }`
- **Output**: `Promise<StudentRow[]>`
- **Description**: Returns full batch roster with status classifications (`on-track`, `nudge`, `flagged`) and mini-waveforms.

#### `getStudentById`

- **Method**: Server Function
- **Input**: `{ data: { id: string } }`
- **Output**: `Promise<StudentRow | null>`
- **Description**: Returns student detailed profile, metrics, and historical performance for `/students/:id`.

#### `getBatchOverview`

- **Method**: Server Function
- **Input**: `{ data?: { batchId?: string } }`
- **Output**:
  ```typescript
  Promise<{
    totalStudents: number;
    flaggedCount: number;
    nudgeCount: number;
    onTrackCount: number;
    activeTodayCount: number;
    batchAvgScore: number;
  }>;
  ```
- **Description**: Returns top-level summary metrics for `/dashboard` meters.

---

## 3. Error Handling & Status Formats

All server functions follow uniform error handling:

- **Success**: Returns requested data directly.
- **Client Error (Invalid input / not found)**: Throws structured error with `{ message: string, code: "NOT_FOUND" | "INVALID_INPUT" }`.
- **Database Fallback**: In the event MongoDB is temporarily offline during local offline rehearsals, server functions return valid in-memory data to ensure uninterrupted UI operations.
