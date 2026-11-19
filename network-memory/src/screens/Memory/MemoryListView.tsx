import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNav } from '../../app/nav';
import { MemoryCard } from '../../components/memory/MemoryCard';
import { ATTRIBUTE_META, CATEGORY_META, RARITY_META } from '../../core/constants';
import { DEFAULT_QUERY, SORT_KEYS, SORT_LABEL, activeFilterCount, applyQuery, buildEntries, type MemoryQuery, type SortKey } from '../../core/memory/query';
import { collectionSummary } from '../../core/player/discovery';
import { loadoutMembership, placementLabel } from '../../core/player/loadout';
import { checkSyncConditions } from '../../core/player/sync';
import { usePlayer } from '../../state/GameProvider';
import { ATTRIBUTES, MEMORY_CATEGORIES, RARITIES } from '../../types/memory';
import { useMemoryQuery } from './memoryQueryState';

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

const chipColor = (c: string) => ({ ['--chip-c' as string]: c }) as CSSProperties;

export function MemoryListView() {
  const nav = useNav();
  const { save, data } = usePlayer();
  const [query, setQuery] = useMemoryQuery();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const entries = useMemo(() => buildEntries(save, data), [save, data]);
  const visible = useMemo(() => applyQuery(entries, query), [entries, query]);
  const membership = useMemo(() => loadoutMembership(save), [save]);
  const pending = save.archive.pendingSyncIds.map((id) => data.memoryById.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const summary = useMemo(() => collectionSummary(save, data), [save, data]);
  const filterCount = activeFilterCount(query);

  const set = (patch: Partial<MemoryQuery>) => setQuery((q) => ({ ...q, ...patch }));

  return (
    <div className="mlist">
      <div className="mlist__toolbar">
        <label className="mlist__search">
          <span className="visually-hidden">Memoryを検索</span>
          <input
            className="input"
            type="search"
            value={query.text}
            onChange={(e) => set({ text: e.target.value })}
            placeholder="名前・分類・属性で検索"
            enterKeyHint="search"
          />
        </label>
        <button type="button" className={`btn btn--sm ${filtersOpen ? 'btn--primary' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
          FILTER{filterCount > 0 && <span className="mlist__badge">{filterCount}</span>}
        </button>
        <label className="mlist__sort">
          <span className="visually-hidden">並び替え</span>
          <select className="select" value={query.sortKey} onChange={(e) => set({ sortKey: e.target.value as SortKey })}>
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="icon-btn"
          onClick={() => set({ sortDir: query.sortDir === 'asc' ? 'desc' : 'asc' })}
          aria-label={query.sortDir === 'asc' ? '昇順（タップで降順）' : '降順（タップで昇順）'}
          title={query.sortDir === 'asc' ? '昇順' : '降順'}
        >
          {query.sortDir === 'asc' ? '▲' : '▼'}
        </button>
      </div>

      {filtersOpen && (
        <div className="panel mlist__filters reveal">
          <FilterGroup label="CATEGORY 分類">
            {MEMORY_CATEGORIES.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={query.categories.includes(c)} onClick={() => set({ categories: toggle(query.categories, c) })}>
                {c}
                <span className="mute">{CATEGORY_META[c].ja}</span>
              </button>
            ))}
          </FilterGroup>
          <FilterGroup label="RARITY レアリティ">
            {RARITIES.map((r) => (
              <button key={r} type="button" className="chip" style={chipColor(RARITY_META[r].color)} aria-pressed={query.rarities.includes(r)} onClick={() => set({ rarities: toggle(query.rarities, r) })}>
                {r}
              </button>
            ))}
          </FilterGroup>
          <FilterGroup label="ATTRIBUTE 属性">
            {ATTRIBUTES.map((a) => (
              <button key={a} type="button" className="chip" style={chipColor(ATTRIBUTE_META[a].color)} aria-pressed={query.attributes.includes(a)} onClick={() => set({ attributes: toggle(query.attributes, a) })}>
                {a}
                <span className="mute">{ATTRIBUTE_META[a].ja}</span>
              </button>
            ))}
          </FilterGroup>
          <div className="mlist__filter-foot">
            <button type="button" className="chip" style={chipColor('var(--c-warn)')} aria-pressed={query.favoritesOnly} onClick={() => set({ favoritesOnly: !query.favoritesOnly })}>
              ★ お気に入りのみ
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setQuery({ ...DEFAULT_QUERY, sortKey: query.sortKey, sortDir: query.sortDir })} disabled={filterCount === 0 && !query.text}>
              条件をリセット
            </button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <section className="panel mlist__pending" aria-label="同期待ちのMemory">
          <div className="panel__title" style={{ color: '#c7a8ff', marginBottom: 0 }}>
            <span>PENDING SYNC</span>
            <small>検出済み・未同期のMemory {pending.length}件</small>
          </div>
          <div className="mlist__pending-grid">
            {pending.map((def) => {
              const check = checkSyncConditions(save, data, def.id);
              return (
                <div key={def.id} className="mlist__pending-item">
                  <MemoryCard def={def} mask="silhouette" size="sm" onClick={() => nav({ name: 'sync', memoryId: def.id })} ariaLabel={`${def.name} に接触する`} />
                  <button type="button" className={`btn btn--sm ${check.ok ? 'btn--purple' : 'btn--ghost'}`} onClick={() => nav({ name: 'sync', memoryId: def.id })}>
                    {check.ok ? 'SYNC' : '条件未達'}
                  </button>
                  {!check.ok && (
                    <p className="mlist__pending-cond">
                      {check.conditions
                        .filter((c) => !c.met)
                        .map((c) => c.text)
                        .join(' / ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="mlist__count mono">
        <span>
          SHOWING <strong>{visible.length}</strong> / {entries.length}
        </span>
        <span className="mute">
          COLLECTED {summary.owned}/{summary.total} · DISCOVERED {summary.discovered}/{summary.total}
        </span>
      </p>

      {visible.length === 0 ? (
        <div className="panel empty">
          <p>条件に一致するMemoryはありません。</p>
          <button type="button" className="btn btn--sm" style={{ marginTop: 12 }} onClick={() => setQuery({ ...DEFAULT_QUERY })}>
            条件をリセット
          </button>
        </div>
      ) : (
        <div className="mlist__grid">
          {visible.map((e, i) => {
            const places = membership.get(e.instance.instanceId)?.filter((p) => p.loadoutId === save.activeLoadoutId);
            return (
              <div key={e.instance.instanceId} className="mlist__item" style={{ animationDelay: `${Math.min(i, 20) * 0.03}s` }}>
                <MemoryCard
                  def={e.def}
                  entry={e}
                  badge={places?.length ? places.map(placementLabel).join(' ').replace(/^L\d+ /, '') : undefined}
                  onClick={() => nav({ name: 'memoryDetail', instanceId: e.instance.instanceId })}
                  ariaLabel={`${e.def.name} Lv.${e.instance.level}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="mlist__group">
      <legend className="section-label">{label}</legend>
      <div className="chip-row">{children}</div>
    </fieldset>
  );
}
