# SparkDeck — Accessibility Audit (WCAG 2.1 AA)

Reviewed from source (github.com/teknoflame/SparkDeck) plus the live site, by Quinton's AI assistant. Scope: `index.html`, `styles.css`, `app.js`. This is a strong, accessibility-first build — most of the hard stuff is already done right. Items are grouped as **Already solid**, **Fix**, and **Verify**.

---

## Already solid (keep it this way)

- **Landmarks**: `<main>`, `<nav>`, `<header>` present. Screen reader users can jump by region.
- **Tabs**: proper `role="tablist" / tab / tabpanel` with `aria-selected` and `aria-current`. This is the correct ARIA tabs pattern, not a fake one.
- **Dialogs**: modals use `role="dialog"` + `aria-modal`. Good.
- **Forms**: 23 `<label>`s all wired to controls via `for`/`id`, plus `aria-labelledby` and `aria-describedby` where needed. Toggles expose state with `aria-pressed`.
- **Live regions**: 7 `aria-live` regions and `role="status"`/`role="alert"`. Exactly what a screen-reader-first app needs to announce changes.
- **Keyboard**: `keydown` handling with Escape (close), Arrow keys (navigation), and ~35 `focus()` calls — real focus management, not tab-order-by-accident.
- **Focus indicators**: 36 `:focus` rules and `outline` usage — focus is visible.
- **Motion**: a `prefers-reduced-motion` media query is honored, plus a manual Reduced Motion toggle.
- **Contrast**: a dedicated high-contrast mode (61 rules) and font-size controls.
- **Language**: `<html lang>` is set.
- **Images**: none, so no missing-alt debt.

---

## Fix

- [ ] **Skip link** (WCAG 2.4.1 Bypass Blocks). No "skip to main content" link yet. Add one as the very first focusable element, visually hidden until focused, targeting `#main`. *(You said this is already on the way — good.)*
- [ ] **Multiple `<h1>`s** (WCAG 1.3.1). The page has three `h1`s. Use exactly one `h1` per view, with `h2`/`h3` nesting under it, so the heading outline reads cleanly. If the three are separate SPA views that are never shown at once, confirm only the active view's `h1` is in the accessibility tree (the others should be hidden, not just visually offscreen).

---

## Verify (likely fine, worth a manual check)

- [ ] **Color contrast** (WCAG 1.4.3, 4.5:1 text / 3:1 large + UI). Can't confirm ratios from code alone. Run the default and dark themes through a contrast checker, including button text, placeholder text, and the focus outline against its background.
- [ ] **`:focus` vs `:focus-visible`**. You use `:focus`. Consider `:focus-visible` so mouse users don't get outlines but keyboard users always do — keeps the visible-focus win without the "why is there a box" complaints.
- [ ] **`prefers-contrast`**. You have a manual high-contrast toggle (great). Optionally also respond to the OS `prefers-contrast: more` media query so it turns on automatically for users who set it system-wide.
- [ ] **Dialog focus management** (WCAG 2.4.3, 2.1.2). Confirm each modal: moves focus into the dialog on open, traps Tab within it while open, closes on Escape, and returns focus to the element that opened it on close.
- [ ] **Live region politeness**. Check that status updates use `aria-live="polite"` and only true errors/interruptions use `role="alert"` / `assertive`, so announcements don't stomp on each other.
- [ ] **Form errors** (WCAG 3.3.1 / 3.3.3). On a bad login or empty required field, make sure the error is programmatically tied to the field (`aria-describedby` / `aria-invalid`) and announced, not just shown in color.
- [ ] **Reflow / zoom** (WCAG 1.4.10, 1.4.4). Check it holds up at 200% zoom and 320px width with no horizontal scrolling or clipped content.

---

## For the multipage version (when you get there)

- Keep the **same landmark structure and nav** on every page so the layout is predictable.
- On navigation, **move focus to the new page's `h1`** (or a top-of-content target) and update the document `<title>` per page, so screen reader users know the page changed.
- Reuse the **skip link** on every page.
- Give each page a **unique, descriptive `<title>`** (WCAG 2.4.2).

---

Net: this is already more accessible than the large majority of shipped web apps. The only true gaps are the skip link and the single-`h1`-per-view cleanup; the rest is verification. Nice work.
