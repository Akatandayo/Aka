import { useId } from 'react';
import type { CharacterDefinition } from '../../types/story';
import './CharacterPortrait.css';

/**
 * 立ち絵（表情差分つき）。
 * 画像（portraits[expr]）があればそれを表示し、無ければ手続き生成の立ち絵を描く。
 *
 * 人物ごとの見た目（作者の立ち絵を参考にしたデザイン）
 * - HITORI: 目にかかる長い前髪の黒髪、眠たげな垂れ目とクマ、ゆるめたネクタイ、肩から落ちかけたジャケット、ネクタイに指をかける仕草 + {Glitch}
 * - MOMIJI: 外ハネのボブ、ぐるぐる目、頬の斜線、白い襟の黒いセーター、背負ったカバン
 * - HARUKA: 長い灰色の髪、紫の瞳、ブラウスにカーディガン（仮のデザイン）
 */

type HairStyle = 'long' | 'shaggy' | 'layered' | 'short' | 'bob';
type Outfit = 'cardigan' | 'tie' | 'sweater' | 'plain';
type EyeStyle = 'default' | 'droopy' | 'spiral';
interface Look {
  hair: HairStyle;
  outfit: Outfit;
  eyes: EyeStyle;
  ears: 'both' | 'right' | 'none';
}
const LOOK: Record<string, Look> = {
  'CHR-HARUKA': { hair: 'long', outfit: 'cardigan', eyes: 'default', ears: 'none' },
  'CHR-HITORI': { hair: 'shaggy', outfit: 'tie', eyes: 'droopy', ears: 'right' },
  'CHR-MOMIJI': { hair: 'layered', outfit: 'sweater', eyes: 'spiral', ears: 'right' },
};
const DEFAULT_LOOK: Look = { hair: 'short', outfit: 'plain', eyes: 'default', ears: 'both' };

const SKIN = '#f8e6d8';
const SKIN_SHADE = '#e8c6b4';
const INK = '#2a2030';

/** 2 色を割合 t で混ぜる（#rrggbb） */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

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
  const look = LOOK[character.id] ?? DEFAULT_LOOK;
  const hair = character.hair ?? '#2a2f44';
  const eyes = character.eyes ?? character.color;
  const accent = character.color;
  const glitch = character.id === 'CHR-HITORI';
  const ids = { iris: `${uid}-iris`, hairHi: `${uid}-hairhi`, cloth: `${uid}-cloth`, face: `${uid}-face` };
  const dark = look.eyes === 'droopy';

  return (
    <div className={cls}>
      <svg viewBox="0 0 300 480" role="img" aria-label={`${character.name}（${expr}）`}>
        <defs>
          <linearGradient id={ids.iris} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mix(eyes, '#000000', dark ? 0.8 : 0.6)} />
            <stop offset="55%" stopColor={dark ? mix(eyes, '#000000', 0.45) : eyes} />
            <stop offset="100%" stopColor={dark ? eyes : mix(eyes, '#ffffff', 0.45)} />
          </linearGradient>
          <linearGradient id={ids.hairHi} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mix(hair, '#ffffff', 0.18)} />
            <stop offset="100%" stopColor={mix(hair, '#000000', 0.25)} />
          </linearGradient>
          <linearGradient id={ids.cloth} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id={ids.face} cx="50%" cy="38%" r="70%">
            <stop offset="65%" stopColor={SKIN} />
            <stop offset="100%" stopColor={SKIN_SHADE} />
          </radialGradient>
        </defs>

        {glitch && (
          <g className="portrait__glitch" aria-hidden>
            <path transform="translate(-5 -22)" d={SHOULDERS} fill="#3ee8ff" opacity="0.35" />
            <path transform="translate(5 -22)" d={SHOULDERS} fill="#ff3b5c" opacity="0.35" />
          </g>
        )}

        {look.outfit === 'sweater' && <Backpack />}
        <BackHair style={look.hair} fill={`url(#${ids.hairHi})`} />
        <g transform="translate(0 -22)">
          <Body outfit={look.outfit} accent={accent} shade={`url(#${ids.cloth})`} />
        </g>
        {/* neck */}
        <path d="M137 268 L137 314 Q150 322 163 314 L163 268 Z" fill={SKIN} />
        <path d="M137 286 Q150 302 163 286 L163 296 Q150 312 137 296 Z" fill={SKIN_SHADE} opacity="0.8" />
        <g transform="translate(0 -22)">
          <Collar outfit={look.outfit} accent={accent} />
        </g>
        {look.ears !== 'none' && (
          <>
            {look.ears === 'both' && <ellipse cx="99" cy="214" rx="7" ry="13" fill={SKIN_SHADE} />}
            <ellipse cx="201" cy="214" rx="7" ry="13" fill={SKIN_SHADE} />
          </>
        )}
        {/* face */}
        <path d={FACE} fill={`url(#${ids.face})`} />
        <path d="M108 180 C124 174 176 174 192 180 C186 188 114 188 108 180 Z" fill={SKIN_SHADE} opacity="0.3" />

        <Eyes expr={expr} style={look.eyes} irisFill={`url(#${ids.iris})`} />
        <Brows expr={expr} color={mix(hair, '#000000', 0.15)} />
        <path d="M151 236 q-2 6 -4 7" stroke={SKIN_SHADE} strokeWidth="2" fill="none" strokeLinecap="round" />
        <Mouth expr={expr} grin={look.eyes === 'spiral'} />
        {['smile', 'pout', 'surprised'].includes(expr) && (
          <>
            <ellipse cx="118" cy="244" rx="11" ry="5" fill="#ff8a8a" opacity="0.32" />
            <ellipse cx="182" cy="244" rx="11" ry="5" fill="#ff8a8a" opacity="0.32" />
          </>
        )}
        {look.eyes === 'spiral' && SPIRAL_EXPRS.includes(expr) && <CheekMarks />}

        <FrontHair style={look.hair} fill={`url(#${ids.hairHi})`} shine={mix(hair, '#ffffff', 0.45)} />
        {look.outfit === 'tie' && (
          <g transform="translate(0 -22)">
            <TieHand />
          </g>
        )}

        {glitch && (
          <g className="portrait__noise" aria-hidden>
            <rect x="96" y="204" width="62" height="4" fill="#3ee8ff" opacity="0.8" />
            <rect x="150" y="318" width="74" height="3" fill="#ff3b5c" opacity="0.8" />
            <rect x="78" y="410" width="56" height="5" fill="#3ee8ff" opacity="0.6" />
            <rect x="170" y="150" width="40" height="3" fill="#ff3b5c" opacity="0.7" />
          </g>
        )}
      </svg>
    </div>
  );
}

const FACE =
  'M100 186 C100 146 122 128 150 128 C178 128 200 146 200 186 C200 230 188 262 168 280 C160 287 155 290 150 290 C145 290 140 287 132 280 C112 262 100 230 100 186 Z';
// 肩まわりは translate(0 -22) して描く（首を短く見せる）
const SHOULDERS = 'M58 504 C60 412 86 362 128 344 L172 344 C214 362 240 412 242 504 Z';
/** ぐるぐる目で描く表情（真剣な場面では普通の瞳に戻る） */
const SPIRAL_EXPRS = ['normal', 'smile', 'pout', 'surprised', 'smirk'];

function BackHair({ style, fill }: { style: HairStyle; fill: string }) {
  switch (style) {
    case 'long':
      return <path d="M84 168 C76 118 114 96 150 96 C188 96 226 118 216 168 C224 250 230 360 236 476 L64 476 C70 360 76 250 84 168 Z" fill={fill} />;
    case 'shaggy':
      return <path d="M88 200 C80 134 114 98 150 98 C188 98 222 134 212 200 C216 236 212 262 204 288 L192 274 L182 292 L118 292 L108 274 L96 288 C88 262 84 236 88 200 Z" fill={fill} />;
    case 'layered':
      return <path d="M88 170 C82 116 116 100 150 100 C186 100 218 116 212 170 C216 222 214 270 208 302 L198 292 L192 308 L180 296 L120 296 L108 308 L102 292 L92 302 C86 270 84 222 88 170 Z" fill={fill} />;
    case 'bob':
      return <path d="M88 168 C82 116 116 100 150 100 C186 100 218 116 212 168 C216 216 214 258 206 292 L94 292 C86 258 84 216 88 168 Z" fill={fill} />;
    default:
      return <path d="M96 196 C86 136 116 104 150 104 C186 104 216 136 206 196 Z" fill={fill} />;
  }
}

function FrontHair({ style, fill, shine }: { style: HairStyle; fill: string; shine: string }) {
  const hi = (d: string) => <path d={d} stroke={shine} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.5" />;
  switch (style) {
    case 'long':
      return (
        <g>
          <path d="M96 204 C88 140 120 106 156 106 C192 108 214 140 206 204 C200 178 192 160 176 148 C168 172 148 186 120 192 C130 178 136 166 136 156 C122 170 108 186 96 204 Z" fill={fill} />
          <path d="M100 176 C90 234 96 300 84 372 C98 362 108 312 112 252 C114 220 108 196 100 176 Z" fill={fill} />
          <path d="M200 176 C210 234 204 300 216 372 C202 362 192 312 188 252 C186 220 192 196 200 176 Z" fill={fill} />
          {hi('M118 130 Q150 116 186 132')}
        </g>
      );
    case 'shaggy':
      // 目にかかる長い前髪（毛先は不揃い）
      return (
        <g>
          <path
            d="M88 214 C82 140 114 100 152 100 C192 100 220 140 212 214 L206 202 L201 234 L193 200 L185 208 L177 198 L169 208 L162 198 L157 234 L151 198 L144 240 L138 198 L130 208 L122 198 L114 210 L106 200 L98 238 Z"
            fill={fill}
          />
          {/* 頬にかかる横の髪（左側のみ長い） */}
          <path d="M90 196 C86 232 90 262 98 288 L108 268 L106 232 C104 214 100 202 94 194 Z" fill={fill} />
          <path d="M210 196 C212 220 210 240 206 258 L200 246 L202 222 Z" fill={fill} />
          {hi('M120 126 Q150 112 184 128')}
        </g>
      );
    case 'layered':
      // 片側に流した前髪 + 外ハネの横髪
      return (
        <g>
          <path
            d="M92 208 C86 146 118 108 152 108 C186 108 214 146 208 208 C204 186 198 170 188 160 C186 180 180 192 172 198 C174 184 172 172 166 164 C156 184 136 196 112 200 C124 190 132 178 134 168 C120 180 104 194 92 208 Z"
            fill={fill}
          />
          <path d="M92 190 C88 236 92 272 96 304 L106 294 L112 300 L110 262 C106 232 104 206 106 192 Z" fill={fill} />
          <path d="M208 190 C212 236 208 272 204 304 L194 294 L188 300 L190 262 C194 232 196 206 194 192 Z" fill={fill} />
          {hi('M118 132 Q150 118 184 134')}
        </g>
      );
    case 'bob':
      return (
        <g>
          <path
            d="M92 206 C88 146 118 110 150 110 C184 110 212 146 208 206 C206 190 202 176 196 166 Q192 184 182 186 Q178 170 168 164 Q164 184 154 186 Q150 168 142 166 Q136 184 126 186 Q122 170 114 168 Q110 186 102 188 Q98 178 98 170 C94 182 92 194 92 206 Z"
            fill={fill}
          />
          {hi('M116 132 Q150 118 186 134')}
        </g>
      );
    default:
      return (
        <g>
          <path
            d="M92 206 C84 140 116 102 152 102 C190 102 218 138 208 206 L198 174 L190 198 L180 166 L170 194 L158 160 L150 192 L138 162 L128 196 L118 166 L108 196 L102 174 Z"
            fill={fill}
          />
          {hi('M120 126 Q150 112 184 128')}
        </g>
      );
  }
}

function Backpack() {
  // 背負ったカバン（左肩の後ろからのぞく）
  return (
    <g transform="translate(0 -22)">
      <rect x="40" y="318" width="78" height="150" rx="22" fill="#5c5e6a" stroke="#34363e" strokeWidth="2" />
      <path d="M40 360 Q79 380 118 360" fill="none" stroke="#34363e" strokeWidth="2" />
      <rect x="62" y="372" width="34" height="8" rx="3" fill="#7c7e8a" />
    </g>
  );
}

function Body({ outfit, accent, shade }: { outfit: Outfit; accent: string; shade: string }) {
  if (outfit === 'tie') {
    // 白いシャツ + 肩から落ちかけたジャケット + ゆるめたネクタイ
    return (
      <g>
        <path d={SHOULDERS} fill="#eceef3" />
        <path d="M48 504 C52 432 70 394 102 376 C114 370 121 360 126 350 L118 504 Z" fill="#4a4e5a" stroke={accent} strokeOpacity="0.35" strokeWidth="1.5" />
        <path d="M252 504 C248 432 230 394 198 376 C186 370 179 360 174 350 L182 504 Z" fill="#4a4e5a" stroke={accent} strokeOpacity="0.35" strokeWidth="1.5" />
        {/* lapels */}
        <path d="M126 350 L134 396 L118 504 M174 350 L166 396 L182 504" stroke="#33363f" strokeWidth="2" fill="none" />
        <g transform="rotate(-7 150 362)">
          <path d="M143 354 L157 354 L154 368 L146 368 Z" fill="#9ea1ad" />
          <path d="M146 368 L154 368 L161 446 L150 458 L139 446 Z" fill="#9ea1ad" />
          <path d="M150 370 L150 452" stroke="#80838e" strokeWidth="1" />
        </g>
        <path d={SHOULDERS} fill={shade} />
      </g>
    );
  }
  if (outfit === 'sweater') {
    // 白い襟の黒いセーター + カバンの肩ひも
    return (
      <g>
        <path d={SHOULDERS} fill="#17171e" stroke={accent} strokeOpacity="0.3" strokeWidth="1.5" />
        <path d="M108 376 L122 352 L131 357 L119 384 L117 504 L105 504 Z" fill="#6c6e7a" />
        <path d="M192 376 L178 352 L169 357 L181 384 L183 504 L195 504 Z" fill="#6c6e7a" />
        <path d={SHOULDERS} fill={shade} />
      </g>
    );
  }
  const base = outfit === 'cardigan' ? '#3a3052' : '#1a2440';
  return (
    <g>
      <path d={SHOULDERS} fill={base} stroke={accent} strokeOpacity="0.45" strokeWidth="1.5" />
      <path d={SHOULDERS} fill={shade} />
      {outfit === 'cardigan' && (
        <>
          <path d="M128 344 L150 420 L172 344 Z" fill="#ece7f4" />
          <path d="M128 344 L150 420 M172 344 L150 420" stroke={mix(accent, '#000000', 0.2)} strokeWidth="3" fill="none" />
          <circle cx="150" cy="392" r="5" fill={accent} />
          <path d="M150 334 L150 387" stroke="#cfc7df" strokeWidth="1" />
        </>
      )}
    </g>
  );
}

function Collar({ outfit, accent }: { outfit: Outfit; accent: string }) {
  if (outfit === 'cardigan') return <path d="M134 318 L166 318 L170 344 L150 352 L130 344 Z" fill="#ece7f4" stroke={mix(accent, '#000000', 0.3)} strokeOpacity="0.3" />;
  if (outfit === 'tie')
    return (
      <g fill="#f6f7fa" stroke="#b8bcc8" strokeWidth="1">
        <path d="M134 332 L148 352 L134 360 L124 342 Z" />
        <path d="M166 332 L152 352 L166 360 L176 342 Z" />
      </g>
    );
  if (outfit === 'sweater')
    return (
      <g fill="#f8f6f8" stroke="#cfc8d4" strokeWidth="1">
        <path d="M134 330 Q140 346 150 348 L128 360 Q120 350 122 340 Z" />
        <path d="M166 330 Q160 346 150 348 L172 360 Q180 350 178 340 Z" />
      </g>
    );
  return null;
}

/** ネクタイに指をかける手（独の仕草） */
function TieHand() {
  return (
    <g>
      <path d="M62 504 C70 452 92 410 120 382 L138 394 C118 424 104 462 98 504 Z" fill="#4a4e5a" />
      <path d="M118 380 L136 392 L132 398 L114 386 Z" fill="#eceef3" />
      <path d="M126 374 C126 364 136 358 144 360 C152 362 154 372 148 380 C142 388 130 388 126 380 Z" fill={SKIN} stroke={SKIN_SHADE} strokeWidth="1.2" />
      <path d="M140 362 C144 354 150 352 152 358" stroke={SKIN_SHADE} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M140 362 C144 354 150 352 152 358" stroke={SKIN} strokeWidth="3.4" fill="none" strokeLinecap="round" />
    </g>
  );
}

function spiralPath(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let t = 0; t <= Math.PI * 5.4; t += 0.28) {
    const r = 0.8 + 1.65 * (t / Math.PI);
    pts.push(`${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * 1.15 * Math.sin(t)).toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}

function Eyes({ expr, style, irisFill }: { expr: string; style: EyeStyle; irisFill: string }) {
  const y = 212;
  const spiral = style === 'spiral' && SPIRAL_EXPRS.includes(expr);
  if (expr === 'smile' && !spiral) {
    return (
      <g fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round">
        <path d={`M112 ${y + 4} Q126 ${y - 9} 140 ${y + 4}`} />
        <path d={`M160 ${y + 4} Q174 ${y - 9} 188 ${y + 4}`} />
      </g>
    );
  }
  const big = expr === 'surprised';
  const droopy = style === 'droopy';
  const baseLid = droopy && !big ? 5 : 0;
  const lid = baseLid + (expr === 'annoyed' ? 8 : expr === 'sad' ? 6 : expr === 'serious' ? 3 : 0);
  const lookDown = expr === 'sad' ? 3 : 0;
  const ry = big ? 15 : 13;
  return (
    <g>
      {[126, 174].map((cx, side) => {
        const outer = side === 0 ? -1 : 1;
        const top = y - ry + 2 + Math.min(lid, 12);
        return (
          <g key={cx}>
            <ellipse cx={cx} cy={y + 2} rx="13" ry={ry - 1} fill="#ffffff" />
            <ellipse cx={cx} cy={y + 3 + lookDown} rx={big ? 9 : 10.5} ry={ry - 1} fill={irisFill} />
            {spiral ? (
              <path d={spiralPath(cx, y + 4)} stroke="#2a1622" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            ) : (
              <ellipse cx={cx} cy={y + 5 + lookDown} rx={big ? 3.5 : 4.5} ry={big ? 5 : 6.5} fill="#10121e" />
            )}
            <circle cx={cx - 4} cy={y - 2 + lookDown} r={spiral ? 2.4 : 3.2} fill="#ffffff" />
            {!spiral && <circle cx={cx + 4} cy={y + 9 + lookDown} r="1.6" fill="#ffffff" opacity="0.85" />}
            {lid > 0 && <path d={`M${cx - 15} ${y - ry - 4} L${cx + 15} ${y - ry - 4} L${cx + 15} ${top} Q${cx} ${top - 4} ${cx - 15} ${top} Z`} fill={SKIN} />}
            {droopy ? (
              // 垂れ目: 目尻が下がる
              <path d={`M${cx - 14 * outer} ${top + 1} Q${cx} ${top - 4} ${cx + 13 * outer} ${top + 4} L${cx + 16 * outer} ${top + 8}`} stroke={INK} strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d={`M${cx - 14 * outer} ${top + 3} Q${cx} ${top - 6} ${cx + 13 * outer} ${top + 1} L${cx + 17 * outer} ${top - 2}`} stroke={INK} strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
            <path d={`M${cx - 8} ${y + ry + 1} Q${cx} ${y + ry + 3} ${cx + 8} ${y + ry + 1}`} stroke={INK} strokeWidth="1.2" fill="none" opacity="0.5" />
            {droopy && (
              // 目の下のクマ
              <g stroke="#b88f84" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.8">
                <path d={`M${cx - 10} ${y + ry + 5} Q${cx} ${y + ry + 9} ${cx + 10} ${y + ry + 5}`} />
                <path d={`M${cx + 3 * outer} ${y + ry + 7} l${outer} 4 M${cx + 7 * outer} ${y + ry + 6} l${outer} 4`} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

function CheekMarks() {
  return (
    <g stroke="#e07a7a" strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
      <path d="M110 246 l5 -8 M116 247 l5 -8 M122 248 l5 -8" />
      <path d="M173 248 l5 -8 M179 247 l5 -8 M185 246 l5 -8" />
    </g>
  );
}

function Brows({ expr, color }: { expr: string; color: string }) {
  const tilt: Record<string, [number, number]> = { serious: [6, -2], annoyed: [7, -1], worried: [-6, 2], surprised: [-3, -7], pout: [3, 0], sad: [-7, 4], smirk: [2, -2] };
  const [inner, outer] = tilt[expr] ?? [0, 0];
  return (
    <g stroke={color} strokeWidth="3.2" strokeLinecap="round" fill="none">
      <path d={`M112 ${188 + outer} Q126 ${183 + (inner + outer) / 2} 138 ${186 + inner}`} />
      <path d={`M162 ${186 + inner} Q174 ${183 + (inner + outer) / 2} 188 ${188 + outer}`} />
    </g>
  );
}

function Mouth({ expr, grin }: { expr: string; grin: boolean }) {
  const c = '#9a5050';
  switch (expr) {
    case 'smile':
      return grin ? (
        // 口を開けた笑顔
        <g>
          <path d="M135 252 Q150 278 165 252 Z" fill="#7a3a3a" stroke={c} strokeWidth="2" strokeLinejoin="round" />
          <ellipse cx="150" cy="264" rx="7" ry="4" fill="#e87a7a" />
        </g>
      ) : (
        <path d="M138 256 Q150 270 162 256 Q150 262 138 256 Z" stroke={c} strokeWidth="2.5" fill="#c96a6a" fillOpacity="0.6" strokeLinejoin="round" />
      );
    case 'smirk':
      return <path d="M140 260 Q154 264 164 252" stroke={c} strokeWidth="2.8" fill="none" strokeLinecap="round" />;
    case 'surprised':
      return <ellipse cx="150" cy="260" rx="6" ry="8" fill="#7a3a3a" />;
    case 'worried':
      return <path d="M140 263 Q150 256 160 263" stroke={c} strokeWidth="2.6" fill="none" strokeLinecap="round" />;
    case 'pout':
      return <path d="M143 259 Q150 253 157 259 Q150 264 143 259 Z" stroke={c} strokeWidth="2.2" fill="#c96a6a" fillOpacity="0.45" />;
    case 'annoyed':
      return <path d="M141 261 L160 258" stroke={c} strokeWidth="2.8" strokeLinecap="round" />;
    case 'sad':
      return <path d="M143 262 Q150 258 157 262" stroke={c} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
    default:
      return grin ? (
        <path d="M140 257 Q150 266 160 257" stroke={c} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M142 259 Q150 263 158 259" stroke={c} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      );
  }
}
