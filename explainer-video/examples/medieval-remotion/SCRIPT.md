# The Curio Cabinet of Medieval Mental Health — script plan

Source: Katherine Harvey, "Medieval mental health", Aeon (ed. Sam Haselby). Full text: `source/article.txt`.
Narration (words + beat ids): `narration.py`. This file is the plan; that file is the words.

**Viewer:** curious adult, no history background, has heard "the Middle Ages blamed madness on demons".
**Promise:** by the end you'll understand how medieval doctors thought about the mind (the humoral
balance and the "non-naturals"), meet the real people who struggled with stress, anxiety and melancholy,
see what was prescribed (from saffron and onyx to walks, gardens, pets, music and prayer), and what the
author thinks we should keep.
**Length target:** ~20–22 min (the user asked for *everything* in a 29-minute essay). ~2,550 words.

**Hook (first 15 s):** a dawn village, a bishop on horseback, a crowd; then a bound "possessed" sailor.
The stereotype is built up, stamped FEAR · CRUELTY · SUPERSTITION, then cracked.
**Central visual:** the **Humoral Compass** — a square with four corners (blood hot+moist, yellow bile
hot+dry, black bile cold+dry, phlegm cold+moist) and a single gold point, "you", that must stay near
the middle. Emotions push it: fear → cold, anger → hot+dry, melancholy → cold+dry, old age → cold+dry,
joy → back toward moist. Alternatives considered: a balance scale (only shows 2 things, not 4 qualities);
a body diagram with fluids (pretty, but can't show *direction* of a push). The compass wins because the
article's claims are all about qualities (warm, dry, cold, moist) and the compass makes each emotion a
visible push.
**Second device — the Cabinet:** a gilded wooden curio cabinet with 10 compartments. Each chapter ends
by placing its emblem (vials, reliquary hand, bow, dream-house, saffron, ferret, lute, candle,
hourglass) into a compartment. The finale shows the full cabinet; three curios are taken out ("don't
revive"), the rest stay.
**Third device — the two voices:** narrator (Charon) and "the sources" (Gacrux, hushed). Every medieval
quotation is spoken by the second voice and shown as ink on vellum with its author in rubric red.
**Aha moment:** ch. 6, c6e→c6f: arrows from anger, fear, grief all push the point to the DRY side;
"Joy was the exception. Joy moistened it." — the point swings back, a flower blooms, 3 s silence.
**Misconception shown failing:** the hook's "demons and cruelty" picture of medieval mental health.
**Out of scope:** whether humoral medicine "worked"; modern clinical advice. One calm caveat in ch. 9
(emotions don't cause miscarriage), and a balanced framing of the author's critique of modern care.

## Fundamentals ladder (taught forwards)
1. The stereotype (demons, exorcism) — what the viewer already believes.
2. The humoral body: four fluids, two qualities each, health = balance.
3. The six non-naturals: outside forces that move the balance — including emotions.
4. Acute emotions push hard (fear: cold; anger: hot+dry) → can kill.
5. Chronic strain (the bent bow): overwork, responsibility; even monks.
6. Anxiety and melancholy (Datini, Duarte, acedia) — the cold-dry corner as a lived experience.
7. Treatments for the body: purge + warm (uses 2), mood substances.
8. Joy as medicine (uses 2+4: joy moistens) → walks, friends, pets.
9. Culture and nature: books, music, gardens, exercise.
10. Soul: piety as health; faith in grief.
11. High stakes: plague, pregnancy, old age (cold+dry again, uses 2).
12. Lessons: prevention, holism, it's perennial.

## Question chain
Hook: "what were medieval minds really like?" → 1: "so which feelings were most dangerous?" →
2: "what about strain that never lets up?" → 3: "the other danger came from inside: worry" →
4: "if you were melancholy in 1390, what would your doctor do?" → 5: "remedies worked best with a
change in how you lived" → 6: "why would joy be medicine?" (answered inside) → 7: "one walk: body, mind
and soul" → 8: soul → 9: "when did it matter most?" → 10: "what do we keep?"

## Color key (fixed)
- Rubric red `#9E2A1E` = blood / hot+moist corner; also attributions of quotes (rubrication)
- Gold `#C8962E` = yellow bile / hot+dry; also "you", the balance point
- Ink-violet `#2E2438` = black bile / cold+dry; melancholy mist
- Lapis blue `#2F5D8C` = phlegm / cold+moist; cold, frost
- Verdigris green `#4E7D5B` = remedies, joy, gardens (never a humour)
- Ink brown `#2B1D14` on vellum `#EEE2C6` = everything else

## Fact base (all from the article unless noted)
- Hugh of Lincoln, Cheshunt, late 12th c.; sailor bound to post + stakes; local bishop "galloped away as if pursued by the Furies" (Adam of Eynsham).
- Four humours; six non-naturals incl. diet, exercise, sleep, emotions. Full list of six (air; food and drink; sleep and waking; motion and rest; retention and evacuation; passions of the soul) — standard Galenic list (not spelled out in the article; widely documented, e.g. Rather, "The six things non-natural", Clio Medica 1968).
- Humour qualities (blood hot/moist etc.) — standard Galenic scheme, not in the article.
- Regimens popular in late-medieval Europe; Juan de Aviñón (14th-c. Seville) quote; Arnold von Bamberg; Niccolaio Martini 1395 fever after election, told Margherita Datini.
- Alice (Essex clerk's daughter), ghost while milking sheep on Good Friday, blood froze round heart, mania, fire; cured by hand of St James at Reading Abbey (relic there from mid-12th c.).
- Anger warms and dries; mid-15th-c. German regimen quote; Henry I + daughter dispute, "chill in his bowels".
- Mind as bent bow; "disputes in the household" shorten years. Daniel of Beccles (c. 1200) toiling ant + quote. Boucicaut (c. 1366–1421) biographer quote (abridged).
- Matthew, 13th-c. monk of Rievaulx, precentor (in charge of the choir/singing), wrote to William, prior of Byland; quote; stomach pains, exhaustion; fate unknown. Alexander de Langley, St Albans.
- Datini (c. 1335–1410), quotes; Black Death's first wave orphaned him; dream 1395; ship no news > 2 months; Margherita's quotes.
- Melancholia: persistent low mood, lack of interest; black shapes, monks, demons. King Duarte (1391–1438), regent during plague. Acedia: silence, services, entertaining, bad news; "half-dead".
- Black bile → brain mist; purge, warm: cinnamon, liquorice syrups, warm-oil massage. Saffron (Welsh c. 1400 "die of happiness"), oregano, fennel, ostrich liver; Hildegard (1098–1179) onyx quote; beryl, sapphire calm anger.
- Taddeo Alderotti / Obizzo II d'Este (c. 1247–93), melancholy + insomnia > 2 years; prescription quote. Joy moistens; others dry; benefits list; German verse regimen quote.
- Lapo Mazzei jests quote; pets: cats, dogs, birds; Robert de Insula (bishop of Durham 1274–83) monkeys; Alfonso X (1221–84) ferret.
- Friar told to stop reading martyrdoms; author's "sad-people books". Bologna 1390s lawyer's son; musician + storyteller; quote; Sergio of Polo.
- Walks for depressed monks; country houses; gardens; Datini's garden (oranges, roses, violets; "great piece of folly"); Platina (1421–81) weeding, pruning. Mirfield quote.
- Occitan regimen (late 13th c.) prayer "with joy"; Lydgate's Dietary (c. 1370–c. 1451). Duarte: physicians, work-life balance, sleep, almsgiving, confession, communion. Giovanni di Paolo Morelli, grief and guilt, first anniversary, faith saved him.
- Chalin de Vivario; Tommaso del Garbo (c. 1305–70) plague advice; COVID comparison (article's).
- Pregnancy: emotions/sudden shock (thunder) could kill a foetus; Elizabeth of Padua; "live in friendship with God and be merry". Caveat (ours): stress/emotion is not an established cause of miscarriage (ACOG FAQ "Early Pregnancy Loss"; NHS "Miscarriage — causes").
- Samuel ibn Naghrillah (11th c.); Innocent III (1160–1216); Edmund Lacey (bishop of Exeter 1420–55), mayor's quip. Zerbi, Gerontocomia 1489: cold and dry, spirits thick; music, conversation, storytelling, maths problems; quote. Petrarch (1304–74) quote.
- Modern: millions affected, hundreds of thousands lost per year; cost barriers; critics of drugs and labels (the author's framing, presented as "some critics").
- Lessons: don't revive exorcism, saffron overdoses, ostrich liver; prevention; holism; perennial problem.

## Chapters → beats → pictures
See `narration.py` for words. Visual plan per chapter:
- **Hook:** dawn village line drawing (generated), rider; crowd; bound sailor (generated, restrained, not graphic); demon marginalia; Hugh's quote card; three red stamps; they crack; a book opens; five icons (walk, garden, cat, friends, lute) fly in; title card; empty cabinet.
- **1 Humours:** four glass vials fill; slide to compass corners; gold point; six roundels around; "passions" glows; regimen books; Aviñón quote; three roundels knocked over by emotions; Martini: point flares to hot corner, fever lines.
- **2 Kill:** Alice + sheep + ghost (generated); frost creeps from cold side, heart ices; flame; reliquary hand (generated) glows; anger: point to hot+dry, ember edge; German quote; Henry I crown topples. Emblem → reliquary hand.
- **3 Bow:** ink bow drawn, string tension rises, a crack line; ant hauling load; Boucicaut: a 24-hour wheel filling with segments; Rievaulx ruin (generated); Matthew's quote; Alexander: books stack higher until they topple. Emblem → bow.
- **4 Worry:** Walther miniature (the classic "troubled mind" pose, captioned honestly); timeline with plague waves; dream-house drawn then collapsing; ship on sea with tally of days; letters flying between two seals; point drifts to cold-dry, violet mist and dark shapes at frame edge; Duarte crown; grey monks fading. Emblem → letter with seal.
- **5 Chest:** head profile with mist; purge + warm: cinnamon, liquorice, oil flask; point warms to centre; saffron crocus; "die of happiness" beat; oregano, fennel, ostrich; onyx, beryl, sapphire sparkle. Emblem → saffron.
- **6 Joy:** prescription scroll unrolls item by item; coins; AHA compass sequence; five benefit icons; verse; Goeli miniature (friends at a board game); Altstetten (falcon); monkeys; ferret. Emblem → ferret.
- **7 Air:** book with skull swapped for book with flowers; Fiedler + Frauenlob miniatures, floating neumes; Warte (bathing under a tree); Veldeke garden; Datini's garden oranges/roses/violets; Platina hands weeding; Mirfield landscape pan (sky, sea, green hills). Emblem → lute.
- **8 Soul:** three linked rings (body, mind, soul); Occitan/Lydgate book pages; Duarte trio; Morelli: candle in darkness that steadies. Emblem → candle.
- **9 Crisis:** bell rings radiating; gossip whispers; Tommaso's three remedies; thunderclap; Elizabeth: gentle, a cradle silhouette; caveat card; the quote. Old age: left/right confusion arrows; "good old days"; tapestry figure; point to cold-dry; Zerbi's four remedies incl. a maths problem written in medieval numerals; Petrarch at desk. Emblem → hourglass.
- **10 Lessons:** modern scale (small, sober); three curios lifted out and set aside; three keepers: unstrung bow (prevention), compass with six roundels balanced (holism), row of the people we met (perennial); cabinet doors close; credits.

## Title + thumbnail
Title: "The Curio Cabinet of Medieval Mental Health". Thumbnail: the full cabinet with the compass glowing.
