import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, clone } from "../src/defaults";
import {
  fit,
  handAfterSave,
  nextZoneIndex,
  predictTime,
  recentTrend,
  roundStep,
  suggest,
  weightFor,
  zoneCounts,
} from "../src/logic/curve";
import type { Gripper, Hand, Session } from "../src/types";

let seq = 0;
function s(p: Partial<Session> & { weight: number; rep1: number }): Session {
  seq++;
  return {
    id: "t" + seq,
    created: seq,
    date: p.date ?? "2026-11-01",
    gripper: (p.gripper ?? "prometheus") as Gripper,
    zone: p.zone ?? "Power",
    hand: (p.hand ?? "LH") as Hand,
    weight: p.weight,
    reps: p.reps ?? [p.rep1],
  };
}

describe("force curve fit", () => {
  it("recovers a and b from exact power-law data", () => {
    const a = 50000, b = -1.8;
    const sessions = [20, 25, 30, 40].map((w) => s({ weight: w, rep1: a * Math.pow(w, b) }));
    const f = fit(sessions, "prometheus", "LH")!;
    expect(f.n).toBe(4);
    expect(f.b).toBeCloseTo(b, 10);
    expect(f.a).toBeCloseTo(a, 6);
    expect(predictTime(f, 30)).toBeCloseTo(a * Math.pow(30, b), 8);
    expect(weightFor(f, predictTime(f, 27))).toBeCloseTo(27, 8);
  });

  it("matches a hand-computed least-squares fit", () => {
    // ln-space points: (ln 32, ln 47), (ln 22, ln 80)
    const sessions = [s({ weight: 32, rep1: 47 }), s({ weight: 22, rep1: 80 })];
    const f = fit(sessions, "prometheus", "LH")!;
    const b = (Math.log(47) - Math.log(80)) / (Math.log(32) - Math.log(22));
    expect(f.b).toBeCloseTo(b, 12);
    expect(f.a).toBeCloseTo(47 / Math.pow(32, b), 9);
  });

  it("needs two points, spread in weight, and a negative slope", () => {
    expect(fit([s({ weight: 30, rep1: 40 })], "prometheus", "LH")).toBeNull();
    expect(fit([s({ weight: 30, rep1: 40 }), s({ weight: 30, rep1: 50 })], "prometheus", "LH")).toBeNull();
    expect(fit([s({ weight: 20, rep1: 40 }), s({ weight: 30, rep1: 50 })], "prometheus", "LH")).toBeNull();
  });

  it("ignores zero weights and zero rep 1, and other grippers/hands", () => {
    const sessions = [
      s({ weight: 32, rep1: 47 }),
      s({ weight: 22, rep1: 80 }),
      s({ weight: 0, rep1: 100 }),
      s({ weight: 15, rep1: 0 }),
      s({ weight: 10, rep1: 999, hand: "RH" }),
      s({ weight: 10, rep1: 999, gripper: "sisyphus" }),
    ];
    expect(fit(sessions, "prometheus", "LH")!.n).toBe(2);
  });

  it("treats records with no gripper as Prometheus", () => {
    const old = [s({ weight: 32, rep1: 47 }), s({ weight: 22, rep1: 80 })].map((x) => {
      const y = { ...x } as Partial<Session>;
      delete y.gripper;
      return y as Session;
    });
    expect(fit(old, "prometheus", "LH")).not.toBeNull();
    expect(fit(old, "sisyphus", "LH")).toBeNull();
  });

  it("rounds to the gripper's step and never below one step", () => {
    const st = clone(DEFAULT_SETTINGS);
    st.steps = { prometheus: 1, sisyphus: 2.5 };
    expect(roundStep(st, 21.4, "prometheus")).toBe(21);
    expect(roundStep(st, 21.6, "prometheus")).toBe(22);
    expect(roundStep(st, 61.3, "sisyphus")).toBe(62.5);
    expect(roundStep(st, 0.2, "sisyphus")).toBe(2.5);
  });
});

describe("suggested weight", () => {
  const st = clone(DEFAULT_SETTINGS);

  it("uses starter weights for the first starterCount sessions", () => {
    expect(suggest([], st, "prometheus", "LH", 0)).toEqual({ w: 32, src: "starter", left: 5 });
    expect(suggest([], st, "sisyphus", "RH", 1)).toEqual({ w: 62.5, src: "starter", left: 5 });
    const one = [s({ weight: 32, rep1: 47 })];
    expect(suggest(one, st, "prometheus", "LH", 1)).toEqual({ w: 22, src: "starter", left: 4 });
  });

  it("switches to the curve once there are starterCount sessions", () => {
    const a = 50000, b = -1.8;
    const sessions = [20, 22, 25, 28, 32].map((w) => s({ weight: w, rep1: a * Math.pow(w, b) }));
    const sg = suggest(sessions, st, "prometheus", "LH", 2)!;
    expect(sg.src).toBe("curve");
    expect(sg.w).toBe(Math.round(Math.pow(120 / a, 1 / b)));
  });

  it("falls back to the starter weight when there is no curve", () => {
    const sessions = [1, 2, 3, 4, 5].map(() => s({ weight: 30, rep1: 40 }));
    expect(suggest(sessions, st, "prometheus", "LH", 3)).toEqual({ w: 13, src: "starter", left: 0 });
  });
});

describe("next zone", () => {
  const st = clone(DEFAULT_SETTINGS);

  it("picks the zone with the fewest sessions, ties to the earlier zone", () => {
    expect(nextZoneIndex([], st, "prometheus", "LH")).toBe(0);
    const sessions = [s({ weight: 30, rep1: 40, zone: "Power" })];
    expect(nextZoneIndex(sessions, st, "prometheus", "LH")).toBe(1);
    sessions.push(s({ weight: 20, rep1: 70, zone: "Power/Strength" }), s({ weight: 15, rep1: 100, zone: "Strength" }));
    expect(nextZoneIndex(sessions, st, "prometheus", "LH")).toBe(3);
  });

  it("is per gripper AND hand: logging one hand never changes the other", () => {
    const sessions = [s({ weight: 30, rep1: 40, zone: "Power", hand: "RH" })];
    expect(nextZoneIndex(sessions, st, "prometheus", "RH")).toBe(1);
    expect(nextZoneIndex(sessions, st, "prometheus", "LH")).toBe(0);
    expect(nextZoneIndex(sessions, st, "sisyphus", "RH")).toBe(0);
    expect(zoneCounts(sessions, st, "prometheus", "RH")).toEqual([1, 0, 0, 0, 0]);
  });

  it("switches to the other hand after saving when it falls behind", () => {
    const sessions = [s({ weight: 30, rep1: 40, hand: "RH" })];
    expect(handAfterSave(sessions, "prometheus", "RH")).toBe("LH");
    sessions.push(s({ weight: 30, rep1: 40, hand: "LH" }));
    expect(handAfterSave(sessions, "prometheus", "LH")).toBe("LH");
  });
});

describe("recent trend", () => {
  it("averages rep1 / predicted − 1 over the last 5 sessions", () => {
    const f = { a: 50000, b: -1.8, n: 0 };
    const mk = (w: number, ratio: number, date: string) =>
      s({ weight: w, rep1: predictTime(f, w) * ratio, date });
    const sessions = [
      mk(20, 2.0, "2026-10-01"), // oldest, dropped
      mk(22, 1.1, "2026-10-02"),
      mk(24, 1.1, "2026-10-03"),
      mk(26, 0.9, "2026-10-04"),
      mk(28, 1.2, "2026-10-05"),
      mk(30, 1.2, "2026-10-06"),
    ];
    const tr = recentTrend(sessions, "prometheus", "LH", f)!;
    expect(tr.n).toBe(5);
    expect(tr.pct).toBe(10);
  });
});
