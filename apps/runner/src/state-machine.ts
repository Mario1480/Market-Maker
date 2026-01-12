import type { BotStatus } from "@mm/core";

export class BotStateMachine {
  private status: BotStatus = "STOPPED";
  private lastReason = "";

  getStatus(): BotStatus {
    return this.status;
  }

  getReason(): string {
    return this.lastReason;
  }

  set(status: BotStatus, reason = ""): void {
    this.status = status;
    this.lastReason = reason;
  }
}