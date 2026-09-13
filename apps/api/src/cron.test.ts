import { describe, expect, it } from "vitest";
import { assertValidCron, isValidCron } from "./cron";

describe("cron validation", () => {
  it("accepts every-minute scheduling", () => {
    expect(isValidCron("* * * * *")).toBe(true);
  });

  it("accepts a daily schedule", () => {
    expect(isValidCron("0 9 * * *")).toBe(true);
  });

  it("accepts a weekday schedule", () => {
    expect(isValidCron("30 8 * * 1-5")).toBe(true);
  });

  it("rejects six-field expressions", () => {
    expect(isValidCron("0 0 9 * * *")).toBe(false);
  });

  it("rejects malformed expressions", () => {
    expect(isValidCron("hello world")).toBe(false);
  });

  it("rejects out-of-range values", () => {
    expect(isValidCron("70 25 * * *")).toBe(false);
  });

  it("throws a useful error for invalid expressions", () => {
    expect(() => assertValidCron("invalid")).toThrow(
      "Cron expression must contain exactly 5 fields",
    );
  });
});