import { ACT_ORDER, DEFAULT_SEQ, DEFAULT_SETTINGS, GRIPPERS, clone, isActivity } from "../defaults";
import type { Activity, Carry, Data, Gripper, Hand, Program, Track, TrackDay } from "../types";
import { gOf } from "./curve";
import { dayNum, numToStr } from "./dates";

/*
 * Rolling rotation. Training days are numbered n = 0, 1, 2, ...
 * Finished days live in track.days; the active day is the next one (or today's entry if
 * today is already finished). The rotation only advances when a day is finished.
 */

export function seq(d: Data): Activity[][] {
  const s = d.settings.seq;
  return Array.isArray(s) && s.length ? s : DEFAULT_SEQ;
}
export const seqLen = (d: Data) => seq(d).length;
const days = (d: Data) => d.track.days || [];
const carry = (d: Data) => d.track.carry || [];
const prog = (d: Data): Program => d.settings.program || DEFAULT_SETTINGS.program;

export const entryN = (d: Data, n: number) => days(d).find((x) => x.n === n);
export const todayEntry = (d: Data, today: string) => days(d).find((x) => x.date === today);

export function activeN(d: Data, today: string): number {
  const e = todayEntry(d, today);
  return e ? e.n : days(d).length;
}

/** Rotation index for training day n: stored for finished days, projected from the last one otherwise. */
export function idxFor(d: Data, n: number): number {
  const e = entryN(d, n);
  const L = seqLen(d);
  if (e) return ((e.idx % L) + L) % L;
  const ds = days(d);
  const last = ds.length ? ds[ds.length - 1].idx : -1;
  return (((last + 1 + (n - ds.length)) % L) + L) % L;
}
export const dayLabel = (d: Data, n: number) => "Day " + (idxFor(d, n) + 1);

export interface ProgramInfo {
  phase: "before" | "on" | "after";
  blockNo?: number;
  week?: number;
  block?: number;
  restWeek?: boolean;
}

/** A program "week" is one pass through the rotation, counted in training days finished since start. */
export function programInfo(d: Data, n: number, today: string): ProgramInfo | null {
  const P = prog(d);
  if (!P.start) return null;
  if (today < P.start) return { phase: "before" };
  const s0 = days(d).filter((x) => x.date < P.start).length;
  const k = n - s0;
  if (k < 0) return null;
  const L = seqLen(d);
  const block = Math.max(1, Number(P.block) || 4);
  const rest = Math.max(0, Number(P.rest) || 0);
  const cyc = block + rest;
  const wk = Math.floor(k / L);
  const pos = wk % cyc;
  return {
    phase: P.end && today > P.end ? "after" : "on",
    blockNo: Math.floor(wk / cyc) + 1,
    week: pos + 1,
    block,
    restWeek: pos >= block,
  };
}
export function isRestWeek(d: Data, n: number, today: string): boolean {
  const i = programInfo(d, n, today);
  return !!(i && i.phase !== "before" && i.restWeek);
}

export const carriedOut = (d: Data, n: number) => carry(d).filter((c) => c.from === n && c.to !== n);
export const carriedIn = (d: Data, n: number, a: Activity) => carry(d).find((c) => c.to === n && c.a === a);

export function itemsFor(d: Data, n: number, today: string): Activity[] {
  const e = entryN(d, n);
  if (e && Array.isArray(e.items)) return e.items.filter(isActivity);
  let items = (seq(d)[idxFor(d, n)] || []).filter(isActivity);
  if (isRestWeek(d, n, today)) items = items.filter((a) => a === "grip");
  const out = new Set(carriedOut(d, n).map((c) => c.a));
  items = items.filter((a) => !out.has(a));
  carry(d).forEach((c) => {
    if (c.to === n && isActivity(c.a) && !items.includes(c.a)) items.push(c.a);
  });
  return ACT_ORDER.filter((a) => items.includes(a));
}

/** Which hands have a session on each gripper within training day n's window. */
export function gripStatusN(d: Data, n: number, today: string): Record<Gripper, Set<Hand>> {
  const r = { prometheus: new Set<Hand>(), sisyphus: new Set<Hand>() };
  const e = entryN(d, n);
  if (!e && n !== activeN(d, today)) return r;
  const prev = entryN(d, n - 1);
  const from = prev ? prev.date : "0000-00-00";
  const to = e ? e.date : today;
  d.sessions.forEach((s) => {
    if (s.date > from && s.date <= to) r[gOf(s)].add(s.hand);
  });
  return r;
}

export function isDoneN(d: Data, n: number, a: Activity, today: string): boolean {
  if (a === "grip") {
    const st = gripStatusN(d, n, today);
    return GRIPPERS.every((g) => st[g.id].size > 0);
  }
  return !!(d.track.done["n" + n] && d.track.done["n" + n][a]);
}

/** The next training day after n that doesn't already have activity a. */
export function nextFreeN(d: Data, n: number, a: Activity, today: string): number {
  for (let i = 1; i <= seqLen(d); i++) {
    if (!itemsFor(d, n + i, today).includes(a)) return n + i;
  }
  return n + 1;
}

export function postpone(d: Data, n: number, a: Activity, today: string): Track {
  const to = nextFreeN(d, n, a, today);
  const C: Carry[] = clone(carry(d));
  const chained = C.find((c) => c.to === n && c.a === a);
  if (chained) chained.to = to;
  else C.push({ a, from: n, to });
  return { ...d.track, carry: C.filter((c) => c.to >= activeN(d, today) - 30) };
}

export function moveBack(d: Data, n: number, a: Activity): Track {
  return { ...d.track, carry: carry(d).filter((c) => !(c.to === n && c.a === a)) };
}

export function finishDay(d: Data, today: string): Track {
  if (todayEntry(d, today)) return d.track;
  const n = days(d).length;
  const entry: TrackDay = { n, date: today, idx: idxFor(d, n), items: itemsFor(d, n, today) };
  return { ...d.track, days: days(d).concat([entry]) };
}

export function undoFinish(d: Data, today: string): Track {
  const e = todayEntry(d, today);
  if (!e || e.n !== days(d).length - 1) return d.track;
  return { ...d.track, days: days(d).filter((x) => x !== e) };
}

export function toggleCheck(d: Data, n: number, a: Activity): Track {
  const done = { ...d.track.done };
  const k = "n" + n;
  const cur = { ...(done[k] || {}) };
  if (cur[a]) delete cur[a];
  else cur[a] = true;
  if (Object.keys(cur).length) done[k] = cur;
  else delete done[k];
  return { ...d.track, done };
}

/** Drop manual ticks older than 90 training days (as the prototype does on save). */
export function pruneDone(d: Data, today: string): Track {
  const keep = activeN(d, today) - 90;
  const done = { ...d.track.done };
  Object.keys(done).forEach((k) => {
    if (Number(k.slice(1)) < keep) delete done[k];
  });
  return { ...d.track, done };
}

export function recentStats(d: Data, today: string) {
  const cutoff = numToStr(dayNum(today) - 6);
  const fin = days(d).filter((x) => x.date >= cutoff);
  let planned = 0;
  let done = 0;
  fin.forEach((x) =>
    itemsFor(d, x.n, today).forEach((a) => {
      planned++;
      if (isDoneN(d, x.n, a, today)) done++;
    }),
  );
  return { days: fin.length, planned, done };
}

/* ---------- Rotation editing ---------- */

export function seqMove(s: Activity[][], i: number, dir: -1 | 1): Activity[][] {
  const j = i + dir;
  const S = clone(s);
  if (i < 0 || i >= S.length || j < 0 || j >= S.length) return S;
  [S[i], S[j]] = [S[j], S[i]];
  return S;
}
export function seqToggle(s: Activity[][], i: number, a: Activity): Activity[][] {
  const S = clone(s);
  const cur = new Set(S[i] || []);
  if (cur.has(a)) cur.delete(a);
  else cur.add(a);
  S[i] = ACT_ORDER.filter((x) => cur.has(x));
  return S;
}
export function seqAdd(s: Activity[][]): Activity[][] {
  return clone(s).concat([[]]);
}
export function seqRemove(s: Activity[][], i: number): Activity[][] {
  const S = clone(s);
  if (S.length > 1 && i >= 0 && i < S.length) S.splice(i, 1);
  return S;
}
