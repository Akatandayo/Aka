import { useState, type CSSProperties } from 'react';
import { useNav } from '../../app/nav';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { CharacterPortrait } from '../../components/story/CharacterPortrait';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { describeCondition, evaluateCondition } from '../../core/conditions';
import { fillText } from '../../core/story/engine';
import { chapterStatus, type ChapterStatus } from '../../core/story/progress';
import { usePlayer } from '../../state/GameProvider';
import type { StoryChapter } from '../../types/story';
import './StoryScreen.css';

const STATUS_LABEL: Record<ChapterStatus, { text: string; color: string }> = {
  locked: { text: 'LOCKED', color: 'var(--c-text-mute)' },
  available: { text: 'NEW', color: 'var(--c-cyan)' },
  in_progress: { text: '読書中', color: 'var(--c-warn)' },
  cleared: { text: 'CLEAR', color: 'var(--c-success)' },
};

/** STORY: メインストーリー（一本道）の章一覧 */
export function StoryScreen() {
  const nav = useNav();
  const { save, data, dispatch } = usePlayer();
  const [restart, setRestart] = useState<StoryChapter | null>(null);
  const cleared = save.story.completedChapters.filter((id) => data.chapterById.has(id)).length;
  const current = save.story.current ? data.chapterById.get(save.story.current.chapterId) : undefined;

  const open = (ch: StoryChapter, fromStart: boolean) => {
    if (fromStart && save.story.current) dispatch({ type: 'STORY_RESET_CURRENT' });
    nav({ name: 'storyPlay', chapterId: ch.id });
  };

  return (
    <ScreenFrame code="01" title="STORY" subtitle="メインストーリー">
      <div className="story-list">
        <section className="panel story-list__head">
          <div>
            <p className="section-label">MAIN STORY</p>
            <h2>流出事件の記録</h2>
            <p className="dim">
              一本道のメインストーリー。章のクリアで新たな Memory の反応や報酬が得られます。読書中の位置は自動で保存されます。
            </p>
          </div>
          <div className="story-list__progress mono">
            <span>
              {cleared} / {data.chapters.length}
            </span>
            <small>CHAPTERS CLEARED</small>
          </div>
        </section>

        <ol className="story-list__chapters">
          {data.chapters.map((ch) => {
            const status = chapterStatus(save, data, ch);
            const ctx = { save, data };
            const meta = STATUS_LABEL[status];
            return (
              <li key={ch.id} className={`panel story-chapter is-${status}`} style={{ ['--st-c' as string]: meta.color } as CSSProperties}>
                <div className="story-chapter__head">
                  <span className="story-chapter__label mono">{ch.label}</span>
                  <span className="tag" style={{ ['--tag-c' as string]: meta.color } as CSSProperties}>
                    {meta.text}
                  </span>
                </div>
                <h3 className="story-chapter__title">{ch.title}</h3>
                {status !== 'locked' && <p className="story-chapter__summary dim">{fillText(ch.summary, save.profile.name)}</p>}
                {status === 'locked' && (
                  <>
                    <p className="section-label">UNLOCK 解放条件</p>
                    <ul className="story-conds">
                      {ch.unlock.map((c, i) => (
                        <li key={i} className={evaluateCondition(c, ctx) ? 'is-met' : ''}>
                          {describeCondition(c, ctx)}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="story-chapter__actions">
                  {status === 'available' && (
                    <button type="button" className="btn btn--primary" onClick={() => open(ch, false)}>
                      読む
                    </button>
                  )}
                  {status === 'in_progress' && (
                    <>
                      <button type="button" className="btn btn--primary" onClick={() => open(ch, false)}>
                        続きから
                      </button>
                      <button type="button" className="btn btn--sm" onClick={() => setRestart(ch)}>
                        最初から
                      </button>
                    </>
                  )}
                  {status === 'cleared' && (
                    <button type="button" className="btn btn--sm" onClick={() => (current && current.id !== ch.id ? setRestart(ch) : open(ch, true))}>
                      もう一度読む
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <section className="panel story-cast">
          <div className="panel__title">
            <span>CAST</span>
            <small>何でも屋「アカルア」</small>
          </div>
          <div className="story-cast__grid">
            {data.characters.map((c) => (
              <article key={c.id} className="story-cast__card" style={{ ['--spk-c' as string]: c.color } as CSSProperties}>
                <div className="story-cast__art">
                  <CharacterPortrait character={c} expr={c.expressions.includes('smile') ? 'smile' : 'normal'} speaking />
                </div>
                <div className="story-cast__body">
                  <h3>{c.name}</h3>
                  {c.reading && <p className="mute story-cast__reading">{c.reading}</p>}
                  <p className="story-cast__role">{c.role}</p>
                  <p className="dim story-cast__profile">{c.profile}</p>
                  <button type="button" className="btn btn--sm" onClick={() => nav({ name: 'archive', category: 'character' })}>
                    ARCHIVE で見る
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={!!restart}
        title="最初から読みますか？"
        confirmLabel="最初から読む"
        onCancel={() => setRestart(null)}
        onConfirm={() => {
          const ch = restart;
          setRestart(null);
          if (ch) open(ch, true);
        }}
      >
        <p>
          {current ? `読書中の「${current.label} ${current.title}」の中断位置は破棄されます。` : ''}
          {restart?.label}「{restart?.title}」を最初から読みます。
        </p>
      </ConfirmDialog>
    </ScreenFrame>
  );
}
