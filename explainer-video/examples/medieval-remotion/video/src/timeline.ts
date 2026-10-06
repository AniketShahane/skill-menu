// Narration is the clock. timing.json (written by tools/voice.py) holds every beat's measured length;
// this file turns it into frame positions. The audio track is built from the SAME numbers
// (tools/mix.py repeats this arithmetic in Python with the same constants.json).
import timing from "./timing.json";
import K from "./constants.json"; // shared with tools/mix.py so picture and sound use the same clock

export const FPS = K.fps;
export const W = 1920;
export const H = 1080;
export const GAP = K.gap; // silence after each beat unless the beat sets pad
export const CARD = K.card; // drawer card between chapters (silent)
export const LEAD = K.lead; // breath after the card before the first line
export const TAIL = K.tail; // breath at the end of a chapter

export type Beat = {id: string; v: "N" | "Q"; t: string; who?: string; show?: string | null; dur: number; pad: number | null};
export type BeatF = Beat & {s: number; e: number; d: number; next: number};
export type Chapter = {key: string; title: string; from: number; card: number; body: number; total: number; beats: BeatF[]};

const f = (sec: number) => Math.round(sec * FPS);

export const CHAPTERS: Chapter[] = (() => {
  let g = 0;
  return (timing as {key: string; title: string; beats: Beat[]; hold?: number}[]).map((ch) => {
    const card = ch.title ? f(CARD) : 0;
    let t = card + f(LEAD);
    const beats: BeatF[] = ch.beats.map((b) => {
      const s = t;
      const d = f(b.dur);
      t = s + d + f(b.pad ?? GAP);
      return {...b, s, e: s + d, d, next: t};
    });
    const total = t + f(TAIL) + f(ch.hold ?? 0); // hold: silent seconds at the end (credits)
    const c = {key: ch.key, title: ch.title, from: g, card, body: total - card, total, beats};
    g += total;
    return c;
  });
})();

export const TOTAL = CHAPTERS.reduce((a, c) => a + c.total, 0);

export const chapter = (key: string) => {
  const c = CHAPTERS.find((x) => x.key === key);
  if (!c) throw new Error(`no chapter ${key}`);
  return c;
};

// b("c1d") -> the beat, with local frames s (start), e (end of speech), d (length), next (start of next beat)
export const beatsOf = (key: string) => {
  const c = chapter(key);
  const m = new Map(c.beats.map((x) => [x.id, x]));
  return (id: string) => {
    const x = m.get(id);
    if (!x) throw new Error(`no beat ${id} in ${key}`);
    return x;
  };
};
