# Functional & Non-Functional Requirements — Tarang

## 1. Functional Requirements

### 1.1 Authentication & Role Switching

- **FR-AUTH-01**: The system must provide single-click role switching (`Student` vs `Teacher`) on `/login` and persist user state across page reloads in `localStorage`.
- **FR-AUTH-02**: Access to `/dashboard`, `/flags`, `/reports`, and `/students/:id` must be restricted to users with the `teacher` role.
- **FR-AUTH-03**: Access to `/practice`, `/practice/:moduleId`, `/progress`, and `/profile` must be restricted to users with the `student` role.
- **FR-AUTH-04**: Sign-out functionality must clear persisted session state and redirect cleanly to `/login`.

### 1.2 Student Practice & Audio Recording

- **FR-STU-01**: Display available practice modules with title, prompt, difficulty badge (`Beginner`, `Intermediate`, `Advanced`), and duration.
- **FR-STU-02**: Module practice view must request microphone permissions, show a 3-second countdown, and record audio.
- **FR-STU-03**: The recording canvas must render real-time audio amplitude bars at 60 FPS using the browser's `Web Audio API`.
- **FR-STU-04**: Stopping a recording must compute attempt diagnostics:
  - Pronunciation score (0–100%)
  - Vocabulary score (0–100%)
  - Grammar score (0–100%)
  - Total filler word count
  - Long pause count
  - Static waveform segment timeline
  - Actionable feedback takeaway
- **FR-STU-05**: Results must be viewable on `/result/:attemptId` with interactive timeline inspection.
- **FR-STU-06**: Student streak counter must increment upon daily practice attempt completion.

### 1.3 Teacher Batch Dashboard & Console

- **FR-TEA-01**: Batch overview must display top-level metrics: total active students, flagged students count, students recorded today, and batch average score.
- **FR-TEA-02**: Status classification for each student:
  - `on-track`: Green dot, active within 24h, score ≥ 70%.
  - `nudge`: Amber dot, active within 48h or score 50–69%.
  - `flagged`: Rust dot, inactive > 5 days or score < 50% or steep decline.
- **FR-TEA-03**: Flagged students panel must highlight warning reasons (e.g., _"Vocab 41% · Inactive 8d"_).
- **FR-TEA-04**: Full student roster must render tight rows with student name, status indicator, focus area, last active timestamp, score percentage, trend indicator, and mini-waveform.
- **FR-TEA-05**: Clicking any student must open `/students/:id` with their comprehensive history, focus breakdown, and past attempts.

### 1.4 Parent & Batch Reports

- **FR-REP-01**: `/reports` must display score distributions, batch trends over 4 weeks, and individual student progress cards.
- **FR-REP-02**: Report cards must be formatted cleanly for sharing and printing.

---

## 2. Non-Functional Requirements

### 2.1 Performance & Latency

- **NFR-PERF-01**: Initial page load LCP < 1.2 seconds.
- **NFR-PERF-02**: Client-side audio waveform frame time < 16ms (consistent 60 FPS).
- **NFR-PERF-03**: Route navigation transition time < 100ms.

### 2.2 Compatibility & Platform

- **NFR-COMP-01**: Fully responsive across mobile viewports (360px–480px for student mic deck) and desktop viewports (1024px–1920px for teacher console).
- **NFR-COMP-02**: Compatible with modern Chromium, Safari, and Firefox browsers supporting Web Audio API and `getUserMedia`.

### 2.3 Aesthetics & Token Adherence

- **NFR-AESTH-01**: Strict compliance with Tarang Design Tokens:
  - Background: `#100E0C` (`ink-950`)
  - Accent: `#3FB8AF` (`signal-teal`)
  - Status Accents: `#E2A33C` (`static-amber`), `#C1503B` (`alert-rust`)
  - Text: `#EDE7DD` (`text-primary`), `#9C9388` (`text-secondary`), `#6B645A` (`text-tertiary`)
- **NFR-AESTH-02**: No generic AI SaaS clichés (no purple gradients, no glassmorphism, no emoji icons).

---

## 3. Edge Cases & Handling

| Edge Case                                | Expected System Behavior                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| User denies microphone permission        | Display clear amber alert banner: _"Microphone access required to record signal"_ with retry button. |
| Inaudible or silent recording            | Waveform displays low amplitude; results prompt user to speak closer to the microphone.              |
| MongoDB offline or unreachable           | Server functions fall back gracefully to cached/in-memory data without unhandled exceptions.         |
| Direct deep-link navigation without auth | Router redirects to `/login` with clean path preservation.                                           |
