import { useEffect, useMemo, useState } from 'react';
import { useNav } from '../../app/nav';
import { AttributeTag } from '../../components/memory/Badges';
import { MemoryCard } from '../../components/memory/MemoryCard';
import { useToast } from '../../components/ui/Toast';
import { CATEGORY_META } from '../../core/constants';
import { buildEntries, sortEntries } from '../../core/memory/query';
import { getTeam, teamEntries } from '../../core/player/teams';
import { usePlayer } from '../../state/GameProvider';
import { useSessionState } from '../../state/sessionState';
import { MEMORY_CATEGORIES, type MemoryCategory } from '../../types/memory';
import { TEAM_SIZE } from '../../types/player';

/** 編成画面: 3体までのチームを3プリセット管理する */
export function TeamEditView() {
  const nav = useNav();
  const toast = useToast();
  const { save, data, dispatch } = usePlayer();
  const [teamId, setTeamId] = useSessionState<string>('memory.teamId', save.activeTeamId);
  const team = getTeam(save, teamId) ?? save.teams[0];
  const [slot, setSlot] = useState(() => {
    const empty = team.slots.indexOf(null);
    return empty >= 0 ? empty : 0;
  });
  const [category, setCategory] = useState<MemoryCategory | null>(null);
  const [nameDraft, setNameDraft] = useState(team.name);
  useEffect(() => setNameDraft(team.name), [team.id, team.name]);

  const members = useMemo(() => teamEntries(save, data, team), [save, data, team]);
  const pool = useMemo(() => {
    const all = sortEntries(buildEntries(save, data), 'cp', 'desc');
    return category ? all.filter((e) => e.def.category === category) : all;
  }, [save, data, category]);

  const filled = members.filter((m) => m !== null);
  const totalCp = filled.reduce((sum, m) => sum + m!.cp, 0);
  const speedOrder = [...filled].sort((a, b) => b!.stats.spd - a!.stats.spd);
  const attributes = [...new Set(filled.map((m) => m!.def.attribute))];
  const isActive = save.activeTeamId === team.id;

  const assign = (instanceId: string | null, at = slot) => {
    dispatch({ type: 'ASSIGN_SLOT', teamId: team.id, slot: at, instanceId });
    if (instanceId) {
      // 次の空き枠へ自動で移動
      const nextSlots = [...team.slots];
      const prev = nextSlots.indexOf(instanceId);
      if (prev >= 0) nextSlots[prev] = nextSlots[at];
      nextSlots[at] = instanceId;
      const nextEmpty = nextSlots.findIndex((s, i) => s === null && i !== at);
      if (nextEmpty >= 0) setSlot(nextEmpty);
    }
  };

  const commitName = () => {
    const name = nameDraft.trim();
    if (!name) {
      setNameDraft(team.name);
      return;
    }
    if (name !== team.name) dispatch({ type: 'RENAME_TEAM', teamId: team.id, name });
  };

  return (
    <div className="team">
      <div className="team__presets" role="tablist" aria-label="編成プリセット">
        {save.teams.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="team__preset"
            aria-selected={t.id === team.id}
            onClick={() => {
              setTeamId(t.id);
              const empty = t.slots.indexOf(null);
              setSlot(empty >= 0 ? empty : 0);
            }}
          >
            {save.activeTeamId === t.id && <span className="team__star" aria-label="出撃チーム">★</span>}
            {t.name}
          </button>
        ))}
      </div>

      <section className="panel team__editor">
        <div className="team__head">
          <label className="field team__name">
            <span className="field__label">TEAM NAME</span>
            <input
              className="input"
              value={nameDraft}
              maxLength={16}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
          <div className="team__head-actions">
            <button
              type="button"
              className={`btn btn--sm ${isActive ? '' : 'btn--primary'}`}
              disabled={isActive}
              onClick={() => {
                dispatch({ type: 'SET_ACTIVE_TEAM', teamId: team.id });
                toast.push({ tone: 'success', title: `${team.name} を出撃チームに設定しました` });
              }}
            >
              {isActive ? '★ 出撃チーム' : '出撃チームに設定'}
            </button>
            <button type="button" className="btn btn--sm btn--purple" onClick={() => dispatch({ type: 'AUTO_TEAM', teamId: team.id })}>
              おまかせ
            </button>
            <button type="button" className="btn btn--sm btn--ghost" disabled={filled.length === 0} onClick={() => dispatch({ type: 'CLEAR_TEAM', teamId: team.id })}>
              全て外す
            </button>
          </div>
        </div>

        <div className="team__slots">
          {Array.from({ length: TEAM_SIZE }, (_, i) => {
            const m = members[i];
            return (
              <div key={i} className={`team__slot ${slot === i ? 'is-target' : ''}`}>
                <span className="team__slot-label mono">{i === 0 ? 'LEADER' : `SLOT ${i + 1}`}</span>
                {m ? (
                  <MemoryCard def={m.def} entry={m} selected={slot === i} onClick={() => setSlot(i)} animated={slot === i} ariaLabel={`スロット${i + 1}: ${m.def.name}（タップで選択）`} />
                ) : (
                  <button type="button" className={`team__empty ${slot === i ? 'is-selected' : ''}`} onClick={() => setSlot(i)} aria-label={`スロット${i + 1}（空き）を選択`}>
                    <span>+</span>
                    <small>{slot === i ? '下から選択' : 'EMPTY'}</small>
                  </button>
                )}
                <div className="team__slot-actions">
                  {m && (
                    <>
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => nav({ name: 'memoryDetail', instanceId: m.instance.instanceId })}>
                        詳細
                      </button>
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => assign(null, i)} aria-label={`${m.def.name} を外す`}>
                        外す
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="team__summary">
          <div>
            <span className="section-label">TOTAL CP</span>
            <strong className="team__cp mono">{totalCp.toLocaleString('ja-JP')}</strong>
          </div>
          <div>
            <span className="section-label">ATTRIBUTE</span>
            <div className="chip-row">{attributes.length ? attributes.map((a) => <AttributeTag key={a} attribute={a} />) : <span className="mute">—</span>}</div>
          </div>
          <div className="team__order">
            <span className="section-label">ACTION ORDER（SPD順・予測）</span>
            <ol>
              {speedOrder.length ? (
                speedOrder.map((m) => (
                  <li key={m!.instance.instanceId}>
                    {m!.def.name}
                    <span className="mono mute"> SPD {m!.stats.spd}</span>
                  </li>
                ))
              ) : (
                <li className="mute">メンバーがいません</li>
              )}
            </ol>
          </div>
        </div>
      </section>

      <section className="team__pool">
        <div className="team__pool-head">
          <p className="section-label">
            SLOT {slot + 1} に配置する Memory を選択
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
        {pool.length === 0 ? (
          <div className="panel empty">該当するMemoryを所持していません。</div>
        ) : (
          <div className="team__pool-grid">
            {pool.map((e) => {
              const inSlot = team.slots.indexOf(e.instance.instanceId);
              const sameMemorySlot = members.findIndex((m) => m && m.def.id === e.def.id && m.instance.instanceId !== e.instance.instanceId);
              return (
                <MemoryCard
                  key={e.instance.instanceId}
                  def={e.def}
                  entry={e}
                  size="sm"
                  badge={inSlot >= 0 ? `SLOT ${inSlot + 1}` : sameMemorySlot >= 0 ? '同名あり' : undefined}
                  selected={inSlot === slot}
                  onClick={() => assign(e.instance.instanceId)}
                  ariaLabel={`${e.def.name} をスロット${slot + 1}に配置`}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
