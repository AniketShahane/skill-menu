import {useCurrentFrame} from "remotion";
import {beatsOf, chapter} from "../timeline";

/** Chapter-local clock: f = frame since chapter start; b(id) = beat; w(id, phrase) = frame when the phrase is spoken
 * (estimated from its character position in the line — Gemini gives no word timings). */
export const useCh = (key: string) => {
  const f = useCurrentFrame();
  const b = beatsOf(key);
  const c = chapter(key);
  const w = (id: string, phrase: string, lead = 3) => {
    const x = b(id);
    const i = x.t.indexOf(phrase);
    if (i < 0) throw new Error(`"${phrase}" not in ${id}`);
    return Math.round(x.s + (x.d * i) / x.t.length) - lead;
  };
  return {f, b, w, end: c.total, c};
};
