import type { Activity, Gripper, Settings } from "./types";

export interface GripperInfo {
  id: Gripper;
  name: string;
  kind: string;
  muscle: string;
}

export const GRIPPERS: GripperInfo[] = [
  { id: "prometheus", name: "Prometheus", kind: "Micro", muscle: "FDP" },
  { id: "sisyphus", name: "Sisyphus", kind: "Crusher", muscle: "FDS" },
];

export const ACTS: Record<Activity, { label: string; desc: string }> = {
  grip: { label: "Grippers", desc: "Prometheus, then Sisyphus. Both hands." },
  board: { label: "Tension board", desc: "Warm up, limit problems, then 10 min core." },
  open: { label: "Indoor climbing", desc: "Gym session on whatever you like. Mix volume with a few hard tries." },
  outdoor: { label: "Outdoor climbing", desc: "A day on real rock. Warm up well and count it as a hard climbing day." },
  strA: { label: "Strength A", desc: "Legs, push, core." },
  strB: { label: "Strength B", desc: "Pull, posterior chain, core." },
  cardio: { label: "Easy cardio", desc: "Zone 2 on a bike or incline walk, 30–45 min." },
  mobility: { label: "Mobility", desc: "Easy stretching or a walk." },
};

/** What each session includes, shown on the session page and in the Plan guide. */
export const GUIDE: Record<Activity, string> = {
  grip: "Prometheus first, then Sisyphus, both hands. Follow each gripper’s next zone on Today. Train fresh, never right after climbing.",
  board:
    "15 min warm-up on easy problems. 40–50 min on problems near your limit, 3 to 5 attempts each, 3 min rest. Keep both feet on and hold every foot placement for a beat before moving. Finish with 10 min core: hollow holds and hanging knee raises.",
  open: "A freer gym session: projects, volume or climbing with friends. Treat it like a board day for recovery, so no gripper session straight after.",
  outdoor:
    "Real rock is usually the hardest climbing day of the week. Skip lifting that day and keep the next day easy if your fingers are worked.",
  strA: "Goblet or front squat 3×6–8, Romanian deadlift 3×6–8 (straps are fine), push-ups or dumbbell press 3×8–10, overhead press 3×8. Core: ab wheel 3×6–10, dead bug 3×8 each side.",
  strB: "Pull-ups 4×4–6, one-arm row 3×8, Bulgarian split squat 3×8 each leg. Core: tuck front lever holds 4×8–10 s, hanging leg raises 3×6–10, Pallof press 3×10 each side.",
  cardio: "30–45 min where you can still talk in full sentences. Bike or incline walk, so your forearms get a break.",
  mobility: "Easy stretching or a walk. Nothing that tires your fingers.",
};

/** Sessions whose "What this session includes" text you can rewrite. */
export const EDITABLE_GUIDES: Activity[] = ["strA", "strB"];
/** Climbing sessions: any of these slots can be done as any of the others on the day. */
export const CLIMBS: Activity[] = ["board", "open", "outdoor"];

export const ACT_ORDER: Activity[] = ["grip", "board", "open", "outdoor", "strA", "strB", "cardio", "mobility"];

export function isActivity(a: unknown): a is Activity {
  return typeof a === "string" && Object.prototype.hasOwnProperty.call(ACTS, a);
}

export const DEFAULT_SEQ: Activity[][] = [
  ["grip", "strA"],
  ["board"],
  ["grip", "cardio"],
  ["board"],
  ["grip", "strB"],
  ["board"],
  ["grip", "cardio"],
];

export const DEFAULT_SETTINGS: Settings = {
  zones: [
    { name: "Power", bottom: 20, top: 47, target: 40, reps: 3 },
    { name: "Power/Strength", bottom: 48, top: 81, target: 72, reps: 3 },
    { name: "Strength", bottom: 82, top: 128, target: 120, reps: 3 },
    { name: "Strength/Endurance", bottom: 129, top: 179, target: 160, reps: 2 },
    { name: "Endurance", bottom: 180, top: 300, target: 240, reps: 1 },
  ],
  rest: 20,
  oneRMTime: 20,
  steps: { prometheus: 1, sisyphus: 1 },
  starter: { prometheus: [32, 22, 15, 13, 10], sisyphus: [90, 62.5, 45, 35, 27.5] },
  starterCount: 5,
  seq: DEFAULT_SEQ,
  program: { start: "", end: "", block: 4, rest: 1 },
};

export function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}
