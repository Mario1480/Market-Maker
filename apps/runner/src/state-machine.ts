export type RunnerState = "idle" | "running" | "stopped";

export function nextState(current: RunnerState): RunnerState {
  if (current === "idle") return "running";
  if (current === "running") return "stopped";
  return "stopped";
}
