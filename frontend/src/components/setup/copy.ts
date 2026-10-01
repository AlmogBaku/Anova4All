// All setup wizard copy in one place. The "get the cooker ready" steps are a
// placeholder until the early test at the cooker records the exact sequence.
import type { StepId } from "./machine.ts";

export const STEP_TITLES: Record<StepId, string> = {
  preflight: "Check this browser",
  prepare: "Get the cooker ready",
  find: "Find the cooker",
  connect: "Connect over Bluetooth",
  key: "Secure the cooker",
  server: "Point the cooker to the server",
  wifi: "Wi-Fi",
  pair: "Wait for the cooker",
  name: "Name the cooker",
  done: "Done",
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
    "Setup runs in this browser over Bluetooth. Stay within a few meters of the cooker.",
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

export const PREPARE = {
  // TODO(early test): replace with the recorded steps for the Anova Wi-Fi cooker.
  steps: [
    "Plug in the cooker and switch it on.",
    "Close the Anova phone app, or turn off Bluetooth on your phone. The cooker accepts one Bluetooth connection at a time.",
    "Keep this device within a few meters of the cooker.",
  ],
  next: "The cooker is ready",
};

export const FIND = {
  intro:
    'Your browser will show a list of nearby devices. Pick the one named "Anova".',
  action: "Find my cooker",
  /** Shown before anything is written to the cooker, so a wrong account is noticed. */
  account: (email: string) => `The cooker will be paired to ${email}.`,
};

export const WIFI = {
  intro:
    "The cooker can keep the Wi-Fi it already uses, or you can give it a new network. It only supports 2.4 GHz networks.",
  keep: "Keep current Wi-Fi",
  change: "Use a different Wi-Fi",
  ssidLabel: "Wi-Fi name",
  passwordLabel: "Wi-Fi password",
  submit: "Send to the cooker",
};

export const PAIR = {
  waiting: (seconds: number) =>
    `Waiting for the cooker to connect to the server… ${seconds} s`,
  lastStatus: {
    device_offline: "The cooker hasn't reached the server yet.",
    key_mismatch:
      "The cooker reached the server but hasn't reported its new key yet.",
    other: "Still trying to reach the server.",
  },
  timeoutTitle: "The cooker didn't connect within a minute",
  troubleshooting: [
    "Unplug the cooker for 10 seconds, plug it back in, then press Keep waiting.",
    "Check that the cooker is on a 2.4 GHz Wi-Fi network with internet access.",
    "If you changed the Wi-Fi, check the name and password and run Bluetooth setup again.",
  ],
  keepWaiting: "Keep waiting",
  redo: "Run Bluetooth setup again",
};

export const NAME = {
  intro:
    "Give the cooker a name so you can tell it apart. You can change it later.",
  label: "Name",
  save: "Save name",
  skip: "Skip",
};

export const COMMON = {
  retry: "Try again",
  startOver: "Start over",
  cancel: "Cancel setup",
};

export const DONE_TOAST = "Cooker set up";
