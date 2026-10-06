import React from "react";
import {AbsoluteFill, Composition, Sequence} from "remotion";
import {CHAPTERS, FPS, H, TOTAL, W} from "./timeline";
import {Filters, Vellum} from "./kit";
import {DrawerCard} from "./Cabinet";
import {BODIES} from "./chapters";

const ChapterView: React.FC<{i: number}> = ({i}) => {
  const c = CHAPTERS[i];
  const Body = BODIES[c.key];
  return (
    <AbsoluteFill>
      {c.card > 0 && <Sequence durationInFrames={c.card} layout="none"><DrawerCard index={i} title={c.title} len={c.card} /></Sequence>}
      {Body && <Body />}
    </AbsoluteFill>
  );
};

export const Film: React.FC = () => (
  <Vellum>
    <Filters />
    {CHAPTERS.map((c, i) => (
      <Sequence key={c.key} from={c.from} durationInFrames={c.total} name={c.key}>
        <ChapterView i={i} />
      </Sequence>
    ))}
  </Vellum>
);

const One: React.FC<{i: number}> = ({i}) => (
  <Vellum><Filters /><ChapterView i={i} /></Vellum>
);

export const Root: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    {CHAPTERS.map((c, i) => (
      <Composition key={c.key} id={`ch-${c.key}`} component={One} defaultProps={{i}} durationInFrames={c.total} fps={FPS} width={W} height={H} />
    ))}
  </>
);
