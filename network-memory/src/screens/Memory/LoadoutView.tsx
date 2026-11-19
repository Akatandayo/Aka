import { useEffect, useMemo, useState } from 'react';
import { useNav } from '../../app/nav';
import { ExplorerAvatar } from '../../components/battle/ExplorerAvatar';
import { AttributeTag } from '../../components/memory/Badges';
import { MemoryCard } from '../../components/memory/MemoryCard';
import { useToast } from '../../components/ui/Toast';
import { ATTRIBUTE_META, CATEGORY_META, SLOT_RULES, STAT_META } from '../../core/constants';
import { buildEntries, sortEntries } from '../../core/memory/query';
import { analyzeLoadout, playerPower } from '../../core/player/character';
import { getLoadout, loadoutMembership, slotIneligibleReason } from '../../core/player/loadout';
import { usePlayer } from '../../state/GameProvider';
import { useSessionState } from '../../state/sessionState';
import { MEMORY_CATEGORIES, STAT_KEYS, type MemoryCategory } from '../../types/memory';
import { LOADOUT_SLOT_TYPES, type LoadoutSlotType } from '../../types/player';

interface SlotRef {
  type: LoadoutSlotType;
  index: number;
}

/** Memory 装備（GDD Ver.2 §6）: メイン 1 / サブ 3 / パッシブ 2 */
export function LoadoutView() {
  const nav = useNav();
  const toast = useToast();
  const { save, data, dispatch } = usePlayer();
  const [loadoutId, setLoadoutId] = useSessionState<string>('memory.loadoutId', save.activeLoadoutId);
  const loadout = getLoadout(save, loadoutId) ?? save.loadouts[0];
  const [target, setTarget] = useState<SlotRef>({ type: 'main', index: 0 });
  const [category, setCategory] = useState<MemoryCategory | null>(null);
  const [nameDraft, setNameDraft] = useState(loadout.name);
  useEffect(() => setNameDraft(loadout.name), [loadout.id, loadout.name]);

  const analysis = useMemo(() => analyzeLoadout(save, data, loadout), [save, data, loadout]);
  const entryById = useMemo(() => new Map(buildEntries(save, data).map((e) => [e.instance.instanceId, e])), [save, data]);
  const membership = useMemo(() => loadoutMembership(save), [save]);
  const pool = useMemo(() => {
    const all = sortEntries(buildEntries(save, data), 'cp', 'desc');
    return category ? all.filter((e) => e.def.category === category) : all;
  }, [save, data, category]);
  const isActive = save.activeLoadoutId === loadout.id;
  const syncColor = ATTRIBUTE_META[analysis.attribute].color;

  const nextEmpty = (after: SlotRef): SlotRef | null => {
    for (const t of LOADOUT_SLOT_TYPES) {
      const i = loadout.slots[t].findIndex((x, idx) => x === null && !(t === after.type && idx === after.index));
      if (i >= 0) return { type: t, index: i };
    }
    return null;
  };

  const equip = (instanceId: string) => {
    dispatch({ type: 'EQUIP', loadoutId: loadout.id, slot: target.type, index: target.index, instanceId });
    const n = nextEmpty(target);
    if (n) setTarget(n);
  };

  const commitName = () => {
    const name = nameDraft.trim();
    if (!name) setNameDraft(loadout.name);
    else if (name !== loadout.name) dispatch({ type: 'RENAME_LOADOUT', loadoutId: loadout.id, name });
  };

  return (
    <div className="loadout">
      <div className="loadout__presets" role="tablist" aria-label="装備プリセット">
        {save.loadouts.map((l) => (
          <button key={l.id} type="button" role="tab" className="loadout__preset" aria-selected={l.id === loadout.id} onClick={() => setLoadoutId(l.id)}>
            {save.activeLoadoutId === l.id && <span className="loadout__star" aria-label="使用中">★</span>}
            {l.name}
          </button>
        ))}
      </div>

      <section className="panel loadout__editor">
        <div className="loadout__head">
          <label className="field loadout__name">
            <span className="field__label">LOADOUT NAME</span>
            <input className="input" value={nameDraft} maxLength={16} onChange={(e) => setNameDraft(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          </label>
          <div className="loadout__head-actions">
            <button
              type="button"
              className={`btn btn--sm ${isActive ? '' : 'btn--primary'}`}
              disabled={isActive}
              onClick={() => {
                dispatch({ type: 'SET_ACTIVE_LOADOUT', loadoutId: loadout.id });
                toast.push({ tone: 'success', title: `${loadout.name} を戦闘で使用します` });
              }}
            >
              {isActive ? '★ 使用中' : 'この装備で戦う'}
            </button>
            <button type="button" className="btn btn--sm btn--purple" onClick={() => dispatch({ type: 'AUTO_LOADOUT', loadoutId: loadout.id })}>
              おまかせ
            </button>
            <button type="button" className="btn btn--sm btn--ghost" disabled={analysis.contributions.length === 0} onClick={() => dispatch({ type: 'CLEAR_LOADOUT', loadoutId: loadout.id })}>
              全て外す
            </button>
          </div>
        </div>

        {LOADOUT_SLOT_TYPES.map((type) => (
          <div key={type} className={`loadout__group loadout__group--${type}`}>
            <p className="loadout__group-label">
              <span className="mono">{SLOT_RULES[type].label}</span>
              <strong>{SLOT_RULES[type].ja}</strong>
              <small>{SLOT_RULES[type].description}</small>
            </p>
            <div className={`loadout__slots loadout__slots--${type}`}>
              {loadout.slots[type].map((id, index) => {
                const e = id ? entryById.get(id) : undefined;
                const selected = target.type === type && target.index === index;
                return (
                  <div key={index} className={`loadout__slot ${selected ? 'is-target' : ''}`}>
                    {e ? (
                      <MemoryCard def={e.def} entry={e} size="sm" selected={selected} animated={selected && type === 'main'} onClick={() => setTarget({ type, index })} ariaLabel={`${SLOT_RULES[type].ja}${index + 1}: ${e.def.name}（タップで選択）`} />
                    ) : (
                      <button type="button" className={`loadout__empty ${selected ? 'is-selected' : ''}`} onClick={() => setTarget({ type, index })} aria-label={`${SLOT_RULES[type].ja}${index + 1}（空き）を選択`}>
                        <span>+</span>
                        <small>{selected ? '下から選択' : 'EMPTY'}</small>
                      </button>
                    )}
                    {e && (
                      <div className="loadout__slot-actions">
                        <button type="button" className="btn btn--sm btn--ghost" onClick={() => nav({ name: 'memoryDetail', instanceId: e.instance.instanceId })}>
                          詳細
                        </button>
                        <button type="button" className="btn btn--sm btn--ghost" onClick={() => dispatch({ type: 'EQUIP', loadoutId: loadout.id, slot: type, index, instanceId: null })} aria-label={`${e.def.name} を外す`}>
                          外す
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="panel loadout__status">
        <div className="panel__title">
          <span>SYNC STATUS</span>
          <small>同期後の主人公の能力</small>
        </div>
        <div className="loadout__status-grid">
          <div className="loadout__avatar">
            <ExplorerAvatar color={save.profile.avatar.color} syncColor={analysis.appearance?.aura ?? syncColor} animated />
            <p className="mono">
              {save.profile.name} · Lv.{save.profile.level}
            </p>
            <p className="loadout__power mono">POWER {playerPower(analysis).toLocaleString('ja-JP')}</p>
          </div>
          <div className="loadout__numbers">
            <table className="stat-table loadout__table">
              <thead>
                <tr>
                  <th />
                  <th className="mono">MAIN固有</th>
                  <th className="mono">成長+補正</th>
                  <th className="mono">同期後</th>
                </tr>
              </thead>
              <tbody>
                {STAT_KEYS.map((k) => (
                  <tr key={k}>
                    <th scope="row">
                      <span className="stat-table__key">{STAT_META[k].label}</span>
                    </th>
                    <td className="mono mute">{analysis.base[k]}</td>
                    <td className="mono loadout__plus">+{analysis.bonus[k]}</td>
                    <td className="mono stat-table__val">{analysis.total[k].toLocaleString('ja-JP')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="loadout__style">
              <dt>属性</dt>
              <dd>
                <AttributeTag attribute={analysis.attribute} withJa />
              </dd>
              <dt>ATTACK</dt>
              <dd>
                {analysis.attack.name}（{analysis.attack.scale.toUpperCase()} {Math.round(analysis.attack.power * 100)}%{analysis.attack.hits > 1 ? ` ×${analysis.attack.hits}` : ''}）
              </dd>
              <dt>REWRITE</dt>
              <dd>{analysis.rewrite ? data.skillById.get(analysis.rewrite.skillId)?.name : <span className="mute">なし（メインMemoryに依存）</span>}</dd>
              <dt>外見</dt>
              <dd style={analysis.appearance ? { color: analysis.appearance.aura } : undefined}>{analysis.appearance?.label ?? <span className="mute">未同期</span>}</dd>
              <dt>成長</dt>
              <dd>
                共通成長 +{Math.round(analysis.rates.growth * 100)}%
                {Object.entries(analysis.rates.passive).map(([k, v]) => ` / ${k.toUpperCase()} +${Math.round((v ?? 0) * 100)}%`).join('')}
              </dd>
            </dl>
          </div>
        </div>
        <div className="loadout__abilities">
          <div>
            <p className="section-label">SKILL（{analysis.skills.length}）</p>
            {analysis.skills.length ? (
              <ul className="loadout__list">
                {analysis.skills.map((s) => {
                  const sk = data.skillById.get(s.skillId);
                  return (
                    <li key={s.skillId}>
                      <strong>{sk?.name}</strong>
                      <span className="mono mute">
                        SE {sk?.cost ?? 0} · CT {sk?.cooldown ?? 0}
                      </span>
                      <small>
                        {data.memoryById.get(s.memoryId)?.name}
                        {analysis.main?.def.id === s.memoryId ? '（完全同期）' : '（補助スキル）'}
                      </small>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mute">メイン・サブにMemoryを装備するとスキルが使えます。</p>
            )}
          </div>
          <div>
            <p className="section-label">PASSIVE（{analysis.passives.length}）</p>
            {analysis.passives.length ? (
              <ul className="loadout__list">
                {analysis.passives.map((s) => (
                  <li key={`${s.memoryId}-${s.skillId}`}>
                    <strong>{data.skillById.get(s.skillId)?.name}</strong>
                    <small>{data.skillById.get(s.skillId)?.description}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mute">メイン・パッシブ枠のMemoryのパッシブ効果が有効になります。</p>
            )}
          </div>
        </div>
      </section>

      <section className="loadout__pool">
        <div className="loadout__pool-head">
          <p className="section-label" style={{ color: 'var(--c-cyan)' }}>
            {SLOT_RULES[target.type].label} {target.index + 1} に装備する Memory を選択
          </p>
          <div className="chip-row">
            <button type="button" className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>
              ALL
            </button>
            {MEMORY_CATEGORIES.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
                {c}
                <span className="mute">{CATEGORY_META[c].ja}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="loadout__pool-grid">
          {pool.map((e) => {
            const reason = slotIneligibleReason(e.def, target.type);
            const here = (membership.get(e.instance.instanceId) ?? []).find((p) => p.loadoutId === loadout.id);
            return (
              <div key={e.instance.instanceId} className="loadout__pool-item" title={reason ?? undefined}>
                <MemoryCard
                  def={e.def}
                  entry={e}
                  size="sm"
                  disabled={Boolean(reason)}
                  badge={here ? `${SLOT_RULES[here.slot].label}${here.slot === 'main' ? '' : here.index + 1}` : undefined}
                  selected={Boolean(here && here.slot === target.type && here.index === target.index)}
                  onClick={() => equip(e.instance.instanceId)}
                  ariaLabel={reason ? `${e.def.name}（${reason}）` : `${e.def.name} を${SLOT_RULES[target.type].ja}に装備`}
                />
                {reason && <p className="loadout__reason">{reason}</p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
