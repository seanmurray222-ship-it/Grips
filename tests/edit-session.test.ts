import { describe, expect, it } from "vitest";
import { readSessionFields, updateSession } from "../src/logic/data";
import type { Session } from "../src/types";

const T = "2026-11-26";
const form = (o: Record<string, string>) => (k: string) => o[k] as string;
const base = { gripper: "sisyphus", date: "2026-11-20", hand: "RH", zone: "Power", weight: "62.5", r1: "41", r2: "", r3: "30" };

describe("session form", () => {
  it("reads weight and hold times, dropping blank reps", () => {
    expect(readSessionFields(form(base), T)).toEqual({
      date: "2026-11-20", gripper: "sisyphus", zone: "Power", hand: "RH", weight: 62.5, reps: [41, 30],
    });
  });

  it("accepts a comma decimal and rounds seconds", () => {
    const f = readSessionFields(form({ ...base, weight: "22,5", r1: "40.6" }), T);
    expect(f).toMatchObject({ weight: 22.5, reps: [41, 30] });
  });

  it("reads more than three reps when the form has them", () => {
    const f = readSessionFields(form({ ...base, r4: "12" }), T);
    expect(f).toMatchObject({ reps: [41, 30, 12] });
  });

  it("refuses a missing weight or rep 1", () => {
    expect(typeof readSessionFields(form({ ...base, weight: "" }), T)).toBe("string");
    expect(typeof readSessionFields(form({ ...base, r1: "0" }), T)).toBe("string");
  });
});

describe("updateSession", () => {
  const s = (id: string, weight: number): Session => ({
    id, created: 5, date: "2026-11-20", gripper: "prometheus", zone: "Power", hand: "LH", weight, reps: [40],
  });

  it("changes only the edited session and keeps its id and creation time", () => {
    const list = [s("a", 20), s("b", 30)];
    const f = readSessionFields(form({ ...base, gripper: "prometheus", hand: "LH", weight: "21", r1: "38", r3: "" }), T);
    if (typeof f === "string") throw new Error(f);
    const out = updateSession(list, "b", f);
    expect(out[0]).toBe(list[0]);
    expect(out[1]).toEqual({ ...list[1], weight: 21, reps: [38] });
    expect(list[1].weight).toBe(30);
  });
});
