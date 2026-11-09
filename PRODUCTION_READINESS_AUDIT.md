# Production Readiness Audit: Trounce (Signal Speak Studio)

| | |
|---|---|
| **Audit date** | 2026-11-06 |
| **Commit audited** | `b4f0227` on `main` (clean working tree) |
| **Scope** | All application source, server functions, services, DB layer, Python sidecar, scripts, Docker, CI, PWA assets, dependencies |
| **Stack** | TanStack Start (React 19, Vite 8), MongoDB driver, JWT sessions, faster-whisper sidecar, Gemini/OpenAI fallback |

This report describes the code **before** any fixes. Results after the fixes are in `PRODUCTION_READINESS_FINAL_REPORT.md`.

## How findings were verified

Every finding carries one of three labels:

| Label | Meaning |
|---|---|
| **RUN** | Reproduced by running the code. The production build was exercised over real HTTP against an isolated in-memory MongoDB, or in real Chrome through the DevTools Protocol. |
| **CODE** | Confirmed by reading the code path end to end. It was not separately executed. |
| **RISK** | A potential risk. It depends on conditions that could not be confirmed from this repository. |

No test touched the Atlas database configured in `.env`. No secret values appear in this report.

---

## 1. Executive Summary

The application has a solid feature set and a sensible structure, but **it is not safe to run in production as it stands**. It stores voice recordings of students, and the design brief and seed data indicate school-age learners.

The most serious problems, all reproduced on the running build:

1. **Anyone on the internet can download any student's voice recording** with no login, if they have or guess the audio ID. The response is also marked `Cache-Control: public, immutable`.
2. **Any logged-in student can read any other student's transcript and teacher notes** by changing an attempt ID.
3. **Stored XSS.** A student can upload HTML as "audio". The server later serves it from the app's origin as `text/html`, where it runs in a teacher's session.
4. **The whole server process crashes** if the database is unavailable while a recording uploads.
5. **Recordings are silently lost.** `saveAttempt` returns `success: true` even when nothing was saved, and the client then discards the recording.
6. **The transcription sidecar cannot start.** It raises `NameError` on line 41.
7. **`npm start` does not run the current build.** It points to `.output/`, which the current config no longer produces.
8. **The PWA does not work.** The service worker never registers in Chrome, and there is no install UI.
9. **The local `SESSION_SECRET` is guessable.** It closely resembles a default value visible in the source code, and the production check does not catch this. If production uses the same value, anyone who can read the repository can forge a session for any account, including an administrator.

Quality gates were also failing: 3 TypeScript errors, 157 ESLint errors, `vitest` exiting 1 despite 25 passing tests, and 26 `npm audit` findings (7 high).

**Positive results.** These were checked and found to be sound:

- No secrets in the client bundle
- No database credentials or API keys anywhere in git history
- CSRF protection is correct and fails closed
- `httpOnly` / `SameSite=Lax` session cookies
- Logout clears cookies correctly
- Server-function errors do not expose stack traces
- No NoSQL injection, because inputs are coerced to strings by Zod
- No unsafe HTML rendering of user content (React escaping; the only `dangerouslySetInnerHTML` is a static theme script)

### Finding counts

| Severity | Count | RUN | CODE | RISK |
|---|---:|---:|---:|---:|
| Critical | 8 | 8 | 0 | 0 |
| High | 21 | 13 | 8 | 0 |
| Medium | 28 | 5 | 21 | 2 |
| Low | 16 | 2 | 14 | 0 |
| **Total** | **73** | **28** | **43** | **2** |

These counts cover the severity-ranked findings in sections 3 to 5. Sections 7 to 12 list further items (`PERF`, `RACE`, `DEAD`, `DUP`, `ARCH`, `DB`).

---

## 2. Overall Production Readiness Assessment

**Verdict at audit time: NOT READY. Do not deploy with real student data.**

| Area | Rating | Reason |
|---|---|---|
| Security | Failing | Public recordings, IDOR, stored XSS, no session revocation |
| Reliability | Failing | Process crash on DB outage, silent data loss |
| Deployability | Failing | `npm start` broken, Docker runs a dev-tooling server, sidecar crashes |
| Data integrity | Poor | Fabricated recordings when the mic is denied, fabricated scores and waveforms shown as real |
| Performance | Fair | Works at small scale; roster and audio paths load far more into memory than needed |
| PWA | Failing | Manifest is valid, but the service worker never registers and there is no install UI |
| Testing | Poor | 25 unit tests, no integration or API tests, and the test run itself fails |
| Maintainability | Fair | Good module layout; heavy duplication and a large unused UI kit |

---

## 3. Critical Bugs

### CRIT-01: Audio endpoint is public and unauthenticated (RUN)
- **File / function:** `src/server.ts`, `fetch()` branch for `/api/audio/:audioId` (lines 48-79)
- **Problem:** No session check and no ownership check. The response is sent with `Cache-Control: public, max-age=31536000, immutable`.
- **Evidence:** A request with no cookie returned `HTTP 200`. Student A could also download Student B's recording.
- **Impact:** Voice recordings of students are exposed. Shared caches and CDNs may store them for a year. This is a likely legal and safeguarding issue.
- **Fix:** Require a valid session. Allow faculty or the owning student only. Send `Cache-Control: private`.

### CRIT-02: Stored XSS through uploaded audio MIME type (RUN)
- **File / function:** `src/server/services/storage.service.ts`, `saveAudio()` (line 51), `getAudioStream()` (line 139)
- **Problem:** The MIME type comes from the client's data URI with no allow-list, then is served back as `Content-Type`.
- **Evidence:** Uploading `data:text/html;base64,...` and fetching with a cold disk cache returned `content-type: text/html` with the `<script>` intact and no `nosniff` header.
- **Impact:** A student can run script in a teacher's or admin's session and act as them (create accounts, read all data).
- **Fix:** Allow-list `audio/*` types and reject everything else. Serve with `nosniff`, `Content-Disposition: inline` and a `sandbox` CSP.

### CRIT-03: A failed GridFS upload crashes the server process (RUN)
- **File / function:** `src/server/services/storage.service.ts`, `saveAudio()` (lines 80-99)
- **Problem:** The upload is fire-and-forget. `uploadStream` has no `error` listener, so an upload failure becomes an uncaught exception. `try/catch` cannot catch it.
- **Evidence:** With mongod stopped, one audio submission caused `exit code 1`. The same error is why `vitest` exits 1.
- **Impact:** A brief database blip during any upload takes the site down for everyone.
- **Fix:** Await the upload with error listeners attached. Never leave a stream without an `error` handler.

### CRIT-04: `saveAttempt` reports success when nothing was saved (RUN)
- **File / function:** `src/server/services/attempt.service.ts`, `saveAttempt()` (lines 353-356); `src/routes/practice.$moduleId.tsx` and `practice.assignment.$assignmentId.tsx`, `handleStop()`
- **Problem:** The `catch` block logs the error and falls through to `return { success: true, ... }`. The same happens when `getDb()` returns null. The client also races the save against a 5-second timer and navigates away regardless.
- **Evidence:** During a DB outage the response was `{"success":true,"id":"att-during-outage"}`. A duplicate-ID insert that failed also returned success.
- **Impact:** A student's recording is permanently lost while the app says it was saved, followed by an error page. On slow connections, where uploads take over 5 seconds, students also hit the error page while the upload is still running.
- **Fix:** Return an error when the save fails. Make saves idempotent. Keep the recording in memory on the client and offer a retry.

### CRIT-05: The transcription sidecar crashes on startup (RUN)
- **File / function:** `whisper_sidecar.py`, module level, line 41
- **Problem:** `MODEL_SIZE` reads `DEVICE`, which is defined on line 42.
- **Evidence:** `python whisper_sidecar.py` fails with `NameError: name 'DEVICE' is not defined`.
- **Impact:** The self-hosted transcription path cannot run at all. `docker-compose` restarts the container in a loop.
- **Fix:** Define `DEVICE` first.

### CRIT-06: `npm start` does not run the current build (RUN)
- **File / function:** `package.json` (`start`), `vite.config.ts` (lines 66-72)
- **Problem:** `start` runs `.output/server/index.mjs`, but `nitro` was removed from the project. A clean `npm run build` produces only `dist/`. The `.output/` on disk dates from October 26. The `preset` option passed to `tanstackStart` does not exist, which is one of the three type errors.
- **Evidence:** A fresh build left `.output/` untouched. `nitro` is not installed.
- **Impact:** `npm start` fails on a clean checkout, or silently serves an old build on a machine that still has `.output/`.
- **Fix:** Add a real production entry point for the `dist/` build. See the architecture decision in section 10.

### CRIT-07: The service worker never registers (RUN)
- **File / function:** `src/routes/__root.tsx`, `RootComponent` effect (lines 175-199)
- **Problem:** Registration waits for `window`'s `load` event inside a React effect. By the time hydration runs, `load` has usually fired, so the listener never runs.
- **Evidence:** In real Chrome, `getRegistration()` returned `null` and `controller` was `false`. Going offline showed the browser's `ERR_INTERNET_DISCONNECTED` page.
- **Impact:** No offline fallback and no update handling. The PWA described in the design brief does not function.
- **Fix:** Register immediately if the document has already loaded.

### CRIT-08: The session signing secret can be guessed (RUN)
- **File / function:** `.env` (local, not committed), `src/config/env.ts` production guard
- **Problem:** The `SESSION_SECRET` in the local `.env` is not random. It closely resembles a default value in the source. The production guard only rejects an exact match and values under 32 characters, so this value passes.
- **Evidence:** Compared programmatically, without printing either value. Found during the final secret scan, not the initial audit: the first git scan only looked for connection strings and API keys.
- **Risk note:** Which value production uses cannot be determined from this repository. The finding is confirmed for the local file; the production impact depends on that answer.
- **Impact:** Anyone who can read the source could forge a valid session for any account, including an administrator, and then read all student data and recordings.
- **Fix:** Refuse to start in production with a secret that resembles the default. **Generate and set a new random secret wherever this value has been used.** This signs everyone out once.

---

## 4. High-Priority Issues

| ID | Verified | File / function | Problem | Impact | Fix |
|---|---|---|---|---|---|
| HIGH-01 | RUN | `src/server/data.ts` `fetchAttemptByIdFn` (l.343) | No ownership check | Any student can read any transcript and teacher note | Faculty-or-owner check |
| HIGH-02 | RUN | `src/server/data.ts` `sendDirectMessageFn` (l.399) | Student can set any `studentId` and `teacherName` | Message injection into another student's inbox | Force own `studentId`, use server-side names |
| HIGH-03 | RUN | `src/server/services/flag.service.ts` `createFlag` | Accepts another student's `attemptId` | Tampers with others' attempts and copies their audio URL | Verify attempt ownership |
| HIGH-04 | RUN | `src/server/services/attempt.service.ts` `saveAttempt` | Client-supplied `audioUrl` and `audioId` stored as-is | Teachers' browsers load attacker URLs. It would also defeat any ownership check, since a student could claim another's `audioId` | Accept data URIs only; derive IDs on the server |
| HIGH-05 | RUN | `src/server/middleware/auth.middleware.ts`, `auth.service.ts` | JWT is never checked against the DB | Deleted users keep access for up to 7 days | Check the user still exists (short cache) |
| HIGH-06 | RUN | `src/server/data.ts` `loginFn` (l.68) | Limiter keyed on email only | Anyone can lock out any user with 5 bad logins | Key on email + IP; add separate failure limits |
| HIGH-07 | RUN | `src/server/data.ts` `loginFn` | No per-source limit | 25 of 25 spray attempts unthrottled | Per-IP failure limit |
| HIGH-08 | RUN | `src/server/data.ts` `streamTranscribeChunkFn`, `attempt.validator.ts` | No size limits; no rate limit on paid AI calls | 40 MB accepted. Memory exhaustion and unbounded AI cost | Size caps at HTTP and Zod layers; rate limit |
| HIGH-09 | RUN | `src/server/data.ts` `updateAppSettingsFn` (l.558) and 4 client files | Master admin identified only by a hardcoded email, with no role check | A teacher can create a teacher account with that email if it does not already exist, and gain settings control | Require `role === "admin"` and read the email from config |
| HIGH-10 | RUN | `src/features/users/lib/whatsapp-credentials.ts`, `assignments/lib/whatsapp-reminders.ts` | Messages link to `https://trounce.app/...` | That URL returned **404**. Every onboarding message points to a dead link on a domain this repo does not show ownership of | Use the app's real origin |
| HIGH-11 | RUN | `src/server/services/storage.service.ts` `getAudioStream` (l.119) | MIME lost on disk-cache hit | iOS `audio/mp4` recordings are served as `audio/webm` on repeat requests and fail to play | Persist MIME next to the cached file |
| HIGH-12 | RUN | `storage.service.ts` `getAudioStream` (l.171-175) | Range parsing is wrong: `bytes=-5` returned the first 6 bytes, an over-long end returned 416, inverted ranges returned 206 | Seeking fails on some browsers | Implement RFC 9110 parsing |
| HIGH-13 | RUN | `src/routes/__root.tsx`, `public/sw.js` | No install UI anywhere | Users cannot install the app | Build the install flow (Phase 4) |
| HIGH-14 | CODE | `src/features/practice/hooks/useAudioRecorder.ts` `startRecording` (l.848-855) | When the mic is denied, generates samples with `Math.random()` and enters "recording" | **Fabricated scores are saved** for a recording that never happened | Stay idle and show the permission error |
| HIGH-15 | CODE | `useAudioRecorder.ts` `stopRecording` (l.940) | Stops tracks on the processed stream, never the raw `getUserMedia` stream | Mic stays active after stopping (privacy indicator, battery) | Keep a ref to the raw stream; stop it on stop and unmount |
| HIGH-16 | CODE | `useAudioRecorder.ts` `stopRecording` (l.995) | `decodeAudioData` has no timeout, though the same file documents that it can hang | Student stuck on "uploading" forever (a deadlock) | Add a timeout |
| HIGH-17 | CODE | `public/sw.js` `PRECACHE_ASSETS` (l.6) | Precaches `/`, which is authenticated SSR HTML | Private data in Cache Storage after logout. Currently masked by CRIT-07 and would activate once registration is fixed | Never cache HTML except the offline page |
| HIGH-18 | CODE | `src/server/db/client.ts` `getDb` (l.80-118) | Concurrent first calls race. After one failure, indexes and seeding are marked done even though they failed | Missing indexes, duplicate seeds, no retry | Single-flight init; retry on failure |
| HIGH-19 | CODE | `docker-compose.yml` (l.39-40, 54-55) | MongoDB (no auth) and sidecar published on host ports | Anyone reaching the host can read or wipe all data | Internal network only |
| HIGH-20 | CODE | `scripts/seed-mongo.ts` | `deleteMany({})` on all core collections with no guard. Logs the full URI including credentials. Defaults to DB `tarang` while the app uses `trounce` | One mistaken command wipes production. Credentials end up in logs | Refuse without an explicit flag; refuse in production; mask the URI |
| HIGH-21 | CODE | No `.dockerignore`; `Dockerfile` `COPY . .` (l.20) | `.env`, `.git`, `.storage` (student audio) copied into builder layers | Secrets and recordings in image layers and caches | Add `.dockerignore` |

---

## 5. Medium- and Low-Priority Issues

### Medium

| ID | Verified | File / function | Problem | Impact | Fix |
|---|---|---|---|---|---|
| MED-01 | RUN | `src/server.ts`, `start.ts` | No CSP, frame, nosniff, referrer or permissions headers | Weaker XSS and clickjacking defence | Add headers |
| MED-02 | RUN | `src/server/services/user.service.ts` `createUser` | Race surfaces a raw `E11000` error with DB and collection names | Internal details shown to users | Handle duplicates; sanitize unknown errors |
| MED-03 | RUN | `src/server/data.ts` `markMessageReadFn` | No ownership check | Student can mark others' messages read | Scope the update |
| MED-04 | RUN | `src/server/data.ts` `warmupWhisperFn` | Unauthenticated; holds a request for up to 55 s | Cheap denial of service | Require auth; shorten the wait |
| MED-05 | RUN | `src/server/data.ts` `getAppSettingsFn` | Unauthenticated; returns `updatedBy` | Minor information leak | Require auth; strip `updatedBy` |
| MED-06 | CODE | `whisper_sidecar.py` `transcribe_audio_bytes` | `_model_lock` covers only the lazy generator's creation; the real work runs outside the lock | Lock is ineffective; concurrent CPU thrash | Consume segments inside the lock |
| MED-07 | CODE | `whisper_sidecar.py` `do_POST` | No auth, `CORS: *`, unlimited body size, runs as root in Docker | Anyone can use it for free compute or crash it | Size limit, optional token, non-root user |
| MED-08 | CODE | `src/server/services/attempt.service.ts` `saveAttempt` | Background job starts before the attempt is inserted | Attempt can stay stuck in `processing` | Insert first |
| MED-09 | CODE | `attempt.service.ts` (`finally`, l.169) | Failed transcription is marked `completed`; `failed` is never set | UI says "no audio detected" when transcription actually failed | Record `failed` |
| MED-10 | CODE | `src/routes/practice.*`, `progress.tsx` | Client cache not invalidated after saving | Homework shows "not done" for 60 s, inviting duplicate recordings | Invalidate on save |
| MED-11 | CODE | `src/routes/practice.index.tsx` | Same stale cache: mark-read and replies revert after navigating back | Read messages reappear as unread | Invalidate on mutate |
| MED-12 | CODE | `useAudioRecorder.ts` | No maximum duration; `maxDurationSec` is defined but never used | An abandoned recording grows without limit | Auto-stop |
| MED-13 | CODE | `src/server/services/student.service.ts` `getStudentById` (l.484-490) | Status overwritten from `updatedAt`, so a flagged student shows "on-track" and a never-active student shows "Today" | Roster and detail page disagree | Keep explicit flags; use attempts for activity |
| MED-14 | CODE | `user.service.ts` `createUser` (l.97) | New students get `scorePct: 85` | Teachers see a score for students who never recorded | Start at 0 |
| MED-15 | CODE | `student.service.ts` `isGlitchyWaveform` | Replaces real data with a synthesized "speech" waveform, including for silent recordings | Teachers and parents see fabricated evidence | Show real data only |
| MED-16 | CODE | `assignment.service.ts` `getAssignmentSubmissions` (l.178) | Empty batch falls back to the full roster "so demo data is available" | Unrelated students listed as pending | Remove the fallback |
| MED-17 | CODE | `assignment.service.ts` (l.239) | Reads `att.studentName`, which does not exist | Submissions from other batches always show "Student". One of the 3 type errors | Look up the real name |
| MED-18 | CODE | `assignment.service.ts` `sendReminder` | Writes `status: "delivered"` to a collection nothing reads; UI says "sent" | Teachers believe students were reminded when they were not | Deliver through the real inbox |
| MED-19 | CODE | `AssignmentSubmissionsModal.tsx` (l.92-95) | On failure, shows "Reminder logged" and marks the student nudged | False confirmation | Report the failure |
| MED-20 | CODE | `assignment.service.ts` `deleteAssignment` | Deletes attempts but leaves their audio | Orphaned recordings stored forever | Delete audio too |
| MED-21 | CODE | `settings.service.ts` | Concurrent first reads insert duplicates. `updateSettings` swallows DB failures and reports success | Settings silently not saved | Upsert; surface failures |
| MED-22 | CODE | `student.service.ts` `getRoster`, `updateStatus`; `attempt.service.ts` `getStudentAttempts` | DB errors return `[]` or `true` | An outage looks like an empty class or a successful action | Surface errors |
| MED-23 | CODE | `transcription.service.ts` | Gemini key sent in URL query string. OpenAI call has no timeout. Abort timer not cleared on failure | Key can leak into logs. Request can hang forever | Use a header; add timeouts |
| MED-24 | CODE | `src/server/db/client.ts` `autoSeedDatabase` | Runs on every cold start: deletes "orphan" students (with a race against concurrent user creation) and re-seeds demo homework whenever the collection is empty | Deleted homework comes back; concurrent new students can lose their roster record | Run once with an atomic marker; remove the delete |
| MED-25 | CODE | `client.ts` `autoSeedDatabase` (l.146-148) | With env unset, creates an admin with an empty email and password | No working admin, and no way to create one because `userCount` is no longer 0 | Refuse to seed without credentials |
| MED-26 | CODE | Multiple routes | Failures only reach `console.error`: reply, flag, feedback, transcript save, resolve, nudge. `resolveStudentStatus` has no `catch` | Users see nothing happen; unhandled rejection | Show errors |
| MED-27 | RISK | `transcription.service.ts` (l.11-22) | In production, a missing or localhost sidecar URL silently redirects student audio to a hardcoded `onrender.com` host | Audio may go to a host the deployer did not choose. The host did not respond within 15 s when checked, consistent with CRIT-05 | Log clearly; document; add optional auth token |
| MED-28 | RISK | `src/server/middleware/rate-limiter.ts` | Limits are per process | Ineffective across multiple instances | Document; move to shared store if scaling out |

### Low

| ID | Verified | File / function | Problem | Fix |
|---|---|---|---|---|
| LOW-01 | RUN | `src/server/services/storage.service.test.ts` | Writes real files to `.storage/audio`: 58 of 103 files there are test leftovers | Use a temp dir and clean up |
| LOW-02 | RUN | `public/manifest.json` | Exact duplicate of `manifest.webmanifest`; never referenced | Delete |
| LOW-03 | CODE | `src/config/env.ts` | `RATE_LIMIT_ENABLED` is defined but never read | Honour it |
| LOW-04 | CODE | `auth.service.ts` `verifySessionToken` | JWT algorithm not pinned | Pin HS256 |
| LOW-05 | CODE | `auth.service.ts` `authenticateUserWithRole` | Returns early for unknown emails (timing leak). `$or` includes `name`, which `.email()` validation makes unreachable | Dummy bcrypt compare; simplify query |
| LOW-06 | CODE | `data.ts` `getSessionFn` vs `auth.middleware.ts` | Legacy cookie accepted by one and ignored by the other | Align |
| LOW-07 | CODE | `users.tsx` `generateRandomPassword` | Uses `Math.random` | Use `crypto.getRandomValues` |
| LOW-08 | CODE | `storage.service.ts` | `audioId` uses `Math.random` | Use `crypto.randomUUID` |
| LOW-09 | CODE | `TeacherShell.tsx` (l.117, 157) | Hardcoded "Batch · X-A · 2025" in production UI | Remove |
| LOW-10 | CODE | `practice.index.tsx`, `students.$id.tsx`, `users.tsx`, `practice.*` | Emoji in UI, against the AGENTS.md design rules | Replace |
| LOW-11 | CODE | `lib/error-page.ts`, `public/offline.html` | Colours outside the design tokens, including pure white | Use tokens |
| LOW-12 | CODE | `attempt.service.ts` (l.160) | Logs the first 80 characters of student transcripts | Remove PII from logs |
| LOW-13 | CODE | `__root.tsx` | `black-translucent` status bar with no safe-area padding | Header sits under the iOS status bar. Use `black` |
| LOW-14 | CODE | `users.tsx` | Delete button shown to teachers, though the server allows admin only | Hide for non-admins |
| LOW-15 | CODE | `vite.config.ts` | `allowedHosts: true` in dev and preview; dev audio plugin allows `..` in `audioId` and bypasses auth | Remove plugin; use default hosts |
| LOW-16 | CODE | `README.md`, `docs/API.md`, `AI_RULES.md` | README is a design prompt with no env or deploy docs. API.md describes functions that do not exist. No `.env.example` | Update docs |

---

## 6. Security Vulnerabilities

| Category | Result | Findings |
|---|---|---|
| Authentication bypass | **Found** | CRIT-01 (no auth on audio), HIGH-05 (no revocation), MED-04, MED-05 |
| Authorization weaknesses | **Found** | HIGH-01, 02, 03, 04, 09, MED-03 |
| XSS | **Found** | CRIT-02. No other vector found: all user content goes through React escaping |
| Insecure file uploads | **Found** | CRIT-02, HIGH-04, HIGH-08 |
| Rate limiting | **Found** | HIGH-06, HIGH-07, HIGH-08, MED-28, LOW-03 |
| Exposed secrets | **One weak secret** | CRIT-08. Otherwise clean: client bundle scanned for every `.env` value and server-only literals, 0 hits. Git history scanned for Mongo credentials and API keys, 0 hits. `prod` is tracked but contains an AI session transcript, not credentials |
| Environment handling | **Partial** | Production guard on `SESSION_SECRET` is good. See MED-25, HIGH-20, MED-27 |
| SQL / NoSQL injection | **Not found** | All query inputs pass through Zod string validation |
| CSRF | **Not found** | `createCsrfMiddleware` uses `Sec-Fetch-Site`, Origin and Referer, and fails closed |
| CORS | **Sidecar only** | App sends no CORS headers. Sidecar uses `*` (MED-07) |
| Sensitive data leakage | **Found** | CRIT-01, HIGH-01, MED-02, LOW-12, HIGH-20 (URI in logs) |
| Insecure DB access | **Found** | HIGH-19 |
| Credential handling | **Risk** | Plaintext passwords are sent through WhatsApp links by design and there is no way to change a password (see section 10) |

---

## 7. Performance Bottlenecks

| ID | Verified | File / function | Problem | Impact | Fix |
|---|---|---|---|---|---|
| PERF-01 | CODE | `student.service.ts` `getRoster` (l.92-96) | Loads **every attempt** of every student, with transcripts and waveforms, to keep the latest 2 per student | Memory and time grow with all-time attempts | Aggregate `$topN` with projection |
| PERF-02 | CODE | `storage.service.ts` `getAudioStream` (l.125) | Reads the whole file into memory for every request, including each small range request | Memory spike on every seek | Stream the requested range |
| PERF-03 | RUN | Production server | No compression; assets have no long-lived cache headers (`no-cache` on all assets in preview) | 821 KB of client assets re-validated on every visit, a real cost on Indian mobile data | gzip/brotli; immutable hashed assets |
| PERF-04 | CODE | `users`, `getRoster`, `getStudentById` | No projection; password hashes loaded into memory unnecessarily | Waste, and wider exposure | Add projections |
| PERF-05 | CODE | `attempt.service.ts` `getStudentAttempts`, `student.service.ts` `getStudentProfile`, `flag.service.ts`, `message.service.ts` | Unbounded queries | Grow with history | Add sensible limits |
| PERF-06 | CODE | `app-settings.ts` | Each hook fetches settings on mount, so 2 identical requests per practice page | Unnecessary requests | Share one request |
| PERF-07 | CODE | `useAudioRecorder.ts`, `transcription.service.ts` | Client AI pass often times out at 3.5 s, then the server transcribes again | Double AI spend | Skip oversized uploads; note remaining cost |
| PERF-08 | CODE | `useAudioRecorder.ts` volume meter | Whole page re-renders 20 times per second while recording | Battery and jank on low-end phones | Deferred. See final report |
| PERF-09 | CODE | `@tanstack/react-query` | Provider mounted, but `useQuery` and `useMutation` appear nowhere | Unused code in the root bundle | Remove |
| PERF-10 | CODE | GridFS `metadata.audioId`, `attempts.audioId` | No index on these lookups | Collection scan on audio access | Add indexes |

**Memory and resource leaks:** HIGH-15 (mic track left running), PERF-02. Timers, polling and event listeners in other components were checked and clean up correctly.

---

## 8. Deadlocks and Race Conditions

| ID | Verified | Location | Scenario | Severity |
|---|---|---|---|---|
| RACE-01 | CODE | `useAudioRecorder.ts` l.995 | Hung `decodeAudioData` leaves the UI in "uploading" forever (HIGH-16) | High |
| RACE-02 | CODE | `db/client.ts` `getDb` | Concurrent init runs index creation and seeding in parallel; failed init is latched as done (HIGH-18) | High |
| RACE-03 | CODE | `attempt.service.ts` | Background transcription finishes before the insert, leaving the status stuck (MED-08) | Medium |
| RACE-04 | RUN | `user.service.ts` `createUser` | Check-then-insert; loser gets a raw `E11000` (MED-02) | Medium |
| RACE-05 | CODE | `settings.service.ts` | Concurrent first read inserts duplicate settings documents (MED-21) | Medium |
| RACE-06 | CODE | `db/client.ts` `autoSeedDatabase` | Orphan cleanup can delete a student document created between its two reads (MED-24) | Medium |
| RACE-07 | CODE | `practice.*` `handleStop` | Navigation races the save; result page errors because the attempt is not stored yet (CRIT-04) | Critical |
| RACE-08 | CODE | `lib/auth.ts` `clearUser` | Cache cleared and `navigate("/login")` runs before `logoutFn` completes, so `/login` can see the old session and bounce back. No `catch` if logout fails | Low |
| RACE-09 | CODE | `user.service.ts`, `assignment.service.ts` | `Date.now()`-based IDs collide when two requests land in the same millisecond | Low |
| RACE-10 | CODE | `flag.service.ts`, `attempt.service.ts` | Multi-collection writes without transactions can partly apply | Low. See section 11 |

**Not found:** WebSocket synchronization issues (the app has no WebSockets), database transaction deadlocks (no transactions are used), and infinite loops. Speech-recognition restart logic guards its loop correctly.

---

## 9. Redundant and Dead Code

| ID | Verified | Location | Detail | Action |
|---|---|---|---|---|
| DEAD-01 | RUN | `src/components/ui/*` (46 files) | Zero imports from application code | Remove |
| DEAD-02 | RUN | `src/hooks/use-mobile.tsx` | Used only by the unused `sidebar.tsx` | Remove |
| DEAD-03 | RUN | 40 npm packages | Used only by DEAD-01 or by nothing (section 12) | Remove |
| DEAD-04 | RUN | `src/lib/db.ts`, `src/lib/audio-analyzer.ts` | Re-export files with no importers | Remove |
| DEAD-05 | RUN | `src/lib/tarang-data.ts` | `studentRoster`, `sampleResult` and duplicate types are unused; only `modules` is needed. It also pulls a React component into server code | Trim |
| DEAD-06 | RUN | `src/config/constants.ts` | `APP_CONFIG`, `THEME_COLORS` unused | Remove |
| DEAD-07 | RUN | `ModuleService.markCompleted` | No callers. It would also mark a module complete for all students | Remove |
| DEAD-08 | CODE | `useAudioRecorder.ts` | `hasGoogleSttNetworkError` constant, `sttNetworkErrorCountRef`, a broken comment block | Remove |
| DEAD-09 | CODE | `useAuth.ts` | `logout` and role helpers unused (only `login`, `isLoading`, `error` are used) | Trim |
| DEAD-10 | RUN | `prod` (tracked in git, also in `.gitignore`) | 21 KB AI session transcript | Remove from repo |
| DEAD-11 | CODE | `src/server.ts` static branch | Serves PWA files with sync reads; handled by the static server instead | Remove |
| DUP-01 | CODE | Score formula | The same "completion %" calculation is copied 14 times across 7 files, with inconsistent defaults (70 vs 75) | Single helper |
| DUP-02 | CODE | `transcription.service.ts` | Gemini and OpenAI calls written twice | Shared helpers |
| DUP-03 | CODE | `attempt.service.ts` | Attempt-to-API mapping written twice | Shared mapper |
| DUP-04 | CODE | Filler word lists | 3 copies. `AudioTranscriptEvaluator` uses a **different** list, so highlighted fillers do not match counted fillers | Single list |
| DUP-05 | CODE | `cleanIndianPhoneNumber` | 2 copies with different behaviour | Single helper |
| DUP-06 | CODE | `practice.$moduleId.tsx`, `practice.assignment.$assignmentId.tsx` | About 90% identical (37 KB each) | Extract save logic now; full merge deferred because of regression risk without UI tests |
| DUP-07 | CODE | `app-settings.ts` | Two near-identical hooks | Shared implementation |

---

## 10. Architecture Problems

| ID | Verified | Issue | Recommendation |
|---|---|---|---|
| ARCH-01 | RUN | No production server. Docker runs `vite preview` (a local preview tool) and ships dev dependencies | Small dedicated Node entry point |
| ARCH-02 | CODE | Error handling is inconsistent: expected and unexpected errors are both plain `Error`, or swallowed | `AppError` for user-facing errors, generic message for the rest |
| ARCH-03 | CODE | `getDb()` returning `null` forces every caller to invent a fallback, many of them misleading | `requireDb()` that fails clearly |
| ARCH-04 | CODE | Server code imports from a React component (`makeSampleWaveform`) | Remove the dependency |
| ARCH-05 | CODE | Scores are computed in the browser and trusted by the server | **Risk to raise with the product owner, see below** |
| ARCH-06 | CODE | Pronunciation, vocabulary and grammar scores come from audio **loudness and pause patterns**, not language analysis (`audio-analyzer.ts`), but are labelled as such in parent reports | **Risk to raise with the product owner, see below** |
| ARCH-07 | CODE | Audio is uploaded as base64 inside JSON, adding 33% and requiring full buffering | Dedicated upload endpoint (deferred) |
| ARCH-08 | CODE | Plaintext "permanent passwords" sent through WhatsApp, with no change or reset flow | Product decision; see final report |
| ARCH-09 | CODE | No health endpoint, structured logs or error monitoring | Add a health endpoint; choose a monitoring tool |
| ARCH-10 | CODE | In-memory rate limiting, roster cache and session cache assume a single instance | Fine at this scale; document it |
| ARCH-11 | CODE | Local `.storage` disk is used as a cache and is lost on most PaaS restarts | Acceptable since GridFS is authoritative once uploads are awaited |

### Architecture decisions and trade-offs

**A. Production server: small `srvx`-based Node entry instead of restoring Nitro**

| Option | Pros | Cons |
|---|---|---|
| **`srvx` entry (chosen)** | Already installed through TanStack Start. About 100 lines we control. Works on Render, Koyeb, Fly, Docker, VPS. Full control of compression, caching and headers | No Vercel/serverless output |
| Restore Nitro | Serverless presets | Was deliberately removed; the version used was a beta; adds a large build layer and most of the audit findings |
| Keep `vite preview` | No work | Not intended for production; needs dev dependencies; no caching control |

If Vercel is needed later, Nitro can be added back without affecting application code. Note that serverless platforms would also break background transcription.

**B. Session revocation: check the user on each request with a 30-second cache**

Pure JWTs cannot be revoked. A session store would be a larger change. Checking the user document with a short in-memory cache adds at most one small query per user every 30 seconds, and takes effect immediately on the instance that handled the delete. If the database is briefly unreachable, the signed token is still honoured so a blip does not log everyone out. Access is denied only when the database positively reports that the user is gone.

**C. Login rate limiting: per email+IP, plus failure-only limits**

Coaching institutes commonly share one IP, so a plain per-IP limit could block a whole class logging in together. Only **failed** logins count toward the IP limit, and a deliberately high email-wide limit slows distributed guessing without letting an attacker cheaply lock someone out.

---

## 11. Database Issues

| ID | Verified | Location | Problem | Fix |
|---|---|---|---|---|
| DB-01 | CODE | `db/client.ts` `ensureDatabaseIndexes` | One try/catch around all indexes: the first failure silently skips the rest | Create each independently |
| DB-02 | CODE | `db/client.ts` | No unique index on `modules.id` or `settings.id` | Add |
| DB-03 | CODE | `db/client.ts` | No index on GridFS `metadata.audioId`, `attempts.audioId`, `attempts.assignmentId` | Add |
| DB-04 | CODE | `client.ts`, `flag.service.ts` | `flagReason: undefined` with `$set` stores `null` | Use `$unset` |
| DB-05 | CODE | `user.service.ts` `createUser` | User and student documents are written non-atomically; a failure in between leaves a user with no roster record | Compensate on failure. Transactions are unavailable on the standalone `mongo:6.0` in `docker-compose` |
| DB-06 | CODE | `user.service.ts` `deleteUser` | Leaves attempts, audio, messages and flags behind | **Needs a decision**: permanent erasure cannot be undone, so it was not changed automatically |
| DB-07 | CODE | `schemas.ts` `ModuleDoc.completed` | Per-student state stored globally; seed data marks two modules complete for everyone | Harmless (UI uses attempts); remove from API over time |
| DB-08 | CODE | `seed-mongo.ts` vs `env.ts` | Different default DB names (`tarang` vs `trounce`) | Align |

---

## 12. Dependency and Package Issues

`npm audit` at baseline: **26 vulnerabilities (3 low, 16 moderate, 7 high, 0 critical)**.

| Package | Severity | Path | Notes | Action |
|---|---|---|---|---|
| `h3` v1, `nitropack`, `@vercel/nft`, `archiver`, `glob`, others | High / moderate | through `vinxi` | **`vinxi` is not imported anywhere.** It accounts for most findings | Remove `vinxi` |
| `zod` 3.25.76 | High | direct | Memory exhaustion on oversized collections (GHSA-mrhx-c7xc-m3w5), fixed in 4.6.6 | Upgrade to 4.x and test |
| `vite` 8.2.2 | High | direct | Several dev-server advisories | Update |
| `follow-redirects`, `node-forge`, `source-map-js`, `brace-expansion` | High | transitive | Fix available | `npm audit fix` |
| `typescript-eslint`, `vitest`, `@vitest/mocker` | Moderate | dev | Dev only | Update |

**Unused packages to remove (each verified with a repository-wide import search):** `vinxi`, `@hookform/resolvers`, all 26 `@radix-ui/*`, `class-variance-authority`, `cmdk`, `date-fns`, `embla-carousel-react`, `input-otp`, `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `recharts`, `sonner`, `vaul`, `@tanstack/react-query`.

**Misplaced:** build-only tools (`tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `vite-tsconfig-paths`, `@tanstack/router-plugin`) are in `dependencies`, which inflates the production image.

**Runtime versions:** Docker and CI use Node 20, which reached end of life in April 2026. Move to Node 22 LTS. `faster-whisper>=1.0.0` is unpinned, so sidecar builds are not reproducible.

---

## 13. Recommended Fixes

Priority order for implementation:

1. **Stop the data exposure:** CRIT-01, CRIT-02, CRIT-08, HIGH-01 to HIGH-04, HIGH-09, MED-03
2. **Stop the crashes and data loss:** CRIT-03, CRIT-04, HIGH-14 to HIGH-16, RACE-*
3. **Make it deployable:** CRIT-05, CRIT-06, HIGH-19 to HIGH-21, ARCH-01, Node 22
4. **Harden:** HIGH-05 to HIGH-08, MED-01, ARCH-02, ARCH-03
5. **Pass the quality gates:** TypeScript, ESLint, tests, `npm audit`
6. **Remove dead code and dependencies:** section 9, section 12
7. **Improve performance:** section 7
8. **Build the PWA:** CRIT-07, HIGH-13, HIGH-17, then the install experience
9. **Add test coverage:** integration, API, authentication, PWA

**Not to be changed without a decision from the product owner:**

- ARCH-05 and ARCH-06: what the scores actually measure
- ARCH-08: how passwords are issued and changed
- DB-06: whether deleting a user erases their recordings

---

## 14. Files Requiring Modification

**Server:** `src/server.ts`, `src/start.ts`, `src/config/env.ts`, `src/config/constants.ts`, `src/server/data.ts`, `src/server/db/client.ts`, `src/server/db/schemas.ts`, `src/server/middleware/auth.middleware.ts`, `src/server/middleware/rate-limiter.ts`, all files in `src/server/services/`, all files in `src/server/validators/`

**Client:** `src/routes/__root.tsx`, `login.tsx`, `dashboard.tsx`, `practice.index.tsx`, `practice.$moduleId.tsx`, `practice.assignment.$assignmentId.tsx`, `profile.tsx`, `progress.tsx`, `result.$attemptId.tsx`, `settings.tsx`, `users.tsx`, `students.$id.tsx`, `flags.tsx`, `src/router.tsx`, `src/lib/auth.ts`, `src/lib/app-settings.ts`, `src/lib/i18n.ts`, `src/lib/tarang-data.ts`, `src/lib/error-page.ts`, `src/components/tarang/StudentShell.tsx`, `TeacherShell.tsx`, `src/features/practice/hooks/useAudioRecorder.ts`, `src/features/auth/hooks/useAuth.ts`, `src/features/assignments/*`, `src/features/users/lib/whatsapp-credentials.ts`, `src/features/students/components/AudioTranscriptEvaluator.tsx`

**Infrastructure:** `package.json`, `package-lock.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`, `Dockerfile`, `Dockerfile.sidecar`, `docker-compose.yml`, `.github/workflows/ci.yml`, `.gitignore`, `whisper_sidecar.py`, `requirements.txt`, `scripts/seed-mongo.ts`, `scripts/generate-pwa-icons.mjs`, `README.md`

**PWA:** `public/sw.js`, `public/manifest.webmanifest`, `public/offline.html`, `public/icons/*`

**New:** `.dockerignore`, `.env.example`, `scripts/serve.mjs`, `src/features/pwa/*`, `src/lib/*` helpers, integration and end-to-end tests

**To delete:** `src/components/ui/*`, `src/hooks/use-mobile.tsx`, `src/lib/db.ts`, `src/lib/audio-analyzer.ts`, `public/manifest.json`, `prod`

---

## 15. Production Deployment Checklist

**Before first deployment**
- [ ] Set `SESSION_SECRET` (at least 32 random characters), `MONGODB_URI`, `MONGODB_DB_NAME`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`
- [ ] **Generate a new random `SESSION_SECRET` (see CRIT-08).** This signs out all users once
- [ ] Decide which transcription engines to enable and set their keys
- [ ] Confirm the deployment is served over HTTPS (required for microphone, service worker and install)
- [ ] Confirm MongoDB requires authentication and is not publicly reachable
- [ ] Confirm the master admin account has `role: "admin"`
- [ ] Confirm legal basis for storing minors' voice recordings, and set a retention policy

**Each release**
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm audit --omit=dev`, `npm run build` all pass
- [ ] Smoke test: log in, record, play back, review as a teacher
- [ ] Check `/api/health`

**After deployment**
- [ ] Back up MongoDB, including the `audio_recordings` GridFS bucket
- [ ] Set up uptime monitoring and error alerts
- [ ] Verify installation on one Android device and one iPhone
