import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNav } from '../../app/nav';
import { audio } from '../../audio/audio';
import { CurrencyAmount } from '../../components/memory/Badges';
import { CharacterPortrait } from '../../components/story/CharacterPortrait';
import { SceneBackground } from '../../components/story/SceneBackground';
import { describeCondition, evaluateCondition, type ConditionContext } from '../../core/conditions';
import { advance, fillText, resumeChapter, startChapter, type StoryLine, type StoryRun, type StoryView } from '../../core/story/engine';
import { chapterChoices, chapterStatus, completeChapter, type ChapterResult } from '../../core/story/progress';
import { worldRestorationRate } from '../../core/world/restoration';
import { usePlayer } from '../../state/GameProvider';
import { CURRENCIES } from '../../types/player';
import type { StoryChapter, StoryFx } from '../../types/story';
import './StoryPlayer.css';

/** 設定のテキスト速度（1〜5）→ 1文字あたりのミリ秒 */
const MS_PER_CHAR = [80, 55, 35, 20, 8];

interface LogEntry {
  speaker: string | null;
  color?: string;
  text: string;
}

/** ストーリー再生画面（#/story/:chapterId） */
export function StoryPlayer({ chapterId }: { chapterId: string }) {
  const nav = useNav();
  const { save, data } = usePlayer();
  const chapter = data.chapterById.get(chapterId);
  if (!chapter) {
    return (
      <div className="story-gate">
        <div className="panel">
          <p className="mono story-gate__code">!! CHAPTER NOT FOUND</p>
          <p>指定された章（{chapterId}）は存在しません。</p>
          <button type="button" className="btn btn--primary" onClick={() => nav({ name: 'story' })}>
            STORY に戻る
          </button>
        </div>
      </div>
    );
  }
  if (chapterStatus(save, data, chapter) === 'locked') {
    const ctx = { save, data };
    return (
      <div className="story-gate">
        <div className="panel">
          <p className="mono story-gate__code">LOCKED</p>
          <h2>
            {chapter.label}「{chapter.title}」はまだ読めません
          </h2>
          <ul className="story-conds">
            {chapter.unlock.map((c, i) => (
              <li key={i} className={evaluateCondition(c, ctx) ? 'is-met' : ''}>
                {describeCondition(c, ctx)}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--primary" onClick={() => nav({ name: 'story' })}>
            STORY に戻る
          </button>
        </div>
      </div>
    );
  }
  return <ContentNoteGate chapter={chapter} />;
}

/** 重い話題を扱う章は、最初から読むときに注意書きを表示する（中断からの再開では表示しない） */
function ContentNoteGate({ chapter }: { chapter: StoryChapter }) {
  const nav = useNav();
  const { save } = usePlayer();
  const [accepted, setAccepted] = useState(() => !chapter.contentNote || save.story.current?.chapterId === chapter.id);
  if (accepted) return <StoryStage key={chapter.id} chapter={chapter} />;
  return (
    <div className="story-gate">
      <div className="panel story-note" role="dialog" aria-label="内容についての注意">
        <p className="mono story-gate__code">CONTENT NOTE</p>
        <h2>
          {chapter.label}「{chapter.title}」
        </h2>
        <p>{chapter.contentNote}</p>
        <p className="dim">読むのがつらくなったら、いつでも「中断」で閉じられます。続きはあとから読めます。</p>
        <div className="story__clear-actions">
          <button type="button" className="btn btn--primary" onClick={() => setAccepted(true)}>
            読む
          </button>
          <button type="button" className="btn" onClick={() => nav({ name: 'story' })}>
            STORY に戻る
          </button>
        </div>
      </div>
    </div>
  );
}

function StoryStage({ chapter }: { chapter: StoryChapter }) {
  const nav = useNav();
  const { save, data, dispatch } = usePlayer();
  const saveRef = useRef(save);
  saveRef.current = save;
  const ctx = useCallback((): ConditionContext => ({ save: saveRef.current, data }), [data]);
  const playerName = save.profile.name;
  const msPerChar = MS_PER_CHAR[Math.min(4, Math.max(0, save.settings.textSpeed - 1))];
  const reduced = save.settings.fx === 'reduced';

  const [run, setRun] = useState<StoryRun>(() => {
    const c = { save, data };
    const cur = save.story.current;
    if (cur?.chapterId === chapter.id && cur.index > 0) return resumeChapter(chapter, c, cur.index, chapterChoices(save, chapter.id));
    return startChapter(chapter, c);
  });
  const runRef = useRef(run);
  runRef.current = run;

  /** 実際に表示している状態（フェード中は古い画面を保持する） */
  const [shown, setShown] = useState<StoryView>(run.view);
  const [curtain, setCurtain] = useState<{ black: boolean; ms: number }>({ black: false, ms: 0 });
  const [busy, setBusy] = useState(false);
  const [fx, setFx] = useState<{ key: number; type: StoryFx; ms: number }[]>([]);
  const fxKey = useRef(0);
  // 演出の終了タイマーは次の命令に進んでも取り消さない（取り消すと揺れ等が止まらなくなる）。アンマウント時にだけ片付ける
  const fxTimers = useRef<number[]>([]);
  useEffect(() => () => fxTimers.current.forEach((t) => window.clearTimeout(t)), []);
  const [typed, setTyped] = useState(0);
  const [autoMode, setAutoMode] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const lastLogged = useRef<StoryLine | null>(null);
  const [result, setResult] = useState<ChapterResult | null>(null);
  const completed = useRef(false);

  const entryOf = useCallback(
    (line: StoryLine): LogEntry | null => {
      if (line.kind === 'title') return null;
      if (line.kind === 'narr') return { speaker: null, text: fillText(line.text, playerName) };
      const ch = data.characterById.get(line.char);
      return { speaker: ch?.name ?? line.char, color: ch?.color, text: fillText(line.text, playerName) };
    },
    [data, playerName],
  );

  // ---- 命令の結果を再生する（SE・画面演出・フェード）
  useEffect(() => {
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    for (const se of run.effects.se) audio.playSe(se);
    const fadeOut = run.effects.fx.find((f) => f.type === 'fade-out');
    const fadeIn = run.effects.fx.find((f) => f.type === 'fade-in');
    const others = reduced ? [] : run.effects.fx.filter((f) => f.type !== 'fade-out' && f.type !== 'fade-in');
    const playOthers = () => {
      if (!others.length) return;
      const added = others.map((f) => ({ key: ++fxKey.current, type: f.type, ms: f.ms }));
      setFx((cur) => [...cur, ...added]);
      for (const a of added) fxTimers.current.push(window.setTimeout(() => setFx((cur) => cur.filter((x) => x.key !== a.key)), a.ms));
    };
    const fade = (ms: number) => (reduced ? Math.min(ms, 250) : ms);
    if (fadeOut) {
      setBusy(true);
      setCurtain({ black: true, ms: fade(fadeOut.ms) });
      later(() => {
        setShown(run.view);
        if (fadeIn) {
          setCurtain({ black: false, ms: fade(fadeIn.ms) });
          later(() => {
            setBusy(false);
            playOthers();
          }, fade(fadeIn.ms));
        } else {
          setBusy(false);
          playOthers();
        }
      }, fade(fadeOut.ms) + 120);
    } else if (fadeIn) {
      setShown(run.view);
      setBusy(true);
      setCurtain({ black: false, ms: fade(fadeIn.ms) });
      later(() => {
        setBusy(false);
        playOthers();
      }, fade(fadeIn.ms));
    } else {
      setShown(run.view);
      setBusy(false);
      playOthers();
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [run, reduced]);

  // ---- セーブ・LOG・章の完了
  useEffect(() => {
    const line = run.view.line;
    if (line && line !== lastLogged.current) {
      lastLogged.current = line;
      const e = entryOf(line);
      if (e) setLog((cur) => [...cur.slice(-199), e]);
    }
    if (!run.ended) {
      dispatch({ type: 'STORY_PROGRESS', chapterId: run.chapterId, index: run.pc, flags: run.flags, choices: run.choices });
      return;
    }
    if (completed.current) return;
    completed.current = true;
    const at = new Date().toISOString();
    setResult(completeChapter(saveRef.current, data, run.chapterId, run.flags, run.detected, at));
    dispatch({ type: 'STORY_COMPLETE', chapterId: run.chapterId, flags: run.flags, detected: run.detected, at });
  }, [run, data, dispatch, entryOf]);

  // ---- BGM
  useEffect(() => {
    audio.playBgm(shown.bgm);
  }, [shown.bgm]);
  useEffect(() => () => audio.stopBgm(), []);

  // ---- 文字送り
  const lineText = shown.line && shown.line.kind !== 'title' ? fillText(shown.line.text, playerName) : '';
  const chars = useMemo(() => Array.from(lineText), [lineText]);
  const lineObj = shown.line;
  const typedRef = useRef(0);
  typedRef.current = typed;
  useEffect(() => {
    if (busy || !lineObj) return;
    setTyped(0);
    if (lineObj.kind === 'title') return;
    const total = chars.length;
    // 前の値に 1 文字ずつ足す（クリックで全文表示にした後に巻き戻らないように）
    const t = window.setInterval(() => {
      if (typedRef.current >= total) {
        window.clearInterval(t);
        return;
      }
      setTyped((n) => Math.min(total, n + 1));
    }, msPerChar);
    return () => window.clearInterval(t);
  }, [lineObj, busy, chars, msPerChar]);
  const typing = !!shown.line && shown.line.kind !== 'title' && typed < chars.length;

  const go = useCallback(
    (choice?: string) => {
      const r = runRef.current;
      if (r.ended) return;
      const next = advance(chapter, r, ctx(), choice);
      if (next !== r) setRun(next);
    },
    [chapter, ctx],
  );

  const canInput = !busy && !result && !logOpen && !shown.choice && shown.wait === null && !run.ended;

  const proceed = useCallback(() => {
    if (!canInput) return;
    if (typing) {
      setTyped(chars.length);
      return;
    }
    audio.playSe('click');
    go();
  }, [canInput, typing, chars.length, go]);

  // 待機命令
  useEffect(() => {
    if (busy || shown.wait === null) return;
    const t = window.setTimeout(() => go(), shown.wait);
    return () => window.clearTimeout(t);
  }, [busy, shown.wait, go]);

  // AUTO
  useEffect(() => {
    if (!autoMode || !canInput || typing || !shown.line) return;
    const ms = shown.line.kind === 'title' ? 2400 : 900 + chars.length * 28;
    const t = window.setTimeout(() => go(), ms);
    return () => window.clearTimeout(t);
  }, [autoMode, canInput, typing, shown.line, chars.length, go]);

  // SKIP: 次の選択肢（または章の終わり）まで進める
  const skip = () => {
    if (busy || result || run.ended) return;
    let r = runRef.current;
    let black = curtain.black;
    const lines: LogEntry[] = [];
    for (let guard = 0; guard < 2000 && !r.ended && !r.view.choice; guard++) {
      if (r.view.line && r.view.line !== lastLogged.current) {
        const e = entryOf(r.view.line);
        if (e) lines.push(e);
        lastLogged.current = r.view.line;
      }
      r = advance(chapter, r, ctx());
      for (const f of r.effects.fx) {
        if (f.type === 'fade-out') black = true;
        if (f.type === 'fade-in') black = false;
      }
    }
    if (lines.length) setLog((cur) => [...cur, ...lines].slice(-200));
    setCurtain({ black, ms: 200 });
    setAutoMode(false);
    setRun({ ...r, effects: { se: [], fx: [] } });
  };

  // キーボード操作
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if ((e.target as HTMLElement | null)?.closest('button')) return;
        e.preventDefault();
        proceed();
      } else if (e.key === 'Escape' && logOpen) setLogOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [proceed, logOpen]);

  const cityLit = 0.06 + worldRestorationRate(save, data, 'WORLD-001') * 0.6;
  const line = shown.line;
  const speaker = line?.kind === 'say' ? data.characterById.get(line.char) : undefined;
  const shaking = fx.some((f) => f.type === 'shake');

  return (
    <div
      className={`story ${shaking ? 'is-shaking' : ''} ${reduced ? 'is-reduced' : ''}`}
      onClick={proceed}
      role="application"
      aria-label={`${chapter.label} ${chapter.title}`}
    >
      <div className={`story__scene ${shown.bgFx === 'fade' ? 'is-fade' : ''}`} key={shown.bg ?? 'none'}>
        <SceneBackground id={shown.bg} lit={cityLit} />
      </div>

      <div className="story__stage" aria-hidden>
        {shown.stage.map((s) => {
          const ch = data.characterById.get(s.char);
          if (!ch) return null;
          return (
            <div key={s.char} className={`story__actor story__actor--${s.pos} ${line?.kind === 'say' && line.char === s.char ? 'is-front' : ''}`}>
              <CharacterPortrait character={ch} expr={s.expr} speaking={line?.kind !== 'say' || line.char === s.char} />
            </div>
          );
        })}
      </div>

      {fx.map((f) =>
        f.type === 'shake' ? null : <div key={f.key} className={`story-fx story-fx--${f.type}`} style={{ animationDuration: `${f.ms}ms` } as CSSProperties} aria-hidden />,
      )}

      <div className={`story__curtain ${curtain.black ? 'is-black' : ''}`} style={{ transitionDuration: `${curtain.ms}ms` }} aria-hidden />

      <div className="story__toolbar" onClick={(e) => e.stopPropagation()}>
        <span className="story__chapter mono">
          {chapter.label} · {chapter.title}
        </span>
        <button type="button" className={`story__tool ${autoMode ? 'is-on' : ''}`} aria-pressed={autoMode} onClick={() => setAutoMode((v) => !v)}>
          AUTO
        </button>
        <button type="button" className="story__tool" onClick={skip} disabled={busy || !!result || run.ended || !!shown.choice} title="次の選択肢まで進める">
          SKIP
        </button>
        <button type="button" className="story__tool" onClick={() => setLogOpen(true)}>
          LOG
        </button>
        <button type="button" className="story__tool" onClick={() => nav({ name: 'story' })} title="現在の位置は自動保存されます">
          中断
        </button>
      </div>

      {line?.kind === 'title' && !busy && (
        <div className="story__title" key={`${line.text}-${run.pc}`}>
          <p className="story__title-main">{line.text}</p>
          {line.sub && <p className="story__title-sub">{fillText(line.sub, playerName)}</p>}
          <span className="story__next mono">▼</span>
        </div>
      )}

      {line && line.kind !== 'title' && !busy && (
        <div className={`story__box ${line.kind === 'narr' ? 'is-narr' : ''}`} style={{ ['--spk-c' as string]: speaker?.color ?? 'var(--c-cyan)' } as CSSProperties}>
          {speaker && <span className="story__name">{speaker.name}</span>}
          <p className="story__text" aria-live="polite">
            {chars.slice(0, typed).join('')}
            <span className="story__ghost" aria-hidden>
              {chars.slice(typed).join('')}
            </span>
          </p>
          {!typing && !shown.choice && <span className="story__next mono">▼</span>}
        </div>
      )}

      {shown.choice && !busy && (
        <div className="story__choices" onClick={(e) => e.stopPropagation()}>
          {shown.choice.options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="story__choice"
              onClick={() => {
                audio.playSe('click');
                go(o.value);
              }}
            >
              {fillText(o.text, playerName)}
            </button>
          ))}
        </div>
      )}

      {logOpen && (
        <div className="story__log" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="LOG">
          <div className="story__log-head">
            <span className="mono">LOG</span>
            <button type="button" className="btn btn--sm" onClick={() => setLogOpen(false)}>
              閉じる
            </button>
          </div>
          <ol>
            {log.map((l, i) => (
              <li key={i} style={{ ['--spk-c' as string]: l.color ?? 'var(--c-text-mute)' } as CSSProperties}>
                {l.speaker && <span className="story__log-name">{l.speaker}</span>}
                <span>{l.text}</span>
              </li>
            ))}
            {!log.length && <li className="mute">まだ記録がありません。</li>}
          </ol>
        </div>
      )}

      {result && <ChapterClear chapter={chapter} result={result} />}
    </div>
  );
}

function ChapterClear({ chapter, result }: { chapter: StoryChapter; result: ChapterResult }) {
  const nav = useNav();
  const { data } = usePlayer();
  const ctx = { save: result.save, data };
  const following = data.chapters.find((c) => c.order > chapter.order && !result.save.story.completedChapters.includes(c.id));
  const followingStatus = following ? chapterStatus(result.save, data, following) : null;
  const detected = result.detected.map((id) => data.memoryById.get(id)).filter((m) => !!m);
  const rewards = result.firstClear ? chapter.rewards : undefined;
  return (
    <div className="story__clear" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="CHAPTER CLEAR">
      <div className="panel story__clear-card">
        <p className="story__clear-code mono">{result.firstClear ? 'CHAPTER CLEAR' : 'CHAPTER REPLAYED'}</p>
        <h2>
          {chapter.label}「{chapter.title}」
        </h2>
        {rewards && (
          <div className="story__clear-block">
            <p className="section-label">REWARD 初回クリア報酬</p>
            <div className="story__clear-rewards">
              {CURRENCIES.filter((c) => rewards.currencies?.[c]).map((c) => (
                <CurrencyAmount key={c} currency={c} amount={rewards.currencies![c]!} />
              ))}
              {Object.entries(rewards.items ?? {}).map(([id, n]) => (
                <span key={id} className="tag">
                  {data.itemById.get(id)?.name ?? id} ×{n}
                </span>
              ))}
            </div>
          </div>
        )}
        {!result.firstClear && <p className="dim">クリア済みの章のため、報酬はありません。</p>}
        {detected.length > 0 && (
          <div className="story__clear-block">
            <p className="section-label">MEMORY DETECTED 新たな Memory の反応</p>
            {detected.map((m) => (
              <div key={m.id} className="story__detected">
                <div>
                  <strong>{m.name}</strong>
                  <span className="mute mono"> {m.id}</span>
                  <p className="dim">{m.title}</p>
                </div>
                <button type="button" className="btn btn--sm btn--purple" onClick={() => nav({ name: 'sync', memoryId: m.id })}>
                  MEMORY SYNC へ
                </button>
              </div>
            ))}
          </div>
        )}
        {following && (
          <div className="story__clear-block">
            <p className="section-label">NEXT STORY</p>
            <p>
              {following.label}「{following.title}」
            </p>
            {followingStatus === 'locked' && (
              <ul className="story-conds">
                {following.unlock.map((c, i) => (
                  <li key={i} className={evaluateCondition(c, ctx) ? 'is-met' : ''}>
                    {describeCondition(c, ctx)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="story__clear-actions">
          {following && followingStatus !== 'locked' && (
            <button type="button" className="btn btn--primary" onClick={() => nav({ name: 'storyPlay', chapterId: following.id })}>
              次の章へ
            </button>
          )}
          {followingStatus === 'locked' && following?.unlock.some((c) => c.type === 'encounterCleared' && !evaluateCondition(c, ctx)) && (
            <button type="button" className="btn btn--primary" onClick={() => nav({ name: 'battle' })}>
              BATTLE へ
            </button>
          )}
          <button type="button" className="btn" onClick={() => nav({ name: 'story' })}>
            STORY
          </button>
          <button type="button" className="btn" onClick={() => nav({ name: 'lobby' })}>
            LOBBY
          </button>
        </div>
      </div>
    </div>
  );
}
