import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MemoryCard } from '../../components/memory/MemoryCard';
import { buildEntries } from '../../core/memory/query';
import { PLAYER_NAME_MAX } from '../../core/save/schema';
import { useGame } from '../../state/GameProvider';
import './TitleScreen.css';

type Phase = 'boot' | 'title' | 'register' | 'receive';

const APP_VERSION = '0.1.0';

/**
 * 起動シーケンス → タイトル → 探索者登録 → 初期Memory受領。
 * セーブデータがある場合は CONTINUE で LOBBY へ。
 */
export function TitleScreen({ onEnter }: { onEnter: () => void }) {
  const { save, data, dispatch } = useGame();
  const skipBoot = save?.settings.skipBoot ?? false;
  const [phase, setPhase] = useState<Phase>(skipBoot ? 'title' : 'boot');
  const [name, setName] = useState('');

  const bootLines = useMemo(
    () => [
      `NETWORK KERNEL v${APP_VERSION}`,
      'MOUNTING MEMORY INDEX ......... OK',
      `RECORDS REGISTERED ............ ${String(data.memories.length).padStart(4, '0')}`,
      `WORLD NODES ................... ${String(data.worlds.length).padStart(4, '0')}`,
      '!! ANOMALY DETECTED: MEMORY OUTFLOW',
      '!! OUTFLOW RATE ...... UNMEASURABLE',
      'EXPLORER INTERFACE ............ READY',
    ],
    [data],
  );
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (phase !== 'boot') return;
    if (shown >= bootLines.length) {
      const t = window.setTimeout(() => setPhase('title'), 650);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 300 : 240);
    return () => window.clearTimeout(t);
  }, [phase, shown, bootLines.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'NEW_GAME', name, at: new Date().toISOString() });
    setPhase('receive');
  };

  if (phase === 'boot') {
    return (
      <button type="button" className="boot" onClick={() => setPhase('title')} aria-label="起動シーケンスをスキップ">
        <div className="boot__log mono">
          {bootLines.slice(0, shown).map((l, i) => (
            <p key={i} className={l.startsWith('!!') ? 'is-alert' : ''}>
              <span className="boot__prompt">{'>'}</span> {l}
            </p>
          ))}
          <span className="boot__cursor" />
        </div>
        <span className="boot__skip mono">TAP TO SKIP</span>
      </button>
    );
  }

  return (
    <div className={`title title--${phase}`}>
      <div className="title__inner">
        <header className="title__logo reveal">
          <p className="title__kicker mono">STORY-DRIVEN MEMORY COLLECTION RPG</p>
          <h1 className="glitch" data-text="NETWORK">
            NETWORK
          </h1>
          <p className="title__sub">
            <span className="title__dash" />
            Memory: <em>Re:Collection</em>
            <span className="title__dash" />
          </p>
        </header>

        {phase === 'title' && (
          <div className="title__menu reveal" style={{ animationDelay: '0.2s' }}>
            {save ? (
              <>
                <button type="button" className="btn btn--primary title__cta" onClick={onEnter}>
                  CONTINUE
                </button>
                <p className="title__note">
                  探索者 <strong>{save.profile.name}</strong> <span className="mono mute">{save.profile.playerId}</span>
                </p>
              </>
            ) : (
              <>
                <button type="button" className="btn btn--primary title__cta" onClick={() => setPhase('register')}>
                  NEW CONNECTION
                </button>
                <p className="title__note">はじめて接続する探索者は、ここから登録を行います。</p>
              </>
            )}
          </div>
        )}

        {phase === 'register' && (
          <form className="panel title__register reveal" onSubmit={submit}>
            <p className="mono title__sys">{'> EXPLORER REGISTRATION'}</p>
            <div className="title__story">
              <p>Networkは、あらゆる存在が「記録」として刻まれる世界。</p>
              <p>人も、生き物も、概念も、出来事も——すべてはMemoryとして保存されている。</p>
              <p className="is-alert">しかし今、そのMemoryがNetwork各地へ流出し続けている。</p>
              <p>流出したMemoryを回収し、記録に隠された真実を解き明かす。それが、探索者の役目だ。</p>
            </div>
            <label className="field">
              <span className="field__label">探索者名（{PLAYER_NAME_MAX}文字まで）</span>
              <input
                className="input"
                value={name}
                maxLength={PLAYER_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                placeholder="EXPLORER"
                autoFocus
                autoComplete="off"
              />
            </label>
            <div className="title__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setPhase('title')}>
                戻る
              </button>
              <button type="submit" className="btn btn--primary">
                登録して接続する
              </button>
            </div>
          </form>
        )}

        {phase === 'receive' && save && <ReceiveStarter onDone={onEnter} />}
      </div>
      <footer className="title__footer mono">
        v{APP_VERSION} · PHASE 1 BUILD · LOCAL SAVE
      </footer>
    </div>
  );
}

function ReceiveStarter({ onDone }: { onDone: () => void }) {
  const { save, data } = useGame();
  const entries = useMemo(() => (save ? buildEntries(save, data) : []), [save, data]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 400 + entries.length * 110);
    return () => window.clearTimeout(t);
  }, [entries.length]);

  return (
    <section className="receive">
      <p className="mono title__sys reveal">{'> CONNECTION ESTABLISHED. WELCOME, EXPLORER.'}</p>
      <h2 className="receive__title reveal">
        {entries.length}件のMemoryを受領しました
      </h2>
      <p className="receive__text reveal dim">流出を免れた記録の一部が、あなたの探索者端末に転送されました。</p>
      <div className="receive__grid">
        {entries.map((e, i) => (
          <div key={e.instance.instanceId} className="receive__card" style={{ animationDelay: `${0.25 + i * 0.11}s` }}>
            <MemoryCard def={e.def} entry={e} size="sm" />
          </div>
        ))}
      </div>
      <button type="button" className="btn btn--primary title__cta" onClick={onDone} disabled={!ready}>
        LOBBY へ
      </button>
    </section>
  );
}
