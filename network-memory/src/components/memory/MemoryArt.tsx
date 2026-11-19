import { useId, useMemo, useState, type ReactNode } from 'react';
import { ATTRIBUTE_META } from '../../core/constants';
import type { MemoryCategory, MemoryDefinition } from '../../types/memory';
import './MemoryArt.css';

/**
 * Memory のイラスト。
 * - illustration が画像パス/URL の場合はその画像を表示する。
 * - "gen:<motif>" の場合（または画像読み込み失敗時）は、ID をシードにした手続き生成 SVG を描画する。
 *   正式なイラストが用意できたら、JSON の illustration を差し替えるだけで置き換わる。
 */

export type ArtMask = 'silhouette' | 'unknown' | null;

interface Props {
  def: MemoryDefinition;
  animated?: boolean;
  /** silhouette: 発見済み未所持 / unknown: 未発見 */
  mask?: ArtMask;
  className?: string;
}

const W = 300;
const H = 400;

// ---------------------------------------------------------------- seeded random

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const range = (r: Rng, min: number, max: number) => min + r() * (max - min);

// ---------------------------------------------------------------- motifs

interface MotifCtx {
  c: string;
  rnd: Rng;
  fill: string;
  dark: string;
  silhouette: boolean;
}

const bust = ({ c, fill }: MotifCtx, dx = 0): ReactNode => (
  <g transform={`translate(${dx} 0)`}>
    <circle className="art-spin" cx={150} cy={148} r={70} fill="none" stroke={c} strokeOpacity={0.35} strokeDasharray="3 7" />
    <circle cx={150} cy={148} r={40} fill={fill} stroke={c} strokeWidth={1.5} />
    <path d="M64 344 C68 264 104 214 150 214 C196 214 232 264 236 344 Z" fill={fill} stroke={c} strokeWidth={1.5} />
    {[236, 256, 276, 296, 316].map((y, i) => (
      <line key={y} x1={96 - i * 4} x2={204 + i * 4} y1={y} y2={y} stroke={c} strokeOpacity={0.18} />
    ))}
  </g>
);

const MOTIFS: Record<string, (ctx: MotifCtx) => ReactNode> = {
  human: (ctx) => bust(ctx),

  lamplighter: (ctx) => (
    <>
      {bust(ctx, -26)}
      <circle className="art-pulse" cx={232} cy={102} r={34} fill="#ffe08a" opacity={0.22} />
      <line x1={232} y1={344} x2={232} y2={98} stroke={ctx.c} strokeWidth={3} />
      <path d="M216 98 L248 98 L240 78 L224 78 Z" fill={ctx.dark} stroke={ctx.c} strokeWidth={1.5} />
      <path d="M226 98 L238 98 L235 118 L229 118 Z" fill="#fff4c4" />
      <line x1={232} y1={78} x2={232} y2={66} stroke={ctx.c} strokeWidth={2} />
    </>
  ),

  librarian: (ctx) => (
    <>
      {bust(ctx)}
      <path d="M92 300 L150 284 L150 344 L92 360 Z" fill={ctx.dark} stroke={ctx.c} strokeWidth={1.5} />
      <path d="M208 300 L150 284 L150 344 L208 360 Z" fill={ctx.dark} stroke={ctx.c} strokeWidth={1.5} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} stroke={ctx.c} strokeOpacity={0.5}>
          <line x1={102} y1={308 + i * 10} x2={142} y2={297 + i * 10} />
          <line x1={198} y1={308 + i * 10} x2={158} y2={297 + i * 10} />
        </g>
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <rect
          key={i}
          className="art-float"
          style={{ animationDelay: `${i * -0.7}s` }}
          x={range(ctx.rnd, 40, 250)}
          y={range(ctx.rnd, 40, 120)}
          width={range(ctx.rnd, 12, 26)}
          height={4}
          fill={ctx.c}
          opacity={range(ctx.rnd, 0.25, 0.6)}
        />
      ))}
    </>
  ),

  cat: ({ c, fill, dark, rnd }) => (
    <>
      {Array.from({ length: 10 }, (_, i) => (
        <text
          key={i}
          className="art-float"
          style={{ animationDelay: `${i * -0.5}s` }}
          x={range(rnd, 30, 260)}
          y={range(rnd, 50, 360)}
          fill={c}
          opacity={range(rnd, 0.2, 0.5)}
          fontSize={range(rnd, 12, 22)}
          fontFamily="monospace"
        >
          {rnd() > 0.5 ? '1' : '0'}
        </text>
      ))}
      <path d="M84 266 L92 146 L136 194 Q150 190 164 194 L208 146 L216 266 Q216 320 150 326 Q84 320 84 266 Z" fill={fill} stroke={c} strokeWidth={1.5} />
      <path d="M100 172 L106 214 L126 196 Z M200 172 L194 214 L174 196 Z" fill={c} opacity={0.35} />
      <ellipse cx={122} cy={246} rx={16} ry={11} fill={c} />
      <ellipse cx={178} cy={246} rx={16} ry={11} fill={c} />
      <ellipse className="art-blink" cx={122} cy={246} rx={3} ry={10} fill={dark} />
      <ellipse className="art-blink" cx={178} cy={246} rx={3} ry={10} fill={dark} />
      <path d="M143 272 L157 272 L150 280 Z" fill={c} />
      <g stroke={c} strokeOpacity={0.6} strokeWidth={1.2}>
        <line x1={112} y1={280} x2={56} y2={270} />
        <line x1={112} y1={288} x2={58} y2={296} />
        <line x1={188} y1={280} x2={244} y2={270} />
        <line x1={188} y1={288} x2={242} y2={296} />
      </g>
    </>
  ),

  hound: ({ c, dark, rnd }) => {
    const pts: string[] = [];
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = i % 2 === 0 ? range(rnd, 104, 124) : range(rnd, 72, 84);
      pts.push(`${(150 + Math.cos(a) * r).toFixed(1)},${(210 + Math.sin(a) * r).toFixed(1)}`);
    }
    return (
      <>
        <polygon className="art-spin art-spin--slow" points={pts.join(' ')} fill="none" stroke={c} strokeWidth={1.5} strokeOpacity={0.7} />
        <circle cx={150} cy={210} r={66} fill={dark} stroke={c} strokeOpacity={0.4} />
        <path d="M94 210 Q150 160 206 210 Q150 260 94 210 Z" fill={c} opacity={0.88} />
        <ellipse className="art-blink" cx={150} cy={210} rx={6} ry={24} fill={dark} />
        {Array.from({ length: 7 }, (_, i) => (
          <rect
            key={i}
            className="art-glitch"
            style={{ animationDelay: `${i * 0.3}s` }}
            x={range(rnd, 50, 220)}
            y={range(rnd, 110, 310)}
            width={range(rnd, 20, 60)}
            height={range(rnd, 3, 8)}
            fill={i % 2 ? '#ff3b5c' : c}
            opacity={0.55}
          />
        ))}
      </>
    );
  },

  key: ({ c, fill, rnd }) => (
    <>
      <circle cx={150} cy={128} r={46} fill="none" stroke={c} strokeWidth={14} strokeOpacity={0.9} />
      <circle className="art-spin" cx={150} cy={128} r={20} fill="none" stroke={c} strokeWidth={3} strokeDasharray="6 4" />
      <rect x={143} y={170} width={14} height={172} fill={fill} stroke={c} strokeWidth={1.5} />
      <rect x={157} y={300} width={28} height={12} fill={fill} stroke={c} strokeWidth={1.5} />
      <rect x={157} y={322} width={18} height={12} fill={fill} stroke={c} strokeWidth={1.5} />
      {Array.from({ length: 16 }, (_, i) => (
        <circle
          key={i}
          cx={i < 8 ? 150 + Math.cos(i) * range(rnd, 38, 54) : range(rnd, 142, 160)}
          cy={i < 8 ? 128 + Math.sin(i) * range(rnd, 38, 54) : range(rnd, 180, 335)}
          r={range(rnd, 1.5, 4)}
          fill="#c9763f"
          opacity={0.55}
        />
      ))}
    </>
  ),

  crossing: ({ c, dark, rnd }) => (
    <>
      {Array.from({ length: 11 }, (_, i) => {
        const x = i * 28 - 4;
        const h = range(rnd, 30, 110);
        return <rect key={i} x={x} y={232 - h} width={24} height={h} fill={dark} stroke={c} strokeOpacity={0.25} />;
      })}
      <line x1={0} y1={232} x2={W} y2={232} stroke={c} strokeOpacity={0.6} />
      <path d="M150 232 L20 400 L280 400 Z" fill={dark} stroke={c} strokeOpacity={0.35} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={110 - i * 14} y={330 + i * 12} width={80 + i * 28} height={5} fill={c} opacity={0.3} />
      ))}
      <line x1={70} y1={400} x2={70} y2={180} stroke={c} strokeWidth={4} strokeOpacity={0.8} />
      <rect x={54} y={116} width={32} height={74} fill={dark} stroke={c} strokeWidth={1.5} />
      <circle className="art-pulse" cx={70} cy={134} r={9} fill="#ff3b5c" />
      <circle className="art-pulse" cx={70} cy={134} r={18} fill="#ff3b5c" opacity={0.25} />
      <circle cx={70} cy={154} r={8} fill={c} opacity={0.18} />
      <circle cx={70} cy={174} r={8} fill={c} opacity={0.18} />
      {Array.from({ length: 46 }, (_, i) => {
        const x = range(rnd, 0, W);
        const y = range(rnd, 0, H);
        return <line key={i} className="art-rain" style={{ animationDelay: `${-rnd() * 1.2}s` }} x1={x} y1={y} x2={x - 5} y2={y + 20} stroke={c} strokeOpacity={0.4} />;
      })}
    </>
  ),

  flower: ({ c, fill, rnd }) => {
    const flower = (cx: number, cy: number, s: number, key: string) => (
      <g key={key} transform={`translate(${cx} ${cy}) scale(${s})`}>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i} cx={Math.cos(a) * 30} cy={Math.sin(a) * 30} r={27} fill={fill} stroke={c} strokeWidth={1.5} />;
        })}
        <circle r={13} fill="#fff1a8" />
      </g>
    );
    return (
      <>
        <path d="M150 232 C 140 280, 168 320, 142 392" fill="none" stroke={c} strokeWidth={3} />
        <path d="M148 300 C 110 290, 96 310, 92 330 C 120 330, 140 318, 148 300 Z" fill={c} opacity={0.4} />
        <path d="M150 340 C 186 330, 200 350, 206 368 C 178 370, 158 358, 150 340 Z" fill={c} opacity={0.4} />
        {flower(150, 196, 1, 'main')}
        {Array.from({ length: 4 }, (_, i) => flower(range(rnd, 40, 260), range(rnd, 60, 360), range(rnd, 0.22, 0.38), `s${i}`))}
      </>
    );
  },

  signal: ({ c, dark }) => (
    <>
      {[44, 86, 128, 170].map((r, i) => {
        const a1 = (-140 * Math.PI) / 180;
        const a2 = (-40 * Math.PI) / 180;
        const d = `M ${150 + Math.cos(a1) * r} ${300 + Math.sin(a1) * r} A ${r} ${r} 0 0 1 ${150 + Math.cos(a2) * r} ${300 + Math.sin(a2) * r}`;
        return (
          <path key={r} className="art-pulse" style={{ animationDelay: `${i * 0.35}s` }} d={d} fill="none" stroke={c} strokeWidth={9 - i * 1.6} strokeLinecap="square" opacity={1 - i * 0.2} />
        );
      })}
      <circle cx={150} cy={300} r={11} fill={c} />
      <rect x={40} y={334} width={220} height={34} fill={dark} stroke={c} strokeOpacity={0.5} />
      <text x={52} y={356} fill={c} fontSize={13} fontFamily="monospace">
        {'> CONNECTED'}
      </text>
      <rect className="art-blink-fast" x={150} y={344} width={8} height={14} fill={c} />
    </>
  ),

  outflow: ({ c, dark, rnd }) => (
    <>
      <circle cx={150} cy={200} r={90} fill="none" stroke={c} strokeOpacity={0.25} />
      <circle className="art-pulse" cx={150} cy={200} r={52} fill="none" stroke={c} strokeOpacity={0.5} />
      {Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2 + range(rnd, -0.05, 0.05);
        const r1 = 30;
        const r2 = range(rnd, 80, 170);
        return <line key={i} x1={150 + Math.cos(a) * r1} y1={200 + Math.sin(a) * r1} x2={150 + Math.cos(a) * r2} y2={200 + Math.sin(a) * r2} stroke={c} strokeOpacity={0.55} />;
      })}
      {Array.from({ length: 11 }, (_, i) => {
        const a = range(rnd, 0, Math.PI * 2);
        const r = range(rnd, 70, 150);
        const x = 150 + Math.cos(a) * r;
        const y = 200 + Math.sin(a) * r;
        return (
          <rect
            key={i}
            className="art-float"
            style={{ animationDelay: `${i * -0.4}s` }}
            x={x - 11}
            y={y - 15}
            width={22}
            height={30}
            fill={dark}
            stroke={i % 3 === 0 ? '#ffffff' : c}
            strokeWidth={1.5}
            transform={`rotate(${range(rnd, -40, 40)} ${x} ${y})`}
          />
        );
      })}
      <circle cx={150} cy={200} r={24} fill={c} />
      <circle cx={150} cy={200} r={10} fill="#ffffff" />
    </>
  ),

  void: ({ c, rnd }) => {
    const poly = (n: number, r: number, rot = 0) =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + rot;
        return `${(150 + Math.cos(a) * r).toFixed(1)},${(200 + Math.sin(a) * r).toFixed(1)}`;
      }).join(' ');
    return (
      <>
        <polygon className="art-spin art-spin--slow" points={poly(6, 122)} fill="none" stroke={c} strokeOpacity={0.4} />
        <polygon className="art-spin art-spin--reverse" points={poly(3, 98, -Math.PI / 2)} fill="none" stroke={c} strokeOpacity={0.6} strokeWidth={1.5} />
        <polygon className="art-spin" points={poly(4, 76, Math.PI / 4)} fill="none" stroke={c} strokeOpacity={0.35} />
        {Array.from({ length: 30 }, (_, i) => {
          const a = range(rnd, 0, Math.PI * 2);
          const r = range(rnd, 56, 140);
          return <circle key={i} cx={150 + Math.cos(a) * r} cy={200 + Math.sin(a) * r} r={range(rnd, 0.8, 2.6)} fill={c} opacity={range(rnd, 0.2, 0.8)} />;
        })}
        <circle cx={150} cy={200} r={50} fill="#000" stroke={c} strokeWidth={1.5} />
        <circle className="art-pulse" cx={150} cy={200} r={58} fill="none" stroke={c} strokeOpacity={0.3} strokeWidth={6} />
      </>
    );
  },

  mask: ({ c, fill, dark, rnd }) => (
    <>
      <path d="M76 166 Q150 108 224 166 Q232 264 150 322 Q68 264 76 166 Z" fill={fill} stroke={c} strokeWidth={1.5} />
      {Array.from({ length: 14 }, (_, i) => (
        <rect
          key={i}
          className="art-glitch"
          style={{ animationDelay: `${i * 0.21}s` }}
          x={range(rnd, 70, 170)}
          y={136 + i * 12}
          width={range(rnd, 30, 90)}
          height={range(rnd, 2, 6)}
          fill={['#ff3b5c', '#ffffff', c][i % 3]}
          opacity={0.4}
        />
      ))}
      <path d="M98 204 Q120 186 142 206 Q120 218 98 204 Z" fill={dark} stroke={c} strokeWidth={1.2} />
      <path d="M202 204 Q180 186 158 206 Q180 218 202 204 Z" fill={dark} stroke={c} strokeWidth={1.2} />
      <path d="M126 270 Q150 262 174 270" fill="none" stroke={dark} strokeWidth={3} />
    </>
  ),

  cube: ({ c }) => (
    <>
      <polygon points="150,120 230,166 150,212 70,166" fill={c} opacity={0.55} />
      <polygon points="70,166 150,212 150,300 70,254" fill={c} opacity={0.3} />
      <polygon points="230,166 150,212 150,300 230,254" fill={c} opacity={0.18} />
      <polygon points="150,120 230,166 230,254 150,300 70,254 70,166" fill="none" stroke={c} strokeWidth={1.5} />
      <circle className="art-spin" cx={150} cy={210} r={118} fill="none" stroke={c} strokeOpacity={0.3} strokeDasharray="2 10" />
    </>
  ),

  blank: ({ c, rnd, silhouette }) => {
    const figure = (fill: string, dx: number, opacity = 1, cls = '') => (
      <g className={cls} transform={`translate(${dx} 0)`} fill={fill} opacity={opacity}>
        <path d="M58 132 Q150 34 242 132 Q196 118 150 120 Q104 118 58 132 Z" />
        <line x1={150} y1={82} x2={178} y2={246} stroke={fill} strokeWidth={3} />
        <circle cx={150} cy={164} r={30} />
        <path d="M116 166 Q116 128 150 128 Q184 128 184 166 L194 252 Q150 264 106 252 Z" />
        <path d="M114 236 Q150 220 186 236 L220 366 L80 366 Z" />
      </g>
    );
    return (
      <>
        {!silhouette && figure('#3ee8ff', -4, 0.45, 'art-glitch')}
        {!silhouette && figure('#ff3b5c', 4, 0.45, 'art-glitch art-glitch--alt')}
        {figure(silhouette ? '#0d1630' : '#f4f8ff', 0)}
        <g fill="none" stroke={silhouette ? '#4b5d80' : '#8fa6cc'} strokeWidth={1.4} opacity={0.75}>
          <circle cx={150} cy={164} r={30} />
          <path d="M124 238 Q150 252 176 238" />
        </g>
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            className="art-float"
            style={{ animationDelay: `${i * -0.6}s` }}
            x={range(rnd, 20, 270)}
            y={range(rnd, 20, 380)}
            width={range(rnd, 4, 14)}
            height={range(rnd, 4, 14)}
            fill="#f4f8ff"
            opacity={range(rnd, 0.3, 0.8)}
          />
        ))}
        <circle cx={150} cy={164} r={30} fill="none" stroke={c} strokeOpacity={0.2} />
      </>
    );
  },
};

const CATEGORY_FALLBACK: Record<MemoryCategory, string> = {
  HUMAN: 'human',
  CREATURE: 'hound',
  CONCEPT: 'void',
  OBJECT: 'cube',
  LOCATION: 'crossing',
  EVENT: 'outflow',
  UNKNOWN: 'blank',
};

function resolveMotif(def: MemoryDefinition): string {
  const m = def.illustration.startsWith('gen:') ? def.illustration.slice(4) : '';
  return MOTIFS[m] ? m : CATEGORY_FALLBACK[def.category];
}

// ---------------------------------------------------------------- component

export function MemoryArt({ def, animated = false, mask = null, className = '' }: Props) {
  const rawId = useId();
  const uid = `art${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [imgFailed, setImgFailed] = useState(false);
  const isImage = !def.illustration.startsWith('gen:') && !imgFailed;
  const color = ATTRIBUTE_META[def.attribute].color;

  const cls = `memory-art ${animated ? 'is-animated' : ''} ${mask ? `is-${mask}` : ''} ${className}`;

  const nodes = useMemo(() => {
    const rnd = mulberry32(hashString(`${def.id}:bg`));
    return Array.from({ length: 16 }, () => ({ x: range(rnd, 10, W - 10), y: range(rnd, 10, H - 10), r: range(rnd, 1, 2.4) }));
  }, [def.id]);

  if (isImage && !mask) {
    return (
      <div className={cls}>
        <img src={def.illustration} alt={def.name} loading="lazy" onError={() => setImgFailed(true)} />
      </div>
    );
  }

  const motifColor = mask === 'silhouette' ? '#4b5d80' : color;
  const ctx: MotifCtx = {
    c: motifColor,
    rnd: mulberry32(hashString(def.id)),
    fill: mask === 'silhouette' ? '#0d1630' : `url(#${uid}-mf)`,
    dark: '#050b18',
    silhouette: mask === 'silhouette',
  };

  return (
    <div className={cls}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={mask === 'unknown' ? '未発見のMemory' : def.name} preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id={`${uid}-bg`} cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor={mask ? '#16223f' : color} stopOpacity={mask ? 1 : 0.34} />
            <stop offset="55%" stopColor="#0a1430" />
            <stop offset="100%" stopColor="#03060e" />
          </radialGradient>
          <linearGradient id={`${uid}-mf`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.85} />
            <stop offset="100%" stopColor={color} stopOpacity={0.12} />
          </linearGradient>
          <pattern id={`${uid}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0 L0 0 0 20" fill="none" stroke={motifColor} strokeOpacity={0.12} strokeWidth={1} />
          </pattern>
          <pattern id={`${uid}-scan`} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="1" fill="#000" opacity={0.35} />
          </pattern>
          <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={W} height={H} fill={`url(#${uid}-bg)`} />
        <rect width={W} height={H} fill={`url(#${uid}-grid)`} />

        {mask === 'unknown' ? (
          <UnknownLayer seed={def.id} />
        ) : (
          <>
            {!mask && (
              <g opacity={0.5}>
                {nodes.map((n, i) => {
                  const next = nodes[(i + 3) % nodes.length];
                  return (
                    <g key={i}>
                      {i % 2 === 0 && <line x1={n.x} y1={n.y} x2={next.x} y2={next.y} stroke={color} strokeOpacity={0.18} />}
                      <circle cx={n.x} cy={n.y} r={n.r} fill={color} opacity={0.6} />
                    </g>
                  );
                })}
              </g>
            )}
            <g filter={mask ? undefined : `url(#${uid}-glow)`}>{MOTIFS[resolveMotif(def)](ctx)}</g>
          </>
        )}

        <rect width={W} height={H} fill={`url(#${uid}-scan)`} />
        <g stroke={mask ? '#4b5d80' : color} strokeWidth={2} fill="none" opacity={0.7}>
          <path d="M12 34 L12 12 L34 12" />
          <path d="M266 12 L288 12 L288 34" />
          <path d="M12 366 L12 388 L34 388" />
          <path d="M266 388 L288 388 L288 366" />
        </g>
        <text x={22} y={380} fill={mask ? '#4b5d80' : color} fontSize={11} fontFamily="monospace" opacity={0.85}>
          {mask === 'unknown' ? 'MEM-????' : def.id}
        </text>
        {mask === 'silhouette' && (
          <text x={150} y={206} textAnchor="middle" fill="#7489ab" fontSize={14} fontFamily="monospace" letterSpacing="3">
            NOT COLLECTED
          </text>
        )}
      </svg>
    </div>
  );
}

function UnknownLayer({ seed }: { seed: string }) {
  const rnd = mulberry32(hashString(`${seed}:unknown`));
  return (
    <>
      {Array.from({ length: 26 }, (_, i) => (
        <rect key={i} x={range(rnd, 0, W)} y={range(rnd, 0, H)} width={range(rnd, 10, 80)} height={range(rnd, 2, 6)} fill="#7489ab" opacity={range(rnd, 0.08, 0.3)} />
      ))}
      <text x={150} y={232} textAnchor="middle" fill="#7489ab" fontSize={96} fontFamily="monospace" opacity={0.55}>
        ?
      </text>
    </>
  );
}
