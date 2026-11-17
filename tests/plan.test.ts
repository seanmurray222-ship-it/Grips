import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, clone } from "../src/defaults";
import { nextZoneIndex, suggest } from "../src/logic/curve";
import { buildExport, emptyTrack, parseImport } from "../src/logic/data";
import {
  activeN,
  dayLabel,
  finishDay,
  idxFor,
  isDoneN,
  itemsFor,
  moveBack,
  nextFreeN,
  postpone,
  programInfo,
  recentStats,
  seqAdd,
  seqMove,
  seqRemove,
  seqToggle,
  undoFinish,
} from "../src/logic/plan";
import type { Activity, Data, Session } from "../src/types";

function data(over: Partial<Data> = {}): Data {
  return { sessions: [], settings: clone(DEFAULT_SETTINGS), track: emptyTrack(), ...over };
}
const withTrack = (d: Data, track: Data["track"]): Data => ({ ...d, track });

describe("rolling rotation", () => {
  it("starts at Day 1 and only advances when a day is finished", () => {
    let d = data();
    expect(activeN(d, "2026-11-01")).toBe(0);
    expect(dayLabel(d, 0)).toBe("Day 1");
    expect(itemsFor(d, 0, "2026-11-01")).toEqual(["grip", "strA"]);
    // Missed calendar days don't move the plan.
    expect(activeN(d, "2026-11-09")).toBe(0);

    d = withTrack(d, finishDay(d, "2026-11-01"));
    expect(d.track.days).toEqual([{ n: 0, date: "2026-11-01", idx: 0, items: ["grip", "strA"] }]);
    // Same day: still shows the finished day.
    expect(activeN(d, "2026-11-01")).toBe(0);
    // Later: next day in the rotation.
    expect(activeN(d, "2026-11-05")).toBe(1);
    expect(dayLabel(d, 1)).toBe("Day 2");
  });

  it("does not finish twice on the same date", () => {
    const d = data();
    const d1 = withTrack(d, finishDay(d, "2026-11-01"));
    expect(finishDay(d1, "2026-11-01")).toBe(d1.track);
  });

  it("wraps around the rotation", () => {
    let d = data();
    for (let i = 0; i < 7; i++) d = withTrack(d, finishDay(d, `2026-11-${String(i + 1).padStart(2, "0")}`));
    expect(idxFor(d, 7)).toBe(0);
    expect(dayLabel(d, 8)).toBe("Day 2");
  });

  it("undo removes today's entry only if it is the latest", () => {
    let d = data();
    d = withTrack(d, finishDay(d, "2026-11-01"));
    expect(undoFinish(d, "2026-11-02")).toBe(d.track);
    d = withTrack(d, undoFinish(d, "2026-11-01"));
    expect(d.track.days).toEqual([]);
  });

  it("history uses stored items, not the current rotation", () => {
    let d = data();
    d = withTrack(d, finishDay(d, "2026-11-01"));
    d.settings.seq = [["board"], ["cardio"]];
    expect(itemsFor(d, 0, "2026-11-02")).toEqual(["grip", "strA"]);
  });
});

describe("editing the rotation", () => {
  const S: Activity[][] = [["grip", "strA"], ["board"], ["grip", "cardio"]];

  it("reorders days up and down", () => {
    expect(seqMove(S, 1, -1)).toEqual([["board"], ["grip", "strA"], ["grip", "cardio"]]);
    expect(seqMove(S, 1, 1)).toEqual([["grip", "strA"], ["grip", "cardio"], ["board"]]);
    expect(seqMove(S, 0, -1)).toEqual(S);
    expect(seqMove(S, 2, 1)).toEqual(S);
  });

  it("toggles activities in canonical order", () => {
    expect(seqToggle(S, 1, "grip")).toEqual([["grip", "strA"], ["grip", "board"], ["grip", "cardio"]]);
    expect(seqToggle(S, 1, "board")[1]).toEqual([]);
  });

  it("adds and removes days, keeping at least one", () => {
    expect(seqAdd(S)).toHaveLength(4);
    expect(seqAdd(S)[3]).toEqual([]);
    expect(seqRemove(S, 0)).toEqual([["board"], ["grip", "cardio"]]);
    expect(seqRemove([["board"]], 0)).toEqual([["board"]]);
  });

  it("never loses your place: the pointer is an index", () => {
    let d = data();
    d = withTrack(d, finishDay(d, "2026-11-01")); // idx 0
    d = withTrack(d, finishDay(d, "2026-11-02")); // idx 1
    expect(idxFor(d, 2)).toBe(2);
    d.settings.seq = seqMove(d.settings.seq, 2, 1);
    expect(idxFor(d, 2)).toBe(2);
    expect(itemsFor(d, 2, "2026-11-03")).toEqual(["board"]);
    // Shrinking the rotation wraps safely.
    d.settings.seq = [["board"], ["grip"]];
    expect(idxFor(d, 2)).toBe(0);
  });
});

describe("program weeks", () => {
  function prog(start: string, block = 2, rest = 1, end = "") {
    const d = data();
    d.settings.seq = [["grip", "board"], ["grip", "strA"]]; // 2-day rotation => 1 week = 2 training days
    d.settings.program = { start, end, block, rest };
    return d;
  }

  it("is null without a start, 'before' before the start", () => {
    expect(programInfo(data(), 0, "2026-11-01")).toBeNull();
    expect(programInfo(prog("2026-12-01"), 0, "2026-11-01")).toEqual({ phase: "before" });
  });

  it("counts weeks in training days finished since start, with rest weeks after each block", () => {
    const d = prog("2026-11-01");
    const at = (n: number) => programInfo(d, n, "2026-11-01")!;
    expect(at(0)).toMatchObject({ phase: "on", blockNo: 1, week: 1, restWeek: false });
    expect(at(2)).toMatchObject({ blockNo: 1, week: 2, restWeek: false });
    expect(at(4)).toMatchObject({ blockNo: 1, week: 3, restWeek: true });
    expect(at(6)).toMatchObject({ blockNo: 2, week: 1, restWeek: false });
  });

  it("ignores days finished before the start", () => {
    let d = prog("2026-11-05");
    d = withTrack(d, finishDay(d, "2026-11-01"));
    d = withTrack(d, finishDay(d, "2026-11-02"));
    expect(programInfo(d, 2, "2026-11-05")).toMatchObject({ week: 1 });
  });

  it("keeps only grip on rest weeks", () => {
    const d = prog("2026-11-01");
    expect(itemsFor(d, 4, "2026-11-01")).toEqual(["grip"]);
    expect(itemsFor(d, 5, "2026-11-01")).toEqual(["grip"]);
    expect(itemsFor(d, 6, "2026-11-01")).toEqual(["grip", "board"]);
  });

  it("flags 'after' past the target end", () => {
    expect(programInfo(prog("2026-11-01", 2, 1, "2026-11-10"), 0, "2026-11-11")!.phase).toBe("after");
  });
});

describe("push and move back", () => {
  it("pushes to the next training day that doesn't already have it", () => {
    const d = data(); // default 7-day rotation
    // Day 1 strA -> Day 2 (board) doesn't have strA.
    expect(nextFreeN(d, 0, "strA", "2026-11-01")).toBe(1);
    // Day 1 grip -> Day 2 has no grip.
    expect(nextFreeN(d, 0, "grip", "2026-11-01")).toBe(1);
    // Day 2 board -> Day 3 (grip+cardio) has no board.
    expect(nextFreeN(d, 1, "board", "2026-11-01")).toBe(2);
    // Day 3 cardio -> Day 4 board.
    const t = postpone(d, 0, "strA", "2026-11-01");
    expect(t.carry).toEqual([{ a: "strA", from: 0, to: 1 }]);
    const d2 = withTrack(d, t);
    expect(itemsFor(d2, 0, "2026-11-01")).toEqual(["grip"]);
    expect(itemsFor(d2, 1, "2026-11-01")).toEqual(["board", "strA"]);
  });

  it("skips days that already have the activity", () => {
    const d = data();
    // Day 2 board: Day 3 has none -> 2. But Day 3 board pushes skip Day 4 (board) -> Day 5.
    expect(nextFreeN(d, 2, "board", "2026-11-01")).toBe(4);
  });

  it("pushing an already-pushed item updates its 'to'", () => {
    let d = data();
    d = withTrack(d, postpone(d, 0, "strA", "2026-11-01"));
    d = withTrack(d, postpone(d, 1, "strA", "2026-11-01"));
    expect(d.track.carry).toEqual([{ a: "strA", from: 0, to: 2 }]);
    expect(itemsFor(d, 1, "2026-11-01")).toEqual(["board"]);
    expect(itemsFor(d, 2, "2026-11-01")).toEqual(["grip", "strA", "cardio"]);
  });

  it("move back deletes the push", () => {
    let d = data();
    d = withTrack(d, postpone(d, 0, "strA", "2026-11-01"));
    d = withTrack(d, moveBack(d, 1, "strA"));
    expect(d.track.carry).toEqual([]);
    expect(itemsFor(d, 0, "2026-11-01")).toEqual(["grip", "strA"]);
  });
});

describe("ticks and adherence", () => {
  const sess = (date: string, gripper: "prometheus" | "sisyphus", hand: "LH" | "RH"): Session => ({
    id: date + gripper + hand, created: 0, date, gripper, zone: "Power", hand, weight: 30, reps: [40],
  });

  it("grip ticks itself when each gripper has a session in the day's window", () => {
    let d = data();
    d = withTrack(d, finishDay(d, "2026-11-01"));
    d.sessions = [sess("2026-11-01", "prometheus", "LH"), sess("2026-11-03", "prometheus", "LH")];
    expect(isDoneN(d, 1, "grip", "2026-11-03")).toBe(false);
    d.sessions.push(sess("2026-11-02", "sisyphus", "RH"));
    expect(isDoneN(d, 1, "grip", "2026-11-03")).toBe(true);
  });

  it("reports recent adherence over the last 7 calendar days", () => {
    let d = data();
    d = withTrack(d, finishDay(d, "2026-11-01")); // grip + strA, nothing done
    d = withTrack(d, finishDay(d, "2026-11-10")); // board
    d.track.done = { n1: { board: true } };
    expect(recentStats(d, "2026-11-12")).toEqual({ days: 1, planned: 1, done: 1 });
  });
});

describe("import of the real export", () => {
  const text = readFileSync(new URL("../data/my-data-export.json", import.meta.url), "utf8");
  const raw = JSON.parse(text);
  const d = parseImport(text);

  it("restores every session, setting and plan entry exactly", () => {
    expect(d.sessions).toEqual(raw.sessions);
    expect(d.settings).toEqual(raw.settings);
    expect(d.track).toEqual(raw.checks);
  });

  it("round-trips through export", () => {
    const out = buildExport(d);
    expect(parseImport(JSON.stringify(out))).toEqual(d);
  });

  it("shows the same next sessions as the prototype", () => {
    for (const g of ["prometheus", "sisyphus"] as const) {
      for (const h of ["LH", "RH"] as const) {
        expect(nextZoneIndex(d.sessions, d.settings, g, h)).toBe(1); // Power/Strength
      }
    }
    expect(suggest(d.sessions, d.settings, "prometheus", "LH", 1)).toEqual({ w: 22, src: "starter", left: 4 });
    expect(suggest(d.sessions, d.settings, "sisyphus", "RH", 1)).toEqual({ w: 62.5, src: "starter", left: 4 });
    // Rotation: two days finished (idx 0, 1), strA pushed from day 1 to day 2.
    expect(activeN(d, "2026-11-17")).toBe(2);
    expect(dayLabel(d, 2)).toBe("Day 3");
    expect(itemsFor(d, 2, "2026-11-17")).toEqual(["board", "strA"]);
  });
});
