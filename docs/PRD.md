# Product Requirements Document (PRD) — Tarang (Signal Speak Studio)

## 1. Product Vision & Mission

**Tarang** (Hindi: _तरंग_ — wave / frequency) is a purpose-built spoken-English coaching platform engineered specifically for tier-2 and tier-3 Indian coaching institutes, competitive exam academies, and job-readiness centres.

### Core Philosophy: "Waveforms, Not Vibes"

Traditional spoken-English evaluation relies on subjective impressions ("vibes", teacher fatigue, arbitrary scoring). Tarang transforms human speech into tangible **acoustic signal data**. Clear articulation, measured cadence, and vocal confidence produce strong, healthy waveforms; hesitation, filler words (_"umm"_, _"aah"_, _"matlab"_), and nervous silence represent noise.

---

## 2. Problem Statement & Market Context

### The Challenge in Tier-2/3 Coaching Institutes

1. **Subjective Feedback**: Students receive vague comments like _"speak with more confidence"_ without actionable diagnostics.
2. **Teacher Bottleneck**: A single teacher handles batches of 40–80 students and cannot listen to 5 minutes of daily speech per student.
3. **Parental Accountability**: Parents paying tuition fees demand tangible proof of English fluency improvement.
4. **Student Anxiety**: Speaking in front of peers triggers performance anxiety; students need a private, low-stakes practice space.

### The Tarang Solution

- **For Students**: A calm, mobile-first, tape-deck style recording studio where they practice structured prompts, visualize their live waveform, review pause/filler diagnostics, and track streaks.
- **For Teachers**: A dense, channel-strip desktop console where an entire batch is scanned in seconds, struggling students are flagged automatically, and multi-metric PDF/WhatsApp progress cards can be generated for parents.

---

## 3. User Personas & Roles

### 3.1 Student Persona: "Aman" (Aspirant)

- **Profile**: 21-year-old preparing for banking/SSC interviews or IT campus placements in Patna or Indore.
- **Context**: Accesses the app via smartphone between classes or from home. Needs encouragement, clarity, and private rehearsal.
- **Needs**: Clear speech prompts, immediate visual feedback, zero intimidating jargon, streak motivation.

### 3.2 Teacher Persona: "Sharma Sir" (Institute Owner / Spoken English Trainer)

- **Profile**: 42-year-old institute head managing 3 batches of 60 students each.
- **Context**: Uses a desktop or laptop during institute hours. Needs rapid batch oversight.
- **Needs**: Instant identification of students falling behind (_"red flags"_), weekly score trends, 1-click progress card generation for parent meetings.

---

## 4. User Roles & Permission Matrix

| Capability / Route                                        | Student Role | Teacher Role |
| --------------------------------------------------------- | :----------: | :----------: |
| Single-screen Role Switch / Login                         |     Yes      |     Yes      |
| View Practice Modules List (`/practice`)                  | **Primary**  |  View-only   |
| Record Audio & View Live Waveform (`/practice/:id`)       | **Primary**  |   Testing    |
| View Individual Attempt Breakdown (`/result/:id`)         | **Primary**  |  View-only   |
| View Personal Streak & Progress (`/progress`, `/profile`) | **Primary**  |      No      |
| Batch Health Dashboard & Channel Strips (`/dashboard`)    |      No      | **Primary**  |
| Red-Flag Alert & Attention Panel (`/flags`)               |      No      | **Primary**  |
| Student Deep-Dive Dossier (`/students/:id`)               |      No      | **Primary**  |
| Generate Batch & Student Reports (`/reports`)             |      No      | **Primary**  |

---

## 5. Feature Specifications & User Journeys

### 5.1 Student Journey: Daily Practice & Signal Feedback

1. **Module Selection (`/practice`)**:
   - Displays daily streak count in Space Grotesk display typography.
   - Calm, scrollable vertical list of module cards (12px border radius).
   - Difficulty tags: `Beginner`, `Intermediate`, `Advanced`.
   - Completed indicator badge and duration indicators (45s to 90s).
2. **Live Recording Console (`/practice/:moduleId`)**:
   - Prominently displays the speaking prompt.
   - 3-second visual countdown before microphone activates.
   - Live canvas-rendered waveform responding to Web Audio API input amplitude.
   - Recording pulse indicator (amber functional pulse).
   - One-tap Stop & Analyze action.
3. **Attempt Diagnostic (`/result/:attemptId`)**:
   - Interactive waveform timeline highlighting speech segments, pauses, and filler words.
   - Core Triad Scores (0–100%): **Pronunciation**, **Vocabulary**, **Grammar**.
   - Metric pill counters: Filler word count, excessive pause count.
   - Actionable AI-driven coaching takeaway (e.g., _"3 filler words detected — try pausing silently instead of saying 'umm'"_).

### 5.2 Teacher Journey: Batch Monitoring & Intervention

1. **Console Overview (`/dashboard`)**:
   - High-density channel strip layout with 4px border radius.
   - Real-time batch health meters: _On track_, _Needs a nudge_, _Flagged_, _Average Score_.
   - Prominent **Needs Attention Panel** isolating flagged students (inactivity > 5 days or score drop > 10%).
   - Full batch table featuring inline mini-waveforms, trend indicators, and direct student links.
2. **Red-Flag Management (`/flags`)**:
   - Categorized intervention board grouping students by failure pattern (Declining Score, Extended Inactivity, High Pause Frequency).
   - Action buttons to trigger reminder nudges or mark resolved.
3. **Parent Report Generator (`/reports`)**:
   - Batch-level aggregate diagnostics and individual student report preview.
   - Export-ready layout with score distribution, 4-week trend graph, and attendance consistency.

---

## 6. Non-Functional Requirements (NFRs)

1. **Performance**:
   - Initial page load under 1.2s on 4G networks.
   - Client-side Web Audio API processing latency under 16ms (60 FPS waveform render).
2. **Reliability & Local Data**:
   - Zero vendor lock-in; operates entirely on local MongoDB with resilient connection pooling and automatic fallback.
3. **Aesthetic Integrity**:
   - Strict adherence to the Tarang Design System (`#100E0C` Ink background, `#3FB8AF` Signal Teal accent, `#EDE7DD` Parchment text).
   - Zero generic AI SaaS cliches (no purple gradients, no glassmorphism, no emoji icons).

---

## 7. Success Metrics (KPIs)

- **Student Daily Active Practice Rate (DAPR)**: > 65% of enrolled batch recording ≥ 1 attempt daily.
- **Intervention Turnaround Time**: Flagged students contacted within 24 hours of alert trigger.
- **Parent Satisfaction Score (CSAT)**: > 90% positive feedback on visual progress cards.
