# AI Agent Guidelines & Coding Constitution — Tarang

Welcome AI Agent. Before writing or modifying any code in this repository, you must read and adhere to these strict rules.

---

## 1. Project Philosophy & Design System

- **Product**: Tarang (Signal Speak Studio) — Spoken-English coaching platform for Indian coaching institutes.
- **Visual Language**: Audio engineering console aesthetic ("Waveforms, not vibes").
- **Colors**: Use only custom tokens: `ink-950` (`#100E0C`), `ink-900` (`#1B1815`), `ink-800` (`#242019`), `border-hairline` (`#2E2A26`), `signal-teal` (`#3FB8AF`), `static-amber` (`#E2A33C`), `alert-rust` (`#C1503B`), `text-primary` (`#EDE7DD`).
- **Typography**: Space Grotesk for display, Inter for body, IBM Plex Mono (`.num`) for numbers/scores.
- **Strictly Prohibited**: Purple gradients, glassmorphism, floating 3D shapes, emoji-as-icon substitutions, pure `#000000` / `#FFFFFF`.

---

## 2. Architecture & File Structure

- **Framework**: TanStack Start (`@tanstack/react-start`) with file-based routing in `src/routes/`.
- **Root Shell**: `src/routes/__root.tsx` is the sole root wrapper. Do not add Next.js/Remix style layout folders.
- **Database**: Local MongoDB via native `mongodb` driver with connection helper `getDb()` in `src/lib/db.ts`. Do not use or reintroduce Supabase or third-party cloud-locked SDKs.
- **Server Functions**: Use `createServerFn` from `@tanstack/react-start` for backend operations.

---

## 3. Mandatory Verification Checklist

Before completing any task:

1. `npx tsc --noEmit` — must pass with 0 type errors.
2. `npm run lint` — must pass with 0 lint errors.
3. `npm run build` — must compile both client and SSR environments.

Refer to `docs/AI_CONTEXT.md`, `docs/PRD.md`, and `docs/TLD.md` for complete specifications.
