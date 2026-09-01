# Technology Stack & Architecture Reference — Tarang

## 1. Overview & Stack Layers

```text
┌─────────────────────────────────────────────────────────────┐
│ LAYER               TECHNOLOGY               VERSION        │
├─────────────────────────────────────────────────────────────┤
│ Framework           TanStack Start           ^1.167.50      │
│ Routing             TanStack Router          ^1.168.25      │
│ UI Library          React                    ^19.2.0        │
│ Styling             Tailwind CSS             ^4.2.1         │
│ State / Query       TanStack Query           ^5.83.0        │
│ Icons               Lucide React             ^0.575.0       │
│ Charts              Recharts                 ^2.15.4        │
│ Database            MongoDB (Local)          ^6.0+ / 7.0+   │
│ DB Driver           mongodb (Node Native)    ^6.13.0        │
│ Build Tool          Vite                     ^8.0.16        │
│ Language            TypeScript               ^5.8.3         │
│ SSR Server Engine   Nitro                    3.0 (beta)     │
│ Audio API           Web Audio API            Standard W3C   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Layer

### 2.1 React 19 & TanStack Start

- **TanStack Start**: Provides full-stack SSR capabilities with built-in streaming, file-based routing, and RPC-style server functions via `createServerFn`.
- **TanStack Router**: Delivers 100% type-safe routing, automatic route parameter inference, and automatic code-splitting per route.
- **TanStack Query v5**: Manages asynchronous server state, automatic caching, revalidation, and background data synchronization.

### 2.2 Styling with Tailwind CSS v4

- Uses the modern `@tailwindcss/vite` plugin without legacy configuration files (`tailwind.config.js`).
- Design tokens defined directly in [src/styles.css](file:///e:/Project/Working/t-trounce/signal-speak-studio-main/src/styles.css) via `@theme inline` block.
- Dual-radius scale: `--radius-deck: 12px` (student mobile surfaces) and `--radius-console: 4px` (teacher console surfaces).

### 2.3 Audio Visualization

- Native HTML5 Canvas + Web Audio API (`AudioContext`, `MediaStreamAudioSourceNode`, `AnalyserNode`).
- Zero external charting/audio dependencies for real-time waveform rendering to preserve 60 FPS performance.

---

## 3. Backend & Data Layer

### 3.1 Local MongoDB

- **Target Instance**: Local MongoDB server running at `mongodb://localhost:27017/tarang` (or configured via `MONGODB_URI`).
- **Driver**: Official `mongodb` Node.js native driver for minimal overhead, connection pooling, and BSON type support.
- **Collections**:
  - `users`: User profiles and role assignments (`student` | `teacher`).
  - `modules`: Practice speech prompts, duration, and difficulty ratings.
  - `attempts`: Recorded practice sessions, scores, and waveform segment metadata.
  - `students`: Batch roster metadata, status flags, and 30-day score trajectories.
  - `batches`: Coaching class batch definitions (e.g., `Batch X-A`).

### 3.2 Nitro SSR Engine

- Lightweight, portable server runtime bundling server entry points and SSR handlers for high throughput.

---

## 4. Development & Tooling

- **Vite 8**: Next-generation lightning-fast bundler with Rolldown-based chunking.
- **TypeScript 5.8**: Strict mode enabled with bundler module resolution (`tsconfig.json`).
- **ESLint 9 + Prettier**: Code formatting and linting enforcing clean React and TypeScript standards.
