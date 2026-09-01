# Architectural Decision Records (ADRs) — Tarang

## ADR-001: Adoption of TanStack Start as Full-Stack SSR Framework

- **Status**: Accepted
- **Context**: The application requires high-performance server-side rendering, instant client-side route transitions, and robust type safety for coaching center web usage across low-spec devices.
- **Decision**: Adopt `@tanstack/react-start` with `@tanstack/react-router` and `@tanstack/react-query`.
- **Consequences**: Provides end-to-end type safety from server functions (`createServerFn`) to React components, eliminating boilerplate API endpoints.

---

## ADR-002: Transition from Cloud Supabase to Local MongoDB Persistence

- **Status**: Accepted
- **Context**: Indian coaching institutes and local deployment environments frequently operate in low/offline bandwidth settings and require zero third-party cloud subscription dependencies.
- **Decision**: Completely replace Supabase with local MongoDB (`mongodb://localhost:27017/tarang`) using the native Node.js `mongodb` driver with automatic connection caching and schema seeder.
- **Consequences**: Eliminates cloud vendor lock-in, ensures complete data sovereignty, and guarantees high-speed local response times.

---

## ADR-003: Client-Side Web Audio API Waveform Computation

- **Status**: Accepted
- **Context**: Visualizing speech audio in real time at 60 FPS without server latency is critical for student engagement during recording sessions.
- **Decision**: Implement real-time acoustic analysis directly on the browser via `AudioContext` and `AnalyserNode`, drawing live bars to HTML5 Canvas.
- **Consequences**: Zero server load during audio capture; instant visual feedback for students without audio buffering delays.

---

## ADR-004: Dual-Personality Design System (Deck vs Console)

- **Status**: Accepted
- **Context**: Students and teachers use the platform under completely different operational circumstances (students on phones needing calm focus; teachers on desktop scanning 50+ students in seconds).
- **Decision**: Unify colors and tokens under the Tarang design system, but introduce an intentional dual-radius layout split: `12px` border radius with generous spacing for student surfaces, and `4px` border radius with dense channel-strip data tables for teacher surfaces.
- **Consequences**: Delivers optimal UX for both roles without fragmenting the underlying design token architecture.
