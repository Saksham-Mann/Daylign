# Design.md
## UI/UX Specification & Design System

---

## 1. Design Tokens

### 1.1 Color Palette

```css
:root {
  /* Canvas & Surfaces */
  --color-canvas: #FAFAF9;      /* primary background */
  --color-surface: #FFFFFF;     /* cards, modals */
  --shadow-surface: 0 1px 2px 0 rgb(0 0 0 / 0.05); /* shadow-sm */

  /* Text */
  --color-text-primary: #1E293B;   /* slate-800 */
  --color-text-secondary: #64748B; /* slate-500 */

  /* Pastel Semantic Palette */
  --color-lavender-bg: #E0E7FF;    /* Study / Analytics */
  --color-lavender-accent: #818CF8;
  --color-mint-bg: #D1FAE5;        /* Success / Completed / Active Timer */
  --color-mint-accent: #34D399;
  --color-peach-bg: #FFE4E6;       /* Watch / Urgent */
  --color-peach-accent: #FB7185;
  --color-butter-bg: #FEF3C7;      /* Groceries / Habits */
  --color-butter-accent: #FBBF24;
}
```

**Tailwind class mapping:**

| Token | Tailwind Utility |
|---|---|
| Canvas | `bg-[#FAFAF9]` |
| Surface | `bg-white shadow-sm` |
| Lavender | `bg-indigo-100 text-indigo-500` (`#E0E7FF` / `#818CF8`) |
| Mint | `bg-emerald-100 text-emerald-500` (`#D1FAE5` / `#34D399`) |
| Peach | `bg-rose-100 text-rose-500` (`#FFE4E6` / `#FB7185`) |
| Butter | `bg-amber-100 text-amber-500` (`#FEF3C7` / `#FBBF24`) |

Category color is user-selectable from these four pastel families at creation time; the accent shade is used for icons, active timer glow, and chart series color for that category.

### 1.2 Typography Scale

| Role | Size / Weight | Tailwind |
|---|---|---|
| Page Title | 28px / 700 | `text-3xl font-bold text-slate-800` |
| Section Heading | 20px / 600 | `text-xl font-semibold text-slate-800` |
| Card Title | 16px / 600 | `text-base font-semibold text-slate-800` |
| Body | 14px / 400 | `text-sm text-slate-800` |
| Metadata / Subtext | 12px / 400 | `text-xs text-slate-500` |

Font stack: system UI stack (`font-sans` default Tailwind stack) — no custom web font load, keeping bundle minimal.

### 1.3 Spacing, Radii & Shadows

- Base spacing unit: 4px (Tailwind default scale).
- Card padding: `p-5` (20px).
- Section gaps: `gap-6` (24px) desktop, `gap-4` (16px) mobile.
- Border radius: `rounded-2xl` (16px) on all cards/modals; `rounded-full` on pills/badges and the timer button.
- Shadow: `shadow-sm` default on surfaces; `shadow-md` on hover/active for cards; no heavy drop shadows (keeps the flat, calm aesthetic).
- Borders: `border border-slate-100` — unobtrusive, near-invisible hairlines rather than heavy strokes.

---

## 2. Component Anatomy

### 2.1 Category Card
```
┌─────────────────────────────┐
│ ● Icon (pastel bg circle)   │
│                              │
│ Study                       │  <- card title
│ 3 checklists · 68% today    │  <- metadata (slate-500)
│ ▓▓▓▓▓▓▓▓░░  (mini progress) │
└─────────────────────────────┘
```
- Root: `<article>` with `rounded-2xl bg-white shadow-sm p-5 hover:shadow-md transition-shadow`.
- Icon circle uses the category's pastel `-bg` token; icon glyph uses `-accent` token.
- Tap target is the full card (`role="button"`, keyboard-focusable, `Enter`/`Space` activates).

### 2.2 Checklist Item (Task Row)
```
┌───────────────────────────────────────────┐
│ ☐  Read Chapter 4          ▶ 00:00   ⋮    │
└───────────────────────────────────────────┘
        ↓ (completed state)
┌───────────────────────────────────────────┐
│ ☑  Read Chapter 4     ✓ 24:18 logged  ⋮   │  <- strikethrough title, mint tint
└───────────────────────────────────────────┘
        ↓ (timer running state)
┌───────────────────────────────────────────┐
│ ☐  Read Chapter 4        ⏸ 04:12···   ⋮   │  <- mint pulse border, live counter
└───────────────────────────────────────────┘
```
- Checkbox: custom-styled `<input type="checkbox">` with a "celebration" micro-animation (scale bounce + mint check-mark draw) on completion — see §5.
- `⋮` opens a small popover menu: Rename, Delete, Reorder handles.
- Timer button only renders when `checklist.settings.timerEnabled === true`.

### 2.3 Active Stopwatch Widget
- Inline within the task row when running: monospace `mm:ss`/`hh:mm:ss` counter, updated via `requestAnimationFrame`-driven interval (~1s tick), mint pulsing ring (`animate-pulse` on the border, not the text, to avoid readability issues).
- Accessible live region: `aria-live="polite"` on the counter's container, but throttled to announce only on stop (not every second) to avoid screen-reader spam.

### 2.4 Analytics Container
```
┌─────────────────────────────────────────────┐
│ Analytics                     [7d] [30d]     │  <- range toggle
│                                                │
│  ▓▓▓  ▓▓  ▓▓▓▓ ▓  ▓▓▓ ▓▓▓▓ ▓▓  (bar chart)     │
│  Mon  Tue  Wed  Thu Fri  Sat  Sun             │
│                                                │
│  Avg 22m/day · 6/7 days active                │
└─────────────────────────────────────────────┘
```
- `<section aria-label="Checklist analytics">` wrapping a `<canvas>` for Chart.js.
- Two chart types depending on settings: completion-rate bar (always, if `graphEnabled`) and time-spent stacked bar (only if `timerEnabled` also true) — rendered as two stacked panels within the same container, not tabs, so both are scannable at once.
- Chart color series pulls from the checklist's category accent token for visual continuity.

### 2.5 Modal Dialogs (Creation / Settings)
- Native `<dialog>` element, opened via `.showModal()` for built-in focus trap and `Esc`-to-close.
- Backdrop: `::backdrop { background: rgb(30 41 59 / 0.4) }`.
- Layout: `rounded-2xl bg-white p-6 max-w-md w-full`, form fields stacked with `gap-4`.
- Toggle controls (Reset Mode, Timer, Graph) use a segmented-control pattern (two pill buttons side by side) rather than a raw checkbox, for clearer affordance of "either/or" state.

---

## 3. Semantic HTML5 Structure Blueprint

```html
<body class="bg-[#FAFAF9]">
  <header class="...">
    <!-- app title, user menu -->
  </header>

  <nav aria-label="Primary">
    <!-- breadcrumb: Home / Category / Checklist -->
  </nav>

  <main>
    <section aria-labelledby="hub-heading">
      <h1 id="hub-heading">Your Activities</h1>
      <div role="list" class="grid ...">
        <article role="listitem"> <!-- category card --> </article>
      </div>
    </section>

    <section aria-labelledby="checklist-heading">
      <h2 id="checklist-heading">Study Checklist</h2>
      <ul> <!-- task rows as <li> --> </ul>

      <section aria-label="Checklist analytics">
        <canvas></canvas>
      </section>
    </section>
  </main>

  <dialog id="checklist-modal" aria-labelledby="modal-title">
    <h2 id="modal-title">New Checklist</h2>
    <form method="dialog"> <!-- fields --> </form>
  </dialog>
</body>
```

- No unsemantic `div` where `<article>`, `<section>`, `<nav>`, `<ul>/<li>` apply (see Rules.md §2).
- Every icon-only button carries `aria-label` (e.g., `aria-label="Start timer for Read Chapter 4"`).

---

## 4. Responsive Breakpoints

| Breakpoint | Range | Layout |
|---|---|---|
| Mobile | `< 640px` | Single column; category cards stack full-width; modal is near-full-screen (`inset-4`). |
| Tablet | `640px – 1023px` | 2-column category grid (`sm:grid-cols-2`); checklist view retains single column with analytics below. |
| Desktop | `≥ 1024px` | 3–4 column category grid (`lg:grid-cols-3`); checklist detail can adopt a two-column layout: task list left, analytics panel pinned right (`lg:grid-cols-[1fr_360px]`). |

Mobile-first Tailwind convention throughout: unprefixed utilities target mobile, `sm:`/`lg:` progressively enhance.

---

## 5. Micro-interactions & Transitions

- **Checkbox completion**: scale-bounce (`transform: scale(1.15)` → `1`) over 200ms with an `ease-out` curve, paired with a mint background flash fading over 400ms (`transition-colors duration-400`).
- **Timer running**: task row border pulses mint (`animate-pulse` on a 2s cycle, opacity 0.6→1) to signal "live" state without being visually noisy.
- **Card hover**: `shadow-sm → shadow-md` and `translate-y-[-1px]` over 150ms.
- **Modal open/close**: native `<dialog>` combined with a CSS `@starting-style` fade/scale-in (opacity 0→1, scale 0.96→1, 150ms) for browsers that support it; graceful no-animation fallback otherwise.
- **Chart render**: Chart.js default `easeOutQuart` animation, capped at 400ms so it never feels sluggish on repeated view.

All animations respect `prefers-reduced-motion: reduce` by disabling scale/pulse transforms and falling back to instant state changes.
