import { useNav } from '../../app/nav';
import { areaState, worldAreas, type AreaState } from '../../core/world/exploration';
import { fillText } from '../../core/story/engine';
import { usePlayer } from '../../state/GameProvider';

/**
 * WORLD のエリアマップ（ノードとつながり）。
 * - 解放済みのエリアは名前を表示して移動できる
 * - 未解放のエリアは「？？？」、非公開のエリアは表示しない（探索能力で位置だけ見えることがある）
 */
export function AreaMap({ worldId, currentAreaId }: { worldId: string; currentAreaId?: string }) {
  const nav = useNav();
  const { save, data } = usePlayer();
  const areas = worldAreas(data, worldId);
  const states = new Map<string, AreaState>(areas.map((a) => [a.id, areaState(save, data, a)]));
  const visible = areas.filter((a) => states.get(a.id) !== 'hidden');
  const byId = new Map(visible.map((a) => [a.id, a]));
  const edges = new Set<string>();
  const lines: { x1: number; y1: number; x2: number; y2: number; open: boolean; key: string }[] = [];
  for (const a of visible) {
    for (const l of a.links) {
      const b = byId.get(l);
      const key = [a.id, l].sort().join('|');
      if (!b || edges.has(key)) continue;
      edges.add(key);
      lines.push({ x1: a.pos.x, y1: a.pos.y, x2: b.pos.x, y2: b.pos.y, open: states.get(a.id) === 'open' && states.get(b.id) === 'open', key });
    }
  }
  return (
    <div className="area-map" role="group" aria-label="エリアマップ">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="area-map__lines" aria-hidden>
        {lines.map((l) => (
          <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={l.open ? 'is-open' : ''} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {visible.map((a) => {
        const st = states.get(a.id)!;
        const current = a.id === currentAreaId;
        const visited = save.exploration.visitedAreas.includes(a.id);
        const label = st === 'open' ? fillText(a.name, save.profile.name) : '？？？';
        return (
          <button
            key={a.id}
            type="button"
            className={`area-node is-${st} ${current ? 'is-current' : ''} ${visited ? 'is-visited' : ''}`}
            style={{ left: `${a.pos.x}%`, top: `${a.pos.y}%` }}
            disabled={st !== 'open' || current}
            onClick={() => nav({ name: 'worldArea', worldId, areaId: a.id })}
            aria-label={st === 'open' ? `${label}へ移動` : '未解放のエリア'}
          >
            <span className="area-node__dot" aria-hidden />
            <span className="area-node__label">{label}</span>
            {current && <span className="area-node__here mono">HERE</span>}
          </button>
        );
      })}
    </div>
  );
}
