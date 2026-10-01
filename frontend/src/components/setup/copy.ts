// All setup wizard copy in one place. The "get the cooker ready" steps and the
// help sheet come from desk research, not yet from the cooker itself.
import type { StepId } from "./machine.ts";

/** The heading printed on each step's screen. */
export const STEP_TITLES: Record<StepId, string> = {
  preflight: "Let's set up your cooker",
  prepare: "Get the cooker ready",
  find: "Find your cooker",
  connect: "Find your cooker",
  key: "Securing the cooker",
  server: "Pointing it at the server",
  wifi: "Which Wi-Fi should it use?",
  pair: "Waiting for it to dial in",
  name: "Name your cooker",
  done: "Done",
};

/** The desktop checklist: one short line per visible step ("connect" shares "find"). */
export const CHECKLIST: Record<Exclude<StepId, "connect" | "done">, string> = {
  preflight: "Check this browser",
  prepare: "Get it ready",
  find: "Find it",
  key: "New key",
  server: "Point it here",
  wifi: "Wi-Fi",
  pair: "Pair",
  name: "Name it",
};

/** Shown while a step is working. */
export const STEP_PROGRESS: Partial<Record<StepId, string>> = {
  preflight: "Checking Bluetooth…",
  find: "Waiting for you to pick the cooker…",
  connect: "Connecting to the cooker…",
  key: "Writing a new key to the cooker…",
  server: "Sending the server address…",
  wifi: "Sending the Wi-Fi details…",
  pair: "Waiting for the cooker to connect to the server…",
  name: "Saving the name…",
};

export const PREFLIGHT = {
  intro:
    "Setup runs in this browser over Bluetooth. It takes about two minutes.",
  /** For strangers who found the project: who runs this. */
  independent:
    "Anova4All is an independent open-source project. It isn't affiliated with Anova.",
  checks: {
    browser: "This browser can use Bluetooth",
    bluetooth: "Bluetooth is on",
    signedIn: "Logged in",
  },
  checking: "Checking",
  checkAgain: "Check again",
  bluetoothOff: {
    title: "Bluetooth is off",
    fix: "Turn on Bluetooth on this device, then check again.",
  },
  signedOut: {
    title: "You're not logged in",
    fix: "Log in, then open setup again.",
  },
};

/** A numbered step: the instruction, and an optional quieter detail under it. */
export interface Instruction {
  text: string;
  detail?: string;
}

export const PREPARE = {
  // TODO(early test): from desk research, unverified on the real Anova Wi-Fi
  // cooker. Replace with the sequence recorded at the hands-on test.
  steps: [
    {
      text: "Plug it in.",
      detail:
        "No button to press. It's ready for Bluetooth as soon as it has power.",
    },
    { text: "Keep it within about 3 m of this phone or laptop." },
    {
      text: "Close the Anova app on any other phone.",
      detail: "It may be holding the Bluetooth link.",
    },
    { text: "Turn Bluetooth on here." },
  ] satisfies Instruction[],
  next: "It's ready",
};

export const FIND = {
  intro: "Your browser lists nearby devices. Pick the one named",
  deviceName: "Anova",
  action: "Find my cooker",
  picking: "Pick it in the list…",
  connecting: "Connecting…",
  /** Shown before anything is written to the cooker, so a wrong account is noticed. */
  account: (email: string) => `It will be paired to ${email}`,
  serverToggle: "Server address",
  serverLabel: "Address the cooker connects to",
  serverHint:
    "Leave empty to use this server's address. Type a LAN IP if the cooker can't reach the public one, e.g. it's on the same Wi-Fi as the server.",
};

export const KEY = {
  intro: "It's getting a new key, so only your account can control it.",
  row: "Writing a new key",
};

export const SERVER = {
  intro:
    "From now on it dials this server over your Wi-Fi instead of Anova's cloud.",
  row: "Sending the server address",
  labels: { cooker: "Cooker", router: "Your router", server: "Server" },
};

export const WIFI = {
  modesLabel: "Wi-Fi network",
  keepTab: "Keep current",
  changeTab: "Change",
  intro:
    "It keeps the network it already uses. Pick Change if it's new to this cooker or you moved house.",
  current: "Current network",
  continue: "Continue",
  ssidLabel: "Network",
  ssidAria: "Wi-Fi name",
  passwordLabel: "Password",
  passwordAria: "Wi-Fi password",
  rules: [
    "2.4 GHz networks only, WPA or WPA2.",
    "The network name must be visible, not hidden.",
    "No spaces or special characters in the name or password.",
    "Keep the cooker within about 1.5 m (5 ft) of the router, not a repeater, while it connects.",
  ],
  rulesLabel: "What the cooker needs",
  submit: "Send to the cooker",
  sending: "Sending…",
};

export const PAIR = {
  intro: "It's connecting to the server over Wi-Fi. Usually under 30 seconds.",
  secondsLeft: "seconds left",
  timerLabel: (seconds: number) => `${seconds} seconds left`,
  lastStatus: {
    device_offline: "It hasn't reached the server yet…",
    key_mismatch: "Reached the server, waiting for its new key…",
    other: "Still trying to reach the server…",
  },
  tooLong: "Taking too long?",
  timeoutTitle: "It didn't dial in within a minute",
  /** Read by the runner too: joined into the timeout problem's fix. */
  troubleshooting: [
    "Unplug it and plug it back in.",
    "Check the Wi-Fi rules.",
    "Then try again.",
  ],
  troubleshootingDetail: [
    "It dials the server again when it powers up.",
    "2.4 GHz, a visible name, no spaces or special characters, close to the router.",
    undefined,
  ] as (string | undefined)[],
  keepWaiting: "Try again",
  redo: "Run Bluetooth setup again",
};

export const NAME = {
  intro: "So you can tell it apart. You can change it later.",
  label: "Name",
  suggestionsLabel: "Suggestions",
  suggestions: ["Kitchen", "Sous vide", "Home"],
  save: "Done",
  skip: "Skip",
};

export const HELP = {
  open: "Need help?",
  title: "Need help?",
  tabs: { find: "Can't find it", reset: "Reset Wi-Fi" },
  // TODO(early test): from desk research, unverified on the real cooker.
  find: [
    {
      text: "Make sure it's plugged in.",
      detail:
        "No button press is needed. It's ready for Bluetooth whenever it has power.",
    },
    { text: "Bring this phone or laptop within about 3 m." },
    {
      text: "Close the Anova app on any other phone.",
      detail: "It may be holding the Bluetooth link.",
    },
    { text: "Check that Bluetooth is on here." },
  ] satisfies Instruction[],
  findNote:
    "Setup needs Chrome or Edge. iPhone and iPad browsers can't use Bluetooth.",
  reset: [
    { text: "Unplug the cooker and plug it back in." },
    {
      text: "Press and hold the Wi-Fi icon until it beeps.",
      detail: "About 4 seconds.",
    },
    { text: "If it doesn't respond, do it once more." },
    { text: "Give it up to a minute to restart." },
  ] satisfies Instruction[],
  resetNote:
    "The Wi-Fi icon usually blinks while it looks for a network and stays solid once it's connected.",
  close: "Try again",
};

export const WIZARD = {
  title: "Set up a cooker",
  progressLabel: "Setup progress",
  stepsLabel: "Setup steps",
  done: "done",
};

export const COMMON = {
  retry: "Try again",
  startOver: "Start over",
  cancel: "Cancel setup",
  close: "Close",
};

export const DONE_TOAST = "Cooker set up";
