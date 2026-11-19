import { useId } from 'react';
import './ExplorerAvatar.css';

/**
 * 主人公（探索者）のビジュアル。
 * 外見カスタマイズ（GDD Ver.2 §3）は avatar.preset / avatar.color で拡張する想定。
 * syncColor: 同期中のメイン Memory の属性色（同期リングの色）
 */
export function ExplorerAvatar({ color, syncColor, animated = false, className = '' }: { color: string; syncColor?: string; animated?: boolean; className?: string }) {
  const uid = `av${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const ring = syncColor ?? color;
  return (
    <div className={`explorer-avatar ${animated ? 'is-animated' : ''} ${className}`}>
      <svg viewBox="0 0 200 240" role="img" aria-label="探索者">
        <defs>
          <radialGradient id={`${uid}-bg`} cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor={ring} stopOpacity={0.35} />
            <stop offset="70%" stopColor="#081028" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#03060e" />
          </radialGradient>
          <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a2a4f" />
            <stop offset="100%" stopColor="#070d1e" />
          </linearGradient>
          <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="200" height="240" fill={`url(#${uid}-bg)`} />
        <g filter={`url(#${uid}-glow)`}>
          <ellipse className="av-ring" cx="100" cy="206" rx="70" ry="14" fill="none" stroke={ring} strokeWidth="2" opacity="0.8" />
          <ellipse className="av-ring av-ring--2" cx="100" cy="206" rx="52" ry="9" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.5" />
        </g>
        {/* coat */}
        <path d="M46 210 C50 150 70 122 100 122 C130 122 150 150 154 210 Z" fill={`url(#${uid}-body)`} stroke={color} strokeWidth="1.5" />
        <path d="M100 124 L100 210" stroke={color} strokeOpacity="0.4" />
        <path d="M70 150 L84 196 M130 150 L116 196" stroke={color} strokeOpacity="0.35" />
        {/* hood & head */}
        <path d="M62 112 C62 66 80 46 100 46 C120 46 138 66 138 112 C130 128 70 128 62 112 Z" fill={`url(#${uid}-body)`} stroke={color} strokeWidth="1.5" />
        <ellipse cx="100" cy="98" rx="24" ry="27" fill="#050a18" />
        {/* visor */}
        <g filter={`url(#${uid}-glow)`}>
          <rect className="av-visor" x="80" y="92" width="40" height="5" rx="2" fill={ring} />
        </g>
        {/* sync hand */}
        <g filter={`url(#${uid}-glow)`}>
          <circle className="av-spark" cx="152" cy="170" r="5" fill={ring} />
          <circle className="av-spark av-spark--2" cx="152" cy="170" r="12" fill="none" stroke={ring} strokeWidth="1.2" />
        </g>
        <rect width="200" height="240" fill="none" stroke={color} strokeOpacity="0.25" />
      </svg>
    </div>
  );
}
