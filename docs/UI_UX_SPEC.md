# UI & UX Design Specification — Tarang

## 1. Design System Philosophy

### "Waveforms, Not Vibes"

Tarang's aesthetic borrows directly from **audio engineering** (waveforms, signal meters, channel strips, studio mixing desks) rather than generic SaaS or edtech visual tropes.

### Explicitly Forbidden Patterns

- **NO** purple / violet / indigo gradients.
- **NO** glassmorphism or frosted-glass blur overloads.
- **NO** floating 3D blobs, spheres, or abstract geometric clutter.
- **NO** emoji-as-icon substitutions.
- **NO** pure black (`#000000`) or pure white (`#FFFFFF`).
- **NO** bounce or confetti micro-animations.

---

## 2. Color Palette & Functional Token System

```text
┌────────────────────┬───────────┬────────────────────────────────────────────────────────┐
│ TOKEN              │ HEX CODE  │ FUNCTIONAL ROLE                                        │
├────────────────────┼───────────┼────────────────────────────────────────────────────────┤
│ ink-950            │ #100E0C   │ Main background. Warm near-black, never cold gray.    │
│ ink-900            │ #1B1815   │ Elevated surface (cards, panels, modal dialogs).       │
│ ink-800            │ #242019   │ Hover / pressed state surface.                         │
│ border-hairline    │ #2E2A26   │ 1px universal border for elevation & structure.        │
│ text-primary       │ #EDE7DD   │ Headlines, primary body. Warm parchment-white.        │
│ text-secondary     │ #9C9388   │ Secondary metadata, labels, timestamps, units.         │
│ text-tertiary      │ #6B645A   │ Inactive tabs, placeholders, subtle captions.          │
│ signal-teal        │ #3FB8AF   │ Primary accent: brand mark, active borders, clear tags.│
│ static-amber       │ #E2A33C   │ Functional only: live recording pulse, filler markers. │
│ alert-rust         │ #C1503B   │ Functional only: red-flag alerts, severe regressions.  │
└────────────────────┴───────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Typography Hierarchy

1. **Display Font**: **Space Grotesk** (500, 600, 700)
   - Used for main headings, hero streak numbers, and brand wordmarks.
   - Letter-spacing: `-0.01em` to `-0.02em`.
2. **Body & UI Font**: **Inter** (400, 500, 600)
   - Used for body text, prompt descriptions, button labels, and tables.
3. **Measurement / Number Font**: **IBM Plex Mono** (`.num` class)
   - Used for all numerical scores, timestamps, percentages, and metrics.
   - `font-feature-settings: "tnum" 1; font-variant-numeric: tabular-nums;`

---

## 4. Dual-Radius Scale (Intentional Layout Density)

- **Student Deck Radius (`--radius-deck: 12px`)**:
  - Used on `/practice`, `/practice/:id`, `/progress`, and `/profile`.
  - Mobile-first, calm, generous touch targets (44px minimum).
- **Teacher Console Radius (`--radius-console: 4px`)**:
  - Used on `/dashboard`, `/flags`, `/reports`, and `/students/:id`.
  - Desktop-first, dense, channel-strip data tables, fast-scanning meters.

---

## 5. Waveform Component States & Visualization

1. **Live Recording Mode**:
   - Canvas-rendered vertical bars oscillating with real-time microphone input.
   - Signal-teal bars with amber pulse dot indicating active audio capture.
2. **Timeline Diagnostic Mode**:
   - Chronological segments representing speech duration.
   - Clear audio in teal (`#3FB8AF`), filler words in amber (`#E2A33C`), pauses in muted hairline (`#2E2A26`).
3. **Inline Mini-Waveform Mode**:
   - Compact 56-bar static preview in teacher roster rows.
