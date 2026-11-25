import { describe, expect, it } from "vitest";
import { existingRunDecision, MAX_RUN_ATTEMPTS, STALE_RUN_MINUTES } from "./runs";

const now = new Date("2026-11-26T19:45:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe("esecuzione già presente per la chiave", () => {
  it("un job eseguito non riparte", () => {
    expect(existingRunDecision({ status: "done", attempts: 1, ran_at: minutesAgo(300) }, now)).toBe(
      "done",
    );
  });

  it("un job in corso da poco non si esegue due volte", () => {
    expect(existingRunDecision({ status: "running", attempts: 1, ran_at: minutesAgo(1) }, now)).toBe(
      "busy",
    );
  });

  it("un job rimasto «in corso» (timeout) si riprova", () => {
    expect(
      existingRunDecision(
        { status: "running", attempts: 1, ran_at: minutesAgo(STALE_RUN_MINUTES + 1) },
        now,
      ),
    ).toBe("retry");
  });

  it("un job fallito si riprova subito, ma non all'infinito", () => {
    expect(existingRunDecision({ status: "failed", attempts: 1, ran_at: minutesAgo(1) }, now)).toBe(
      "retry",
    );
    expect(
      existingRunDecision(
        { status: "failed", attempts: MAX_RUN_ATTEMPTS, ran_at: minutesAgo(1) },
        now,
      ),
    ).toBe("exhausted");
    expect(
      existingRunDecision(
        { status: "running", attempts: MAX_RUN_ATTEMPTS, ran_at: minutesAgo(60) },
        now,
      ),
    ).toBe("exhausted");
  });
});
