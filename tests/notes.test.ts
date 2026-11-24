import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, clone } from "../src/defaults";
import { buildExport, emptyTrack, parseImport, readTrack } from "../src/logic/data";
import { moveBack, noteFor, postpone, setNote } from "../src/logic/plan";
import type { Data } from "../src/types";

const T = "2026-11-01";
function data(): Data {
  return { sessions: [], settings: clone(DEFAULT_SETTINGS), track: emptyTrack() };
}
const withTrack = (d: Data, track: Data["track"]): Data => ({ ...d, track });

describe("session notes", () => {
  it("sets, reads and clears a note per training day and activity", () => {
    let d = data();
    d = withTrack(d, setNote(d, 2, "board", "Sent the blue V6"));
    expect(noteFor(d, 2, "board")).toBe("Sent the blue V6");
    expect(noteFor(d, 2, "strA")).toBe("");
    expect(noteFor(d, 3, "board")).toBe("");
    d = withTrack(d, setNote(d, 2, "board", "   "));
    expect(noteFor(d, 2, "board")).toBe("");
    expect(d.track.notes).toBeUndefined();
  });

  it("moves the note with the session when pushed, and back again", () => {
    let d = data();
    d = withTrack(d, setNote(d, 0, "strA", "Squat 60 kg"));
    d = withTrack(d, postpone(d, 0, "strA", T)); // Day 1 -> Day 2
    expect(noteFor(d, 0, "strA")).toBe("");
    expect(noteFor(d, 1, "strA")).toBe("Squat 60 kg");
    d = withTrack(d, postpone(d, 1, "strA", T)); // chained push -> Day 3
    expect(noteFor(d, 2, "strA")).toBe("Squat 60 kg");
    d = withTrack(d, moveBack(d, 2, "strA"));
    expect(noteFor(d, 0, "strA")).toBe("Squat 60 kg");
    expect(d.track.carry).toEqual([]);
  });

  it("keeps both texts if the target day already has a note", () => {
    let d = data();
    d = withTrack(d, setNote(d, 0, "strA", "new"));
    d = withTrack(d, setNote(d, 1, "strA", "old"));
    d = withTrack(d, postpone(d, 0, "strA", T));
    expect(noteFor(d, 1, "strA")).toBe("old\nnew");
  });

  it("survives export and import, and drops junk", () => {
    let d = data();
    d = withTrack(d, setNote(d, 4, "grip", "Left index sore"));
    expect(parseImport(JSON.stringify(buildExport(d))).track.notes).toEqual({ n4: { grip: "Left index sore" } });
    const t = readTrack({ days: [], carry: [], done: {}, notes: { n1: { board: "ok", bogus: "x", strA: 3 }, x2: { board: "y" } } });
    expect(t.notes).toEqual({ n1: { board: "ok" } });
  });
});

describe("move back guard", () => {
  it("won't move a session back onto a finished day, where it would vanish", async () => {
    const { finishDay, canMoveBack, itemsFor } = await import("../src/logic/plan");
    let d = data();
    d = withTrack(d, postpone(d, 0, "strA", T)); // Day 1 strA -> Day 2
    expect(canMoveBack(d, 1, "strA")).toBe(true);
    d = withTrack(d, finishDay(d, T)); // Day 1 finished without strA
    expect(canMoveBack(d, 1, "strA")).toBe(false);
    expect(moveBack(d, 1, "strA")).toBe(d.track);
    expect(itemsFor(d, 1, "2026-11-02")).toContain("strA");
  });
});
