# AI Context & Project Constitution — Tarang

> **Single Source of Truth for AI Coding Assistants working in this repository.**

---

## 1. Project Purpose & Core Identity

- **Project Name**: Tarang (Signal Speak Studio)
- **What it is**: Spoken-English coaching studio for tier-2/3 Indian coaching institutes.
- **Core Metaphor**: Speech is an acoustic **signal** — clarity is amplitude and coherence; hesitation, filler words (_"umm"_, _"aah"_), and nervous pauses are **noise**.

---

## 2. Immutable Design System Rules (DO NOT DEVIATE)

1. **Color Tokens**:
   - Background: `#100E0C` (`ink-950`) — Warm near-black, never `#000000` or cold slate.
   - Surface: `#1B1815` (`ink-900`), Hover: `#242019` (`ink-800`).
   - Borders: `#2E2A26` (`border-hairline`, 1px).
   - Text: `#EDE7DD` (`text-primary` - parchment white), `#9C9388` (`text-secondary`), `#6B645A` (`text-tertiary`).
   - Primary Accent: `#3FB8AF` (`signal-teal`) — Used for active state, brand mark, primary CTAs.
   - Functional Accents: `#E2A33C` (`static-amber` - live recording pulse, filler markers), `#C1503B` (`alert-rust` - red-flag students, errors).

2. **Forbidden Patterns**:
   - **NO** purple / violet / indigo SaaS gradients.
   - **NO** glassmorphism or blur effects on standard cards.
   - **NO** emoji as icons in the product UI.
   - **NO** floating 3D shapes or bounce/confetti micro-animations.

3. **Typography**:
   - Headings & Wordmarks: **Space Grotesk**
   - Body & Controls: **Inter**
   - Numbers & Metrics: **IBM Plex Mono** (`.num` class)

4. **Dual-Radius Hierarchy**:
   - Student Surfaces (`/practice`, `/progress`, `/profile`): **12px radius**, calm, mobile-first.
   - Teacher Surfaces (`/dashboard`, `/flags`, `/reports`, `/students/:id`): **4px radius**, dense, desktop console.

---

## 3. Technology Stack & Backend Constraints

- **Framework**: TanStack Start (`@tanstack/react-start` + `@tanstack/react-router` + `@tanstack/react-query`).
- **Database**: Local MongoDB (`mongodb://localhost:27017/tarang`) using native `mongodb` package with `getDb()` connection pooling in `src/lib/db.ts`.
- **Zero Cloud Proprietary Lock-in**: Do NOT introduce Supabase, Firebase, or cloud-only authentication SDKs.
- **Routing**: File-based routes in `src/routes/` with `routeTree.gen.ts`. Never create Next.js `pages/` or `app/` folders.

---

## 4. Verification Workflow

Whenever you make changes to this codebase:

1. Run `npx tsc --noEmit` to verify type safety.
2. Run `npm run lint` and `npm run format` to enforce style guidelines.
3. Run `npm run build` to confirm client and server SSR bundles compile cleanly.
