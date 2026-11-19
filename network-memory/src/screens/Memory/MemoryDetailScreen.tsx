import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNav } from '../../app/nav';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { AttributeTag, CategoryTag, RarityTag } from '../../components/memory/Badges';
import { MemoryArt } from '../../components/memory/MemoryArt';
import { MemoryCard } from '../../components/memory/MemoryCard';
import { StatHexagon } from '../../components/memory/StatHexagon';
import { useToast } from '../../components/ui/Toast';
import { ATTRIBUTE_META, CATEGORY_META, MAX_LIMIT_BREAK, RARITY_META, SLOT_RULES, STAT_META, STATUS_META, TARGET_LABEL } from '../../core/constants';
import type { GameData } from '../../core/data/gameData';
import { applyQuery, buildEntries, toEntry, type MemoryEntry } from '../../core/memory/query';
import { describeUnlock, evaluateFragments, ownedMemoryIdSet } from '../../core/memory/records';
import { baseStats, expToNext, maxLevel } from '../../core/memory/stats';
import { discoveryState } from '../../core/player/discovery';
import { loadoutMembership, placementLabel } from '../../core/player/loadout';
import { checkSyncConditions } from '../../core/player/sync';
import { usePlayer } from '../../state/GameProvider';
import { useSessionState } from '../../state/sessionState';
import { STAT_KEYS } from '../../types/memory';
import type { PlayerSave } from '../../types/player';
import type { PassiveTrigger, SkillDefinition } from '../../types/skill';
import { peekMemoryQuery } from './memoryQueryState';
import './MemoryDetail.css';

type DetailTab = 'status' | 'skill' | 'record' | 'link';

const TABS: { id: DetailTab; label: string; ja: string }[] = [
  { id: 'status', label: 'STATUS', ja: '能力' },
  { id: 'skill', label: 'SKILL', ja: 'スキル' },
  { id: 'record', label: 'RECORD', ja: '記録' },
  { id: 'link', label: 'LINK', ja: '関連' },
];

const TRIGGER_LABEL: Record<PassiveTrigger, string> = {
  always: '常時',
  battle_start: '戦闘開始時',
  turn_start: 'ターン開始時',
  on_damaged: '被ダメージ時',
  on_lethal: '致死ダメージ時',
  on_status: '状態異常時',
  on_enemy_down: '敵撃破時',
};

export function MemoryDetailScreen({ instanceId }: { instanceId: string }) {
  const nav = useNav();
  const { save, data, dispatch } = usePlayer();
  const [tab, setTab] = useSessionState<DetailTab>('memory.detailTab', 'status');

  const instance = save.memories.find((m) => m.instanceId === instanceId);
  const def = instance ? data.memoryById.get(instance.memoryId) : undefined;

  // 前後移動は一覧の検索条件・並び順に従う
  const siblings = useMemo(() => {
    const all = buildEntries(save, data);
    const filtered = applyQuery(all, peekMemoryQuery());
    return filtered.some((e) => e.instance.instanceId === instanceId) ? filtered : applyQuery(all, { ...peekMemoryQuery(), text: '', categories: [], rarities: [], attributes: [], favoritesOnly: false });
  }, [save, data, instanceId]);
  const idx = siblings.findIndex((e) => e.instance.instanceId === instanceId);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const back = { route: { name: 'memory', tab: 'list' } as const, label: 'LIST' };

  if (!instance || !def) {
    return (
      <ScreenFrame code="03" title="MEMORY" subtitle="記録詳細" back={back}>
        <div className="panel empty">
          <p>この記録は見つかりませんでした。</p>
          <button type="button" className="btn btn--sm" style={{ marginTop: 12 }} onClick={() => nav(back.route)}>
            一覧に戻る
          </button>
        </div>
      </ScreenFrame>
    );
  }

  const entry = toEntry(instance, def);
  const cap = maxLevel(def.rarity, instance.limitBreak);
  const placements = loadoutMembership(save).get(instance.instanceId) ?? [];
  const combat = def.skills.length > 0 || def.passiveSkills.length > 0;
  const vars = {
    ['--rarity-c' as string]: RARITY_META[def.rarity].color,
    ['--attr-c' as string]: ATTRIBUTE_META[def.attribute].color,
  } as CSSProperties;

  return (
    <ScreenFrame code="03" title="MEMORY" subtitle="記録詳細" back={back}>
      <div className={`mdetail mdetail--${def.rarity.toLowerCase()}`} style={vars} key={instance.instanceId}>
        <section className="mdetail__hero">
          <div className="mdetail__art reveal">
            <MemoryArt def={def} animated />
          </div>

          <div className="mdetail__head reveal" style={{ animationDelay: '0.08s' }}>
            <div className="mdetail__tags">
              <RarityTag rarity={def.rarity} solid />
              <CategoryTag category={def.category} />
              <AttributeTag attribute={def.attribute} withJa />
            </div>
            <div>
              <p className="mdetail__id mono">
                {def.id}
                {def.nameEn && <> · {def.nameEn}</>}
              </p>
              <h2 className="mdetail__name">{def.name}</h2>
              {def.title && <p className="mdetail__title">{def.title}</p>}
            </div>

            <dl className="mdetail__level">
              <div>
                <dt>LEVEL</dt>
                <dd className="mono">
                  {instance.level}
                  <span className="mute"> / {cap}</span>
                </dd>
              </div>
              <div>
                <dt>LIMIT</dt>
                <dd className="mdetail__lb" aria-label={`限界突破 ${instance.limitBreak} / ${MAX_LIMIT_BREAK}`}>
                  {Array.from({ length: MAX_LIMIT_BREAK }, (_, i) => (
                    <span key={i} className={i < instance.limitBreak ? 'is-on' : ''} />
                  ))}
                </dd>
              </div>
              <div>
                <dt>CP</dt>
                <dd className="mono">{entry.cp.toLocaleString('ja-JP')}</dd>
              </div>
            </dl>
            <div className="mdetail__exp">
              <div className="mdetail__exp-row mono">
                <span>EXP</span>
                <span>
                  {instance.exp} / {expToNext(instance.level)}
                </span>
              </div>
              <div className="meter" style={{ ['--meter-c' as string]: ATTRIBUTE_META[def.attribute].color }}>
                <div className="meter__fill" style={{ width: `${Math.min(100, (instance.exp / expToNext(instance.level)) * 100)}%` }} />
              </div>
              <p className="mdetail__hint">
                {combat ? '装備して戦うと同期経験値を得てレベルが上がり、補正値が成長します。' : 'この記録は戦闘では使用しません（探索・ストーリー用）。'}
                スキル強化・限界突破・融合は未実装です（拡張フェーズで実装予定）。
              </p>
            </div>

            {def.quote && <blockquote className="mdetail__quote">{def.quote}</blockquote>}

            <div className="mdetail__actions">
              <button
                type="button"
                className="btn btn--sm"
                aria-pressed={instance.favorite}
                onClick={() => dispatch({ type: 'TOGGLE_FAVORITE', instanceId: instance.instanceId })}
                style={instance.favorite ? ({ ['--btn-c' as string]: 'var(--c-warn)' } as CSSProperties) : undefined}
              >
                {instance.favorite ? '★ お気に入り' : '☆ お気に入り'}
              </button>
              {combat && (
                <button type="button" className="btn btn--sm btn--purple" onClick={() => nav({ name: 'memory', tab: 'loadout' })}>
                  装備{placements.length > 0 && `（${placements.map(placementLabel).join(' / ')}）`}
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="mdetail__pager">
          <button type="button" className="btn btn--sm btn--ghost" disabled={!prev} onClick={() => prev && nav({ name: 'memoryDetail', instanceId: prev.instance.instanceId }, { replace: true })}>
            ◀ {prev ? prev.def.name : 'PREV'}
          </button>
          <span className="mono mute">
            {idx + 1} / {siblings.length}
          </span>
          <button type="button" className="btn btn--sm btn--ghost" disabled={!next} onClick={() => next && nav({ name: 'memoryDetail', instanceId: next.instance.instanceId }, { replace: true })}>
            {next ? next.def.name : 'NEXT'} ▶
          </button>
        </div>

        <RecordTabs tab={tab} setTab={setTab} save={save} data={data} entry={entry} />
      </div>
    </ScreenFrame>
  );
}

function RecordTabs({ tab, setTab, save, data, entry }: { tab: DetailTab; setTab: (t: DetailTab) => void; save: PlayerSave; data: GameData; entry: MemoryEntry }) {
  const story = entry.def.storyId ? data.storyById.get(entry.def.storyId) : undefined;
  const fragments = useMemo(
    () => (story ? evaluateFragments(story.fragments, { ownedMemoryIds: ownedMemoryIdSet(save), flags: save.progress.flags, instance: entry.instance }) : []),
    [story, save, entry.instance],
  );
  const unread = fragments.filter((f) => f.unlocked && !save.archive.readFragmentIds.includes(f.fragment.id)).length;

  return (
    <section className="mdetail__tabs">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'record' && unread > 0 && <span className="mdetail__dot" aria-label={`未読 ${unread} 件`} />}
            <small>{t.ja}</small>
          </button>
        ))}
      </div>
      <div className="mdetail__tab-body" role="tabpanel">
        {tab === 'status' && <StatusTab entry={entry} />}
        {tab === 'skill' && <SkillTab entry={entry} data={data} />}
        {tab === 'record' && <RecordTab entry={entry} save={save} data={data} fragments={fragments} />}
        {tab === 'link' && <LinkTab entry={entry} save={save} data={data} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- STATUS

function StatusTab({ entry }: { entry: MemoryEntry }) {
  const base = baseStats(entry.def);
  const color = ATTRIBUTE_META[entry.def.attribute].color;
  const combat = entry.def.skills.length > 0 || entry.def.passiveSkills.length > 0;
  return (
    <div className="mdetail__status">
      <div className="panel">
        <p className="section-label">DESCRIPTION</p>
        <p className="mdetail__desc">{entry.def.description}</p>
      </div>
      {entry.def.persona && (
        <div className="panel mdetail__persona">
          <p className="section-label">PERSONA 人格記録</p>
          <p className="mdetail__desc">{entry.def.persona.personality}</p>
          {entry.def.persona.note && <p className="dim mdetail__persona-note">{entry.def.persona.note}</p>}
        </div>
      )}
      {!combat && <p className="notice notice--planned">この記録は戦闘能力を持たず、ステータス補正もありません。探索能力やストーリー進行に使われます（SKILLタブ参照）。</p>}
      <div className="mdetail__status-grid">
        <div className="panel">
          <p className="section-label">PARAMETER</p>
          <table className="stat-table">
            <tbody>
              {STAT_KEYS.map((k) => (
                <tr key={k}>
                  <th scope="row">
                    <span className="stat-table__key">{STAT_META[k].label}</span>
                    <span className="stat-table__ja">{STAT_META[k].ja}</span>
                  </th>
                  <td className="stat-table__bar">
                    <div className="meter" style={{ ['--meter-c' as string]: color }}>
                      <div className="meter__fill" style={{ width: `${Math.min(100, (base[k] / STAT_META[k].reference) * 100)}%` }} />
                    </div>
                  </td>
                  <td className="stat-table__val mono">{entry.stats[k].toLocaleString('ja-JP')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mdetail__hint">
            数値はこのMemoryの<strong>ステータス補正</strong>（現在のレベル）。装備すると主人公に加算されます: {(['main', 'sub', 'passive'] as const).map((t) => `${SLOT_RULES[t].ja} ${Math.round(SLOT_RULES[t].statRate * 100)}%`).join(' / ')}。バーは資質を示します。
          </p>
        </div>
        <div className="panel mdetail__hex">
          <p className="section-label">APTITUDE</p>
          <StatHexagon stats={base} color={color} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- SKILL

function SkillCard({ skill, level }: { skill: SkillDefinition; level?: number }) {
  const attr = skill.attribute ? ATTRIBUTE_META[skill.attribute] : null;
  const statuses = [...new Set(skill.effects.map((e) => e.status).filter((s): s is NonNullable<typeof s> => Boolean(s)))];
  return (
    <article className={`skill skill--${skill.kind}`} style={attr ? ({ ['--skill-c' as string]: attr.color } as CSSProperties) : undefined}>
      <header className="skill__head">
        <span className="skill__kind mono">{skill.kind === 'active' ? 'ACTIVE' : skill.kind === 'passive' ? 'PASSIVE' : 'REWRITE'}</span>
        <h4 className="skill__name">{skill.name}</h4>
        {level !== undefined && <span className="mono mute skill__lv">Lv.{level}</span>}
      </header>
      <div className="skill__meta">
        {skill.attribute && <AttributeTag attribute={skill.attribute} />}
        {skill.target && <span className="tag">{TARGET_LABEL[skill.target]}</span>}
        {skill.kind === 'active' && <span className="tag">SP {skill.cost ?? 0}</span>}
        {skill.kind === 'active' && <span className="tag">CT {skill.cooldown ?? 0}</span>}
        {skill.kind === 'passive' && skill.trigger && <span className="tag">{TRIGGER_LABEL[skill.trigger]}</span>}
      </div>
      <p className="skill__desc">{skill.description}</p>
      {statuses.length > 0 && (
        <ul className="skill__notes">
          {statuses.map((s) => (
            <li key={s}>
              <strong>{STATUS_META[s].label}</strong>: {STATUS_META[s].description}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function SkillTab({ entry, data }: { entry: MemoryEntry; data: GameData }) {
  const actives = entry.def.skills.map((id) => data.skillById.get(id)).filter((s): s is SkillDefinition => Boolean(s));
  const passives = entry.def.passiveSkills.map((id) => data.skillById.get(id)).filter((s): s is SkillDefinition => Boolean(s));
  const rewrite = entry.def.rewrite ? data.skillById.get(entry.def.rewrite) : undefined;
  return (
    <div className="mdetail__skills">
      {actives.length + passives.length === 0 ? (
        <p className="notice notice--planned">この記録は戦闘スキルを持たない。</p>
      ) : (
        <p className="notice">メイン・サブ枠に装備するとアクティブスキル（MEMORY SKILL）、メイン・パッシブ枠に装備するとパッシブ効果が戦闘で使えます。REWRITEはメイン装備時のみ。</p>
      )}
      {(entry.def.fieldAbilities?.length ?? 0) > 0 && (
        <>
          <p className="section-label">FIELD ABILITY 探索能力</p>
          <div className="skill-grid">
            {entry.def.fieldAbilities!.map((f) => (
              <article key={f.id} className="skill skill--field">
                <header className="skill__head">
                  <span className="skill__kind mono">FIELD</span>
                  <h4 className="skill__name">{f.name}</h4>
                </header>
                <p className="skill__desc">{f.description}</p>
                <p className="mdetail__hint">WORLD探索（PHASE 4）で使用されます。</p>
              </article>
            ))}
          </div>
        </>
      )}
      {actives.length > 0 && <p className="section-label">ACTIVE SKILL</p>}
      <div className="skill-grid">
        {actives.map((s) => (
          <SkillCard key={s.id} skill={s} level={entry.instance.skillLevels[s.id] ?? 1} />
        ))}
      </div>
      {passives.length > 0 && <p className="section-label">PASSIVE SKILL</p>}
      <div className="skill-grid">
        {passives.map((s) => (
          <SkillCard key={s.id} skill={s} />
        ))}
      </div>
      <p className="section-label">REWRITE</p>
      {rewrite ? (
        <article className={`rewrite ${rewrite.direction?.glitch ? 'is-glitch' : ''}`} style={{ ['--rw-c' as string]: rewrite.direction?.color ?? 'var(--c-cyan)' } as CSSProperties}>
          <div className="rewrite__label mono">REWRITE SEQUENCE</div>
          <h4 className="rewrite__name">
            {rewrite.name}
            {rewrite.nameEn && <span className="mono"> // {rewrite.nameEn}</span>}
          </h4>
          <dl className="rewrite__cond">
            <dt>発動条件</dt>
            <dd>{rewrite.conditionText}</dd>
          </dl>
          <p className="skill__desc">{rewrite.description}</p>
          {rewrite.direction?.cutin && (
            <p className="rewrite__cutin">
              <span className="mono">CUT-IN</span>「{rewrite.direction.cutin}」
            </p>
          )}
        </article>
      ) : (
        <p className="mute mdetail__none">このMemoryはREWRITEを持たない。</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- RECORD

function RecordTab({ entry, save, data, fragments }: { entry: MemoryEntry; save: PlayerSave; data: GameData; fragments: ReturnType<typeof evaluateFragments> }) {
  const { dispatch } = usePlayer();
  const toast = useToast();
  const discovered = useMemo(() => new Set([...save.archive.discoveredMemoryIds, ...save.memories.map((m) => m.memoryId)]), [save]);
  // 開いた時点で未読だった断片に NEW を表示する
  const [newIds] = useState(() => new Set(fragments.filter((f) => f.unlocked && !save.archive.readFragmentIds.includes(f.fragment.id)).map((f) => f.fragment.id)));
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const unlocked = fragments.filter((f) => f.unlocked);
    const fragmentIds = unlocked.map((f) => f.fragment.id).filter((id) => !save.archive.readFragmentIds.includes(id));
    const reveals = unlocked.flatMap((f) => f.fragment.reveals ?? []).filter((id) => !discovered.has(id));
    if (fragmentIds.length === 0 && reveals.length === 0) return;
    dispatch({ type: 'DISCOVER', memoryIds: reveals, fragmentIds });
    for (const id of new Set(reveals)) {
      const m = data.memoryById.get(id);
      if (m) toast.push({ tone: 'discover', title: `新たなMemoryの存在を確認: ${m.name}`, body: `${CATEGORY_META[m.category].label} / ${m.rarity} — 入手方法はLINKタブで確認できます。`, durationMs: 6000 });
    }
  }, [fragments, save.archive.readFragmentIds, discovered, dispatch, data, toast]);

  if (fragments.length === 0) return <p className="mute mdetail__none">このMemoryには記録が登録されていない。</p>;

  const unlockedCount = fragments.filter((f) => f.unlocked).length;
  return (
    <div className="records">
      <p className="records__progress mono">
        RECORD {unlockedCount} / {fragments.length}
      </p>
      <ol className="records__list">
        {fragments.map(({ fragment, unlocked }, i) => (
          <li key={fragment.id} className={`record ${unlocked ? 'is-unlocked' : 'is-locked'}`} style={{ animationDelay: `${i * 0.12}s` }}>
            <header className="record__head">
              <span className="record__no mono">#{String(i + 1).padStart(2, '0')}</span>
              <h4>{unlocked ? fragment.title : 'LOCKED RECORD'}</h4>
              {unlocked && newIds.has(fragment.id) && <span className="tag tag--solid" style={{ ['--tag-c' as string]: 'var(--c-purple)' } as CSSProperties}>NEW</span>}
            </header>
            {unlocked ? (
              <p className="record__text">{fragment.text}</p>
            ) : (
              <p className="record__lock">
                <span className="mono">解放条件</span> {describeUnlock(fragment.unlock, data, discovered)}
              </p>
            )}
          </li>
        ))}
      </ol>
      <p className="mdetail__hint">記録はMemoryの入手・育成・ストーリー進行によって解放されます。記録の中には、まだ見ぬMemoryの手がかりが含まれていることもあります。</p>
      {entry.def.storyId && <p className="mdetail__hint mono">STORY-ID: {entry.def.storyId}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- LINK

function LinkTab({ entry, save, data }: { entry: MemoryEntry; save: PlayerSave; data: GameData }) {
  const nav = useNav();
  const world = entry.def.worldId ? data.worldById.get(entry.def.worldId) : undefined;
  return (
    <div className="links">
      <div className="panel">
        <p className="section-label">RELATED MEMORIES 関連する記録</p>
        {entry.def.relatedMemories.length === 0 ? (
          <p className="mute">関連する記録はない。</p>
        ) : (
          <div className="links__grid">
            {entry.def.relatedMemories.map((id) => {
              const def = data.memoryById.get(id);
              if (!def) return null;
              const state = discoveryState(save, id);
              const owned = state === 'owned' ? save.memories.find((m) => m.memoryId === id) : undefined;
              return (
                <div key={id} className={`links__item is-${state}`}>
                  <MemoryCard
                    def={def}
                    entry={owned ? toEntry(owned, def) : undefined}
                    mask={state === 'owned' ? null : state === 'discovered' ? 'silhouette' : 'unknown'}
                    size="sm"
                    onClick={owned ? () => nav({ name: 'memoryDetail', instanceId: owned.instanceId }) : undefined}
                  />
                  <p className="links__state mono">{state === 'owned' ? 'COLLECTED' : state === 'discovered' ? 'NOT COLLECTED' : 'UNDISCOVERED'}</p>
                  {state === 'discovered' && <p className="links__hint">{def.acquisitionMethod.map((a) => a.label).join(' / ')}</p>}
                  {state === 'undiscovered' && <p className="links__hint">記録を読み解くと存在が判明するかもしれない。</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="links__info">
        <div className="panel">
          <p className="section-label">SYNC CONDITION 同期条件</p>
          <SyncConditions memoryId={entry.def.id} save={save} data={data} />
        </div>
        <div className="panel">
          <p className="section-label">ACQUISITION 入手方法</p>
          <ul className="links__list">
            {entry.def.acquisitionMethod.map((a, i) => (
              <li key={i}>
                <span className="tag">{a.type.toUpperCase()}</span> {a.label}
              </li>
            ))}
          </ul>
          <p className="mdetail__hint">
            この個体: {new Date(entry.instance.acquiredAt).toLocaleString('ja-JP')} / {entry.instance.acquiredFrom}
          </p>
        </div>
        <div className="panel">
          <p className="section-label">ORIGIN 出現WORLD</p>
          {world ? (
            <>
              <p className="links__world">
                <span className="mono">{world.id}</span> {world.name}
                <small>{world.subtitle}</small>
              </p>
              <p className="dim" style={{ fontSize: 13 }}>
                {world.description}
              </p>
              <p className="mdetail__hint">WORLD探索は PHASE 4 で実装予定です。</p>
            </>
          ) : (
            <p className="mute">出現WORLD: 不明</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SyncConditions({ memoryId, save, data }: { memoryId: string; save: PlayerSave; data: GameData }) {
  const check = checkSyncConditions(save, data, memoryId);
  if (check.conditions.length === 0) return <p className="dim" style={{ fontSize: 13 }}>条件なし（接触するだけで同期できる）</p>;
  return (
    <ul className="links__list">
      {check.conditions.map((c, i) => (
        <li key={i}>
          <span className={`tag ${c.met ? '' : 'tag--planned'}`} style={c.met ? ({ ['--tag-c' as string]: 'var(--c-success)' } as CSSProperties) : undefined}>
            {c.met ? '達成' : '未達'}
          </span>{' '}
          {c.text}
        </li>
      ))}
    </ul>
  );
}
