---
name: Anova4All
description: Remote control for abandoned Anova Precision Cooker Wi-Fi
colors:
  steel: "#f6f2ee"
  steel-deep: "#efe9e3"
  rail: "#ddd3ca"
  rail-hi: "#ece4dc"
  paper: "#fffdfb"
  well: "#f4eee8"
  ink: "#1d1814"
  ink-soft: "#776b61"
  heat: "#c25429"
  heat-hi: "#e8834a"
  heat-ink: "#fffdfb"
  glow: "rgb(214 108 58 / 0.2)"
  steel-dark: "#110e0c"
  steel-deep-dark: "#0c0a08"
  rail-dark: "#3a322b"
  rail-hi-dark: "#2a241f"
  paper-dark: "#1a1613"
  well-dark: "#231e1a"
  ink-dark: "#f4ede6"
  ink-soft-dark: "#a89b90"
  heat-dark: "#e57f4c"
  heat-hi-dark: "#f2a26c"
  heat-ink-dark: "#1a1613"
  glow-dark: "rgb(240 140 80 / 0.14)"
typography:
  display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(4rem, 10vw, 6rem)"
    fontWeight: 200
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeatureSettings: "'ss01', 'tnum'"
  heading:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
    textTransform: "uppercase"
rounded:
  base: "0.875rem"
  card: "1.75rem"
  button: "624rem"
  stepper: "1.1rem"
  stepper-key: "0.9rem"
spacing:
  card-padding: "1rem"
  card-padding-lg: "2rem"
  stack-sm: "0.5rem"
  stack-md: "0.75rem"
  stack-lg: "1.5rem"
components:
  button-default:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
    padding: "0 1.25rem"
    height: "2.75rem"
  button-heat:
    backgroundColor: "linear-gradient(to bottom right, {colors.heat-hi}, {colors.heat})"
    textColor: "{colors.heat-ink}"
    rounded: "{rounded.button}"
    padding: "0 1.75rem"
    height: "3.5rem"
  switch-checked:
    backgroundColor: "linear-gradient(to bottom right, {colors.heat-hi}, {colors.heat})"
    rounded: "{rounded.button}"
    width: "3.125rem"
    height: "1.875rem"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "1rem"
---

# Design System: Anova4All

## Overview

**Creative North Star: "Copper Ring"**

Warm porcelain and reserved copper. The app is a native-feeling cooker remote where the temperature is always the hero—the largest number on the screen, feather-light Geist numerals in tabular style. The ground is warm porcelain steel (`--steel`), soft white cards have hairline borders, and copper (`--heat`) is reserved for "heating now": the state dot, the temperature arc on the dial, and the Stop button. Success states are quiet; there is no celebration.

The design serves owners of an abandoned first-generation Anova sous-vide cooker, many of them strangers finding the project after the official app shut down. They need to see at a glance that the cooker is online, heating, and doing what they asked. Light and dark themes follow the system setting. Celsius and Fahrenheit are both first-class.

**Key Characteristics:**
- Copper means heat/active only
- One dominant number per screen (the water temperature)
- Fits one screen; no scrolling on the cook screen
- Quiet success, no confetti or celebration
- Light and dark themes with identical structure

## Colors

The palette is warm and tactile: soft porcelain grounds, copper for heat, ink for text. Dark mode is a kitchen display at night—charcoal cards with paper-white ink.

### Primary
- **Copper** (`#c25429` / dark: `#e57f4c`): Used only for "heating now." Appears as the state dot with a soft glow, the gradient arc on the dial, and the Stop button gradient. Its rarity is the signal.
- **Copper Highlight** (`#e8834a` / dark: `#f2a26c`): The lighter end of the copper gradient.

### Neutral
- **Steel** (`#f6f2ee` / dark: `#110e0c`): The page ground, a warm porcelain in light mode, deep charcoal in dark.
- **Steel Deep** (`#efe9e3` / dark: `#0c0a08`): Slightly darker steel for subtle layering.
- **Paper** (`#fffdfb` / dark: `#1a1613`): Cards and elevated surfaces. Soft white in light, warm near-black in dark.
- **Well** (`#f4eee8` / dark: `#231e1a`): Inset controls like steppers, toggle groups, and segments.
- **Rail** (`#ddd3ca` / dark: `#3a322b`): Unchecked switches, inactive segments, dividers.
- **Rail Highlight** (`#ece4dc` / dark: `#2a241f`): Hairline borders on cards, the track on the dial. The thinnest visible line.
- **Ink** (`#1d1814` / dark: `#f4ede6`): Body text, icons, default buttons.
- **Ink Soft** (`#776b61` / dark: `#a89b90`): Secondary text, labels, icons in muted state.
- **Glow** (`rgb(214 108 58 / 0.2)` / dark: `rgb(240 140 80 / 0.14)`): The soft copper radial gradient at the top of the page and around the heating state dot.

### Named Rules
**The Copper-Only Rule.** Copper (`--heat`) is used for active heating state only. It never means "primary action" or "selected" outside the heating context. Start buttons are ink, not copper.

## Typography

**Primary Font:** Geist Variable (100–900) with system fallback
**Character:** A contemporary geometric sans, technically neutral but warm in its lighter weights. The extralight numerals (200) give the water temperature a precise, instrument-like quality. Small caps labels (`letter-spacing: 0.08em`) separate sections without adding visual weight.

### Hierarchy
- **Display** (200, 4–6rem fluid, line-height 1, tracking -0.04em, tabular-nums): The water temperature. Extralight weight makes large sizes feel precise, not heavy.
- **Heading** (500, 1.875rem, line-height 1.15, tracking -0.03em): Page titles and cooker names. Medium weight, slightly condensed.
- **Body** (400, 0.9375rem, line-height 1.5, normal tracking): All running text, button labels, form fields. Sized at 15px base (16px actual in inputs to prevent iOS zoom).
- **Label** (500, 0.6875rem, line-height 1.2, tracking 0.08em, uppercase): Section headers, field captions. Quiet small caps.

### Named Rules
**The Tracking Floor Rule.** No letter-spacing tighter than `-0.04em`. Display numerals sit at exactly `-0.04em` (not `-0.05em`). Tighter tracking compresses the glyphs beyond Geist's comfortable range.

**The Tabular Numerals Rule.** All numbers—temperatures, timers, minutes—use `font-variant-numeric: tabular-nums` so digits align vertically and don't shift width when values change.

**The Stylistic Set Rule.** `font-feature-settings: 'ss01'` is enabled globally for Geist's alternate single-story `a`, which reads more clearly at small sizes.

## Layout

**Spatial model:** A single-column stack on phones (390px–640px), two-column on desktop above 640px. The cook screen is one card, rounded-[1.75rem] (28px), with a 270° dial on the left and controls on the right at desktop widths. Everything fits one screen; the cook screen never scrolls.

**Container:** `max-w-5xl` (80rem / 1280px) centered with `px-4 sm:px-6` horizontal padding.

**Phone (390px default):** Bottom tabs (56px high) with safe-area-inset-bottom. Top bar is slim (44px notch + 48px navigation). The dial is `max-w-[14.5rem]` on phones, `max-w-[22rem]` on desktop.

**Desktop (1440px):** Two-column cook screen grid: `sm:grid-cols-[1fr_minmax(0,22rem)]`. The dial column is fluid up to 22rem; the controls column is fixed. Top navigation becomes a horizontal pill segment in a well.

**Spacing rhythm:** `gap-2` (0.5rem), `gap-3` (0.75rem), `gap-8` (2rem) for card internal grids. Cards are spaced with `gap-3` in their parent stack.

## Elevation & Depth

Flat by default. Depth is one declaration: the `shadow-ticket` token, whose first layer is the 1px hairline ring (`0 0 0 1px var(--rail-hi)`).

### Shadow Vocabulary
- **Ticket Shadow** (`0 1px 0 rgb(255 255 255 / 0.7) inset, 0 1px 2px rgb(60 30 10 / 0.05), 0 24px 48px -32px rgb(60 30 10 / 0.3)` / dark: `0 1px 0 rgb(255 255 255 / 0.03) inset, 0 24px 48px -28px rgb(0 0 0 / 0.7)`): The only elevation. Inset highlight, close contact shadow, and a deep ambient glow. Applied to cards, dialogs, and the cook screen.

### Named Rules
**The One-Elevation Rule.** An elevated surface (card, dialog, toast) declares `shadow-ticket` and nothing else; the hairline lives inside that token, so never add `border border-hairline` to the same element. Flat surfaces inside a card use a `border-hairline` divider or a `bg-well` fill, not a shadow.

## Shapes

**Form language:** Generous rounded corners—28px on cards, full-round on buttons and switches, 14–18px on inset wells and fields. The dial is a 270° arc open at the bottom, rotated 135° so the arc starts at the lower left and sweeps clockwise.

**Corner radii:**
- **Base** (`0.875rem` / 14px): Default for small elements, toggles, badges.
- **Card** (`1.75rem` / 28px): Cards, dialogs, the cook screen panel, alert dialogs.
- **Button** (`624rem` / full-round): Buttons, switches, pills, segmented controls.
- **Stepper** (`1.1rem` / 17.6px): The stepper well background.
- **Stepper Key** (`0.9rem` / 14.4px): The paper +/− keys inside the stepper.

**The dial:** A 270° SVG arc (75% of a circle) at `r="88"` in a 200×200 viewBox. Three layers: a faint hairline track, a stronger rail up to the target, and a copper arc for the water temperature while heating. The target is a paper knob with a 3px ring—copper while heating, ink when idle, rail when disabled—with no drop shadow. Focus ring is ink.

## Components

Components are purpose-built for the cook screen and share the warm porcelain + copper material language.

### Dial
- **Shape:** 270° arc open at the bottom, `max-w-[14.5rem]` on phones, `max-w-[22rem]` on desktop. The knob is a 24px circle (6px visible, 3px border) on the ring's edge.
- **Colors:** Track in `--rail-hi`, passive fill in `--rail`, copper gradient (`url(#dial-heat)`) while heating. The knob is `--paper` with a 3px ring—copper while heating, ink when idle, rail when disabled—and no drop shadow. Focus ring is ink.
- **Interaction:** Draggable by the knob or anywhere on the ring. Arrow keys step by 0.5°C / 1°F. Haptic tap on change (`navigator.vibrate?.(5)`).
- **States:** Disabled (can't edit while offline or during a command), dragging (knob scales to 110%, number shows the target in copper).
- **Motion:** The water arc animates with a 700ms ease-out transition. Reduced motion makes it instant.

### Stepper (−  value  +)
- **Shape:** Rounded-[1.1rem] well (`--well`), 56px high, with paper keys (rounded-[0.9rem], 44px square) on each side and the value centered.
- **Colors:** Well background, paper keys with hairline borders.
- **Value display:** Typeable input, `1.625rem` light weight, `-0.03em` tracking, `tabular-nums`. The unit (°C, °F, min, h) sits as a superscript to the right. At rest the timer reads "9 min" or "1:30 h"; while typing it switches to HH:MM digits.
- **Disabled state:** Entire stepper at 60% opacity.

### Unit Toggle (°C / °F)
- **Shape:** Horizontal pill sitting in the dial's bottom gap, `h-8` (32px) × `w-24` (96px), rounded-full. Radix RadioGroup with a sliding `--paper` thumb that translates between the two options.
- **Colors:** `--well` background with inset hairline ring (`shadow-[inset_0_0_0_1px_var(--rail-hi)]`). Unselected labels are `--ink-soft`, selected is `--ink`. Thumb is `--paper` with contact shadow in light mode, `--rail` with stronger shadow in dark.
- **Interaction:** Switches between Celsius and Fahrenheit. Thumb slides with 180ms ease-out transition. Presses in the dial's bottom gap beside the pill are ignored by angle (`pressAction`); the pill itself is excluded from the dial's pointer handling.

### Buttons
- **Shape:** Full-round (pill), 44px default height, 56px large.
- **Primary (Start):** `--ink` background, `--paper` text. Hover: 88% opacity.
- **Heat (Stop):** Copper gradient (`linear-gradient(to bottom right, var(--heat-hi), var(--heat))`), `--heat-ink` text. Hover: 105% brightness. Only shown while heating.
- **Outline:** `--paper` background, `--rail` border, `--ink` text. Hover: `--well` background.
- **Secondary:** `--well` background, `--ink` text. Hover: `--rail-hi` background.
- **Ghost:** Transparent, `--ink` text. Hover: `--well` background.

### Switch
- **Shape:** Full-round track, 50px wide × 30px tall. Thumb is 24px diameter, translates 20px on check.
- **Unchecked:** `--rail` background, white thumb.
- **Checked:** Copper gradient background, thumb moves right.
- **Disabled:** 45% opacity.

### Cards
- **Shape:** Rounded-[1.75rem], `--paper` background, `shadow-ticket` (which carries the hairline ring).
- **Padding:** 16px on phones, 32px on desktop (`p-4 sm:p-8`).
- **The cook screen card:** Contains the dial and controls. On desktop it's a two-column grid: `sm:grid-cols-[1fr_minmax(0,22rem)]`.

### State Dot
- **Size:** 8px diameter, full-round.
- **Idle:** `--ink-soft` at 50% opacity.
- **Offline:** `--rail`.
- **Heating:** `--heat` with a 4px soft glow (`box-shadow: 0 0 0 4px color-mix(in oklab, var(--heat) 18%, transparent)`).

### Auto-stop Field
- **Layout:** Label on the left, switch on the right, 44px min-height, `px-1` padding.
- **Label:** Two lines—title (15px medium) and explanation (13px soft). Disabled when no timer is set ("Set a timer first").
- **Switch:** Standard switch component (see above).

### Toast
- **Shape:** Full-round pill, `--paper` background, shadow, positioned bottom-center with 28px clearance.
- **Content:** Icon + text, 14.5px font, 44px height.
- **Entrance:** Slides up 16px and fades in over 500ms with `cubic-bezier(.3,.7,.2,1)`. Reduced motion makes it instant.

## Do's and Don'ts

Concrete guardrails grounded in the implemented system.

### Do:
- **Do** use copper (`--heat`) only for "heating now"—the state dot, the dial arc, the Stop button. Never for "primary action" outside that context.
- **Do** keep the water temperature the largest number on the screen, at 64–96px (4–6rem fluid), extralight weight (200), `-0.04em` tracking, `tabular-nums`.
- **Do** let `shadow-ticket` carry a card's edge and depth in one declaration; use `border-hairline` only for dividers and flat insets.
- **Do** set all number displays to `font-variant-numeric: tabular-nums` so digits don't shift width.
- **Do** size form inputs at 16px actual (`font-size: 16px` or `font-size: max(16px, 1em)`) to prevent iOS zoom on focus.
- **Do** follow the tracking floor: no `letter-spacing` tighter than `-0.04em`.
- **Do** use `@media (prefers-reduced-motion: reduce)` to make all animations instant (`animation-duration: 0.01ms`, `transition-duration: 0.01ms`).
- **Do** give buttons a press-down effect (`transform: scale(0.97)` on `:active`) for a native feel.

### Don't:
- **Don't** use copper for anything except "heating now." Start buttons are ink, not copper.
- **Don't** add confetti, celebration animations, or success fanfare. Success states are quiet—a plain confirmation or a small toast.
- **Don't** use unicode icons (✓, ×, ❌, ✅) or emoji. Use Lucide React icons or inline SVG.
- **Don't** use eyebrow labels (small caps labels that sit above a heading). Section labels are small caps, but they're not eyebrows.
- **Don't** combine ghost-style cards (no visible border or background) with this system. All cards have a hairline and a background.
- **Don't** set tracking tighter than `-0.04em`. The display numerals sit at exactly `-0.04em`.
- **Don't** put a border and a shadow on the same element (the ghost card). Pick the token, not both.
