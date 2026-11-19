import { useId, useMemo } from 'react';
import { ATTRIBUTE_META } from '../../core/constants';
import type { Attribute } from '../../types/memory';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 流出 Memory が変質した敵の手続き生成ビジュアル（ID ごとに形が変わる） */
export function EnemyArt({ id, attribute, boss = false }: { id: string; attribute: Attribute; boss?: boolean }) {
  const uid = `en${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const color = ATTRIBUTE_META[attribute].color;
  const shape = useMemo(() => {
    const r = rng(hash(id));
    const n = 7 + Math.floor(r() * 9);
    const pts: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const rad = i % 2 === 0 ? 62 + r() * 26 : 34 + r() * 18;
      pts.push(`${(100 + Math.cos(a) * rad).toFixed(1)},${(100 + Math.sin(a) * rad).toFixed(1)}`);
    }
    const eyes = 1 + Math.floor(r() * 3);
    const bars = Array.from({ length: 6 }, () => ({ x: 20 + r() * 140, y: 30 + r() * 140, w: 14 + r() * 40, h: 2 + r() * 4 }));
    return { pts: pts.join(' '), eyes, bars, rot: r() * 360 };
  }, [id]);

  return (
    <svg viewBox="0 0 200 200" className={`enemy-art ${boss ? 'is-boss' : ''}`} role="img" aria-hidden>
      <defs>
        <radialGradient id={`${uid}-g`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor="#03060e" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-f`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="100" cy="100" r="96" fill={`url(#${uid}-g)`} />
      {boss && <circle className="enemy-art__crown" cx="100" cy="100" r="92" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="10 6" />}
      <g filter={`url(#${uid}-f)`} transform={`rotate(${shape.rot} 100 100)`}>
        <polygon className="enemy-art__body" points={shape.pts} fill="#0a0f22" stroke={color} strokeWidth="2" />
      </g>
      <g filter={`url(#${uid}-f)`}>
        {Array.from({ length: shape.eyes }, (_, i) => {
          const off = (i - (shape.eyes - 1) / 2) * 26;
          return (
            <g key={i}>
              <ellipse cx={100 + off} cy="100" rx="11" ry="7" fill={color} />
              <ellipse className="enemy-art__pupil" cx={100 + off} cy="100" rx="2.5" ry="6" fill="#03060e" />
            </g>
          );
        })}
      </g>
      {shape.bars.map((b, i) => (
        <rect key={i} className="enemy-art__bar" style={{ animationDelay: `${i * 0.3}s` }} x={b.x} y={b.y} width={b.w} height={b.h} fill={i % 2 ? '#ff3b5c' : color} opacity="0.6" />
      ))}
    </svg>
  );
}
