import { useEffect, useMemo, type CSSProperties } from 'react';
import { useNav } from '../../app/nav';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { CharacterPortrait } from '../../components/story/CharacterPortrait';
import { ARCHIVE_CATEGORY_META, archiveProgress, buildArchive, type ArchiveItem } from '../../core/archive/archive';
import { usePlayer } from '../../state/GameProvider';
import { ARCHIVE_CATEGORIES, type ArchiveCategory } from '../../types/archive';
import './ArchiveScreen.css';

/** MEMORY ARCHIVE（GDD Ver.3 §6）: 発見した記録の閲覧。未発見の記録は内容を伏せる */
export function ArchiveScreen({ category = 'memory' }: { category?: ArchiveCategory }) {
  const nav = useNav();
  const { save, data } = usePlayer();
  const items = useMemo(() => buildArchive(save, data), [save, data]);
  const progress = archiveProgress(items);
  const list = items.filter((i) => i.category === category);

  return (
    <ScreenFrame code="04" title="ARCHIVE" subtitle="記録の図鑑">
      <div className="archive">
        <section className="panel archive__head">
          <div>
            <p className="section-label">MEMORY ARCHIVE</p>
            <h2>発見した記録</h2>
            <p className="dim">関連する Memory の発見・同期や、ストーリーの進行で記録が解放されます。未発見の記録は内容が伏せられています。</p>
          </div>
          <div className="archive__rate mono">
            <span>
              {progress.unlocked} / {progress.total}
            </span>
            <small>RECORDS UNLOCKED</small>
          </div>
        </section>

        <div className="archive__tabs" role="tablist" aria-label="記録の分類">
          {ARCHIVE_CATEGORIES.map((c) => {
            const inCat = items.filter((i) => i.category === c);
            const hasNew = inCat.some((i) => i.isNew);
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={c === category}
                className={`archive__tab ${c === category ? 'is-active' : ''}`}
                onClick={() => nav({ name: 'archive', category: c }, { replace: true })}
              >
                <span className="archive__tab-label mono">{ARCHIVE_CATEGORY_META[c].label}</span>
                <span className="archive__tab-ja">
                  {ARCHIVE_CATEGORY_META[c].ja} {inCat.filter((i) => i.unlocked).length}/{inCat.length}
                </span>
                {hasNew && <span className="archive__dot" aria-label="新しい記録" />}
              </button>
            );
          })}
        </div>

        <ul className="archive__list" role="tabpanel">
          {list.map((item) => (
            <li key={item.id}>
              {item.unlocked ? (
                <button type="button" className="archive-row" onClick={() => nav({ name: 'archiveEntry', entryId: item.id })}>
                  <span className="archive-row__title">
                    {item.title}
                    {item.isNew && <span className="archive__dot" aria-label="新しい記録" />}
                  </span>
                  {item.subtitle && <span className="archive-row__sub dim">{item.subtitle}</span>}
                  <span className="archive-row__meta mono">
                    {item.sections.filter((s) => s.unlocked).length}/{item.sections.length} SECTIONS
                  </span>
                </button>
              ) : (
                <div className="archive-row is-locked" aria-label="未発見の記録">
                  <span className="archive-row__title">？？？</span>
                  <span className="archive-row__sub mute">{item.hint ?? '記録は伏せられている'}</span>
                  <span className="archive-row__meta mono">LOCKED</span>
                </div>
              )}
            </li>
          ))}
          {!list.length && <li className="dim">この分類の記録はまだありません。</li>}
        </ul>
      </div>
    </ScreenFrame>
  );
}

export function ArchiveEntryScreen({ entryId }: { entryId: string }) {
  const nav = useNav();
  const { save, data, dispatch } = usePlayer();
  const items = useMemo(() => buildArchive(save, data), [save, data]);
  const item: ArchiveItem | undefined = items.find((i) => i.id === entryId);
  const unlocked = item?.unlocked ?? false;

  useEffect(() => {
    if (unlocked) dispatch({ type: 'ARCHIVE_READ', entryIds: [entryId] });
  }, [unlocked, entryId, dispatch]);

  const back = { route: { name: 'archive' as const, category: item?.category ?? 'memory' }, label: 'ARCHIVE' };
  if (!item || !item.unlocked) {
    return (
      <ScreenFrame code="04" title="ARCHIVE" subtitle="記録の図鑑" back={back}>
        <section className="panel">
          <p className="mono archive__locked-code">LOCKED</p>
          <p>{item ? 'この記録はまだ発見されていません。' : '指定された記録は存在しません。'}</p>
          {item?.hint && <p className="dim">ヒント: {item.hint}</p>}
        </section>
      </ScreenFrame>
    );
  }

  const meta = ARCHIVE_CATEGORY_META[item.category];
  const character = item.characterId ? data.characterById.get(item.characterId) : undefined;
  const owned = item.memoryId ? save.memories.find((m) => m.memoryId === item.memoryId) : undefined;
  const relatedMemory = item.memoryId ? data.memoryById.get(item.memoryId) : undefined;
  const world = item.worldId ? data.worldById.get(item.worldId) : undefined;

  return (
    <ScreenFrame code="04" title="ARCHIVE" subtitle={meta.label} back={back}>
      <article className="archive-entry" style={character ? ({ ['--spk-c' as string]: character.color } as CSSProperties) : undefined}>
        <header className={`panel archive-entry__head ${character ? 'has-art' : ''}`}>
          {character && (
            <div className="archive-entry__art">
              <CharacterPortrait character={character} expr="normal" speaking />
            </div>
          )}
          <div>
            <p className="section-label">
              {meta.label} · {meta.ja}
            </p>
            <h2>{item.title}</h2>
            {item.subtitle && <p className="dim">{item.subtitle}</p>}
            {character && (
              <dl className="archive-entry__profile">
                {character.reading && (
                  <>
                    <dt>読み</dt>
                    <dd>{character.reading}</dd>
                  </>
                )}
                {character.formerName && (
                  <>
                    <dt>旧名</dt>
                    <dd>{character.formerName}</dd>
                  </>
                )}
                <dt>所属</dt>
                <dd>{character.role}</dd>
                {character.age !== undefined && (
                  <>
                    <dt>年齢</dt>
                    <dd>{character.age}</dd>
                  </>
                )}
                {character.origin && (
                  <>
                    <dt>出身</dt>
                    <dd>{character.origin}</dd>
                  </>
                )}
              </dl>
            )}
          </div>
        </header>

        {item.sections.map((s) => (
          <section key={s.id} className={`panel archive-section ${s.unlocked ? '' : 'is-locked'}`}>
            <h3>{s.unlocked ? s.title : '？？？'}</h3>
            {s.unlocked ? (
              <>
                {s.contentNote && <p className="archive-section__note">{s.contentNote}</p>}
                <p className="archive-section__text">{s.text}</p>
              </>
            ) : (
              <>
                <p className="archive-section__redacted" aria-label="伏せられた記録">
                  ████ ██████ ███ ████████ ██ █████
                </p>
                {s.hint && <p className="mute archive-section__hint">解放条件: {s.hint}</p>}
              </>
            )}
          </section>
        ))}

        <div className="archive-entry__links">
          {owned && (
            <button type="button" className="btn btn--sm" onClick={() => nav({ name: 'memoryDetail', instanceId: owned.instanceId })}>
              Memory「{relatedMemory?.name}」を見る
            </button>
          )}
          {world && (
            <button type="button" className="btn btn--sm" onClick={() => nav({ name: 'worldDetail', worldId: world.id })}>
              WORLD「{world.name}」を見る
            </button>
          )}
        </div>
      </article>
    </ScreenFrame>
  );
}
