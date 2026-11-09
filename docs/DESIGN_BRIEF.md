# Trounce Studio

Trounce- Frontend Design & Build Brief

Application name: Trounce (formerly Tarang)- Spoken-English speech intelligence and practice studio.

How to use this file: paste the whole thing into Claude Code, v0, Cursor, or a fresh Claude chat as the build prompt. It is written as a direct instruction to whichever AI builds the frontend. Section 10 is the literal kickoff prompt — everything above it is the reference the builder should follow while executing.

1. Subject & Direction

Trounce is a spoken-English coaching tool used inside Indian tier-2/3 coaching institutes. Two roles, one app: students record themselves speaking and get feedback; teachers monitor a batch and prove progress to parents. The product's own vocabulary — recording, transcript, pause, filler word, fluency, pronunciation — is the design's source material. Avoid borrowing the visual language of generic "AI SaaS" or "EdTech gradient" products. Borrow instead from audio engineering: waveforms, signal meters, channel strips, control rooms. Speaking clearly = strong signal. Hesitation, filler words, long pauses = noise. This is literal (it's real audio data), not a decorative metaphor.

Single app, role-based routing (already decided): one design system, two layout personalities —

Student surfaces: calm, mobile-first, encouraging. Built around a mic/tape-deck moment.

Teacher surfaces: dense, fast-scanning, console-like. Built around channel strips.

2. Design Tokens

Color — functional, not decorative

Token Hex Use ink-950 #100E0C App background. Warm near-black, not cold gray-black. ink-900 #1B1815 Card / elevated surface. ink-800 #242019 Hover surface, pressed state. border-hairline #2E2A26 All borders, 1px. No drop shadows for elevation — use border + slight surface-color shift instead. text-primary #EDE7DD Headlines, body. Warm parchment-white, never pure #FFF. text-secondary #9C9388 Labels, metadata, timestamps. text-tertiary #6B645A Placeholders, disabled. signal-teal #3FB8AF The ONE primary accent: active states, primary CTA, "clear" score zones, brand mark. Use at full saturation sparingly — mostly at 10–15% opacity as fills, full opacity only for small marks (dots, icons, active border). static-amber #E2A33C Functional only: live-recording pulse, filler-word markers in transcript, "needs a nudge" status. Never decorative. alert-rust #C1503B Functional only: red-flag students, critical errors. Used sparingly — if everything is rust, nothing is urgent.

Never use pure #000000 or pure #FFFFFF anywhere. No purple/violet/indigo. No gradients except the one specified in §3.

Type — three roles, each doing a different job

Role Typeface Where Display / headlines Space Grotesk (500/600/700) Screen titles, streak counts, hero moments. Has a technical, instrument-panel character — deliberately not Inter/Geist for headlines. Body / UI Inter (400/500) All running text, buttons, nav, form labels. Data / measurement IBM Plex Mono (400/500) Every number that is a measurement: scores, percentages, timers, WPM, dates in tables. The mono treatment signals "this is data," consistently, everywhere.

Type scale (px, use exactly — not Tailwind defaults): 12 / 14 / 16 / 20 / 28 / 40 / 56. Headlines jump scale deliberately (e.g. 16→28, not 16→20→24) so hierarchy reads instantly.

Radius — two systems, intentional

Teacher console elements (tables, channel strips, data cards): 4px. Reads as precision instrument.

Student-facing elements (practice cards, buttons, the recording control): 12px. Reads as calm and approachable.

This split is a design statement, not an accident — never let it average out to a uniform 8px everywhere.

Spacing

Base unit 4px. Section padding on mobile: 20px. On teacher desktop tables: tight 12px row padding — density is the point there.

Motion — orchestrated, not scattered

Recording: waveform animates live from mic input, real-time, no easing tricks needed — it's literally the signal.

Score reveal: one orchestrated moment. The waveform "settles" left-to-right over ~600ms, each segment locking into its color (teal/amber) like a needle finding its reading. This is the single big animation moment in the whole app — spend the motion budget here.

Everything else: 120–150ms ease-out on hover/press, border-brightening instead of glow/shadow. No bounce, no confetti, no floating elements. Respect prefers-reduced-motion — disable the waveform settle animation and snap to final state instead.

3. Signature Element — The Waveform-as-Feedback System

This is the one thing Tarang is remembered for. Every spoken attempt produces a waveform. That same waveform object is reused everywhere instead of inventing a new visual per screen:

Recording screen: live, moving, neutral teal.

Score reveal: same waveform, now color-segmented — teal where speech was clear, amber where a filler word or pause was detected, with small labels on tap.

Student portfolio: shrunk to a thumbnail strip, Month 1 attempt next to Month 6 attempt, same visual side by side — the improvement is visible, not just a number.

Teacher channel strip: a tiny inline waveform thumbnail per student row instead of a generic progress bar.

Parent report: the waveform graphic is the hero visual on the PDF/WhatsApp report — "this is what your child's speaking looked like this week," far more convincing than a percentage.

This is the one allowed gradient/visual flourish in the whole system. Everything else stays flat and disciplined around it.

4. Information Architecture

Student (mobile-first, installable PWA): /login → /practice (hub) → /practice/:moduleId (recording session) → /result/:attemptId (score reveal) → /progress (portfolio/history) → /profile

Teacher (desktop-first, same app, different layout): /login → /dashboard (batch overview, channel strips) → /students/:id (detail + history) → /reports (generate/send parent reports) → /flags (red-flag panel)

Both roles share: auth shell, color tokens, type system, the waveform component. They do not share page layouts.

5. Screen Specs

Student — Practice Hub (/practice)

Single column, generous spacing. Top: streak count in Space Grotesk, large (this is the one "hero number" moment for students). Below: a vertical list of practice modules as cards (12px radius), each showing module name, difficulty tag, and a small static waveform icon if completed. No grid of icons — a calm scrollable list, this audience opens the app on a phone between classes, not at a desk.

Student — Recording Session (/practice/:moduleId)

┌─────────────────────────────┐
│ ← Back 00:14 │ mono timer, top right
│ │
│ "Tell me about your │ prompt text, Space Grotesk
│ favorite hobby" │
│ │
│ ╭──────────────────────╮ │
│ │ ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿ │ │ live waveform, full width
│ ╰──────────────────────╯ │
│ │
│ ◉ RECORDING │ amber pulse dot + label
│ │
│ ⏺ tap to stop │ 12px radius, large tap target
│ │
└─────────────────────────────┘

No circular progress ring for the timer — mono digits only, top corner, out of the way. The waveform is the centerpiece.

Student — Score Reveal (/result/:attemptId)

Waveform settles into color segments (the one animation). Below it: three mono numbers in a row — Pronunciation / Vocabulary / Grammar — each with a one-word "Focus Area" callout under whichever is lowest, in static-amber text. A short, specific line of feedback in the interface's own voice ("3 filler words in this attempt — try pausing instead of saying 'umm'"), never generic praise like "Great job!"

Teacher — Dashboard Overview (/dashboard)

┌──────────────────────────────────────────────────┐
│ Batch Signal Health [Generate Report] │
│ 24 active · 3 need attention │
├──────────────────────────────────────────────────┤
│ ⚠ NEEDS ATTENTION │
│ ● Priya S. ∿∿*∿*∿ Vocab 41% Inactive 8d │
│ ● Rahul K. ∿*∿∿\__ Pron 38% Score ↓ 12% │
├──────────────────────────────────────────────────┤
│ Name Waveform Focus Last active │
│ ○ Aman V. ∿∿∿∿∿∿∿ — Today │
│ ○ Sneha T. ∿∿∿*∿∿∿ Grammar Today │
│ ○ ... │
└──────────────────────────────────────────────────┘

Red-flag section visually distinct — slightly different border treatment (alert-rust, dashed instead of hairline) so it reads as a warning panel without needing an icon-heavy banner. Below it, the full roster as tight 4px-radius rows — a real table, not cards. This is the one screen allowed to feel dense.

Teacher — Reports (/reports)

One-click per student: generates the waveform-led PDF/WhatsApp image. Preview pane shows exactly what the parent receives. Copy on the button says "Send to parent," not "Export" — name the action by what the teacher is actually doing.

6. Components

Button (primary): signal-teal fill, ink-950 text, 12px radius (student) / 4px radius (teacher), no shadow. Hover: brighten fill 8%.

Button (secondary): transparent, border-hairline, text-primary. Hover: border becomes text-secondary.

Status dot: 8px circle — teal (on track), amber (needs nudge), rust (flagged). Used in teacher rows only, never decoratively.

Channel strip row (teacher): fixed-height, mono numbers right-aligned, name + status dot left-aligned, inline waveform thumbnail center.

Waveform component: single shared component, props for mode: "live" | "result" | "thumbnail", reused across every screen in §3.

Icons: lucide-react, used only where a word would be ambiguous (back, play, stop, send). No icon next to every label — that's icon soup. Most rows need zero icons.

7. Copy & Voice

Write from the student/teacher's side of the screen: "Record your answer," not "Initiate recording session."

Active voice, consistent verbs through a flow: if the button says "Send to parent," the confirmation says "Sent to parent" — never "Submitted" or "Done."

No filler praise ("Amazing!", "You're crushing it!"). Feedback is specific: name what happened and what to do about it.

Empty states are instructions, not mascots: a new student's /progress page says "No attempts yet — your first recording will show up here," not an illustration of a sad robot.

No emoji in the product UI. Emoji-as-icon is a generic-AI tell.

8. Technical Build Constraints

Stack: React + Vite, Tailwind CSS (use the tokens above as custom theme values, not default Tailwind palette/radius), lucide-react for icons.

PWA: installable, manifest theme-color = #100E0C, "Add to Home Screen" prompt on student first login (this is the actual install funnel — institute shares a link via WhatsApp).

Layout: student routes mobile-first (max-width ~480px container, centered on larger screens); teacher routes desktop-first (full-width tables, usable down to tablet, not optimized below that).

Accessibility: visible keyboard focus rings in signal-teal, all color-coded status also has a text/shape difference (not color alone — colorblind-safe), prefers-reduced-motion respected per §2.

Auth: single login, role field on user determines which route tree renders. No separate apps, no separate deploys.

9. Explicitly Avoid

Purple/violet/indigo gradients. Glassmorphism. Circular percentage rings as the default progress visual. Floating 3D blobs or abstract shapes. An icon next to every single label. Numbered 01/02/03 section markers (nothing here is a real numbered sequence). Pure black/pure white. Inter used for everything with no display pairing. Bounce or confetti micro-animations. Generic AI copy ("Unlock your potential," "Empower your journey," "Your AI-powered companion"). Badge/pill overuse for things that aren't actually states.

10. Build Instruction (paste this part as the literal prompt)

Build a React + Vite + Tailwind PWA called Tarang, a spoken-English coaching app with two roles (student, teacher) sharing one codebase and one login, role-based routing. Follow the design token system, typography, signature waveform component, screen layouts, copy voice, and "explicitly avoid" list defined in this brief exactly — do not substitute default Tailwind colors, default radius, or generic SaaS dashboard patterns. Start by building the shared design system (tokens, Button, Card, the Waveform component in its three modes) before building individual screens. Build the student Recording Session screen and the teacher Dashboard Overview screen first — these are the two screens that prove out the signature element and the console-vs-mic-deck layout split. Match complexity to the vision: the student surfaces should feel calm and uncluttered, the teacher surfaces should feel dense and fast to scan — do not make them visually consistent in density, only consistent in token system.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
