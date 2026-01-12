import { createContext } from "./context";
import { runLoop } from "./loop";

export function createRunner() {
  const context = createContext();
  return {
    start() {
      runLoop(context);
    }
  };
}
