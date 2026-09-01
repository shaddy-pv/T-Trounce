# Project Brief — Tarang (Signal Speak Studio)

## 1. Executive Summary

**Tarang** is a dedicated spoken-English training and monitoring studio created for Indian coaching institutes, competitive exam academies, and job-readiness centres. It provides a dual-role platform (Student & Teacher) rooted in audio engineering concepts: speech is evaluated as a physical **signal**, where clarity is strength and hesitation is noise.

---

## 2. Core Problem & Market Need

In Indian tier-2/3 institutes (Patna, Indore, Jaipur, Lucknow, etc.), spoken English coaching suffers from three core breakdowns:

1. **Subjectivity**: Spoken assessments are based on fleeting teacher impressions rather than structured metrics.
2. **Batch Overload**: Teachers cannot provide individual speaking time to 50+ students in a 1-hour class.
3. **Parental Verification**: Institutes struggle to demonstrate measurable student improvement to fee-paying parents.

---

## 3. The Tarang Solution

- **Student Mic Deck**: Private, mobile-first recording console where students read prompts, observe real-time audio waveforms, receive immediate pause/filler diagnostics, and build daily streaks.
- **Teacher Control Console**: Desktop channel-strip overview providing batch-wide signal monitoring, automatic flagging of struggling or inactive students, and 1-click parent report generation.

---

## 4. Key Product Features

- **Live Waveform Visualizer**: 60 FPS Web Audio API canvas visualizer displaying real-time speech amplitude.
- **Triad Acoustic Scoring**: Pronunciation, Vocabulary, and Grammar scores calculated alongside exact filler and pause counts.
- **Channel Strip Dashboard**: High-density batch overview showing student status dots (`on-track`, `nudge`, `flagged`) and mini-waveforms.
- **Actionable Red-Flag Alerts**: Automatic isolation of students with score drops or extended inactivity.
- **Parent Progress Cards**: Exportable weekly performance dossiers showing 4-week score trends and practice volume.

---

## 5. Goals & Non-Goals

### Goals (MVP)

- Deliver a fast, responsive SSR web application running completely on local infrastructure (Node.js + Local MongoDB).
- Adhere strictly to the Tarang Design System (warm near-black `#100E0C` ink, parchment typography, signal teal `#3FB8AF`).
- Provide instant role switching between Student and Teacher.

### Non-Goals (MVP)

- Do **not** build heavy cloud-dependent proprietary vendor lock-in.
- Do **not** use generic AI SaaS aesthetic cliches (purple gradients, glassmorphism, floating blobs, emoji icons).
- Do **not** require credit cards or complex multi-tenant billing in local coaching deployments.

---

## 6. Target Audience

- **Primary Students**: 18–26 year olds preparing for SSC, Bank PO, NDA, IELTS, or campus placement interviews.
- **Primary Instructors**: Coaching institute teachers, spoken English faculty, institute administrators.
