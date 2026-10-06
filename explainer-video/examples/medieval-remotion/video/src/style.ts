import {loadFont as loadFraktur} from "@remotion/google-fonts/UnifrakturMaguntia";
import {loadFont as loadFell} from "@remotion/google-fonts/IMFellEnglish";
import {loadFont as loadFellSC} from "@remotion/google-fonts/IMFellEnglishSC";
import {loadFont as loadGaramond} from "@remotion/google-fonts/EBGaramond";

export const FRAKTUR = loadFraktur("normal", {weights: ["400"], subsets: ["latin"]}).fontFamily;
export const FELL = loadFell("normal", {weights: ["400"], subsets: ["latin"]}).fontFamily;
export const FELL_I = loadFell("italic", {weights: ["400"], subsets: ["latin"]}).fontFamily;
export const FELL_SC = loadFellSC("normal", {weights: ["400"], subsets: ["latin"]}).fontFamily;
export const GARAMOND = loadGaramond("normal", {weights: ["400", "500", "600"], subsets: ["latin", "latin-ext"]}).fontFamily;

// Colour key (fixed for the whole film — see SCRIPT.md)
export const C = {
  vellum: "#EEE2C6",
  vellumDeep: "#E2D0A8",
  ink: "#2B1D14",
  inkSoft: "#5A4634",
  red: "#9E2A1E", // blood · hot+moist · quote attributions
  gold: "#C8962E", // yellow bile · hot+dry · "you" (the balance point)
  goldLight: "#E9C46A",
  black: "#2E2438", // black bile · cold+dry · melancholy
  blue: "#2F5D8C", // phlegm · cold+moist · cold
  green: "#4E7D5B", // remedies · joy
};
