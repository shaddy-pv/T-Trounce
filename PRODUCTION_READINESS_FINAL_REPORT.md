# Production Readiness Final Report: Trounce

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Starting point** | Commit `b4f0227` on `main` |
| **State of the work** | Uncommitted changes in the working tree, for review. Nothing was committed or pushed |
| **Full audit** | `PRODUCTION_READINESS_AUDIT.md` |

## Verdict

**Ready for a controlled pilot once the three required actions below are done. Not yet ready for a wide rollout.**

All 8 critical and all 21 high-priority findings are fixed, and every automated check passes. Three things are still unverified or undecided: installation on real phones, the Docker image build, and whether the speech scores should be shown to parents as they are today (section 10).

### Required before deploying

1. **Generate a new `SESSION_SECRET`** with `openssl rand -base64 48`, and set it on every environment. The value in the local `.env` closely resembles a default in the source code. If production uses the same value, anyone with access to the repository could forge an administrator session. **The app now refuses to start in production with a weak secret**, so this step is mandatory. It signs everyone out once.
2. **Check that your master admin account has `role: "admin"`** in the database. Settings access now needs both that role and the configured email.
3. **Update your host's commands:** build with `npm ci && npm run build`, start with `npm start`. See section 11.

---

## 1. Original Audit Findings

| Severity | Found | Reproduced by running | Confirmed in code | Potential risk |
|---|---:|---:|---:|---:|
| Critical | 8 | 8 | 0 | 0 |
| High | 21 | 13 | 8 | 0 |
| Medium | 28 | 5 | 21 | 2 |
| Low | 16 | 2 | 14 | 0 |
| **Total** | **73** | **28** | **43** | **2** |

The most serious problems at the start:

- Anyone could download student voice recordings without logging in
- Any student could read any other student's transcripts and teacher notes
- A student could upload HTML that later ran in a teacher's session (stored XSS)
- A database blip during an upload crashed the whole server
- Recordings were lost while the app reported they had been saved
- The transcription sidecar crashed on startup
- `npm start` did not run the current build
- The service worker never registered, and there was no install UI

**Quality gates at the start:** 3 TypeScript errors, 157 ESLint errors and 7 warnings, a test run that exited with an error despite 25 passing tests, and 26 `npm audit` findings (7 high).

---

## 2. Issues Successfully Fixed

| Category | Fixed | Partly fixed | Left as is |
|---|---:|---:|---:|
| Critical | 8 | | |
| High | 21 | | |
| Medium | 25 | 2 (MED-26, MED-27) | 1 (MED-28) |
| Low | 15 | 1 (LOW-16) | |

### Before and after, using the same attacks

These probes ran over real HTTP against the production build, with a real database. 24 defects reproduced on the original code. None reproduce now.

| Defect | Before | After |
|---|---|---|
| Anonymous download of a recording | HTTP 200, cached publicly for a year | 401 |
| Student A downloads Student B's recording | 200 | 404 |
| Student A reads Student B's transcript and teacher notes | Leaked | Refused |
| Stored XSS through "audio" upload | Served as `text/html` | Rejected on upload |
| Inject a message into another student's inbox | Stored, with a spoofed name | Goes to the sender's own thread, with the real name |
| Mark another student's message as read | Worked | No effect |
| Flag another student's attempt | Worked | Refused |
| Store an external URL or another student's audio ID | Stored | Ignored |
| Save reports success when nothing was saved | `success: true` | Reports the failure |
| Save during a database outage | `success: true`, recording lost | Reports the failure, recording kept for retry |
| Upload failure during an outage | **Server process exits** | Server keeps running |
| Deleted user's session | Works for up to 7 days | Refused immediately |
| Lock a user out with 5 bad logins | Worked | Attacker throttled, real user unaffected |
| Trying many accounts from one address | Not throttled | Blocked |
| Teacher account using the master email changes settings | Worked | Refused |
| Oversized upload | 40 MB accepted | 413 |
| Anonymous sidecar warm-up, anonymous settings read | Allowed | Refused |
| iPhone recordings on repeat playback | Served as `audio/webm`, fail to play | Correct type |
| Audio seeking (3 range request bugs) | Wrong bytes or wrong errors | Correct |
| Raw database error shown to users | Shown | Clean message |
| Security headers | All missing | All present |

*One note for anyone re-running these:* the type-change probe still printed `CONFIRMED` after the fixes, because it compared the anonymous 401 response's type with the owner's. That was a flaw in the probe. The owner's type is correct on every request, which the end-to-end suite checks directly.

### Also found and fixed along the way

These were not in the original audit:

- **A local `npm run build` could silently produce a development bundle.** Your `.env` sets `NODE_ENV=development`, which produced a build with no service worker and no security headers. `npm run build` now always builds for production.
- **Saved teacher feedback disappeared on reload**, because the student profile left it out of its response.
- **Numbers starting with 91 were treated as having a country code**, so WhatsApp links for those students went to the wrong number.
- **Background transcription could overwrite a student's manual correction.**
- **A client could claim a 100% completion score** by sending a very small target duration. The target now comes from the server.
- **A double tap on Record opened the microphone twice.**
- **Validation errors reached users as raw JSON.**

---

## 3. Issues Intentionally Left Unresolved

### Needs your decision

These change what the product does or promises, so they weren't changed automatically.

| Item | What is happening today | Why it needs you |
|---|---|---|
| **What the scores measure** (ARCH-06) | "Pronunciation", "Vocabulary" and "Grammar" scores come from audio loudness and pause patterns, not language analysis. They appear in parent reports under those names | **The most important open item.** Parents may reasonably believe these assess their child's grammar. Options: rename them, or add real assessment |
| **Students can fake scores** (ARCH-05) | Scores are computed in the browser and trusted by the server. A determined student could submit any score | Fixing this properly needs server-side analysis |
| **Passwords over WhatsApp** (ARCH-08) | Plaintext "permanent" passwords are sent through WhatsApp links, and users cannot change or reset them | Needs a change-password flow, which is a new feature |
| **Deleting a user** (DB-06) | Their attempts, recordings and messages stay in the database | Permanent erasure can't be undone. You may also have data-retention obligations here |
| **Who can create teachers** | Teachers can create other teacher accounts | This may be intended. Worth confirming |
| **Student navigation drawer** | Students have bottom tabs, not a drawer, so their Install option is in the bottom navigation and on the Profile page | A new drawer would have changed the student UI. Say if you want one |

### Deferred engineering work

| Item | Why it was deferred |
|---|---|
| Two practice routes are about 90% identical (DUP-06) | The save logic is now shared. Merging the screens is risky without visual regression tests |
| Audio uploads as base64 inside JSON (ARCH-07) | Works within the limits. A dedicated upload endpoint would be a larger change |
| Recording screen re-renders 20 times a second (PERF-08) | Needs restructuring. Not visible on the test machine; check on low-end phones |
| Client and server can both pay for transcription (PERF-07) | Partly reduced. The remaining overlap needs a design decision |
| Rate limits are per server process (MED-28) | Fine for one instance. A shared store is only needed when scaling out |
| Multi-collection writes are not transactional (RACE-10) | The `docker-compose` MongoDB runs without a replica set. Writes are ordered so the important one happens first |
| A hardcoded default sidecar URL remains for production (MED-27) | Removing it could break your current deployment. It now logs a clear warning; set `WHISPER_SIDECAR_URL` to silence it |
| A few loading errors only reach the console (MED-26) | The report and submissions panels. The actions people take now show errors |
| CSP allows inline scripts | Required by how the framework streams its data. Removing it needs per-request nonces |
| No error monitoring (ARCH-09) | Needs a choice of service. A health endpoint was added |
| Some older docs describe early designs (LOW-16) | Wrong paths were fixed and `docs/API.md` now points to the source of truth |

### Files left in place

- `.storage/audio` has 101 older files, about 56 of which are leftovers from old test runs (20 or 32 bytes). The rest may be real recordings, so nothing older was touched.
- `.output/` is an old build that nothing uses now. It is ignored by git and safe to delete.
- Testing the sidecar on this machine may have downloaded the `tiny.en` Whisper model to the local Hugging Face cache. That is outside the repository.

---

## 4. Files Modified

**Totals:** 94 files modified, 51 deleted, 33 new paths. See `git status` for the exact list.

| Area | Files |
|---|---|
| **Server core** | `src/server.ts`, `src/start.ts`, `src/server/data.ts`, `src/server/db/client.ts`, `src/server/db/schemas.ts`, `src/config/env.ts`, `src/config/constants.ts` |
| **Middleware** | `src/server/middleware/auth.middleware.ts`, `rate-limiter.ts` |
| **Services** | All of `src/server/services/*` |
| **Validators** | All of `src/server/validators/*` |
| **Client** | `src/routes/*`, `src/lib/auth.ts`, `app-settings.ts`, `i18n.ts`, `tarang-data.ts`, `error-page.ts`, `src/components/tarang/*`, `src/features/practice/*`, `src/features/assignments/*`, `src/features/students/*`, `src/features/reports/*`, `src/features/users/*`, `src/features/auth/*` |
| **PWA** | `public/sw.js`, `public/manifest.webmanifest`, `public/offline.html`, `public/icons/*`, `scripts/generate-pwa-icons.mjs` |
| **Sidecar** | `whisper_sidecar.py`, `requirements.txt`, `Dockerfile.sidecar` |
| **Infrastructure** | `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`, `scripts/seed-mongo.ts` |
| **Docs** | `README.md` (rewritten; the old content moved to `docs/DESIGN_BRIEF.md`), `AGENTS.md`, `AI_RULES.md`, `docs/AI_CONTEXT.md`, `API.md`, `ARCHITECTURE.md`, `DATABASE.md`, `DECISIONS.md`, `TLD.md` |

**New files:**

- **Server:** `scripts/serve.mjs`, `scripts/build.mjs`, `src/server/errors.ts`, `src/config/security-headers.ts`, `src/server/middleware/client-ip.ts`, `forwarded-for.ts`, `src/server/services/attempt.mapper.ts`
- **Shared helpers:** `src/lib/scoring.ts`, `roles.ts`, `phone.ts`, `app-url.ts`, `sample-waveform.ts`
- **Features:** `src/features/pwa/*`, `src/features/practice/hooks/useAttemptSubmission.ts`, `src/features/practice/components/SaveFailedPanel.tsx`
- **Config:** `.dockerignore`, `.env.example`
- **Tests:** `tests/e2e/run.mjs`, `tests/vitest-global-setup.ts`, `src/server/services/services.integration.test.ts`, `src/lib/helpers.test.ts`, `src/config/env.test.ts`

---

## 5. Redundant Code Removed

Each removal was checked with a repository-wide search first. All of it can be restored from git.

| Removed | Size |
|---|---|
| Unused UI kit, `src/components/ui/*` (zero imports from the app) | 46 files |
| Unused packages, including `vinxi`, which caused most audit findings, plus Radix, `recharts` and `@tanstack/react-query` | 42 direct dependencies removed. Another 3 build tools moved to dev dependencies, and `srvx` added |
| `src/hooks/use-mobile.tsx`, `src/lib/db.ts`, `src/lib/audio-analyzer.ts`, `public/manifest.json` | 4 files |
| `prod`, an AI session transcript tracked in git | 1 file |
| Mock student roster and sample results in `tarang-data.ts`, unused constants, `ModuleService.markCompleted`, dead recorder state, dev-only audio plugin | Internal |

**Duplicated code consolidated:**

- The score formula, from 14 copies to one
- Filler word lists, from 3 to one. Teachers' highlighting now matches what is counted, so words like "like" and "actually" are no longer highlighted
- Phone number helpers, from 2 to one
- Attempt mapping, from 3 to one
- Gemini and OpenAI calls, from 2 of each to one

**Net result:** about 20,800 lines removed and 7,800 added, across tracked files.

---

## 6. Performance Improvements

| Measure | Before | After | How it was measured |
|---|---|---|---|
| **Roster query, data loaded into memory** | 39.15 MB | **0.64 MB** | 200 students with 50 attempts each, on a real MongoDB |
| **Roster query, time** | 794 ms | **210 ms** | Same data, median of 5 runs |
| **Client JS and CSS, raw** | 821 KB | 776 KB | Build output |
| **Client JS and CSS, as delivered** | Not compressed by the app | **211 KB** (brotli) | Build output |
| **Hashed file caching** | Revalidated every visit | Cached for 1 year | Response headers |
| **Direct runtime dependencies** | 56 | 12 | `package.json` |
| **Total installed packages** | 945 | 406 | `package-lock.json` |
| **Production `node_modules`** | Not measured | 120 MB | Runtime-only install |

These are not separately benchmarked, but the code path changed in the following ways:

- Audio range requests now read only the requested bytes, where they used to load the whole file each time.
- New indexes cover audio lookups.
- Settings are fetched once per screen, down from twice.
- Password hashes are no longer loaded when listing users.

---

## 7. Security Improvements

- **Recordings:** login and ownership checks, `Cache-Control: private`, audio-only upload allow-list, and `nosniff` with a sandbox CSP on responses
- **Authorization:** faculty-or-owner checks on attempts, messages and flags. Sender details always come from the server
- **Sessions:** deleted accounts lose access immediately, the current role comes from the database, the JWT algorithm is pinned, and weak signing secrets are refused at startup
- **Master admin:** requires the admin role as well as the configured email, and is no longer hardcoded across client files
- **Login:** limits by account and address, plus failure-only limits, so a class sharing one address isn't blocked. Forged `X-Forwarded-For` values are ignored. Response timing no longer reveals which emails exist
- **Limits:** a 32 MB ceiling on requests, size limits on all input fields, and rate limits on transcription, messages, flags and attempts
- **Errors:** only messages written for users reach the browser. Everything else is logged and replaced with a generic message
- **Headers:** CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`, on pages and on static files
- **Infrastructure:** MongoDB and the sidecar are no longer published on host ports, Docker excludes `.env` and student audio from images, both images run as non-root, and Node moved from 20 (end of life) to 22
- **Sidecar:** optional shared-secret auth, a request size limit, wildcard CORS removed, and transcripts removed from logs
- **Gemini API key:** moved from the URL to a header
- **Seed script:** refuses to run without an explicit flag or in production, and no longer logs database credentials
- **Dependencies:** `npm audit` went from **26 findings to 0**, including dev dependencies

**Checked and found sound:** CSRF protection, cookie flags, no NoSQL injection, no unsafe HTML rendering, and no secrets in the client bundle.

---

## 8. PWA Implementation Details

The earlier files were a starting point but didn't work: Chrome never registered the service worker, and there was no install UI.

### Where Install App appears

| Where | Who | Behaviour |
|---|---|---|
| **Home screen card** | Students on `/practice`, teachers on `/dashboard` | Can be dismissed. Stays away for 14 days once dismissed |
| **Navigation drawer** | Teachers on phones and tablets | Permanent row in the drawer |
| **Desktop header** | Teachers on desktop | Compact button, since there is no drawer at that size |
| **Bottom navigation** | Students | Install tab, shown only while there is something to install |
| **Profile page** | Students | Always available. Confirms when already installed |
| **Sign-in page** | Everyone | Quiet link, because this is the first page people see from a shared link |

The UI uses the existing design tokens, works in light and dark themes, and is translated into English, Hinglish and Hindi.

### How each situation is handled

| Situation | What happens |
|---|---|
| Browser offers installation | Install App opens the browser's real dialog |
| User cancels | A short note says it can be installed later, and the option stays |
| User installs | Options disappear, and Profile confirms it is installed |
| Already running as an app | No install options |
| Installed, then uninstalled | The option comes back when the browser offers it again |
| iPhone or iPad | Step-by-step Add to Home Screen instructions |
| Android without a prompt | Step-by-step menu instructions |
| Mac Safari | Add to Dock instructions |
| Browser that can't install, such as desktop Firefox | A plain explanation suggesting Chrome or Edge |

There is no fake download anywhere: the button only ever opens the browser's own install flow or honest instructions.

### What the service worker caches

| Content | Strategy | Why it is safe |
|---|---|---|
| Pages | **Never cached.** Always from the network, with the offline page as fallback | Users always get current code, and no private page is stored |
| API, server functions, audio | **Never touched** | Private student data |
| Hashed build files | Cache first, in a per-build cache | The name changes when the content changes, so they can't go stale |
| Offline page, manifest, icons | Network first | Public |
| Google Fonts | Cache first, limited to 30 entries | Public and immutable |

### After a deployment

The build stamps `sw.js` with a hash, so every deployment is detected. Open apps show "A new version is ready" with a Refresh button. **They never reload on their own, and the message is hidden on recording screens,** so a student can't lose a take. Old caches are deleted when the new version activates. If an open tab asks for a file from an old build, it reloads once automatically.

### Manifest and icons

Name, short name, ID, start URL, scope, standalone display, theme and background colours, and shortcuts. Icons at 32, 72, 96, 128, 144, 152, 192, 256, 384 and 512 px, maskable 192 and 512, an opaque 180 px Apple icon, and SVG.

---

## 9. Tests Executed and Results

All of these ran on the final code, from a clean build.

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | **Pass**, 0 errors (was 3). `noUnusedLocals` is now on |
| ESLint | `npm run lint` | **Pass**, 0 errors, 0 warnings (was 157 and 7) |
| Unit and integration tests | `npm test` | **113 of 113 pass** (was 25, with a failing run) |
| End-to-end tests | `npm run test:e2e` | **211 of 211 pass** |
| Dependency audit | `npm audit` | **0 vulnerabilities** (was 26) |
| Production build | `npm run build` | **Pass** |
| Sidecar | `python whisper_sidecar.py` | **Pass**. Starts and runs the real model (it crashed before) |

**End-to-end coverage**, using the real production server, a real MongoDB and real Chrome:

| Area | Checks |
|---|---:|
| Authentication | 14 |
| Authorization | 25 |
| Uploads and stored data | 10 |
| Audio streaming | 11 |
| Rate limiting | 5 |
| Error handling | 3 |
| Headers, caching, compression | 22 |
| PWA manifest and icons | 34 |
| PWA in a real browser (installability, service worker, caches, offline) | 13 |
| Install experience | 25 |
| Every page loads, with no hydration or CSP errors | 25 |
| Recording flow (microphone, saving, retry, permission denied) | 15 |
| Updates after a deployment | 4 |
| Database outage | 5 |

**Checked separately:**

- Dev mode works.
- The server runs with runtime dependencies only.
- Sidecar token auth works against the real model.
- The install UI was reviewed in screenshots, on phone and desktop, in both themes.

### What was not tested

| Not tested | Why | What was done instead |
|---|---|---|
| **Installing on a real Android phone or iPhone** | No devices here | Chrome reports the app as installable. The install event was simulated, and the app's reaction to it was tested |
| **The browser's native install dialog** | Can't be automated | The app's handling of accept and cancel was tested |
| **Docker image build** | Docker isn't running on this machine | The final stage was reproduced by hand with a runtime-only install, and it worked. **`docker compose up` itself has not been run** |
| **GitHub Actions workflow** | Runs only on GitHub | Each of its commands was run locally. The Linux runner has not been tried |
| **Real Gemini and OpenAI calls** | Tests deliberately send nothing to external services | The Gemini key moved to a header; the fallback paths weren't exercised against the real APIs |
| **A real microphone and real speech** | Automated Chrome uses a fake audio device | The whole pipeline ran, but transcription accuracy wasn't assessed |
| **Your Atlas database and live deployment** | Deliberately never touched | Tests used an in-memory MongoDB 7.0 |
| **Automatic stop at 10 minutes** | Too slow for the test run | The code path is short, but it hasn't been run |
| **Reload when an old build's file is missing** | Hard to trigger on demand | The update flow itself is tested. This fallback hasn't been run |
| **Load testing** | Out of scope | |

---

## 10. Remaining Risks

| Risk | Level | What to do |
|---|---|---|
| **Scores don't measure what their names say** | **High** for trust, and possibly legally | Decide before parents rely on the reports (section 3) |
| **Children's voice data** | **High** | Confirm consent and retention obligations, and decide on deletion (DB-06) |
| **Plaintext passwords over WhatsApp, with no way to change them** | Medium-High | Add a change-password flow |
| **Install not yet seen on a real phone** | Medium | Try one Android phone and one iPhone before announcing it |
| **Docker path unproven** | Medium, if you use Docker | Run `docker compose up --build` once |
| **Students can submit false scores** | Medium | Acceptable for a pilot, not for anything high-stakes |
| **Roster query needs MongoDB 5.2 or newer** (uses `$topN`) | Low-Medium | Check your Atlas version |
| **Audio upload size on slow connections** | Low-Medium | Recordings are capped at 10 minutes, and failed saves can be retried. Watch real usage |
| **Rate limits reset on restart and are per instance** | Low | Fine for a single instance |
| **Rejected uploads are read and discarded before the 413 is sent** | Low | Reading stops at 128 MB, and nothing is kept in memory |

---

## 11. Production Deployment Instructions

**Before you start**, do the three required actions at the top of this report. The app must be served over **HTTPS**, or the microphone and installation won't work.

### Environment

```sh
SESSION_SECRET=      # Required. openssl rand -base64 48
MONGODB_URI=         # Required
MONGODB_DB_NAME=     # Required
ADMIN_EMAIL=         # Master administrator. Also used for the first-run admin account
ADMIN_INITIAL_PASSWORD=   # Only used if the database has no users
WHISPER_SIDECAR_URL=      # Recommended. Otherwise a default host is used, with a warning
WHISPER_SIDECAR_TOKEN=    # Set on both sides if the sidecar is reachable from the internet
GEMINI_API_KEY=      # Optional
OPENAI_API_KEY=      # Optional
TRUSTED_PROXY_HOPS=  # Optional. Default 1 suits most hosts. See below
```

Don't set `NODE_ENV` in `.env`. Each command sets it.

`TRUSTED_PROXY_HOPS` is the number of proxies in front of the app. Use `1` behind one proxy (Render, Koyeb, Fly, nginx), `2` with Cloudflare in front of that, and `0` if the app faces the internet directly.

### Node host (Render, Koyeb, Fly, VPS)

| Setting | Value |
|---|---|
| Node version | 22.12 or newer |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check | `/api/health` |

The process must stay running, because transcription happens in the background. **Vercel and other serverless hosts are not supported as is.** See ADR-005 in `docs/DECISIONS.md`.

### Docker Compose

```sh
docker compose up --build
```

Put a reverse proxy with HTTPS in front, and set `TRUSTED_PROXY_HOPS=1`. MongoDB moves from 6.0 to 7.0, which is a supported upgrade for existing data. **Back up first.**

### Transcription sidecar

The sidecar could not start before this work, so redeploy it. The default host didn't respond within 15 seconds when checked, which is consistent with that crash. It may also have been asleep on a free tier.

### After deploying

1. Open `/api/health` and confirm `{"status":"ok","database":true}`.
2. Log in as a student, record, and play it back.
3. Log in as a teacher, review the recording, and leave feedback.
4. As the master admin, open Settings.
5. Install on one Android phone and one iPhone.
6. Back up MongoDB, including the `audio_recordings` bucket.
7. Set up uptime monitoring on `/api/health`.

### What users will notice

- Everyone is signed out once, because of the new secret.
- Recordings require login. Nothing in the app shared these links, so nothing should break.
- Homework reminders now really arrive in the student's inbox. Before, they were recorded but never delivered.
- Recordings stop automatically at 10 minutes.
- A brand-new student shows no score until they record, where they used to show 85%.
- Waveforms are always real. A quiet recording looks quiet.
- Deleted homework no longer comes back after a restart.
- WhatsApp links now use your real site address. They used to point to `trounce.app`, which returned 404.

### Rolling back

All changes are uncommitted, so review them with `git diff`. If you deploy and need to go back, redeploy the previous commit. The service worker picks up the change like any other deployment.

---

## 12. Final Production-Readiness Assessment

| Area | At the start | Now |
|---|---|---|
| Security | Failing | **Strong for this stage.** Open items are product decisions |
| Reliability | Failing | **Good.** Survives outages and doesn't lose recordings |
| Deployability | Failing | **Good on Node hosts.** Docker unproven |
| Data integrity | Poor | **Improved.** Fabricated data removed, but see the score question |
| Performance | Fair | **Good.** Not load tested |
| PWA | Failing | **Works in Chrome.** Real phones unverified |
| Testing | Poor | **Good.** 324 automated checks |
| Maintainability | Fair | **Good.** Much smaller, with one duplication left |

**Overall: ready for a controlled pilot** with one institute, once the three required actions are done and you have tried it on real phones. This is not a claim of 100% readiness.

**Before a wider rollout:**

1. Decide what to do about the score labels.
2. Settle consent, retention and deletion for students' voice data.
3. Add a change-password flow.
4. Add error monitoring.
5. Run the Docker path once, if you plan to use it.
