export const EXECUTION_STATUSES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "RETRYING",
  "CANCELLED",
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

const allowedTransitions: Record<
  ExecutionStatus,
  readonly ExecutionStatus[]
> = {
  QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "RETRYING"],
  SUCCEEDED: [],
  FAILED: ["RETRYING"],
  RETRYING: ["QUEUED", "CANCELLED"],
  CANCELLED: [],
};

export function canTransition(
  from: ExecutionStatus,
  to: ExecutionStatus,
): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(
  from: ExecutionStatus,
  to: ExecutionStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid execution state transition: ${from} -> ${to}`,
    );
  }
}