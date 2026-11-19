import { useMemo, type CSSProperties } from 'react';
import { useNav } from '../../app/nav';
import { EnemyArt } from '../../components/battle/EnemyArt';
import { ExplorerAvatar } from '../../components/battle/ExplorerAvatar';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { AttributeTag } from '../../components/memory/Badges';
import { MemoryCard } from '../../components/memory/MemoryCard';
import { ATTRIBUTE_META } from '../../core/constants';
import { encounterStatus } from '../../core/battle/setup';
import { PVP_MODES, PVP_MODE_DEFS } from '../../core/online/pvp';
import { analyzeLoadout, playerPower } from '../../core/player/character';
import { discoveryState } from '../../core/player/discovery';
import { getActiveLoadout } from '../../core/player/loadout';
import { usePlayer } from '../../state/GameProvider';
import './Battle.css';

/** BATTLE: 検出された流出反応（エンカウント）の一覧 */
export function BattleScreen() {
  const nav = useNav();
  const { save, data } = usePlayer();
  const loadout = getActiveLoadout(save);
  const analysis = useMemo(() => analyzeLoadout(save, data, loadout), [save, data, loadout]);
  const hasMain = Boolean(analysis.main);
  const byWorld = useMemo(() => {
    const map = new Map<string, typeof data.encounters>();
    for (const e of data.encounters) map.set(e.worldId, [...(map.get(e.worldId) ?? []), e]);
    return [...map.entries()];
  }, [data]);

  return (
    <ScreenFrame code="05" title="BATTLE" subtitle="流出反応">
      <div className="signals">
        <section className="panel signals__me">
          <div className="signals__avatar">
            <ExplorerAvatar color={save.profile.avatar.color} syncColor={ATTRIBUTE_META[analysis.attribute].color} />
          </div>
          <div className="signals__me-info">
            <p className="section-label">EXPLORER</p>
            <p className="signals__me-name">
              {save.profile.name} <span className="mono mute">Lv.{save.profile.level}</span>
            </p>
            <p className="mono signals__power">POWER {playerPower(analysis).toLocaleString('ja-JP')}</p>
            <p className="signals__main">
              MAIN: {analysis.main ? <strong>{analysis.main.def.name}</strong> : <span className="mute">未装備</span>} <AttributeTag attribute={analysis.attribute} />
            </p>
            <p className="dim signals__me-sub">
              スキル {analysis.skills.length} · パッシブ {analysis.passives.length} · REWRITE {analysis.rewrite ? data.skillById.get(analysis.rewrite.skillId)?.name : 'なし'}
            </p>
            <button type="button" className="btn btn--sm" onClick={() => nav({ name: 'memory', tab: 'loadout' })}>
              装備を変更（{loadout.name}）
            </button>
          </div>
        </section>

        <p className="notice notice--planned">
          Network各地で検出された流出反応に接続して戦闘します。WORLD探索（PHASE 4）の実装後は、各WORLDのエリア・クエストから接続する形に統合されます。
        </p>
        {!hasMain && <p className="notice notice--warn">メインMemoryが装備されていません。LOADOUTでメインMemoryを装備してください。</p>}

        {byWorld.map(([worldId, encs]) => {
          const world = data.worldById.get(worldId);
          return (
            <section key={worldId} className="signals__world" style={{ ['--world-c' as string]: world ? ATTRIBUTE_META[world.attribute].color : 'var(--c-cyan)' } as CSSProperties}>
              <header className="signals__world-head">
                <span className="mono">{worldId}</span>
                <h2>{world?.name ?? worldId}</h2>
                <small>{world?.subtitle}</small>
              </header>
              <div className="signals__list">
                {encs.map((enc) => {
                  const status = encounterStatus(save, enc);
                  const progress = save.battle.encounters[enc.id];
                  const drops = enc.firstClear?.memories ?? [];
                  const locked = status === 'locked';
                  return (
                    <article key={enc.id} className={`panel signal is-${status} ${enc.boss ? 'is-boss' : ''}`}>
                      <div className="signal__head">
                        <span className="mono signal__id">{enc.id}</span>
                        {enc.boss && <span className="tag tag--solid" style={{ ['--tag-c' as string]: 'var(--c-error)' } as CSSProperties}>BOSS</span>}
                        {status === 'cleared' && <span className="tag" style={{ ['--tag-c' as string]: 'var(--c-success)' } as CSSProperties}>CLEARED ×{progress?.clears}</span>}
                        <span className={`signal__lv mono ${save.profile.level < enc.recommendedLevel ? 'is-high' : ''}`}>推奨 Lv.{enc.recommendedLevel}</span>
                      </div>
                      <h3 className="signal__name">{locked ? '？？？' : enc.name}</h3>
                      <p className="signal__desc dim">{locked ? '前の流出反応を鎮静化すると、反応が検出される。' : enc.description}</p>
                      {!locked && (
                        <>
                          <div className="signal__enemies">
                            {enc.enemies.map((id, i) => {
                              const en = data.enemyById.get(id)!;
                              return (
                                <div key={i} className="signal__enemy" title={en.description}>
                                  <EnemyArt id={en.id} attribute={en.attribute} boss={en.boss} />
                                  <span>{en.name}</span>
                                  <AttributeTag attribute={en.attribute} />
                                </div>
                              );
                            })}
                          </div>
                          <div className="signal__rewards">
                            <span className="mono">EXP {enc.rewards.exp}</span>
                            {Object.entries(enc.rewards.currencies ?? {}).map(([c, n]) => (
                              <span key={c} className="mono">
                                {c} {n}
                              </span>
                            ))}
                            {Object.entries(enc.rewards.items ?? {}).map(([id, n]) => (
                              <span key={id}>
                                {data.itemById.get(id)?.name} ×{n}
                              </span>
                            ))}
                          </div>
                          {drops.length > 0 && (
                            <div className="signal__drop">
                              {drops.map((id) => {
                                const def = data.memoryById.get(id)!;
                                const st = discoveryState(save, id);
                                const pending = save.archive.pendingSyncIds.includes(id);
                                return (
                                  <div key={id} className="signal__drop-item">
                                    <div className="signal__drop-card">
                                      <MemoryCard def={def} size="sm" mask={st === 'owned' ? null : st === 'discovered' ? 'silhouette' : 'unknown'} />
                                    </div>
                                    <p>
                                      <span className="mono">FIRST CLEAR</span>
                                      <br />
                                      {st === 'owned' ? `『${def.name}』同期済み` : pending ? `『${def.name}』検出済み・同期待ち` : status === 'cleared' ? '検出済み' : 'Memory反応あり'}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                      <div className="signal__foot">
                        {progress && <span className="mono mute">BEST {progress.bestRounds} ROUNDS</span>}
                        <button type="button" className="btn btn--primary" disabled={locked || !hasMain} onClick={() => nav({ name: 'battleRun', encounterId: enc.id })}>
                          {locked ? 'LOCKED' : 'CONNECT'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}

        <p className="mono mute signals__stats">
          WIN {save.battle.wins} · LOSE {save.battle.losses} · RETREAT {save.battle.retreats}
        </p>

        <section className="panel signals__online" aria-label="オンライン対戦（未実装）">
          <div className="panel__title">
            <span>ONLINE</span>
            <small>
              対人戦 <span className="tag tag--planned">未実装 · PHASE 5</span>
            </small>
          </div>
          <p className="dim">オンライン対戦は PHASE 5 で実装予定です。現在は接続できません。対戦ルールは次のとおりです。</p>
          <ul className="signals__online-rules">
            <li>参加するのは探索者（主人公）1 人。完全同期するメイン Memory は 1 つ</li>
            <li>バトル開始後は Memory の変更不可（開始時の装備で戦う）</li>
            <li>サブ Memory はメイン Memory の能力体系内での補助（補助スキル）としてのみ機能</li>
            <li>結果はサーバーで再計算して検証</li>
          </ul>
          <ul className="signals__online-modes">
            {PVP_MODES.map((m) => (
              <li key={m}>
                <span className="mono">{m}</span>
                <span>{PVP_MODE_DEFS[m].ja}</span>
                <span className="dim">{PVP_MODE_DEFS[m].description}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ScreenFrame>
  );
}
