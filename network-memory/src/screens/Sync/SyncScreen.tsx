import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNav } from '../../app/nav';
import { audio } from '../../audio/audio';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { AttributeTag, CategoryTag, RarityTag } from '../../components/memory/Badges';
import { MemoryArt } from '../../components/memory/MemoryArt';
import { ATTRIBUTE_META, RARITY_META } from '../../core/constants';
import { checkSyncConditions } from '../../core/player/sync';
import { KIND_LABEL, restorationChangesFor, type RestorationChange } from '../../core/world/restoration';
import { usePlayer } from '../../state/GameProvider';
import './SyncScreen.css';

type Phase = 'detected' | 'contact' | 'complete' | 'failed';

const CONTACT_LINES = ['> CONTACT ESTABLISHED', '> HANDSHAKE ......... OK', '> DECRYPTING RECORD ..', '> SYNC CONDITION CHECK'];

/**
 * MEMORY SYNC（GDD Ver.2 §4）
 * 1.発見 → 2.接触 → 3.接触演出 → 4.情報の同期 → 5.能力が使用可能に → 6.Memory一覧に登録
 */
export function SyncScreen({ memoryId }: { memoryId: string }) {
  const nav = useNav();
  const { save, data, dispatch } = usePlayer();
  const def = data.memoryById.get(memoryId);
  const alreadyOwned = save.memories.some((m) => m.memoryId === memoryId);
  const pending = save.archive.pendingSyncIds.includes(memoryId);
  const [phase, setPhase] = useState<Phase>(alreadyOwned ? 'complete' : 'detected');
  const [lines, setLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [unmet, setUnmet] = useState<string[]>([]);
  const [restored, setRestored] = useState<RestorationChange[]>([]);
  const synced = useRef(false);
  const check = checkSyncConditions(save, data, memoryId);

  useEffect(() => {
    if (phase !== 'contact') return;
    const reduced = document.documentElement.dataset.fx === 'reduced';
    const step = reduced ? 120 : 520;
    const timers: number[] = [];
    const contactLines = [...CONTACT_LINES, ...(def?.syncEffects.direction?.lines ?? [])];
    contactLines.forEach((l, i) => timers.push(window.setTimeout(() => setLines((x) => [...x, l]), step * (i + 1))));
    let p = 0;
    const iv = window.setInterval(() => {
      p = Math.min(100, p + (reduced ? 25 : 4));
      setProgress(p);
    }, step / 6);
    timers.push(
      window.setTimeout(
        () => {
          window.clearInterval(iv);
          if (!check.ok) {
            setUnmet(check.conditions.filter((c) => !c.met).map((c) => c.text));
            setLines((x) => [...x, '!! SYNC REJECTED —— 同期条件を満たしていない']);
            setPhase('failed');
            return;
          }
          setProgress(100);
          setLines((x) => [...x, '> SYNCHRONIZING ABILITIES ... 100%']);
          if (!synced.current) {
            synced.current = true;
            // 世界修復の変化は、同期で状態が変わる前に算出する
            setRestored(restorationChangesFor(save, data, memoryId));
            dispatch({ type: 'SYNC_MEMORY', memoryId, at: new Date().toISOString() });
            audio.playSe('sync');
          }
          timers.push(window.setTimeout(() => setPhase('complete'), reduced ? 100 : 700));
        },
        step * (contactLines.length + 1.5),
      ),
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(iv);
    };
    // 同期条件（check）は phase が 'contact' になった時点の値で判定する
  }, [phase]);

  if (!def) {
    return (
      <ScreenFrame code="SY" title="MEMORY SYNC" subtitle="同期" back={{ route: { name: 'memory', tab: 'list' }, label: 'MEMORY' }}>
        <div className="panel empty">この Memory の反応は見つかりません。</div>
      </ScreenFrame>
    );
  }

  const instance = save.memories.find((m) => m.memoryId === memoryId);
  // 同期演出の色は Memory ごとに設定できる（syncEffects.direction.color）
  const vars = {
    ['--r-c' as string]: RARITY_META[def.rarity].color,
    ['--a-c' as string]: def.syncEffects.direction?.color ?? ATTRIBUTE_META[def.attribute].color,
  } as CSSProperties;
  const notDetected = !alreadyOwned && !pending && phase === 'detected';

  return (
    <ScreenFrame code="SY" title="MEMORY SYNC" subtitle="同期" back={{ route: { name: 'memory', tab: 'list' }, label: 'MEMORY' }}>
      <div className={`sync sync--${phase} sync--${def.rarity.toLowerCase()}`} style={vars}>
        <div className="sync__stage">
          <div className="sync__rings" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <div className="sync__card">
            <MemoryArt def={def} mask={phase === 'complete' ? null : 'silhouette'} animated={phase === 'complete'} />
            {phase === 'contact' && <div className="sync__scan" aria-hidden />}
            {phase === 'complete' && <div className="sync__flash" aria-hidden />}
          </div>
        </div>

        <div className="sync__info">
          {phase === 'detected' && (
            <>
              <p className="sync__kicker mono">!! MEMORY SIGNAL DETECTED</p>
              <h2 className="sync__title">未同期の記録</h2>
              <div className="sync__tags">
                <RarityTag rarity={def.rarity} solid />
                <CategoryTag category={def.category} />
                <AttributeTag attribute={def.attribute} />
              </div>
              <p className="dim sync__text">
                {notDetected ? 'この Memory の反応はまだ検出されていない。' : 'Memoryに触れ、記録に宿る能力をあなた自身に同期する。'}
              </p>
              <div className="sync__conds">
                <p className="section-label">SYNC CONDITION 同期条件</p>
                {check.conditions.length === 0 ? (
                  <p className="dim">条件なし</p>
                ) : (
                  <ul>
                    {check.conditions.map((c, i) => (
                      <li key={i} className={c.met ? 'is-met' : ''}>
                        <span className="mono">{c.met ? '[OK]' : '[--]'}</span> {c.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="button" className="btn btn--primary btn--purple sync__cta" disabled={notDetected} onClick={() => setPhase('contact')}>
                接触する — CONTACT
              </button>
            </>
          )}

          {(phase === 'contact' || phase === 'failed') && (
            <>
              <p className="sync__kicker mono">{phase === 'failed' ? '!! SYNC REJECTED' : 'SYNCHRONIZING…'}</p>
              <div className="sync__progress">
                <div className="sync__progress-fill" style={{ width: `${progress}%` }} />
                <span className="mono">{progress}%</span>
              </div>
              <div className="sync__log mono">
                {lines.map((l, i) => (
                  <p key={i} className={l.startsWith('!!') ? 'is-alert' : ''}>
                    {l}
                  </p>
                ))}
              </div>
              {phase === 'failed' && (
                <>
                  <ul className="sync__unmet">
                    {unmet.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                  <p className="dim sync__text">記録はあなたの端末に保持されている。条件を満たしたら、MEMORY › PENDING SYNC から再接触できる。</p>
                  <div className="sync__actions">
                    <button type="button" className="btn" onClick={() => nav({ name: 'memory', tab: 'list' })}>
                      MEMORY へ
                    </button>
                    <button type="button" className="btn btn--primary" onClick={() => nav({ name: 'battle' })}>
                      BATTLE へ
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {phase === 'complete' && (
            <>
              <p className="sync__kicker mono is-ok">SYNC COMPLETE</p>
              <h2 className="sync__title sync__title--name">{def.name}</h2>
              {def.title && <p className="dim">{def.title}</p>}
              <div className="sync__tags">
                <RarityTag rarity={def.rarity} solid />
                <CategoryTag category={def.category} />
                <AttributeTag attribute={def.attribute} withJa />
              </div>
              {def.quote && <blockquote className="sync__quote">{def.quote}</blockquote>}
              <div className="sync__gained">
                <p className="section-label">同期した能力</p>
                <ul>
                  {def.skills.map((id) => (
                    <li key={id}>
                      <span className="mono">SKILL</span> {data.skillById.get(id)?.name}
                    </li>
                  ))}
                  {def.passive.map((id) => (
                    <li key={id}>
                      <span className="mono">PASSIVE</span> {data.skillById.get(id)?.name}
                    </li>
                  ))}
                  {def.syncEffects.rewrite && (
                    <li>
                      <span className="mono">REWRITE</span> {data.skillById.get(def.syncEffects.rewrite)?.name}
                    </li>
                  )}
                  {(def.fieldAbilities ?? []).map((f) => (
                    <li key={f.id}>
                      <span className="mono">FIELD</span> {f.name}
                    </li>
                  ))}
                </ul>
              </div>
              {restored.length > 0 && (
                <div className="sync__restore">
                  <p className="section-label">WORLD RESTORATION 世界修復</p>
                  {restored.map((r) => (
                    <div key={r.worldId} className="sync__restore-world">
                      <p className="mono">
                        {data.worldById.get(r.worldId)?.name} {Math.round(r.before * 100)}% → <strong>{Math.round(r.after * 100)}%</strong>
                      </p>
                      <ul>
                        {r.restored.map((t) => (
                          <li key={t.target.id}>
                            <span className="mono">{KIND_LABEL[t.kind].label}</span> {t.target.name}
                            <span className="dim"> —— {t.target.description}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <button type="button" className="btn btn--sm" onClick={() => nav({ name: 'worldDetail', worldId: restored[0].worldId })}>
                    WORLD を見る
                  </button>
                </div>
              )}
              <p className="sync__registered">Memory一覧に登録しました。</p>
              <div className="sync__actions">
                {instance && (
                  <button type="button" className="btn" onClick={() => nav({ name: 'memoryDetail', instanceId: instance.instanceId })}>
                    記録を見る
                  </button>
                )}
                {def.skills.length + def.passive.length > 0 && (
                  <button type="button" className="btn btn--purple" onClick={() => nav({ name: 'memory', tab: 'loadout' })}>
                    装備する
                  </button>
                )}
                <button type="button" className="btn btn--primary" onClick={() => nav({ name: 'battle' })}>
                  BATTLE へ
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </ScreenFrame>
  );
}
