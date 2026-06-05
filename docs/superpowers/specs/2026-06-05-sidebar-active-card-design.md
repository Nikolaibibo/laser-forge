# Sidebar Refactor: Active Card + Generator Overlay

**Date:** 2026-06-05
**Status:** Approved (design review with Nikolai)

## Problem

The left sidebar grew organically and is no longer user-friendly:

- `GeneratorPicker` renders all 16 generators (3 groups) as always-expanded
  two-line buttons (~800–900 px). The PIPELINE section (`LayerStack`) is
  pushed below the fold — reaching the distortion layers requires scrolling
  past 15 generators that are not in use.
- The active generator is not visible at a glance; its highlight is buried
  somewhere in the list.
- Section hierarchy is inconsistent: a stray "BASE" label, MOTIF, generator
  group headers, and PIPELINE use three different header styles.

Workflow reality (confirmed): generator switching is rare — pick one, then
tune parameters/pipeline for a long time. The full list may live behind one
click.

## Solution

### 1. `GeneratorPicker` — two states

**Collapsed (default):** a single card showing the active generator:

- generator name (bold), group title, one-line description (ellipsized)
- a ⇄ glyph as change affordance; the whole card is clickable

**Open:** clicking the card opens the existing grouped list as an **overlay
covering the entire sidebar** (absolutely positioned, own vertical scroll).

- The current list rendering (group headers + two-line buttons with
  description) is reused 1:1 inside the overlay — vertical space is free there.
- The active entry is highlighted and scrolled into view on open.
- Selecting an entry sets the generator and closes the overlay.
- The overlay also closes on `Esc` and on click outside.

### 2. `App.tsx` — reorder + hierarchy fix

New sidebar order, top to bottom:

1. Header (unchanged)
2. **GENERATOR** section: active card, with `MotifPanel` directly below
   (still rendered only while the blueprint generator is active)
3. **PIPELINE** section: `LayerStack` (logic unchanged, only position)
4. Flex spacer + footer (unchanged)

The orphaned "BASE" label is removed. All section headers use one shared
style: 11 px, bold, letter-spaced caps — the style PIPELINE already uses.

### 3. Non-goals / unchanged

- No new store state — overlay open/closed is local `useState`.
- No URL-sync (`urlSync.ts`) changes.
- No new dependencies; inline styles as in the rest of the codebase.
- Right Leva parameter panel untouched.
- `LayerStack` internals untouched.

## Error handling

Purely presentational change; no new failure modes. Parse/upload error
display in `MotifPanel` is unchanged.

## Testing

- Existing automated checks: lint + build must stay green. Existing unit
  tests are unaffected (no logic changes).
- Manual browser check: card shows active generator; overlay opens/closes
  (click, select, `Esc`, click-outside); pipeline visible without scrolling;
  MOTIF appears only for blueprint.

## Affected files

- `src/ui/GeneratorPicker.tsx` — rewrite (card + overlay)
- `src/App.tsx` — sidebar reorder, remove "BASE" label, unify section headers
