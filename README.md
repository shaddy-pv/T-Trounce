# Trounce

A spoken-English coaching app for coaching institutes. Students record themselves and see their speech as a waveform. Teachers monitor a batch, give feedback and send progress reports to parents. It installs as an app on phones and computers.

The product and design direction are in [docs/DESIGN_BRIEF.md](docs/DESIGN_BRIEF.md).

**Stack:** TanStack Start (React 19, Vite), MongoDB, and an optional Python transcription service.

## Getting started

Requires Node.js 22.12 or newer and a MongoDB database.

```sh
npm install
cp .env.example .env    # then fill in the values
npm run dev
```

The first time the app connects to a database with no users, it creates the admin account from `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build, written to `dist/` |
| `npm start` | Runs the production build |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint and Prettier check |
| `npm test` | Unit and integration tests, using a temporary in-memory MongoDB |
| `npm run test:e2e` | End-to-end checks against the production build. Run `npm run build` first. Browser checks need Chrome or Edge |
| `npm run generate:icons` | Regenerates the app icons in `public/icons/` |
| `npm run db:seed -- --confirm-wipe` | **Deletes all data** and resets a development database. Refuses to run with `NODE_ENV=production` |

Tests never read `.env` and cannot reach your real database.

## Configuration

All settings are documented in [.env.example](.env.example). `.env` is read by `npm run dev`, `npm run build` and `npm start`; values set in the real environment take priority. Don't put `NODE_ENV` in `.env`, as each command sets it correctly.

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Production | Signs sessions. At least 32 random characters |
| `MONGODB_URI`, `MONGODB_DB_NAME` | Production | Database connection |
| `ADMIN_EMAIL` | First run | Admin account, and the one account allowed to change system settings |
| `ADMIN_INITIAL_PASSWORD` | First run | Password for that account |
| `WHISPER_SIDECAR_URL`, `WHISPER_SIDECAR_TOKEN` | No | Self-hosted transcription service |
| `GEMINI_API_KEY`, `OPENAI_API_KEY` | No | Cloud transcription fallbacks |
| `TRUSTED_PROXY_HOPS` | No | Reverse proxies in front of the app. Defaults to 1 in production; use 0 if the app faces the internet directly |

## Deploying

**The app must be served over HTTPS.** Browsers only allow the microphone, the service worker and app installation on secure sites.

### Any Node host (Render, Koyeb, Fly, a VPS)

```sh
npm ci
npm run build
npm start
```

The server reads `PORT` and `HOST`. Point your platform's health check at `/api/health`. The process must keep running, because transcription happens in the background after a recording is saved, so serverless platforms are not supported.

### Docker Compose

Create a `.env` with `SESSION_SECRET`, `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`, then:

```sh
docker compose up --build
```

Only the web app is published on the host. MongoDB and the transcription service stay on the internal network. Put a reverse proxy with HTTPS in front, and set `TRUSTED_PROXY_HOPS=1` when you do.

### Transcription service (optional)

```sh
pip install -r requirements.txt
python whisper_sidecar.py
```

If it can be reached from the internet, set the same `WHISPER_SIDECAR_TOKEN` on both sides. Without any speech engine, recordings still save, without a transcript.

## Installing the app

Users can install from **Install App** on the home screen, in the teacher navigation drawer, in the student bottom navigation, or on the Profile page. Browsers that offer an install prompt show it directly. iPhones and other browsers get step-by-step instructions instead.

After a deployment, open apps show a "new version" message. They never reload on their own, so a recording in progress can't be interrupted. See [ADR-007](docs/DECISIONS.md) for what the service worker caches and why.

## Project layout

```
src/routes/       Pages (file-based routing)
src/features/     Feature code: practice, pwa, assignments, reports, students, users, dashboard
src/components/   Shared components
src/server/       Server functions (data.ts), services, validators, database
src/lib/          Helpers shared by client and server
scripts/          Production server, icon generator, database seed
tests/            End-to-end checks and test setup
public/           Service worker, manifest, offline page, icons
docs/             Product, architecture and decision records
```

Contributors and AI agents should also read [AGENTS.md](AGENTS.md).
