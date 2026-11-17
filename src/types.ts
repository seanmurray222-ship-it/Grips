export type Gripper = "prometheus" | "sisyphus";
export type Hand = "LH" | "RH";
export type Activity = "grip" | "board" | "open" | "outdoor" | "strA" | "strB" | "cardio" | "mobility";

export interface Session {
  id: string;
  created: number;
  date: string;
  gripper: Gripper;
  zone: string;
  hand: Hand;
  weight: number;
  reps: number[];
}

export interface Zone {
  name: string;
  bottom: number;
  top: number;
  target: number;
  reps: number;
}

export interface Program {
  start: string;
  end: string;
  block: number;
  rest: number;
}

export interface Settings {
  zones: Zone[];
  rest: number;
  oneRMTime: number;
  steps: Record<Gripper, number>;
  starter: Record<Gripper, number[]>;
  starterCount: number;
  seq: Activity[][];
  program: Program;
}

export interface TrackDay {
  n: number;
  date: string;
  idx: number;
  items: Activity[];
}

export interface Carry {
  a: Activity;
  from: number;
  to: number;
}

export interface Track {
  days: TrackDay[];
  carry: Carry[];
  done: Record<string, Partial<Record<Activity, true>>>;
}

/** Everything the logic needs, plus "today" so it can be tested. */
export interface Data {
  sessions: Session[];
  settings: Settings;
  track: Track;
}

export interface ExportFile {
  version: number;
  exportedFrom?: string;
  exportedAt?: string;
  sessions: Session[];
  settings: Settings;
  checks: Track;
}
