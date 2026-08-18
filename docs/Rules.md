# Rules.md
## Coding Standards & Constraints

---

## 1. Vanilla JS Conventions

- **ES6+ modules only**: every file is a native ES module (`type="module"` in `index.html`), using `import`/`export` — no global namespace pollution, no bundler-specific syntax (unless a build step is explicitly introduced for Tailwind purging).
- **Async/await over `.then()` chains** for all Firestore and Auth calls; wrap in `try/catch` at the call site closest to the user-facing action (e.g., inside the submit handler, not buried in `db.js`), so error messages can be contextual.
- **No implicit globals**: state lives in module scope or is passed explicitly; avoid attaching data to `window` except for the one-time Firebase app instance if genuinely needed across modules that can't `import` it directly.
- **Pure functions where possible**: formatting helpers (duration `mm:ss`/`hh:mm:ss`), date-bucketing for charts, and reset-boundary calculations should be pure, unit-testable functions with no side effects — isolated from DOM/Firestore code.
- **Naming**: `camelCase` for functions/variables, `PascalCase` only for constructor-like factory functions (rare in this codebase), files `kebab-case.js` or matching the module name (`db.js`, `timer.js`).
- **Duration formatting contract** (single source of truth, used by both live timer and historical logs):
  ```js
  function formatDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  ```

## 2. Semantic HTML Guidelines

- Zero unsemantic `<div>`/`<span>` soup where a semantic element applies:
  - `<header>` for the app bar, `<nav>` for breadcrumb/routing chrome, `<main>` for the single primary content region per view.
  - `<article>` for each self-contained card (category card, checklist card).
  - `<section>` for logically distinct groupings within a view (e.g., the analytics panel gets its own `<section aria-label="...">`).
  - `<ul>`/`<li>` for the task list — never a `<div>`-based fake list.
  - `<dialog>` (native) for all modals — never a hand-rolled overlay `<div>` with manual focus-trap JS.
- `<div>`/`<span>` are reserved strictly for styling hooks that have no semantic meaning (e.g., a decorative color-accent circle, a flex layout wrapper).
- Every interactive icon-only control has an `aria-label` describing its action **and target** (e.g., `aria-label="Delete checklist: Daily Study"`), not just a generic label.
- Form inputs always have an associated `<label>` (visually hidden via `sr-only` if the design calls for placeholder-only visual style — never label-less).

## 3. Tailwind CSS Utility Rules

- **Palette enforcement**: only the four pastel families defined in `Design.md §1.1` (lavender/mint/peach/butter) plus the canvas/surface/slate neutrals may be used for themable UI — no ad hoc arbitrary hex values (`bg-[#123abc]`) introduced outside the design tokens without updating `Design.md` first.
- **Responsive prefixes required**: any layout-affecting utility (grid columns, flex direction, padding that changes by breakpoint) must be expressed mobile-first with explicit `sm:`/`lg:` prefixes rather than relying on a single fixed layout — per `Design.md §4`.
- **Rounded corners**: `rounded-2xl` on all card/modal surfaces, `rounded-full` on pills/badges/circular controls — no other radius values introduced for primary surfaces.
- **Shadows**: `shadow-sm` default, `shadow-md` only as a hover/active state — never stacking heavier shadow utilities, to preserve the flat/minimal aesthetic.
- **No inline `style=""` attributes** for anything expressible in Tailwind utilities; inline styles are reserved only for genuinely dynamic values Tailwind can't express statically (e.g., a chart's computed pixel height passed from JS).

## 4. Performance Constraints

- **Zero heavy dependencies**: no SPA framework (React/Vue/etc.), no state-management library, no CSS-in-JS, no icon-font megabundle — hand-authored SVG icons or a minimal curated icon set only. The only runtime dependencies are Tailwind CSS, Chart.js, and the Firebase JS SDK.
- **Bundle size discipline**: if a build step is introduced (for Tailwind purge or SDK tree-shaking), target a total initial JS payload under ~150KB gzipped, excluding the Firebase SDK's own footprint (which is tree-shaken to only the `app`/`auth`/`firestore` modules actually used — no `firebase/analytics`, `firebase/storage`, etc. unless a future feature needs them).
- **Lazy-render charts**: Chart.js and the analytics panel's data-fetch only initialize when a checklist with `graphEnabled: true` is actually scrolled into view / the checklist detail view is mounted — never pre-fetch or pre-render charts for checklists the user hasn't opened.
- **Real-time listener discipline**: `onSnapshot` subscriptions are scoped to the active view only and explicitly unsubscribed on route change/teardown (`TechSpec.md §4`) — never leave stale listeners accumulating across navigation, which silently degrades performance and read-quota usage over a session.
- **Debounce writes**: rapid-fire interactions (e.g., dragging to reorder tasks) batch into a single Firestore write on drag-end rather than one write per intermediate position.
