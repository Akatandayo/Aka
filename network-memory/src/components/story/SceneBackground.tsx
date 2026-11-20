import { useMemo } from 'react';
import './SceneBackground.css';

/**
 * ストーリーの背景（ID で指定）。画像素材が無いため手続き生成で描く。
 * - network-void: 接続の狭間
 * - null-city-rain: 雨の NULL CITY（lit = 0〜1 で灯っている窓の割合。世界修復で明るくなる）
 * - akarua-office: 何でも屋「アカルア」の店内
 * - akarua-night: 閉店後のアカルア（照明を落とした夜）
 */
export function SceneBackground({ id, lit = 0.3 }: { id: string | null; lit?: number }) {
  return (
    <div className={`scene scene--${id ?? 'none'}`} aria-hidden>
      {id === 'network-void' && <VoidScene />}
      {id === 'null-city-rain' && <CityScene lit={lit} />}
      {id === 'akarua-office' && <OfficeScene />}
      {id === 'akarua-night' && <OfficeScene night />}
      <div className="scene__vignette" />
    </div>
  );
}

function rand(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function VoidScene() {
  const pts = useMemo(() => {
    const r = rand(7);
    return Array.from({ length: 40 }, () => ({ x: r() * 1600, y: r() * 900, s: 1 + r() * 3, d: r() * 6 }));
  }, []);
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="void-g" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#1b1450" />
          <stop offset="100%" stopColor="#02030a" />
        </radialGradient>
        <pattern id="void-grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M60 0 L0 0 0 60" fill="none" stroke="#3ee8ff" strokeOpacity="0.08" />
        </pattern>
      </defs>
      <rect width="1600" height="900" fill="url(#void-g)" />
      <rect width="1600" height="900" fill="url(#void-grid)" />
      {pts.map((p, i) => (
        <rect key={i} className="scene__float" style={{ animationDelay: `${-p.d}s` }} x={p.x} y={p.y} width={p.s * 3} height={p.s} fill={i % 5 ? '#3ee8ff' : '#ff3b5c'} opacity="0.5" />
      ))}
      <circle className="scene__pulse" cx="800" cy="450" r="160" fill="none" stroke="#9b6bff" strokeOpacity="0.4" />
    </svg>
  );
}

function CityScene({ lit }: { lit: number }) {
  const { buildings, rain } = useMemo(() => {
    const r = rand(42);
    const buildings = Array.from({ length: 18 }, (_, i) => {
      const w = 70 + r() * 60;
      const h = 220 + r() * 420;
      const x = i * 92 - 30;
      const windows = Array.from({ length: Math.floor(h / 44) * 3 }, (_, j) => ({
        x: x + 12 + (j % 3) * (w / 3.4),
        y: 900 - h + 20 + Math.floor(j / 3) * 44,
        on: r(),
      }));
      return { x, w, h, windows };
    });
    const rain = Array.from({ length: 90 }, () => ({ x: r() * 1700, y: r() * 900, d: r() * 1.2 }));
    return { buildings, rain };
  }, []);
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="city-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050815" />
          <stop offset="100%" stopColor="#141e3c" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#city-sky)" />
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={900 - b.h} width={b.w} height={b.h} fill="#070b18" stroke="#3ee8ff" strokeOpacity="0.08" />
          {b.windows.map((w, j) => (
            <rect key={j} x={w.x} y={w.y} width="12" height="16" fill={w.on < lit ? '#ffd27a' : '#1a2340'} opacity={w.on < lit ? 0.85 : 0.6} />
          ))}
        </g>
      ))}
      <rect y="820" width="1600" height="80" fill="#04060e" />
      <rect y="826" width="1600" height="2" fill="#3ee8ff" opacity="0.15" />
      {rain.map((d, i) => (
        <line key={i} className="scene__rain" style={{ animationDelay: `${-d.d}s` }} x1={d.x} y1={d.y} x2={d.x - 10} y2={d.y + 40} stroke="#9fc3ff" strokeOpacity="0.35" />
      ))}
    </svg>
  );
}

function OfficeScene({ night = false }: { night?: boolean }) {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="office-lamp" cx="70%" cy="40%" r={night ? '28%' : '60%'}>
          <stop offset="0%" stopColor="#ffcf8a" stopOpacity={night ? 0.3 : 0.45} />
          <stop offset="100%" stopColor="#ffcf8a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="office-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={night ? '#0e0c1a' : '#241a2a'} />
          <stop offset="100%" stopColor={night ? '#06050c' : '#120c16'} />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#office-wall)" />
      {/* window with rain */}
      <rect x="180" y="140" width="420" height="380" fill={night ? '#0b1630' : '#0a1226'} stroke="#6b4f3a" strokeWidth="14" />
      {night && (
        <g>
          <circle cx="520" cy="210" r="26" fill="#dfe8ff" opacity="0.5" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={194 + i * 66} y={430 - (i % 3) * 40} width="44" height={83 + (i % 3) * 40} fill="#050a18" />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={`w${i}`} x={210 + i * 47} y={455 - (i % 3) * 30} width="6" height="8" fill="#ffd27a" opacity="0.7" />
          ))}
        </g>
      )}
      <line x1="390" y1="140" x2="390" y2="520" stroke="#6b4f3a" strokeWidth="10" />
      <line x1="180" y1="330" x2="600" y2="330" stroke="#6b4f3a" strokeWidth="10" />
      {Array.from({ length: 24 }, (_, i) => (
        <line key={i} className="scene__rain" style={{ animationDelay: `${-(i % 7) * 0.17}s` }} x1={200 + ((i * 47) % 380)} y1={150 + ((i * 83) % 340)} x2={194 + ((i * 47) % 380)} y2={180 + ((i * 83) % 340)} stroke="#9fc3ff" strokeOpacity="0.4" />
      ))}
      {/* shelves */}
      <rect x="1080" y="120" width="380" height="460" fill="#1a1218" stroke="#6b4f3a" strokeWidth="6" />
      {[0, 1, 2, 3].map((r) => (
        <g key={r}>
          <rect x="1080" y={210 + r * 110} width="380" height="8" fill="#6b4f3a" />
          {Array.from({ length: 9 }, (_, c) => (
            <rect key={c} x={1096 + c * 40} y={150 + r * 110} width={18 + (c % 3) * 6} height={58 - (c % 2) * 10} fill={['#3a5a8a', '#8a3a4a', '#4a7a5a', '#b69cff'][(c + r) % 4]} opacity="0.7" />
          ))}
        </g>
      ))}
      {/* sign */}
      <g>
        <rect x="660" y="90" width="300" height="80" rx="6" fill="#0d0a10" stroke="#ffcf8a" strokeOpacity="0.6" />
        <text x="810" y="143" textAnchor="middle" fill="#ffcf8a" fillOpacity={night ? 0.35 : 1} fontSize="40" fontFamily="var(--f-display)" letterSpacing="8" className={night ? '' : 'scene__sign'}>
          AKARUA
        </text>
      </g>
      {/* desk & lamp */}
      <rect x="0" y="700" width="1600" height="200" fill="#1d1418" />
      <rect x="760" y="640" width="640" height="40" fill="#5a3f2e" />
      <path d="M1180 640 L1200 520 L1240 520 L1260 640 Z" fill="#2a2024" />
      <circle className="scene__lamp" cx="1220" cy="520" r={night ? 18 : 30} fill="#ffd9a0" opacity={night ? 0.6 : 0.9} />
      <rect width="1600" height="900" fill="url(#office-lamp)" />
      {night && <rect width="1600" height="900" fill="#05040e" opacity="0.35" />}
    </svg>
  );
}
