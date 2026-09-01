# Tarang (Signal Speak Studio) — Production Readiness Roadmap & Feature Audit

**Document Version:** 2.0.0  
**Status:** In Progress / Pre-Production Remediation  
**Target Architecture:** Multi-Tenant Speech Coaching SaaS Platform (React 19 + TanStack Start + Node.js + MongoDB + Cloudflare R2 / S3 + Whisper ASR)

---

## 1. Executive Status & Complete Feature Audit Matrix

This matrix details the exact state of every module, component, and user flow across both the **Student Portal**, **Teacher Console**, **Admin Management**, and **Backend/Data Infrastructure**.

### 1.1 Student Portal (`/practice`, `/progress`, `/profile`)

| Feature / Capability                |     Current Status     | Implemented Functionality                                             | Missing / Unfinished Items                                                                                                                                       |
| :---------------------------------- | :--------------------: | :-------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication & Sign-in**        |      ⚠️ Insecure       | Form input for email and password                                     | • No real email validation<br>• Unknown emails auto-create accounts<br>• No "Forgot Password" or email confirmation                                              |
| **Curriculum Practice Drills**      |       ⚠️ Partial       | List 5 default curriculum prompts; Start recording                    | • **Global completion bug**: completing a module marks it done for the entire institute<br>• No per-student progression/unlock tree                              |
| **Live Audio Recording & Waveform** |       ⚠️ Partial       | Web Audio API RMS amplitude stream rendered at 60 FPS on HTML5 Canvas | • Only records `audio/webm` (fails on iOS Safari)<br>• Web Audio memory not freed on premature tab close<br>• No mic level calibration / background noise gating |
| **Audio Storage & Upload**          | ❌ Broken Architecture | Records audio blob and converts to Base64 string                      | • **Stores raw Base64 audio inside MongoDB documents (exceeds 16MB BSON limit)**<br>• No direct-to-S3/R2 presigned upload pipeline                               |
| **Speech Diagnostic Evaluation**    |      ⚠️ Simulated      | Generates Pronunciation, Vocab, and Grammar scores                    | • **`Math.random() > 0.6` randomly fakes filler words**<br>• Vocab/Grammar scores calculated from volume amplitude formulas, not real NLP/ASR                    |
| **Homework / Assignment Feed**      |      ❌ Defective      | Displays assigned homework list                                       | • **Leaking bug**: shows all assignments across all institutes, sessions, and batches without cohort filtering<br>• No past-due grace period handling            |
| **7-Day Streak & Activity Metric**  |        ⚠️ Buggy        | 7-bar visual streak component                                         | • **Reset bug**: Streak calculates from 0 if student opens app before recording on the current day                                                               |
| **Teacher Notes & Feedback Loop**   |     🟢 Functional      | Real-time direct message thread; reply to teacher                     | • Missing push notifications / email alerts on new message                                                                                                       |
| **Portfolio & Attempt History**     |     🟢 Functional      | 30-day signal trajectory graph and past attempt cards                 | • Pagination missing (breaks after 50+ attempts)<br>• Audio replay does not sync waveform scrubber with seekhead                                                 |
| **Student Profile & Settings**      |     🟢 Functional      | Shows enrolled batch, interface language toggle                       | • Language preference stored only in local React state (resets on refresh)                                                                                       |

---

### 1.2 Teacher & Admin Console (`/dashboard`, `/assignments`, `/flags`, `/reports`, `/users`)

| Feature / Capability                          |  Current Status  | Implemented Functionality                                                                         | Missing / Unfinished Items                                                                                                                                                            |
| :-------------------------------------------- | :--------------: | :------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Teacher Authentication & RBAC**             | ❌ Critical Risk | Session cookie verification                                                                       | • Anyone can type `/flags`, `/reports`, or `/students/$id` without logging in (**missing route guards**)<br>• Auto-registration allows anyone to select "Teacher" and enter any email |
| **Batch Health Meters & Overview**            |  🟢 Functional   | Total active, flagged count, nudge count, average score                                           | • Metrics calculated on full table in-memory; missing MongoDB `$aggregate` pipeline for scale                                                                                         |
| **Session & Batch Filters**                   |  🟢 Functional   | Filter by Season (Summer/Autumn/Winter/Spring) & Time (Morning/Evening)                           | • Filter is client-side only (downloads all students over the wire)                                                                                                                   |
| **Red-Flagged Alert Panel**                   |     ⚠️ Buggy     | Identifies inactive (>4 days) or declining students                                               | • **Overwrite bug**: Resolving or flagging a student updates `updatedAt`, which resets status to `"on-track"` on next query                                                           |
| **Assignment Broadcast Engine**               |    ⚠️ Partial    | Interactive modal to create homework targeted to batch with title, prompt, duration, and deadline | • Delete RPC deletes all student submissions without confirmation or teacher ownership check<br>• No student submission rate tracker                                                  |
| **Student Profile Dossier (`/students/$id`)** |    ⚠️ Partial    | Detailed dossier with attendance, score trajectory, and historical audio player                   | • **Zero route protection** (anyone can access private recordings)<br>• Audio player lacks waveform-synchronized scrubber jumping                                                     |
| **Direct Notes to Students**                  |  🟢 Functional   | Send direct coaching guidance to specific student                                                 | • No rich-text formatting or voice notes from teacher                                                                                                                                 |
| **Parent WhatsApp Report Generator**          |   ⚠️ Simulated   | Instant preview card and WhatsApp `api.whatsapp.com` URL generator                                | • Hardcoded institute name (`Sharma Coaching, Patna`)<br>• Estimated attempt count instead of real week count<br>• No automated bulk PDF export                                       |
| **User & Faculty Administration (`/users`)**  |  ❌ Unprotected  | Create teachers & students, assign passwords, delete accounts                                     | • **Unprotected RPC**: Any anonymous client can call `createUserFn` or `deleteUserFn`<br>• Hardcoded email check `shadanmd566@gmail.com` for admin privileges                         |

---

### 1.3 Backend, Database & Infrastructure

| Feature / Capability                            |  Current Status  | Implemented Functionality                       | Missing / Unfinished Items                                                                                                                                                    |
| :---------------------------------------------- | :--------------: | :---------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server RPC Functions (`src/server/data.ts`)** | ❌ Critical Risk | 20+ TanStack Start server functions             | • **0 authorization checks** on RPC layer<br>• Validators are no-op identity functions `(p) => p` (no Zod schema parsing)<br>• Vulnerable to NoSQL injection and IDOR attacks |
| **Database Engine & Client**                    |    ⚠️ Partial    | MongoDB native connection pool with auto-seeder | • Silent fallback to mock data masks real database outages<br>• Missing multi-tenant `instituteId` field on collections                                                       |
| **Secrets & Environment Config**                |   ❌ Insecure    | `.env` and `src/config/env.ts`                  | • Hardcoded plaintext admin password in `seed-mongo.ts` and `login.tsx`<br>• Insecure default session secret string fallback                                                  |
| **Automated Testing Suite**                     |    ❌ Missing    | None                                            | • 0 unit tests (Vitest)<br>• 0 integration tests<br>• 0 Playwright E2E tests                                                                                                  |
| **Code Quality & Linter**                       |    ⚠️ Failing    | ESLint 9 + Prettier config                      | • **407 ESLint/Prettier errors blocking CI/CD pipeline**                                                                                                                      |
| **DevOps, CI/CD & Production Build**            |    ⚠️ Partial    | `npm run build` succeeds                        | • No Dockerfile or container configuration<br>• No GitHub Actions CI workflow<br>• No health check endpoint (`/api/health`)<br>• No Sentry / APM error tracking               |

---

## 2. Comprehensive Multi-Phase Implementation Roadmap

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PRODUCTION READINESS TIMELINE                                  │
├───────────────────┬───────────────────┬───────────────────┬───────────────────┬──────────────────┤
│ PHASE 1 (Week 1)  │ PHASE 2 (Week 2)  │ PHASE 3 (Week 3)  │ PHASE 4 (Week 4)  │ PHASE 5 (Week 5) │
│ Security, Auth &  │ Storage & DB      │ Real Speech & ASR │ Feature Polish &  │ Testing, DevOps  │
│ RPC Middleware    │ Multi-Tenancy     │ Intelligence      │ Portal Completion │ & Launch Ready   │
└───────────────────┴───────────────────┴───────────────────┴───────────────────┴──────────────────┘
```

---

## Phase 1: Security, Authentication & RPC Hardening (P0 Blocker)

### 1.1 Purge Hardcoded Secrets & Bypass Credentials

- [ ] Remove hardcoded credentials (`shadanmd566@gmail.com`, `700Shadan724@#`) from `src/routes/login.tsx`.
- [ ] Remove credential cheat-sheet display box from public login UI.
- [ ] Remove plaintext passwords in `scripts/seed-mongo.ts` and replace with runtime environment variables (`ADMIN_SEED_PASSWORD`).
- [ ] Remove hardcoded email check `user.email === "shadanmd566@gmail.com"` in `src/server/services/auth.service.ts` and `src/server/services/user.service.ts`. Role must come strictly from the authenticated database document.
- [ ] Enforce strict Zod schema validation in `src/config/env.ts` at server startup (fail fast if `SESSION_SECRET` or `MONGODB_URI` is missing).

### 1.2 Authentication Lifecycle & Token Management

- [ ] **Remove Auto-Registration on Login**: In `AuthService.authenticateUserWithRole`, fail with `401 Unauthorized` if the email does not exist or password does not match.
- [ ] Implement separate, secured registration and invitation flows for students and faculty.
- [ ] Introduce dual-token auth architecture:
  - Short-lived Access Token (15 min) in memory / secure cookie.
  - Long-lived Refresh Token (7 days) in HTTP-only, SameSite=Strict, Secure cookie with database revocation list.
- [ ] Implement password reset flow via cryptographic single-use tokens.

### 1.3 Server Function RPC Protection & Input Schema Validation

- [ ] Implement TanStack Start middleware wrappers:
  - `authMiddleware`: Verifies session token and injects `user` context.
  - `teacherOnlyMiddleware`: Asserts `user.role === 'teacher' || user.role === 'admin'`.
  - `adminOnlyMiddleware`: Asserts `user.role === 'admin'`.
- [ ] Apply middleware to all server functions in `src/server/data.ts`:
  - `fetchUsersFn`, `createUserFn`, `deleteUserFn` -> `adminOnlyMiddleware` / `teacherOnlyMiddleware`.
  - `createAssignmentFn`, `deleteAssignmentFn`, `updateStudentStatusFn` -> `teacherOnlyMiddleware`.
  - `saveAttemptFn` -> `authMiddleware` (enforce that caller can only write to their own `studentId`).
- [ ] Replace all no-op validators with strict **Zod schemas** (`z.object({...})`) on every server function to reject malformed or malicious payloads before execution.

### 1.4 Route Authentication Guards

- [ ] Add `beforeLoad` route guards to all protected routes:
  - `src/routes/flags.tsx`: Require teacher/admin session.
  - `src/routes/reports.tsx`: Require teacher/admin session.
  - `src/routes/students.$id.tsx`: Require teacher session, or student session matching the route `$id`.
  - `src/routes/users.tsx`: Require admin/teacher session.

---

## Phase 2: Object Storage & Database Architecture Refactoring

### 2.1 Audio Object Storage Migration (Cloudflare R2 / AWS S3)

- [ ] Set up S3-compatible Object Storage bucket (Cloudflare R2 or AWS S3).
- [ ] Implement presigned upload endpoint: `getPresignedAudioUploadUrl(studentId, fileExtension)`.
- [ ] Update client recording flow: Client uploads audio binary directly to Object Storage via HTTP PUT and sends only the public CDN URL to `saveAttemptFn`.
- [ ] Refactor `AttemptDoc.audioUrl` in MongoDB schemas to store clean URL strings (max 255 chars) instead of multi-megabyte Base64 strings.
- [ ] Configure automatic 90-day lifecycle archiving/cleanup rules on audio bucket.

### 2.2 Per-Student Module Progress Isolation

- [ ] Remove `completed: boolean` field from global `ModuleDoc` in `src/server/db/schemas.ts`.
- [ ] Create `StudentProgressDoc` collection (`student_progress`):
  ```typescript
  interface StudentProgressDoc {
    studentId: string;
    moduleId: string;
    completed: boolean;
    bestScore: number;
    attemptsCount: number;
    lastAttemptAt: Date;
  }
  ```
- [ ] Update `ModuleService.getAllModules(studentId)` to dynamically aggregate module definitions with the student's personal progress document.

### 2.3 Student Status & State Machine Remediation

- [ ] Remove dynamic status recalculation in `StudentService.getRoster()` and `getStudentById()` that overwrites manual teacher flags.
- [ ] Persist student status explicitly: `"on-track" | "nudge" | "flagged"`.
- [ ] Create automated daily scheduled background job to mark students as `flagged` only if `lastActiveDate` > 4 days AND status is currently `on-track`.
- [ ] Maintain teacher manual overrides until explicitly resolved or reset.

### 2.4 Multi-Tenant Institute & Cohort Scoping

- [ ] Add `instituteId` to all database schemas (`users`, `students`, `batches`, `assignments`, `attempts`, `messages`).
- [ ] Add MongoDB compound indexes:
  - `students`: `{ instituteId: 1, batchId: 1, status: 1 }`
  - `assignments`: `{ instituteId: 1, batchId: 1, createdAt: -1 }`
  - `attempts`: `{ instituteId: 1, studentId: 1, createdAt: -1 }`
- [ ] Scope `AssignmentService.listAssignments()` strictly to the student's authenticated `instituteId`, `sessionSeason`, and `batchTime` (or `batchId`).

---

## Phase 3: Speech & Acoustic Intelligence Pipeline

### 3.1 Cross-Browser Audio Capture (Mobile Safari & Desktop)

- [ ] Inspect browser MIME support in `useAudioRecorder.ts`:
  1. `audio/webm;codecs=opus` (Chrome / Firefox / Edge / Android)
  2. `audio/mp4` / `audio/aac` (Safari iOS & macOS)
  3. Fallback to WAV PCM audio encoder if compressed formats fail.
- [ ] Handle Safari AudioContext suspended state (`ctx.resume()` on user tap).
- [ ] Add audio chunk streaming and cleanup on component unmount to prevent browser memory leaks.

### 3.2 Real Speech-to-Text & Phonetic Pronunciation Engine

- [ ] Integrate **Whisper ASR pipeline** (OpenAI Whisper API or self-hosted Faster-Whisper / Groq Whisper) to generate verbatim transcripts with word-level timestamps.
- [ ] **Accurate Filler Detection**: Cross-reference word timestamps with acoustic silence intervals to detect actual hesitations ("um", "uh", "matlab", "like", "actually", "er") without `Math.random()` simulation.
- [ ] **Acoustic Cadence & Pauses**: Compute Words-Per-Minute (WPM) and detect unnatural pauses (> 1.2s) vs. natural grammatical pauses.
- [ ] **NLP Grammar & Vocabulary Evaluator**: Send transcript to language model for syntax validation, lexical diversity scoring, and targeted speech recommendations.

---

## Phase 4: Feature Completion on Student & Teacher Portals

### 4.1 Student Portal Complete Features

- [ ] **Daily Streak Fix**: Update streak calculation so that an active streak does not reset to 0 in the morning before recording; preserve streak if active within the last 36 hours.
- [ ] **Homework vs Practice Split**: Clear visual segmentation between mandatory instructor-assigned homework and elective daily practice drills.
- [ ] **Offline Practice Queue**: Cache curriculum prompts and recordings locally in IndexedDB; auto-sync when internet connection is restored.
- [ ] **Synchronized Audio Scrubber**: Interactive waveform where clicking any segment jumps audio playback to that exact millisecond.
- [ ] **Pronunciation Drilldown**: Detailed view showing phonetic mistakes with a "Listen to Native Model" audio comparison button.

### 4.2 Teacher & Admin Console Complete Features

- [ ] **Dynamic Live Filters**: Real-time batch filtering by Session, Batch Timing, and Attention Status backed by server-side MongoDB aggregation.
- [ ] **Homework Submission Matrix**: Real-time grid showing which students have completed, submitted late, or are pending for each assigned homework.
- [ ] **Teacher Feedback Studio**: Record voice notes or write markdown feedback directly onto student attempts.
- [ ] **Dynamic Parent Reports**: Replace hardcoded institute names with dynamic institute branding, real attendance stats, and one-click WhatsApp/PDF delivery.
- [ ] **Bulk Roster Import**: CSV student roster upload with auto-generation of initial credentials.

---

## Phase 5: Code Quality, Testing, CI/CD & DevOps

### 5.1 Code Quality & Linter Remediation

- [ ] Fix all 407 ESLint / Prettier formatting and typing errors (`npm run format && npm run lint`).
- [ ] Remove all `@typescript-eslint/no-explicit-any` instances with strict TypeScript interfaces.

### 5.2 Automated Testing Suite

- [ ] **Unit Tests (Vitest)**:
  - `auth.service.test.ts`: Password hashing, token signing, role verification.
  - `audio-analyzer.test.ts`: Acoustic calculations, WPM, filler identification.
  - `student.service.test.ts`: Status state transitions, roster queries.
- [ ] **Integration Tests**:
  - Test all Server Function RPC endpoints against in-memory MongoDB (`mongodb-memory-server`).
- [ ] **End-to-End Tests (Playwright)**:
  - Student Journey: Login -> Record audio drill -> Review diagnostic waveform -> Check portfolio.
  - Teacher Journey: Login -> Broadcast homework -> Grade student submission -> Share WhatsApp report.

### 5.3 Deployment, Containerization & Monitoring

- [ ] Create production `Dockerfile` (multi-stage Node.js 22 alpine build).
- [ ] Create `docker-compose.yml` for local staging (app + MongoDB + MinIO storage).
- [ ] Set up GitHub Actions CI workflow (`.github/workflows/ci.yml`) running lint, typecheck, unit tests, and production build on every push/PR.
- [ ] Add `/api/health` endpoint monitoring database connectivity, memory usage, and uptime.
- [ ] Integrate Sentry for exception tracking and Pino for structured JSON logging.

---

## 3. Production Deployment Sign-off Criteria

The application is officially deemed **Production-Ready** when:

1. `npm run lint` passes with 0 errors and 0 warnings.
2. `npx tsc --noEmit` passes with 0 type errors.
3. `npm run test` achieves > 85% code coverage across all services and RPC handlers.
4. `npm run test:e2e` passes all Playwright user journey tests.
5. All audio blobs are stored in Object Storage with CDN URLs (0 Base64 strings in MongoDB).
6. Penetration testing confirms no unauthorized access to `/dashboard`, `/reports`, `/flags`, `/users`, or backend RPCs.
7. End-to-end recording works reliably across Chrome, Firefox, Edge, and iOS Safari.
