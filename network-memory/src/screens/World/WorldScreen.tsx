import { useMemo, type CSSProperties } from 'react';
import { useNav } from '../../app/nav';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { AttributeTag } from '../../components/memory/Badges';
import { SceneBackground } from '../../components/story/SceneBackground';
import { encounterStatus } from '../../core/battle/setup';
import { ATTRIBUTE_META } from '../../core/constants';
import { discoveryState } from '../../core/player/discovery';
import { canExplore, entryArea, explorationProgress } from '../../core/world/exploration';
import { questStatus } from '../../core/world/quests';
import { KIND_LABEL, computeWorldState, overallRestoration, restorationViews, worldConnection } from '../../core/world/restoration';
import { usePlayer } from '../../state/GameProvider';
import { RESTORATION_KINDS } from '../../types/world';
import type { WorldDefinition } from '../../types/world';
import { AreaMap } from './AreaMap';
import { QuestList } from './QuestList';
import './WorldScreen.css';
import './Explore.css';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** WORLD: 各世界の修復状況（GDD Ver.3 §5）と探索（PHASE 4） */
export function WorldScreen({ worldId }: { worldId?: string }) {
  const { data } = usePlayer();
  const world = worldId ? data.worldById.get(worldId) : undefined;
  if (worldId && world) return <WorldDetail world={world} />;
  return <WorldList />;
}

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div className="world-meter" style={{ ['--w-c' as string]: color } as CSSProperties} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="world-meter__fill" style={{ width: pct(value) }} />
    </div>
  );
}

function WorldList() {
  const nav = useNav();
  const { save, data } = usePlayer();
  const overall = overallRestoration(save, data);
  return (
    <ScreenFrame code="02" title="WORLD" subtitle="世界修復">
      <div className="world">
        <section className="panel world__overall">
          <div>
            <p className="section-label">NETWORK RESTORATION</p>
            <h2>世界の修復状況</h2>
            <p className="dim">
              Memory を回収すると、その記録が世界へ帰り、人物・建物・出来事・機能が復元されます。どの Memory が何を復元するかは、各 WORLD の記録が示しています。
            </p>
          </div>
          <div className="world__overall-rate mono">
            <span>{pct(overall)}</span>
            <small>TOTAL</small>
          </div>
        </section>

        <section className="panel">
          <div className="panel__title">
            <span>QUESTS</span>
            <small>受注中・報告できる依頼</small>
          </div>
          <QuestList quests={data.quests.filter((q) => ['active', 'ready', 'available'].includes(questStatus(save, data, q)))} showLocked={false} />
        </section>

        <ul className="world__list">
          {data.worlds.map((w) => {
            const conn = worldConnection(save, data, w);
            const st = computeWorldState(save, data, w, '');
            const color = ATTRIBUTE_META[w.attribute].color;
            const ex = explorationProgress(save, data, w.id);
            return (
              <li key={w.id}>
                <button
                  type="button"
                  className={`panel world-card ${conn.connected ? '' : 'is-locked'}`}
                  style={{ ['--w-c' as string]: color } as CSSProperties}
                  onClick={() => nav({ name: 'worldDetail', worldId: w.id })}
                >
                  <span className="world-card__id mono">{w.id}</span>
                  <span className="world-card__name">{conn.known ? w.name : '？？？'}</span>
                  <span className="world-card__sub dim">{conn.connected ? w.subtitle : conn.known ? `${w.subtitle}（未接続）` : '未接続の世界'}</span>
                  <span className="world-card__rate">
                    <Meter value={st.restorationRate} color={color} />
                    <span className="mono">
                      {pct(st.restorationRate)} · {st.recoveredMemories.length}/{st.requiredMemories.length}
                    </span>
                  </span>
                  {conn.connected && ex.total > 0 && (
                    <span className="world-card__explore mono">
                      EXPLORED {ex.done}/{ex.total}
                    </span>
                  )}
                  {!conn.connected && conn.requirement && <span className="world-card__req">接続条件: {conn.requirement}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </ScreenFrame>
  );
}

function WorldDetail({ world }: { world: WorldDefinition }) {
  const nav = useNav();
  const { save, data } = usePlayer();
  const conn = worldConnection(save, data, world);
  const st = useMemo(() => computeWorldState(save, data, world, ''), [save, data, world]);
  const saved = save.worlds[world.id];
  const views = restorationViews(save, data, world);
  const color = ATTRIBUTE_META[world.attribute].color;
  const encounters = data.encounters.filter((e) => e.worldId === world.id);
  const name = conn.known ? world.name : '？？？';
  const entry = entryArea(data, world.id);
  const explorable = canExplore(save, data, world.id);
  const last = save.exploration.lastArea ? data.areaById.get(save.exploration.lastArea) : undefined;
  const resume = last && last.worldId === world.id ? last : entry;
  const ex = explorationProgress(save, data, world.id);
  const quests = data.quests.filter((q) => q.worldId === world.id);

  return (
    <ScreenFrame code="02" title={name} subtitle={conn.known ? world.subtitle : '未接続の世界'} back={{ route: { name: 'world' }, label: 'WORLD' }}>
      <div className="world" style={{ ['--w-c' as string]: color } as CSSProperties}>
        <section className="world-hero">
          {conn.connected && entry ? <SceneBackground id={world.id === 'WORLD-001' ? 'null-city-rain' : entry.bg} lit={0.06 + st.restorationRate * 0.6} /> : <div className="world-hero__bg" />}
          <div className="world-hero__body">
            <AttributeTag attribute={world.attribute} withJa />
            <h2 className="world-hero__name">{name}</h2>
            <p>
              {conn.known ? world.description : 'この世界の記録はまだ見つかっていません。'}
              {!conn.connected && ` この世界とはまだ接続されていません。${conn.requirement ? `接続条件: ${conn.requirement}` : ''}`}
            </p>
            <div className="world-hero__rate">
              <span className="mono">RESTORATION {pct(st.restorationRate)}</span>
              <Meter value={st.restorationRate} color={color} />
            </div>
          </div>
        </section>

        {explorable && resume && (
          <section className="panel">
            <div className="panel__title">
              <span>EXPLORE</span>
              <small className="mono">
                EXPLORED {ex.done}/{ex.total}
              </small>
            </div>
            <AreaMap worldId={world.id} />
            <div className="world__actions">
              <button type="button" className="btn btn--primary" onClick={() => nav({ name: 'worldArea', worldId: world.id, areaId: resume.id })}>
                {resume.id === entry?.id ? '探索を始める' : '探索を続ける'}
              </button>
            </div>
          </section>
        )}

        {quests.length > 0 && conn.connected && (
          <section className="panel">
            <div className="panel__title">
              <span>QUESTS</span>
              <small>この世界の依頼</small>
            </div>
            <QuestList quests={quests} />
          </section>
        )}

        <section className="panel">
          <div className="panel__title">
            <span>WORLD STATE</span>
            <small>{saved?.updatedAt ? `最終更新 ${new Date(saved.updatedAt).toLocaleString('ja-JP')}` : '修復の記録'}</small>
          </div>
          <dl className="world-state">
            <div>
              <dt>回収した Memory</dt>
              <dd className="mono">
                {st.recoveredMemories.length} / {st.requiredMemories.length}
              </dd>
            </div>
            <div>
              <dt>帰還した人物</dt>
              <dd className="mono">{st.restoredNPCs.length}</dd>
            </div>
            <div>
              <dt>解放されたエリア</dt>
              <dd className="mono">{st.unlockedAreas.length}</dd>
            </div>
            <div>
              <dt>解放された出来事</dt>
              <dd className="mono">{st.unlockedEvents.length}</dd>
            </div>
            <div>
              <dt>復元された物体・機能</dt>
              <dd className="mono">{st.restoredObjects.length}</dd>
            </div>
          </dl>
        </section>

        {RESTORATION_KINDS.map((kind) => {
          const list = views.filter((v) => v.kind === kind);
          if (!list.length) return null;
          return (
            <section key={kind} className="panel">
              <div className="panel__title">
                <span>{KIND_LABEL[kind].label}</span>
                <small>{KIND_LABEL[kind].ja}</small>
              </div>
              <ul className="world-targets">
                {list.map((v) => {
                  const mem = data.memoryById.get(v.target.memoryId);
                  const known = mem && discoveryState(save, mem.id) !== 'undiscovered';
                  const owned = save.memories.find((m) => m.memoryId === v.target.memoryId);
                  return (
                    <li key={v.target.id} className={`world-target ${v.restored ? 'is-restored' : ''}`}>
                      <span className="world-target__mark" aria-hidden>
                        {v.restored ? '◆' : '◇'}
                      </span>
                      <div className="world-target__body">
                        <strong>{v.restored ? v.target.name : '？？？'}</strong>
                        <p className="dim">{v.restored ? v.target.description : (v.target.lostDescription ?? '記録が欠落している。')}</p>
                        <p className="world-target__memory mono">
                          {v.restored ? 'RESTORED BY ' : 'REQUIRES '}
                          {owned ? (
                            <button type="button" className="link" onClick={() => nav({ name: 'memoryDetail', instanceId: owned.instanceId })}>
                              {mem?.name}
                            </button>
                          ) : known ? (
                            <span>{mem?.name}（未同期）</span>
                          ) : (
                            <span>未発見の Memory</span>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <section className="panel">
          <div className="panel__title">
            <span>SIGNALS</span>
            <small>この世界の流出反応</small>
          </div>
          {encounters.length ? (
            <ul className="world-signals">
              {encounters.map((e) => {
                const s = encounterStatus(save, e);
                return (
                  <li key={e.id} className={`is-${s}`}>
                    <span className="mono">{e.id}</span>
                    <span>{s === 'locked' ? '？？？' : e.name}</span>
                    <span className="tag">{s === 'cleared' ? 'CLEAR' : s === 'available' ? '接続可能' : 'LOCKED'}</span>
                    {s !== 'locked' && (
                      <button type="button" className="btn btn--sm" onClick={() => nav({ name: 'battleRun', encounterId: e.id })}>
                        接続
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dim">観測できる流出反応はありません。</p>
          )}
        </section>

        <div className="world__actions">
          <button type="button" className="btn" onClick={() => nav({ name: 'archive', category: 'world' })}>
            WORLD RECORD を見る
          </button>
        </div>
      </div>
    </ScreenFrame>
  );
}
