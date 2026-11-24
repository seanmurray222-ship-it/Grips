import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, GUIDE, clone } from "../src/defaults";
import { buildExport, emptyTrack, parseImport, readTrack } from "../src/logic/data";
import {
  climbFor,
  finishDay,
  gripAutoN,
  guideFor,
  isCustomGuide,
  isDoneN,
  moveBack,
  postpone,
  recentStats,
  setClimb,
  setGuide,
  toggleCheck,
} from "../src/logic/plan";
import type { Data, Session } from "../src/types";

const T = "2026-11-01";
function data(): Data {
  return { sessions: [], settings: clone(DEFAULT_SETTINGS), track: emptyTrack() };
}
const withTrack = (d: Data, track: Data["track"]): Data => ({ ...d, track });
const sess = (gripper: Session["gripper"], hand: Session["hand"], date = T): Session => ({
  id: gripper + hand + date, created: 1, date, gripper, zone: "Power", hand, weight: 20, reps: [30],
});

describe("editable session guides", () => {
  it("uses the built-in guide until you save your own", () => {
    let s = clone(DEFAULT_SETTINGS);
    expect(guideFor(s, "strA")).toBe(GUIDE.strA);
    expect(isCustomGuide(s, "strA")).toBe(false);
    s = setGuide(s, "strA", "  Deadlift 5×3\nPress 3×5  ");
    expect(guideFor(s, "strA")).toBe("Deadlift 5×3\nPress 3×5");
    expect(guideFor(s, "strB")).toBe(GUIDE.strB);
    expect(isCustomGuide(s, "strA")).toBe(true);
  });

  it("goes back to the built-in guide when cleared or set to the same text", () => {
    let s = setGuide(clone(DEFAULT_SETTINGS), "strB", "Rows");
    s = setGuide(s, "strB", "   ");
    expect(guideFor(s, "strB")).toBe(GUIDE.strB);
    expect(s.guides).toBeUndefined();
    s = setGuide(setGuide(s, "strB", "Rows"), "strB", GUIDE.strB);
    expect(s.guides).toBeUndefined();
  });

  it("survives export and import, and drops junk", () => {
    const d = data();
    d.settings = setGuide(d.settings, "strA", "My A");
    const back = parseImport(JSON.stringify(buildExport(d)));
    expect(guideFor(back.settings, "strA")).toBe("My A");
    const junk = parseImport(JSON.stringify({ ...buildExport(d), settings: { ...d.settings, guides: { strA: 5, nope: "x", strB: "B" } } }));
    expect(junk.settings.guides).toEqual({ strB: "B" });
  });
});

describe("manual gripper tick", () => {
  it("can be ticked by hand when no sessions were logged", () => {
    let d = data();
    expect(isDoneN(d, 0, "grip", T)).toBe(false);
    d = withTrack(d, toggleCheck(d, 0, "grip"));
    expect(gripAutoN(d, 0, T)).toBe(false);
    expect(isDoneN(d, 0, "grip", T)).toBe(true);
    d = withTrack(d, toggleCheck(d, 0, "grip"));
    expect(isDoneN(d, 0, "grip", T)).toBe(false);
  });

  it("still ticks itself from logged sessions on both grippers", () => {
    const d = data();
    d.sessions = [sess("prometheus", "LH")];
    expect(isDoneN(d, 0, "grip", T)).toBe(false);
    d.sessions.push(sess("sisyphus", "RH"));
    expect(gripAutoN(d, 0, T)).toBe(true);
    expect(isDoneN(d, 0, "grip", T)).toBe(true);
  });

  it("counts toward recent adherence", () => {
    let d = data();
    d = withTrack(d, toggleCheck(d, 0, "grip"));
    d = withTrack(d, toggleCheck(d, 0, "strA"));
    d = withTrack(d, finishDay(d, T));
    expect(recentStats(d, T)).toEqual({ days: 1, planned: 2, done: 2 });
  });
});

describe("climbing type", () => {
  it("defaults to the planned activity and can be switched", () => {
    let d = data();
    expect(climbFor(d, 1, "board")).toBe("board");
    d = withTrack(d, setClimb(d, 1, "board", "outdoor"));
    expect(climbFor(d, 1, "board")).toBe("outdoor");
    expect(climbFor(d, 3, "board")).toBe("board");
    d = withTrack(d, setClimb(d, 1, "board", "open"));
    expect(climbFor(d, 1, "board")).toBe("open");
    d = withTrack(d, setClimb(d, 1, "board", "board"));
    expect(climbFor(d, 1, "board")).toBe("board");
    expect(d.track.climb).toBeUndefined();
  });

  it("only applies to climbing sessions", () => {
    const d = data();
    expect(setClimb(d, 0, "strA", "outdoor")).toBe(d.track);
    expect(setClimb(d, 1, "board", "cardio")).toBe(d.track);
    expect(climbFor(d, 0, "strA")).toBe("strA");
  });

  it("travels with the session when pushed and moved back", () => {
    let d = data();
    d = withTrack(d, setClimb(d, 1, "board", "outdoor")); // Day 2 board -> outdoor
    d = withTrack(d, postpone(d, 1, "board", T)); // Day 2 -> Day 3 (no board there)
    expect(climbFor(d, 1, "board")).toBe("board");
    expect(climbFor(d, 2, "board")).toBe("outdoor");
    d = withTrack(d, moveBack(d, 2, "board"));
    expect(climbFor(d, 1, "board")).toBe("outdoor");
    expect(climbFor(d, 2, "board")).toBe("board");
  });

  it("survives export and import, and drops junk", () => {
    let d = data();
    d = withTrack(d, setClimb(d, 1, "board", "open"));
    const back = parseImport(JSON.stringify(buildExport(d)));
    expect(climbFor(back, 1, "board")).toBe("open");
    const t = readTrack({ climb: { n1: { board: "cardio" }, n2: { strA: "open", open: "outdoor" }, x: { board: "open" } } });
    expect(t.climb).toEqual({ n2: { open: "outdoor" } });
  });
});
