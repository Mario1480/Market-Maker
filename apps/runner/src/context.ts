export type RunnerContext = {
  startedAt: number;
};

export function createContext(): RunnerContext {
  return { startedAt: Date.now() };
}
