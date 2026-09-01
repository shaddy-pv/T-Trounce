# Tarang (Signal Speak Studio) — Product Roadmap & Engineering Tasks

**Document Version:** 2.0.0  
**Status:** Pre-Production Remediation  
**Target Architecture:** Multi-Tenant Speech Coaching SaaS Platform (React 19 + TanStack Start + Node.js + MongoDB + Cloudflare R2 / S3 + Whisper ASR)

---

## 1. Release Milestones Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: MVP UI & Aesthetic Design System (COMPLETED)                  │
│ • Dual-shell design system (12px Student Deck & 4px Teacher Console)   │
│ • 60 FPS HTML5 Canvas Waveform in 3 modes (live, result, thumbnail)    │
│ • Teacher Dashboard with batch meters and red-flag alert panel         │
│ • Student Recording console with Web Audio API mic input               │
│ • Diagnostic result screen with triad scoring breakdown                │
│ • Local MongoDB connection pool with initial auto-seeder               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Security, Auth & Server RPC Hardening (SPRINT 1)              │
│ • Remove hardcoded passwords & admin bypasses (login.tsx, seed-mongo)  │
│ • Eliminate auto-registration on login; implement strict auth & tokens │
│ • Add TanStack Start Server Function authorization middleware          │
│ • Implement strict Zod schema validation on all RPC boundary inputs    │
│ • Add beforeLoad route guards to /flags, /reports, /students/:id       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Storage & Database Multi-Tenant Refactor (SPRINT 2)           │
│ • Migrate Base64 audio blobs out of MongoDB to Cloudflare R2 / S3      │
│ • Decouple global module completion into per-student progress records  │
│ • Fix student status state machine & remove dynamic updatedAt resets   │
│ • Multi-tenant instituteId and cohort scoping across all queries       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Real Speech & Acoustic Intelligence Pipeline (SPRINT 3)       │
│ • Cross-browser MediaRecorder with iOS Safari MP4 & WebM codecs        │
│ • Whisper ASR integration for real verbatim speech transcription       │
│ • Real phonetic filler word detection (no Math.random simulation)      │
│ • NLP-driven grammar, vocabulary, and pronunciation scoring            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: Testing, CI/CD, Containerization & Launch (SPRINT 4)          │
│ • Fix 407 ESLint & Prettier linter/formatting errors                   │
│ • Full Vitest unit test suite + Playwright E2E testing suite           │
│ • Production multi-stage Dockerfile & GitHub Actions CI/CD             │
│ • Sentry error tracking & /api/health monitoring endpoint              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Detailed Task Breakdown & Work In Progress

Refer to the complete, exhaustive feature audit and implementation roadmap in [ROADMAP.md](file:///e:/Project/Working/t-trounce/signal-speak-studio-main/ROADMAP.md).
