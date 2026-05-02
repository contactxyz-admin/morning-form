---
title: "feat: Align home-page branding with the /demo voice"
type: feat
status: active
created: 2026-05-02
---

## Problem

The marketing home (`/`) and the public `/demo` walkthrough use different brand registers. User feedback: the home page should match the demo's branding.

| Surface | Wordmark | Nav | Eyebrow / footer chips | Voice |
|---------|----------|-----|------------------------|-------|
| `/` (home, [src/app/page.tsx](src/app/page.tsx)) | `<Wordmark variant="inline" size="md">` — SVG dot-cluster mark + sans-extrabold "Morning Form" | sans-serif body links (How it works, Members, See a demo, Sign in) | Pill: "Now in private beta · UK" | Bold, marketing-led |
| `/demo` ([src/app/demo/layout.tsx](src/app/demo/layout.tsx)) | Text-only `font-display font-light text-subheading -tracking-[0.02em]` "Morning Form" | mono uppercase `text-[10px] tracking-[0.14em]` tab links | mono-upper chip: "Synthetic demo" / "Synthetic data — no real patient" | Quiet, editorial |

The demo's voice is the one to converge on — restrained typography, mono-uppercase eyebrows, no logo mark.

## Scope Boundaries

- **In scope:**
  - Header: replace `<Wordmark variant="inline">` with the demo's text-only "Morning Form" treatment
  - Header nav: switch the four nav links from sans-serif body to mono-uppercase tabs (mirroring `DemoTab`)
  - Hero "private beta · UK" pill: keep the message, restyle as a mono-uppercase eyebrow line so it speaks the demo voice
  - Footer: replace `<Wordmark variant="lockup" size="lg">` with text-only treatment
  - Footer nav (Privacy, Safety & clinical, Contact): switch from sans-serif body to mono-uppercase
  - "© 2026 Morning Form" treatment — keep the mono caption look already used on the demo footer

- **Out of scope:**
  - Restyling section heads (`text-display`, `text-[2rem] font-semibold`) — these are content, not branding chrome
  - Changing the imagery rail, "Why it pays", "How it works", testimonial cards — content layout untouched
  - Deleting `<Wordmark>` from the codebase — keep the component (may resurface for favicon, social share, or product chrome). Just stop using it on the home page.
  - Authed `/(app)/...` surfaces — different audience, different chrome problem
  - Updating the `<DemoTab>` pattern itself — already the source of truth, reuse if practical

## Origin

User feedback: *"change the branding on the home page here https://morning-form.vercel.app/ to the branding here https://morning-form.vercel.app/demo"*. The demo branding was polished separately as part of the synthetic-persona work; the home page predates it and is now visibly out of register.

## Implementation Units

### U1 — Replace Wordmark + sans-nav with the demo's editorial chrome

**Goal:** `/` uses the same wordmark treatment, mono-uppercase tabs, and mono-uppercase eyebrow chips as `/demo`.

**Files:**
- [src/app/page.tsx](src/app/page.tsx) — only file touched

**Approach:**

Header swap — current top of page.tsx:
```tsx
<Link href="/" aria-label="Morning Form — home" className="-m-1 p-1">
  <Wordmark variant="inline" size="md" />
</Link>
<nav className="flex items-center gap-8 text-[0.8125rem] text-text-secondary">
  <Link href="#how" ...>How it works</Link>
  <Link href="#proof" ...>Members</Link>
  <Link href="/demo" ...>See a demo</Link>
  <Link href="/sign-in" ...>Sign in</Link>
</nav>
```

Replace with the demo's pattern (verbatim from [src/app/demo/layout.tsx:31-49](src/app/demo/layout.tsx#L31-L49) and [src/components/demo/demo-tab.tsx](src/components/demo/demo-tab.tsx)):
```tsx
<Link
  href="/"
  className="font-display font-light text-subheading -tracking-[0.02em] text-text-primary"
>
  Morning Form
</Link>
<nav className="flex items-center gap-6">
  {NAV.map((t) => <HomeNavLink key={t.href} {...t} />)}
</nav>
```

Where each link uses the same class string the `<DemoTab>` inactive-state uses: `font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring`. No `usePathname` is needed — the home page is one route, no active state.

**Hero eyebrow swap** — current:
```tsx
<span className="chip-soft">
  <span className="chip-soft-dot" />
  <span>Now in private beta · UK</span>
</span>
```

Replace with the demo's eyebrow pattern (mirrors *"The persona — 38 yo, mild metabolic syndrome"* on `/demo`):
```tsx
<p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
  Now in private beta · UK
</p>
```

**Footer swap** — current `<Wordmark variant="lockup" size="lg" />` becomes the same text-only treatment, sized for the footer (use `text-heading` or keep `text-subheading` to match the demo footer's restraint). Footer nav links use the same mono-uppercase class string. The "© 2026 Morning Form" copyright keeps its existing caption styling.

**Patterns to follow:**
- [src/app/demo/layout.tsx](src/app/demo/layout.tsx) — header + tab + footer treatment
- [src/components/demo/demo-tab.tsx](src/components/demo/demo-tab.tsx) — inactive-state class string is the right baseline for the home nav

**Test scenarios:**
- `/` server-renders cleanly (no client-component leak; the home page stays an RSC)
- The Wordmark SVG mark is gone from `/`'s rendered DOM
- The header nav contains four mono-uppercase links (How it works, Members, See a demo, Sign in) — matches the demo's nav class string
- The hero eyebrow "Now in private beta · UK" renders as font-mono uppercase, not as a chip-soft pill
- The footer renders text-only "Morning Form" wordmark (no SVG `<svg>` from the dot-cluster mark in the footer)
- Existing imagery rail, "Why it pays", "How it works", testimonial blocks, final CTA section — all untouched

**Verification:** `next build` clean; visual diff between `/` and `/demo` headers shows the same wordmark + nav register; Playwright smoke confirms no `<svg>` from the wordmark mark exists on the home page.

## Requirements Trace

| ID | Requirement | Implementation Unit |
|----|-------------|---------------------|
| R1 | Home-page wordmark matches `/demo`'s text-only `font-display font-light` treatment | U1 |
| R2 | Home-page nav uses the same mono-uppercase class string as `<DemoTab>` (inactive state) | U1 |
| R3 | Hero eyebrow uses the demo's mono-uppercase voice, not a chip pill | U1 |
| R4 | Footer wordmark + nav match demo register | U1 |
| R5 | Existing content layout (hero, sections, testimonials, CTAs) is unchanged | U1 — out of scope language |
| R6 | `<Wordmark>` component is preserved for future use, just unused on home page | U1 |

## Risks

- **Visual regression on the home page hero.** The chip-soft pill is a designed primitive used elsewhere — confirm it's not load-bearing for any other home-page surface (it isn't, per quick grep, but check before deleting).
- **Brand drift the other way.** If the home page's bolder voice was a deliberate marketing choice, this aligns it down to the demo register. User explicitly asked for this; capture it as the new direction.
- **`Wordmark` looks abandoned.** Keeping the component without callers is fine for one quarter; flag for removal if no caller arrives.

## Confidence Check

- Plan depth: **Lightweight** — single file, single visual pass, zero data/architecture changes.
- The reference patterns are already in the codebase (demo/layout.tsx, demo-tab.tsx) — no design invention needed.
- All requirements trace to the same implementation unit; no sequencing concern.
