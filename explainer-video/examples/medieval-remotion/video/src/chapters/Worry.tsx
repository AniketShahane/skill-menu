import React from "react";
import {AbsoluteFill, Easing, Img, staticFile} from "remotion";
import {Art, life, Mini, mv, Note, prog, Question, Quote, T, lerp} from "../kit";
import {Compass} from "../Compass";
import aspects from "../../public/art/art.json";
import {C, FELL, FELL_SC} from "../style";
import {useCh} from "./use";

/** the dream-house, cut into slices that fall apart */
const FallingHouse: React.FC<{x: number; y: number; w: number; at: number; fall: number; o: number}> = ({x, y, w, at, fall, o}) => {
  const a = (aspects as Record<string, number>).house;
  const h = w / a;
  const n = 6;
  return (
    <>
      {Array.from({length: n}).map((_, i) => {
        const l = (i / n) * 100, r = 100 - ((i + 1) / n) * 100;
        const d = Math.max(0, fall - i * 0.06);
        const dy = d * d * 700;
        const rot = (i % 2 ? 1 : -1) * d * 25;
        return <Img key={i} src={staticFile("art/house.png")} style={{position: "absolute", left: x - w / 2, top: y - h / 2 + dy, width: w, height: h, mixBlendMode: "multiply", opacity: o * (1 - d * 0.9),
          clipPath: `inset(0 ${r}% 0 ${l}%)`, transform: `rotate(${rot}deg)`, transformOrigin: `${l + 8}% 100%`}} />;
      })}
    </>
  );
};

const Timeline: React.FC<{o: number; p: number; f: number}> = ({o, p}) => {
  const x0 = 260, x1 = 1660, y = 760;
  const X = (yr: number) => x0 + ((yr - 1330) / 80) * (x1 - x0);
  const waves = [1348, 1363, 1374, 1383, 1390, 1400];
  return (
    <svg width={1920} height={1080} style={{position: "absolute", opacity: o}}>
      <line x1={x0} x2={x0 + (x1 - x0) * p} y1={y} y2={y} stroke={C.ink} strokeWidth={3} />
      <rect x={X(1335)} y={y - 16} width={(X(1410) - X(1335)) * p} height={10} fill={C.gold} />
      <text x={X(1335)} y={y - 30} fontFamily={FELL_SC} fontSize={26} fill={C.ink}>Datini c. 1335–1410</text>
      {[1340, 1360, 1380, 1400].map((yr) => <text key={yr} x={X(yr)} y={y + 40} textAnchor="middle" fontFamily={FELL} fontSize={24} fill={C.inkSoft} opacity={p}>{yr}</text>)}
      {waves.map((yr, i) => {
        const q = Math.max(0, Math.min(1, p * 1.2 - i * 0.12));
        return <g key={yr} opacity={q}>
          <circle cx={X(yr)} cy={y - 60} r={i === 0 ? 18 : 12} fill={C.black} opacity={0.85} />
          {i === 0 && <text x={X(yr)} y={y - 92} textAnchor="middle" fontFamily={FELL_SC} fontSize={26} fill={C.black}>1348: orphaned by the Black Death</text>}
        </g>;
      })}
      <text x={X(1393)} y={y - 120} textAnchor="middle" fontFamily={FELL} fontStyle="italic" fontSize={26} fill={C.black} opacity={p}>the plague keeps returning</text>
    </svg>
  );
};

export const Worry: React.FC = () => {
  const {f, b, w, end} = useCh("worry");
  const fall = prog(f, w("c4e", "fallen to pieces") + 6, 34, Easing.in(Easing.quad));
  const mel = prog(f, w("c4k", "low mood"), 60);
  const compO = life(f, b("c4k").s, b("c4m").s, 16, 16);
  const letter = (k: number) => {
    // letters fly between Francesco (left) and Margherita (right)
    const t = (f - b("c4h").s) / 45 - k * 0.5;
    const ph = t - Math.floor(t);
    const dir = Math.floor(t) % 2 === 0 ? 1 : -1;
    return {x: dir > 0 ? lerp(520, 1400, ph) : lerp(1400, 520, ph), y: 700 - Math.sin(ph * Math.PI) * 120};
  };
  const lettersO = life(f, b("c4h").s, b("c4k").s, 14, 14);
  return (
    <AbsoluteFill>
      <Mini name="walther" x={500} y={500} h={760} at={b("c4a").s - 6} out={b("c4c").s} caption="Codex Manesse, c. 1300–40: a poet in the classic pose of a troubled mind" />
      <T x={1260} y={260} at={w("c4a", "Francesco Datini")} out={b("c4c").s} size={96} font="fraktur" w={1000}>Francesco Datini</T>
      <T x={1260} y={390} at={w("c4a", "Francesco Datini") + 10} out={b("c4b").s - 4} size={36} font="sc" color={C.red} w={1000}>merchant of Prato, Tuscany · born c. 1335</T>
      <Quote text={b("c4b").t} who={b("c4b").who!} s={b("c4b").s} e={b("c4b").e} out={b("c4c").s} x={1260} y={420} w={1000} size={46} />

      <Timeline o={life(f, b("c4c").s, b("c4d").s, 14, 14)} p={prog(f, b("c4c").s, Math.round(b("c4c").d * 0.8), Easing.linear)} f={f} />
      <T x={960} y={250} at={b("c4c").s + 4} out={b("c4d").s} size={50} font="fellI" w={1400}>a life lived between plagues</T>

      <Art name="merchant" x={700} y={540} w={560} at={b("c4d").s} out={b("c4e").s - 4} />
      <T x={1350} y={400} at={w("c4d", "the plague")} out={b("c4e").s - 4} size={46} font="sc" color={C.black} w={600}>the plague</T>
      <T x={1350} y={480} at={w("c4d", "his business")} out={b("c4e").s - 4} size={46} font="sc" color={C.gold} w={600}>his business</T>
      <T x={1350} y={580} at={w("c4d", "a dream")} out={b("c4e").s - 4} size={40} font="fellI" w={600}>Prato, 1395: a letter about a dream</T>

      <FallingHouse x={500} y={560} w={560} at={b("c4e").s} fall={fall} o={life(f, b("c4e").s - 4, b("c4f").s, 20, 12)} />
      <Quote text={b("c4e").t} who={b("c4e").who!} s={b("c4e").s} e={b("c4e").e} out={b("c4f").s} x={1240} y={330} w={1050} size={48} />

      <Art name="ship" x={560} y={540} w={780} at={b("c4f").s} out={b("c4h").s - 4} drift={60} />
      <svg width={1920} height={1080} style={{position: "absolute", opacity: life(f, w("c4f", "more than"), b("c4g").s, 10, 12)}}>
        {Array.from({length: 9}).map((_, i) => {
          const q = prog(f, w("c4f", "more than") + i * 4, 6);
          const gx = 1360 + (i % 5) * 36 + Math.floor(i / 5) * 230;
          return i % 5 === 4 ? <line key={i} x1={gx - 150} y1={470} x2={gx + 6} y2={420} stroke={C.red} strokeWidth={5} opacity={q} /> : <line key={i} x1={gx} y1={410} x2={gx} y2={480} stroke={C.ink} strokeWidth={5} opacity={q} />;
        })}
      </svg>
      <T x={1500} y={520} at={w("c4f", "more than")} out={b("c4g").s} size={44} font="sc" w={600}>no news for two months</T>
      <Quote text={b("c4g").show ?? b("c4g").t} who={b("c4g").who!} s={b("c4g").s} e={b("c4g").e} out={b("c4h").s} x={1420} y={300} w={880} size={46} />

      <T x={420} y={800} at={b("c4h").s} out={b("c4k").s} size={44} font="sc" w={500}>Francesco</T>
      <T x={1500} y={800} at={b("c4h").s} out={b("c4k").s} size={44} font="sc" color={C.red} w={500}>Margherita</T>
      {[0, 1].map((k) => {
        const p = letter(k);
        return f >= b("c4h").s && <Art key={k} name="letter" x={p.x} y={p.y} w={150} at={b("c4h").s + k * 10} out={b("c4k").s - 6} len={8} opacity={lettersO} />;
      })}
      <Quote text={b("c4i").t} who={b("c4i").who!} s={b("c4i").s} e={b("c4i").e} out={b("c4j").s - 2} y={130} size={50} />
      <Quote text={b("c4j").t} who={b("c4j").who!} s={b("c4j").s} e={b("c4j").e} out={b("c4k").s} y={130} size={48} w={1500} />

      <Compass cx={960} cy={560} size={520} o={compO} point={1} px={0.8 * mel} py={-0.8 * mel} mist={mel} showQualities={0} />
      <T x={960} y={60} at={b("c4k").s} out={b("c4m").s} size={44} font="fellI" w={1500}>melancholy · from Greek <span style={{fontStyle: "normal", fontFamily: FELL}}>μέλαινα χολή</span>, “black bile”</T>
      <T x={300} y={420} at={w("c4k", "low mood")} out={b("c4l").s} size={38} font="sc" color={C.black} w={460}>a low mood that won't lift</T>
      <T x={1620} y={420} at={w("c4k", "no interest")} out={b("c4l").s} size={38} font="sc" color={C.black} w={460}>no interest in daily life</T>
      <Art name="shadows" x={260} y={600} w={420} at={w("c4l", "terrible black shapes")} out={b("c4m").s - 4} opacity={0.85} len={40} />
      <Art name="shadows" x={1660} y={560} w={380} at={w("c4l", "terrible black shapes") + 12} out={b("c4m").s - 4} opacity={0.7} len={40} rot={6} />

      <Note place="King Duarte of Portugal" when="1391–1438" at={b("c4m").s} out={b("c4n").s} />
      <Art name="crown" x={960} y={470} w={460} at={b("c4m").s + 4} out={b("c4n").s - 4} />
      <T x={960} y={680} at={w("c4m", "lifelong")} out={b("c4n").s - 4} size={44} font="fellI">a lifelong “melancholic humour”</T>
      <T x={960} y={760} at={w("c4m", "regent")} out={b("c4n").s - 4} size={38} font="sc" color={C.black}>it began while he ruled as regent, in a time of plague</T>

      <Art name="monks" x={960} y={mv(f, b("c4n2").s - 6, 600, 760)} w={1300} at={b("c4n").s} out={b("c4o").s - 4} opacity={mv(f, b("c4n2").s - 6, 1, 0.55)} />
      <T x={960} y={170} at={b("c4n").s + 4} out={b("c4n2").s - 6} size={84} font="fraktur">acedia</T>
      <T x={960} y={290} at={w("c4n", "a deadly")} out={b("c4n2").s - 6} size={40} font="fellI">a deadly listlessness of the spirit</T>
      <Quote text={b("c4n2").show ?? b("c4n2").t} who={b("c4n2").who!} s={b("c4n2").s} e={b("c4n2").e} out={b("c4o").s} y={160} w={1500} size={48} />
      <Question text="So if you were melancholy in the Middle Ages, what would your doctor do?" at={b("c4o").s} out={end - 14} y={450} size={56} />
    </AbsoluteFill>
  );
};
