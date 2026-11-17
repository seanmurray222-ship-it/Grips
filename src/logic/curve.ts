import type { Gripper, Hand, Session, Settings } from "../types";

export interface Fit {
  a: number;
  b: number;
  n: number;
}

/** Old records have no gripper: they were all Prometheus. */
export function gOf(s: Pick<Session, "gripper">): Gripper {
  return s.gripper === "sisyphus" ? "sisyphus" : "prometheus";
}

function usable(s: Session): boolean {
  return Number(s.weight) > 0 && Array.isArray(s.reps) && Number(s.reps[0]) > 0;
}

/**
 * Least-squares fit of ln(rep1) = ln(a) + b·ln(weight) for one gripper and hand.
 * Returns null with fewer than 2 points, no spread in weight, or a slope that isn't negative.
 */
export function fit(sessions: Session[], gripper: Gripper, hand: Hand): Fit | null {
  const pts = sessions
    .filter((s) => gOf(s) === gripper && s.hand === hand && usable(s))
    .map((s) => [Math.log(Number(s.weight)), Math.log(Number(s.reps[0]))] as const);
  if (pts.length < 2) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) * (x - mx);
    sxy += (x - mx) * (y - my);
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  if (!(b < 0)) return null;
  return { a: Math.exp(my - b * mx), b, n };
}

export const predictTime = (f: Fit, w: number) => f.a * Math.pow(w, f.b);
export const weightFor = (f: Fit, t: number) => Math.pow(t / f.a, 1 / f.b);

export function stepFor(settings: Settings, g: Gripper): number {
  return Number(settings.steps && settings.steps[g]) || 1;
}
/** Round to the gripper's step, never below one step. */
export function roundStep(settings: Settings, w: number, g: Gripper): number {
  const st = stepFor(settings, g);
  return Math.max(st, Math.round(w / st) * st);
}

export function zoneIndex(settings: Settings, name: string): number {
  return settings.zones.findIndex((z) => z.name === name);
}

/** Sessions per zone for one gripper AND hand. */
export function zoneCounts(sessions: Session[], settings: Settings, gripper: Gripper, hand: Hand): number[] {
  const c = settings.zones.map(() => 0);
  for (const s of sessions) {
    if (gOf(s) !== gripper || s.hand !== hand) continue;
    const i = zoneIndex(settings, s.zone);
    if (i >= 0) c[i]++;
  }
  return c;
}

/** The zone with the fewest sessions on this gripper and hand; ties go to the earlier zone. */
export function nextZoneIndex(sessions: Session[], settings: Settings, gripper: Gripper, hand: Hand): number {
  const c = zoneCounts(sessions, settings, gripper, hand);
  let best = 0;
  c.forEach((v, i) => {
    if (v < c[best]) best = i;
  });
  return best;
}

/** Oldest first; same-day sessions ordered by creation time. */
export function sortedSessions(sessions: Session[]): Session[] {
  return sessions
    .slice()
    .sort((a, b) => (a.date === b.date ? (a.created || 0) - (b.created || 0) : a.date < b.date ? -1 : 1));
}

export function sessionCount(sessions: Session[], g: Gripper, hand: Hand): number {
  return sessions.filter((s) => gOf(s) === g && s.hand === hand).length;
}

/** Mean of (rep1 / predicted − 1) over the last 5 sessions, as a whole percentage. */
export function recentTrend(sessions: Session[], gripper: Gripper, hand: Hand, f: Fit | null) {
  if (!f) return null;
  const recent = sortedSessions(sessions)
    .filter((s) => gOf(s) === gripper && s.hand === hand && usable(s))
    .slice(-5);
  if (recent.length < 2) return null;
  const avg = recent.reduce((a, s) => a + (s.reps[0] / predictTime(f, s.weight) - 1), 0) / recent.length;
  return { pct: Math.round(avg * 100), n: recent.length };
}

export interface Suggestion {
  w: number;
  src: "starter" | "curve";
  left?: number;
}

/** Starter weights for the first sessions on each gripper and hand, then the fitted curve. */
export function suggest(sessions: Session[], settings: Settings, g: Gripper, hand: Hand, zi: number): Suggestion | null {
  const n = sessionCount(sessions, g, hand);
  const lim = Math.max(0, Number(settings.starterCount) || 0);
  const st = settings.starter && settings.starter[g];
  const sw = st ? Number(st[zi]) || 0 : 0;
  if (n < lim && sw > 0) return { w: sw, src: "starter", left: lim - n };
  const f = fit(sessions, g, hand);
  if (f) return { w: roundStep(settings, weightFor(f, settings.zones[zi].target), g), src: "curve" };
  return sw > 0 ? { w: sw, src: "starter", left: 0 } : null;
}

export function otherHand(h: Hand): Hand {
  return h === "LH" ? "RH" : "LH";
}

/**
 * After saving a session: if the other hand now has fewer sessions on that gripper,
 * return it so the UI switches to it. Otherwise keep the current hand.
 */
export function handAfterSave(sessions: Session[], g: Gripper, hand: Hand): Hand {
  const oh = otherHand(hand);
  return sessionCount(sessions, g, oh) < sessionCount(sessions, g, hand) ? oh : hand;
}
