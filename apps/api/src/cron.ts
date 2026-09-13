import { CronExpressionParser } from "cron-parser";

export function assertValidCron(expression: string): void {
  const normalized = expression.trim();

  if (normalized.length === 0) {
    throw new Error("Cron expression cannot be empty");
  }

  const fields = normalized.split(/\s+/);

  if (fields.length !== 5) {
    throw new Error(
      "Cron expression must contain exactly 5 fields: minute hour day-of-month month day-of-week",
    );
  }

  try {
    CronExpressionParser.parse(normalized);
  } catch {
    throw new Error("Invalid cron expression");
  }
}

export function isValidCron(expression: string): boolean {
  try {
    assertValidCron(expression);
    return true;
  } catch {
    return false;
  }
}