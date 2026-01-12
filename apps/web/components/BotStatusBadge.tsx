type BotStatusBadgeProps = {
  status: "running" | "paused" | "error";
};

export function BotStatusBadge({ status }: BotStatusBadgeProps) {
  return <span>{status}</span>;
}
