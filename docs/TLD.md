# Technical Level Design (TLD) — Tarang (Signal Speak Studio)

## 1. System Architecture Overview

Tarang is architected as a high-performance, full-stack SSR application using **TanStack Start** with **React 19**, **Vite 8**, **Tailwind CSS v4**, and **Local MongoDB** for data persistence.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          Client Browser (React 19)                    │
│                                                                        │
│  ┌─────────────────────────┐           ┌────────────────────────────┐  │
│  │   Student Mobile View   │           │   Teacher Console View     │  │
│  │  (12px Radius Deck UI)  │           │   (4px Radius Strip UI)    │  │
│  └───────────┬─────────────┘           └─────────────┬──────────────┘  │
│              │                                       │                 │
│              ▼                                       ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │   TanStack Router (File-based Routing, Preloading & Sockets)     │  │
│  │   TanStack Query v5 (Client State, Invalidation, Caching)       │  │
│  │   Web Audio API (AnalyserNode, Live Canvas Waveform Engine)     │  │
│  └───────────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       │ HTTP / SSR RPC (createServerFn)
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Node.js / Nitro SSR Server Engine                  │
│                                                                        │
│  ┌────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │  TanStack Start Server │  │  SSR Error Wrappers & Normalizers    │  │
│  │  Function RPC Handlers │  │  (src/server.ts & src/start.ts)      │  │
│  └───────────┬────────────┘  └──────────────────────────────────────┘  │
│              │                                                         │
│              ▼                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │          Local MongoDB Client Layer (src/lib/db.ts)              │  │
│  │    • Global Connection Pooling & HMR Socket Cache                │  │
│  │    • Automatic Schema Validation & Indexing                      │  │
│  │    • Resilient In-Memory Fallback & Auto-Seeding                 │  │
│  └───────────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       │ Native MongoDB Wire Protocol
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Local MongoDB 6.0+ / 7.0+                       │
│                                                                        │
│   Database: tarang                                                     │
│   Collections: users, modules, attempts, students, batches             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Architecture & Design System

### 2.1 Technology Choices

- **React 19**: Modern concurrent rendering and optimized component lifecycle.
- **TanStack Router**: Fully type-safe file-based router with automatic route tree generation (`src/routeTree.gen.ts`).
- **Tailwind CSS v4 (`@tailwindcss/vite`)**: CSS-first theme tokens defined directly in `src/styles.css` using `@theme inline`.
- **Lucide Icons**: Minimalist functional icons used selectively.

### 2.2 Design System Tokens & Dual Radius

The UI uses strict semantic color tokens and a deliberate dual-radius hierarchy:

- **Surface**: `ink-950` (`#100E0C`), `ink-900` (`#1B1815`), `ink-800` (`#242019`), `border-hairline` (`#2E2A26`).
- **Accents**: `signal-teal` (`#3FB8AF` - primary), `static-amber` (`#E2A33C` - recording/nudges), `alert-rust` (`#C1503B` - flagged errors).
- **Typography**: Space Grotesk (display numbers/headings), Inter (body/labels), IBM Plex Mono (metrics and tabular data).
- **Dual Radius**: 12px for mobile student deck; 4px for dense desktop console tables.

---

## 3. Backend & Data Layer Architecture

### 3.1 Local MongoDB Driver Architecture

The backend uses the official Node.js `mongodb` driver with optimized connection pooling.

```typescript
// src/lib/db.ts Connection Cache Pattern
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/tarang";
  const client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();
  cachedClient = client;
  cachedDb = client.db(process.env.MONGODB_DB_NAME || "tarang");
  return cachedDb;
}
```

### 3.2 Resilience & Auto-Seeding

When the database is empty on initialization, the database helper automatically initializes indexes and populates starter seed data (practice modules and initial student roster) so the platform is immediately operational.

---

## 4. Audio Processing & Waveform Engine

### 4.1 Client-Side Live Audio Pipeline

1. `navigator.mediaDevices.getUserMedia({ audio: true })` requests browser microphone access.
2. `AudioContext` creates an `AnalyserNode` with `fftSize = 256`.
3. `requestAnimationFrame` samples frequency bin amplitudes at 60 FPS.
4. Canvas rendering draws proportional signal bars with teal intensity matching RMS amplitude.

### 4.2 Waveform Timeline Segment Classification

Waveforms are structured into chronological segments:

```typescript
export interface WaveformSegment {
  timeSec: number;
  amplitude: number; // 0.0 to 1.0
  kind: "clear" | "pause" | "filler";
}
```

---

## 5. Security & Error Handling

1. **Role-Based Routing**: Verified both on the client via `useUser` and in server loaders.
2. **SSR Error Normalization**: [src/server.ts](file:///e:/Project/Working/t-trounce/signal-speak-studio-main/src/server.ts) traps in-handler throws and renders a consistent fallback page.
3. **Graceful DB Fallback**: If local MongoDB is temporarily unreachable during local development, data services fall back to memory mocks without crashing the UI.

---

## 6. Scalability & Performance Benchmarks

- **LCP (Largest Contentful Paint)**: < 0.9s on broadband, < 1.4s on 4G.
- **Bundle Footprint**: Client bundle gzip under 180kB.
- **Zero Cloud API Latency**: Fully self-contained local database layer eliminating cloud roundtrips during coaching rehearsals.
