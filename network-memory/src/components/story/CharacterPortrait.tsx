import { useId } from 'react';
import type { CharacterDefinition } from '../../types/story';
import './CharacterPortrait.css';

/**
 * 立ち絵（表情差分つき）。
 * 画像（portraits[expr]）があればそれを表示し、無ければ手続き生成の立ち絵を描く。
 * 髪型・装飾は人物ごとに変える（HARUKA: 長髪 / HITORI: 短髪 + {Glitch} / MOMIJI: ボブ + 紅葉の髪飾り）。
 */

type Style = 'long' | 'short' | 'bob';
const STYLE_BY_ID: Record<string, Style> = { 'CHR-HARUKA': 'long', 'CHR-HITORI': 'short', 'CHR-MOMIJI': 'bob' };

interface Props {
  character: CharacterDefinition;
  expr: string;
  speaking?: boolean;
  className?: string;
}

export function CharacterPortrait({ character, expr, speaking = false, className = '' }: Props) {
  const uid = `cp${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const image = character.portraits?.[expr] ?? character.portraits?.normal;
  const cls = `portrait ${speaking ? 'is-speaking' : ''} portrait--${character.id.toLowerCase()} ${className}`;
  if (image) {
    return (
      <div className={cls}>
        <img src={image} alt={`${character.name}（${expr}）`} />
      </div>
    );
  }
  const style = STYLE_BY_ID[character.id] ?? 'short';
  const hair = character.hair ?? '#2a2f44';
  const eyes = character.eyes ?? character.color;
  const accent = character.color;
  const glitch = character.id === 'CHR-HITORI';

  const figure = (
    <>
      {/* back hair */}
      {style === 'long' && <path d="M88 150 C70 230 72 330 96 420 L204 420 C228 330 230 230 212 150 Z" fill={hair} />}
      {style === 'bob' && <path d="M92 140 C80 190 86 236 104 262 L196 262 C214 236 220 190 208 140 Z" fill={hair} />}
      {/* body */}
      <path d="M70 480 C74 392 104 344 150 340 C196 344 226 392 230 480 Z" fill={`url(#${uid}-coat)`} stroke={accent} strokeOpacity="0.55" strokeWidth="1.5" />
      <path d="M134 342 L150 380 L166 342" fill="none" stroke={accent} strokeWidth="2" strokeOpacity="0.8" />
      {/* neck */}
      <rect x="138" y="292" width="24" height="54" rx="8" fill="#f1d9c8" />
      {/* face */}
      <ellipse cx="150" cy="226" rx="54" ry="66" fill="#f7e3d5" />
      <ellipse cx="150" cy="236" rx="54" ry="58" fill={`url(#${uid}-shade)`} />
      {/* eyes */}
      <Eyes expr={expr} color={eyes} />
      <Brows expr={expr} color={hair} />
      <Mouth expr={expr} />
      {(expr === 'smile' || expr === 'pout' || expr === 'surprised') && (
        <>
          <ellipse cx="118" cy="258" rx="10" ry="5" fill="#ff8a8a" opacity="0.3" />
          <ellipse cx="182" cy="258" rx="10" ry="5" fill="#ff8a8a" opacity="0.3" />
        </>
      )}
      {/* front hair */}
      {style === 'long' && (
        <path d="M94 216 C90 150 120 128 150 128 C184 128 212 150 206 216 C196 182 176 166 152 162 C140 186 116 198 94 216 Z" fill={hair} />
      )}
      {style === 'short' && (
        <path
          d="M94 214 C86 152 118 124 152 124 C188 124 214 152 206 214 L196 186 L186 204 L176 176 L162 198 L152 170 L140 196 L128 174 L116 200 L106 182 Z"
          fill={hair}
        />
      )}
      {style === 'bob' && (
        <path d="M92 228 C86 156 118 130 150 130 C184 130 214 156 208 228 C200 196 186 178 168 174 C150 190 116 196 92 228 Z" fill={hair} />
      )}
      {/* accessories */}
      {style === 'bob' && <Leaf x={196} y={160} color={accent} />}
      {style === 'long' && <circle cx="150" cy="370" r="6" fill={accent} opacity="0.9" />}
    </>
  );

  return (
    <div className={cls}>
      <svg viewBox="0 0 300 480" role="img" aria-label={`${character.name}（${expr}）`}>
        <defs>
          <linearGradient id={`${uid}-coat`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a2440" />
            <stop offset="100%" stopColor="#0a1020" />
          </linearGradient>
          <radialGradient id={`${uid}-shade`} cx="50%" cy="30%" r="70%">
            <stop offset="70%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#7a4a3a" stopOpacity="0.18" />
          </radialGradient>
        </defs>
        {glitch && (
          <g className="portrait__glitch" opacity="0.5">
            <g transform="translate(-4 0)" style={{ mixBlendMode: 'screen' }} filter="url(#none)">
              <path d="M70 480 C74 392 104 344 150 340 C196 344 226 392 230 480 Z" fill="#3ee8ff" opacity="0.4" />
            </g>
            <g transform="translate(4 0)">
              <path d="M70 480 C74 392 104 344 150 340 C196 344 226 392 230 480 Z" fill="#ff3b5c" opacity="0.4" />
            </g>
          </g>
        )}
        {figure}
        {glitch && (
          <g className="portrait__noise">
            <rect x="96" y="210" width="60" height="4" fill="#3ee8ff" opacity="0.7" />
            <rect x="150" y="300" width="70" height="3" fill="#ff3b5c" opacity="0.7" />
            <rect x="80" y="400" width="50" height="5" fill="#3ee8ff" opacity="0.5" />
          </g>
        )}
      </svg>
    </div>
  );
}

function Eyes({ expr, color }: { expr: string; color: string }) {
  const y = 226;
  if (expr === 'smile') {
    return (
      <g fill="none" stroke="#3a2a2a" strokeWidth="3.5" strokeLinecap="round">
        <path d={`M112 ${y + 4} Q126 ${y - 10} 140 ${y + 4}`} />
        <path d={`M160 ${y + 4} Q174 ${y - 10} 188 ${y + 4}`} />
      </g>
    );
  }
  const ry = expr === 'surprised' ? 15 : expr === 'annoyed' || expr === 'serious' ? 9 : expr === 'sad' ? 11 : 13;
  const lid = expr === 'annoyed' ? 7 : expr === 'sad' ? 6 : 0;
  // 伏し目（sad）は瞳を下に寄せる
  const look = expr === 'sad' ? 3 : 0;
  return (
    <g>
      {[126, 174].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={y} rx="12" ry={ry} fill="#fff" />
          <ellipse cx={cx} cy={y + 1 + look} rx="8.5" ry={ry - 2} fill={color} />
          <ellipse cx={cx} cy={y + 2 + look} rx="4" ry={Math.max(3, ry - 6)} fill="#121624" />
          <circle cx={cx - 3} cy={y - 4 + look} r="2.6" fill="#fff" />
          <path d={`M${cx - 13} ${y - ry + 1 + lid} Q${cx} ${y - ry - 5 + lid} ${cx + 13} ${y - ry + 1 + lid}`} stroke="#2a2030" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

function Brows({ expr, color }: { expr: string; color: string }) {
  const tilt: Record<string, [number, number]> = { serious: [6, -2], annoyed: [7, -1], worried: [-6, 2], surprised: [-2, -6], pout: [3, 0], sad: [-7, 4] };
  const [inner, outer] = tilt[expr] ?? [0, 0];
  return (
    <g stroke={color} strokeWidth="4" strokeLinecap="round" fill="none">
      <path d={`M112 ${200 + outer} L138 ${198 + inner}`} />
      <path d={`M162 ${198 + inner} L188 ${200 + outer}`} />
    </g>
  );
}

function Mouth({ expr }: { expr: string }) {
  const c = '#8a4a4a';
  switch (expr) {
    case 'smile':
      return <path d="M136 268 Q150 282 164 268" stroke={c} strokeWidth="3" fill="#c96a6a" fillOpacity="0.35" strokeLinecap="round" />;
    case 'smirk':
      return <path d="M138 272 Q154 276 164 264" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />;
    case 'surprised':
      return <ellipse cx="150" cy="272" rx="7" ry="9" fill="#7a3a3a" />;
    case 'worried':
      return <path d="M138 276 Q150 268 162 276" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />;
    case 'pout':
      return <path d="M142 272 Q150 266 158 272 Q150 276 142 272" stroke={c} strokeWidth="2.5" fill="#c96a6a" fillOpacity="0.4" />;
    case 'annoyed':
      return <path d="M140 274 L162 270" stroke={c} strokeWidth="3" strokeLinecap="round" />;
    case 'sad':
      return <path d="M142 276 Q150 271 158 276" stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round" />;
    default:
      return <path d="M140 272 Q150 275 160 272" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />;
  }
}

function Leaf({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(20)`}>
      <path d="M0 -14 L4 -5 L13 -8 L8 1 L14 6 L4 6 L3 14 L0 8 L-3 14 L-4 6 L-14 6 L-8 1 L-13 -8 L-4 -5 Z" fill={color} stroke="#7a2a12" strokeWidth="1" />
      <line x1="0" y1="8" x2="0" y2="18" stroke="#7a2a12" strokeWidth="1.5" />
    </g>
  );
}
