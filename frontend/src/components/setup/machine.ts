// Pure setup step machine: state + reducer. Side effects live in runner.ts.
// The cooker key is deliberately NOT part of this state.

export type StepId =
  | "preflight"
  | "prepare"
  | "find"
  | "connect"
  | "key"
  | "server"
  | "wifi"
  | "pair"
  | "name"
  | "done";

/** Display order. */
export const STEPS: readonly StepId[] = [
  "preflight",
  "prepare",
  "find",
  "connect",
  "key",
  "server",
  "wifi",
  "pair",
  "name",
  "done",
];

export interface Problem {
  code: string;
  title: string;
  fix: string;
}

/** ready: waiting for the user; working: in progress; failed: shows the fix and Retry. */
export type Phase = "ready" | "working" | "failed";

export interface PairProgress {
  elapsedMs: number;
  attempts: number;
  lastCode?: string;
}

export interface SetupState {
  step: StepId;
  phase: Phase;
  /** Preflight problems (all of them), or the failure of the current step. */
  problems: Problem[];
  /** Where Retry resumes. */
  resume?: StepId;
  idCard?: string;
  pair?: PairProgress;
  pairTimedOut: boolean;
  device?: { id: string; name: string };
}

export type SetupAction =
  | { type: "preflight_checked"; problems: Problem[] }
  | { type: "prepared" }
  | { type: "started"; step: StepId }
  | { type: "ready"; step: StepId }
  | { type: "connected"; idCard: string }
  | { type: "pair_progress"; progress: PairProgress }
  | { type: "pair_timeout"; problem: Problem }
  | { type: "paired"; device: { id: string; name: string } }
  | { type: "named"; name?: string }
  | { type: "failed"; step: StepId; problem: Problem }
  | { type: "restart" };

export const initialState: SetupState = {
  step: "preflight",
  phase: "working",
  problems: [],
  pairTimedOut: false,
};

export function reducer(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case "preflight_checked":
      return action.problems.length > 0
        ? {
            ...state,
            step: "preflight",
            phase: "failed",
            problems: action.problems,
            resume: "preflight",
          }
        : {
            ...state,
            step: "prepare",
            phase: "ready",
            problems: [],
            resume: undefined,
          };
    case "prepared":
      return {
        ...state,
        step: "find",
        phase: "ready",
        problems: [],
        resume: undefined,
      };
    case "started":
      return {
        ...state,
        step: action.step,
        phase: "working",
        problems: [],
        resume: undefined,
        ...(action.step === "pair"
          ? { pairTimedOut: false, pair: { elapsedMs: 0, attempts: 0 } }
          : {}),
      };
    case "ready":
      return {
        ...state,
        step: action.step,
        phase: "ready",
        problems: [],
        resume: undefined,
      };
    case "connected":
      return { ...state, idCard: action.idCard };
    case "pair_progress":
      return { ...state, pair: action.progress };
    case "pair_timeout":
      return {
        ...state,
        step: "pair",
        phase: "failed",
        pairTimedOut: true,
        problems: [action.problem],
        resume: "pair",
      };
    case "paired":
      return {
        ...state,
        step: "name",
        phase: "ready",
        problems: [],
        resume: undefined,
        device: action.device,
      };
    case "named":
      return {
        ...state,
        step: "done",
        phase: "ready",
        problems: [],
        device:
          state.device && action.name
            ? { ...state.device, name: action.name }
            : state.device,
      };
    case "failed":
      return {
        ...state,
        step: action.step,
        phase: "failed",
        problems: [action.problem],
        // Retry resumes at the failed step; for Bluetooth writes the runner
        // reconnects first. Nothing earlier is redone.
        resume: action.step,
      };
    case "restart":
      return {
        ...state,
        step: "find",
        phase: "ready",
        problems: [],
        resume: undefined,
        idCard: undefined,
        pair: undefined,
        pairTimedOut: false,
        device: undefined,
      };
  }
}
