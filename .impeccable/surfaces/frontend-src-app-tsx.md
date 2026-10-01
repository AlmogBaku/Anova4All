---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/app.tsx"
related_targets: ["frontend/src"]
---

# Anova4All app (all signed-in and auth surfaces)

Scope: the whole SPA (setup wizard, cook screen, device list and empty state, device settings and members, auth, invite, OAuth consent, account). Mode: Operate.

Audience and job: Anova Wi-Fi 1 owners, many of them strangers, controlling a sous-vide cook from a phone in the kitchen or a desktop. Task: set temperature and timer, start or stop, and see the cooker is online. Proof: the live water temperature, large and current. Constraints: PRODUCT.md (°C/°F, light and dark from the system, quiet success, not affiliated with Anova).

## Direction contract

THESIS: A native-feeling cooker remote where the temperature is the hero—the largest number on the screen, always visible, always current. Copper means "heating now" and nothing else.

OWN-WORLD: Warm porcelain steel ground (`--steel`); soft white cards with hairline borders and a single shadow tier; copper (`--heat`) reserved for "heating now": the state dot with a soft glow, the gradient arc on the dial, and the Stop button. Feather-light Geist numerals (weight 200) for the water temperature. Dark mode is a kitchen display at night—charcoal cards with paper-white ink.

STORY: At a glance, see whether the cooker is heating, the water temperature (large, precise, tabular), and when it stops. Drag the dial or use the steppers to adjust. Start or Stop with one button in thumb reach.

FIRST VIEWPORT: Cook screen. A single rounded card (28px radius) with a hairline border. On phones: the dial at the top, controls stacked below. On desktop (≥640px): two-column grid with the dial on the left (fluid up to 22rem), controls on the right (fixed 22rem). The dial is a 270° arc open at the bottom, rotated so the sweep starts lower-left. Water temperature in the center: 64–96px, extralight, `-0.04em` tracking, tabular numerals. The state dot (8px, full-round) sits in the card header with the cooker name. Copper only appears while heating.

FORM: Copper Ring. Raises: one dominant number per screen (the temperature); copper means heat/active only (never "primary action"); quiet success (no confetti); fits one screen (no scrolling on the cook screen); hairlines + single shadow tier (not layered elevation); generous rounded corners (28px cards, full-round buttons); light and dark with identical structure.

CONSTRAINTS: 390px phone width (bottom tabs + safe-area insets), 1440px desktop (max-w-5xl centered). Celsius and Fahrenheit are both first-class. Light and dark themes follow the system setting. All number displays use `tabular-nums`. Tracking floor is `-0.04em` (no tighter). Form inputs are 16px actual to prevent iOS zoom. Reduced motion makes all animations instant.

MOTION: One authored motion per screen. The dial's water arc animates over 700ms ease-out. Buttons press down (scale 0.97) on `:active`. Toasts slide up 16px and fade in over 500ms. Reduced motion (`prefers-reduced-motion: reduce`) makes all animations instant (0.01ms).

FINISH: Design system documented in DESIGN.md at repo root. All screens fit one viewport (no scrolling on the cook screen). Violations logged and tracked for future cleanup.
