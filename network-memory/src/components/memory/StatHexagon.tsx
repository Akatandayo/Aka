import { STAT_META } from '../../core/constants';
import { STAT_KEYS, type StatBlock } from '../../types/memory';

/** 6ステータスの資質（基礎値の比率）を示すレーダーチャート */
export function StatHexagon({ stats, color, size = 220 }: { stats: StatBlock; color: string; size?: number }) {
  const cx = 110;
  const cy = 110;
  const R = 78;
  const angle = (i: number) => -Math.PI / 2 + (i * Math.PI * 2) / STAT_KEYS.length;
  const point = (i: number, r: number) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r] as const;
  const ring = (ratio: number) =>
    STAT_KEYS.map((_, i) => point(i, R * ratio).map((v) => v.toFixed(1)).join(',')).join(' ');
  const values = STAT_KEYS.map((k, i) => {
    const ratio = Math.max(0.06, Math.min(1, stats[k] / STAT_META[k].reference));
    return point(i, R * ratio).map((v) => v.toFixed(1)).join(',');
  }).join(' ');

  return (
    <svg viewBox="0 0 220 220" width={size} height={size} role="img" aria-label="ステータスの資質チャート" className="stat-hex">
      {[1, 0.75, 0.5, 0.25].map((r) => (
        <polygon key={r} points={ring(r)} fill="none" stroke="rgba(110,190,255,0.18)" />
      ))}
      {STAT_KEYS.map((_, i) => {
        const [x, y] = point(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(110,190,255,0.14)" />;
      })}
      <polygon points={values} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={2} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      {STAT_KEYS.map((k, i) => {
        const [x, y] = point(i, R + 18);
        return (
          <text key={k} x={x} y={y + 4} textAnchor="middle" fill="#a9bad6" fontSize={11} fontFamily="var(--f-display)" letterSpacing="1">
            {STAT_META[k].label}
          </text>
        );
      })}
    </svg>
  );
}
