# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (a single-page app on GitHub Pages; it has to work well on a phone and on a desktop)

## Users

Owners of the Anova Precision Cooker Wi-Fi (the first generation) whose official app stopped working when Anova shut down its cloud.
- **Who they are:** sign-up is open to any owner, including strangers who find the project. Realistic scale is tens to low hundreds of users.
- **Setup:** done once, from a phone next to the cooker, over Web Bluetooth.
- **Everyday use:** starting, adjusting and watching cooks from a phone in the kitchen or from a desktop, and sometimes through an AI assistant (Claude or ChatGPT, over MCP).
- **Shared cookers:** an owner can invite household members, who control the cooker but can't manage it.

## Product Purpose

A reliable remote control for a cooker its maker abandoned. Users set the temperature and timer, start and stop a cook, and see at a glance that the cooker is online and doing what they asked. Auto-stop turns the heater off when the timer ends.

Success looks like this:
- the cooker does what the screen says;
- a dropped connection shows as offline, then recovers without a reload;
- setup finishes on the first try, or names the fix.

Success states are quiet: a plain confirmation, with no celebration.

## Positioning

The only way to keep using an Anova Wi-Fi 1 after the cloud shut down.
- It is open source (MIT) and has an open API: REST, plus MCP for AI assistants.
- It talks to the cooker through the project's own server, without patching DNS.
- The stance is trust. A valid login is trusted, and people tinkering with the API or the code is welcome.

## Constraints

- Keep the name "Anova4All", written as one word. There is an existing simple logo at `.github/logo.svg`.
- Support light and dark themes, following the system setting.
- Celsius and Fahrenheit are both first-class. The limits are 25–100 °C (77–211 °F) and 0–6000 min.
- Bluetooth setup needs a browser with Web Bluetooth, which means Chrome on Android or desktop. iOS Safari can't run setup, but it can still control cooks.
- The cooker accepts one Bluetooth connection at a time, and only supports 2.4 GHz Wi-Fi.
- Strangers sign up, so the first-run flow needs clear onboarding and plain explanations: what the project is, and that it is not affiliated with Anova.

## Open decisions

- Accessibility target: not stated. Default to WCAG AA unless the owner says otherwise.
- A trademark disclaimer for "Anova": the wording isn't decided yet.
