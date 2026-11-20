import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNav } from '../../app/nav';
import { audio } from '../../audio/audio';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { SceneBackground } from '../../components/story/SceneBackground';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RewardList } from '../../components/ui/RewardList';
import { ATTRIBUTE_META } from '../../core/constants';
import { fillText } from '../../core/story/engine';
import {
  areaState,
  explorationProgress,
  ownedFieldAbilities,
  pointRequirements,
  pointState,
  searchPoint,
  unmetConditions,
  type PointState,
  type SearchOutcome,
} from '../../core/world/exploration';
import { computeWorldState } from '../../core/world/restoration';
import { usePlayer } from '../../state/GameProvider';
import type { AreaDefinition, AreaPoint } from '../../types/exploration';
import { AreaMap } from './AreaMap';
import './Explore.css';

const TYPE_META: Record<AreaPoint['type'], { label: string; action: string }> = {
  search: { label: 'SEARCH', action: '調べる' },
  talk: { label: 'TALK', action: '話す' },
  signal: { label: 'SIGNAL', action: '接続する' },
  event: { label: 'EVENT', action: '見る' },
};

/** WORLD のエリア（#/world/:worldId/:areaId）: 地点を調べ・話し・流出反応に接続する */
export function AreaScreen({ worldId, areaId }: { worldId: string; areaId: string }) {
  const nav = useNav();
  const { save, data } = usePlayer();
  const area = data.areaById.get(areaId);
  const world = data.worldById.get(worldId);
  if (!area || !world || area.worldId !== worldId) {
    return (
      <ScreenFrame code="02" title="WORLD" subtitle="探索" back={{ route: { name: 'world' }, label: 'WORLD' }}>
        <section className="panel">指定されたエリアは存在しません。</section>
      </ScreenFrame>
    );
  }
  const st = areaState(save, data, area);
  if (st !== 'open') {
    return (
      <ScreenFrame code="02" title={world.name} subtitle="探索" back={{ route: { name: 'worldDetail', worldId }, label: world.name }}>
        <section className="panel">
          <p className="mono explore__locked-code">LOCKED</p>
          <p>このエリアにはまだ入れません。</p>
          {st === 'locked' && <p className="dim">条件: {unmetConditions(area.unlock, { save, data }).join(' / ') || 'この世界に接続する'}</p>}
          <button type="button" className="btn btn--primary" onClick={() => nav({ name: 'worldDetail', worldId })}>
            {world.name} に戻る
          </button>
        </section>
      </ScreenFrame>
    );
  }
  return <AreaView key={area.id} area={area} />;
}

function AreaView({ area }: { area: AreaDefinition }) {
  const nav = useNav();
  const { save, data, dispatch } = usePlayer();
  const world = data.worldById.get(area.worldId)!;
  const [result, setResult] = useState<{ point: AreaPoint; outcome: SearchOutcome } | null>(null);
  const color = ATTRIBUTE_META[world.attribute].color;
  const name = fillText(area.name, save.profile.name);
  const rate = computeWorldState(save, data, world, '').restorationRate;
  const progress = explorationProgress(save, data, world.id);
  const abilities = useMemo(() => [...ownedFieldAbilities(save, data)].map((id) => data.fieldAbilityById.get(id)!), [save, data]);

  useEffect(() => {
    dispatch({ type: 'EXPLORE_VISIT', areaId: area.id });
  }, [area.id, dispatch]);

  const act = (p: AreaPoint) => {
    if (p.type === 'signal' && p.encounterId) {
      nav({ name: 'battleRun', encounterId: p.encounterId });
      return;
    }
    if ((p.type === 'talk' || p.type === 'event') && p.eventId) {
      nav({ name: 'eventPlay', eventId: p.eventId });
      return;
    }
    const r = searchPoint(save, data, p.id, new Date().toISOString());
    if (!r.ok) return;
    audio.playSe(r.outcome.detected.length || r.outcome.discovered.length ? 'sync' : 'click');
    dispatch({ type: 'EXPLORE_SEARCH', pointId: p.id, at: new Date().toISOString() });
    setResult({ point: p, outcome: r.outcome });
  };

  const points = area.points.map((p) => ({ p, st: pointState(save, data, p) })).filter((x) => x.st !== 'hidden');

  return (
    <ScreenFrame code="02" title={world.name} subtitle={name} back={{ route: { name: 'worldDetail', worldId: world.id }, label: world.name }}>
      <div className="explore" style={{ ['--w-c' as string]: color } as CSSProperties}>
        <section className="explore-hero">
          <SceneBackground id={area.bg} lit={0.06 + rate * 0.6} />
          <div className="explore-hero__body">
            <p className="mono explore-hero__id">
              {world.id} · {area.id}
            </p>
            <h2 className="explore-hero__name">{name}</h2>
            <p>{fillText(area.description, save.profile.name)}</p>
            <p className="mono explore-hero__stats">
              RESTORATION {Math.round(rate * 100)}% · EXPLORED {progress.done}/{progress.total}
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel__title">
            <span>POINTS</span>
            <small>このエリアでできること</small>
          </div>
          <ul className="explore-points">
            {points.map(({ p, st }) => (
              <PointCard key={p.id} point={p} state={st} onAct={() => act(p)} />
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panel__title">
            <span>MAP</span>
            <small>{world.name}</small>
          </div>
          <AreaMap worldId={world.id} currentAreaId={area.id} />
        </section>

        <section className="panel">
          <div className="panel__title">
            <span>FIELD ABILITY</span>
            <small>探索能力（同期済みの Memory が持つ能力）</small>
          </div>
          {abilities.length ? (
            <ul className="explore-abilities">
              {abilities.map((f) => (
                <li key={f.id}>
                  <strong>【{f.name}】</strong>
                  <span className="mute"> {data.memoryById.get(f.memoryId)?.name}</span>
                  <p className="dim">{f.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dim">探索能力を持つ Memory と、まだ同期していません。</p>
          )}
        </section>
      </div>

      <ConfirmDialog open={!!result} title={result ? result.point.name : ''} kicker="> SEARCH RESULT" confirmLabel="OK" hideCancel onConfirm={() => setResult(null)} onCancel={() => setResult(null)}>
        {result && <SearchResultView outcome={result.outcome} onSync={(id) => nav({ name: 'sync', memoryId: id })} />}
      </ConfirmDialog>
    </ScreenFrame>
  );
}

function PointCard({ point, state, onAct }: { point: AreaPoint; state: PointState; onAct: () => void }) {
  const { save, data } = usePlayer();
  const meta = TYPE_META[point.type];
  const npc = point.npc ? data.characterById.get(point.npc) : undefined;
  const reqs = state === 'locked' || state === 'needs-ability' ? pointRequirements(save, data, point) : [];
  const canAct = state === 'available' || (state === 'done' && point.type !== 'search');
  const fa = point.fieldAbility ? data.fieldAbilityById.get(point.fieldAbility) : undefined;
  return (
    <li className={`explore-point is-${state} is-${point.type}`} style={npc ? ({ ['--npc-c' as string]: npc.color } as CSSProperties) : undefined}>
      <span className="explore-point__type mono">{meta.label}</span>
      <div className="explore-point__body">
        <strong className="explore-point__name">{state === 'locked' && point.type !== 'signal' ? '？？？' : fillText(point.name, save.profile.name)}</strong>
        <p className="dim">{fillText(point.description, save.profile.name)}</p>
        {fa && state !== 'needs-ability' && <p className="explore-point__fa mono">FIELD ABILITY【{fa.name}】</p>}
        {reqs.length > 0 && <p className="explore-point__req">必要: {reqs.join(' / ')}</p>}
        {point.type === 'search' && point.rewards && state !== 'done' && state !== 'locked' && (
          <p className="explore-point__rewards">
            <RewardList rewards={point.rewards} />
          </p>
        )}
      </div>
      <div className="explore-point__act">
        {state === 'done' && <span className="tag">{point.type === 'signal' ? 'CLEAR' : point.type === 'search' ? '調査済み' : '既読'}</span>}
        {canAct && (
          <button type="button" className={`btn btn--sm ${state === 'available' ? 'btn--primary' : ''}`} onClick={onAct}>
            {state === 'done' ? (point.type === 'signal' ? '再接続' : 'もう一度') : meta.action}
          </button>
        )}
      </div>
    </li>
  );
}

function SearchResultView({ outcome, onSync }: { outcome: SearchOutcome; onSync: (memoryId: string) => void }) {
  const { save, data } = usePlayer();
  return (
    <div className="explore-result">
      <p className="explore-result__text">{fillText(outcome.text, save.profile.name)}</p>
      {outcome.rewards && (
        <p>
          <RewardList rewards={outcome.rewards} />
        </p>
      )}
      {outcome.discovered.map((id) => (
        <p key={id} className="explore-result__memo">
          ◆ Memory『{data.memoryById.get(id)?.name}』の存在を発見した（ARCHIVE に記録）
        </p>
      ))}
      {outcome.detected.map((id) => (
        <p key={id} className="explore-result__memo">
          ◆ Memory『{data.memoryById.get(id)?.name}』の反応を検出した{' '}
          <button type="button" className="btn btn--sm btn--purple" onClick={() => onSync(id)}>
            MEMORY SYNC へ
          </button>
        </p>
      ))}
    </div>
  );
}
