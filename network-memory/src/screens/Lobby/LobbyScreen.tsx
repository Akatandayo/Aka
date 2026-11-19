import { useMemo, type CSSProperties } from 'react';
import { MENU, type MenuEntry } from '../../app/screens';
import { useNav } from '../../app/nav';
import { ExplorerAvatar } from '../../components/battle/ExplorerAvatar';
import { AttributeTag, CurrencyAmount } from '../../components/memory/Badges';
import { MemoryCard } from '../../components/memory/MemoryCard';
import { useTypewriter } from '../../components/ui/useTypewriter';
import { ATTRIBUTE_META, SLOT_RULES } from '../../core/constants';
import { encounterStatus } from '../../core/battle/setup';
import { buildEntries } from '../../core/memory/query';
import { expToNext } from '../../core/memory/stats';
import { analyzeLoadout, playerPower } from '../../core/player/character';
import { collectionSummary } from '../../core/player/discovery';
import { getActiveLoadout } from '../../core/player/loadout';
import { usePlayer } from '../../state/GameProvider';
import { CURRENCIES, LOADOUT_SLOT_TYPES } from '../../types/player';
import './LobbyScreen.css';

/** LOBBY: すべての機能への入口となるハブ画面 */
export function LobbyScreen() {
  const nav = useNav();
  const { save, data, saveStatus } = usePlayer();
  const loadout = getActiveLoadout(save);
  const analysis = useMemo(() => analyzeLoadout(save, data, loadout), [save, data, loadout]);
  const summary = useMemo(() => collectionSummary(save, data), [save, data]);
  const entryById = useMemo(() => new Map(buildEntries(save, data).map((e) => [e.instance.instanceId, e])), [save, data]);
  const nextSignal = data.encounters.find((e) => encounterStatus(save, e) === 'available');
  const pendingSync = save.archive.pendingSyncIds.length;
  const rate = summary.total ? Math.round((summary.owned / summary.total) * 100) : 0;

  const logs = [
    { tone: 'alert', text: 'Memoryの流出を継続して観測中。流出規模は測定不能。' },
    { tone: 'info', text: `同期済みの記録 ${summary.owned} / ${summary.total}（${rate}%）` },
    ...(pendingSync > 0 ? [{ tone: 'discover', text: `検出済み・未同期のMemoryが ${pendingSync} 件あります（MEMORY › PENDING SYNC）。` }] : []),
    ...(nextSignal ? [{ tone: 'info', text: `新たな流出反応: ${data.worldById.get(nextSignal.worldId)?.name} 「${nextSignal.name}」` }] : []),
    {
      tone: saveStatus.error ? 'alert' : 'info',
      text: saveStatus.error
        ? `保存: ${saveStatus.error}`
        : `ローカルに自動保存中${saveStatus.lastSavedAt ? `（最終 ${new Date(saveStatus.lastSavedAt).toLocaleTimeString('ja-JP')}）` : ''}`,
    },
    { tone: 'mute', text: 'OFFLINE MODE — オンライン機能（アカウント・対人戦・ランキング）は PHASE 5 で実装予定です。' },
  ];

  return (
    <div className="lobby">
      <header className="lobby__header">
        <div className="lobby__brand">
          <span className="lobby__brand-main glitch" data-text="NETWORK">
            NETWORK
          </span>
          <span className="lobby__brand-sub">Memory: ReCollection</span>
        </div>
        <button type="button" className="lobby__explorer" onClick={() => nav({ name: 'profile' })} aria-label="プロフィールを開く">
          <span className="lobby__explorer-lv mono">Lv.{save.profile.level}</span>
          <span className="lobby__explorer-body">
            <span className="lobby__explorer-name">{save.profile.name}</span>
            <span className="lobby__explorer-id mono">
              {save.profile.title} · {save.profile.playerId}
            </span>
          </span>
        </button>
        <div className="lobby__wallet">
          {CURRENCIES.map((c) => (
            <CurrencyAmount key={c} currency={c} amount={save.wallet[c]} />
          ))}
        </div>
      </header>

      <main className="lobby__main">
        <section className="lobby__stage">
          <ExplorerPanel analysis={analysis} />

          <div className="panel lobby__team">
            <div className="panel__title">
              <span>LOADOUT</span>
              <small>{loadout.name}</small>
            </div>
            <div className="lobby__loadout">
              {LOADOUT_SLOT_TYPES.map((type) =>
                loadout.slots[type].map((id, i) => {
                  const e = id ? entryById.get(id) : undefined;
                  return (
                    <div key={`${type}-${i}`} className={`lobby__lo-slot lobby__lo-slot--${type}`}>
                      <span className="mono">{SLOT_RULES[type].label}</span>
                      {e ? (
                        <MemoryCard def={e.def} entry={e} size="sm" onClick={() => nav({ name: 'memoryDetail', instanceId: e.instance.instanceId })} />
                      ) : (
                        <button type="button" className="lobby__slot-empty" onClick={() => nav({ name: 'memory', tab: 'loadout' })} aria-label={`${SLOT_RULES[type].ja}枠（空き）`}>
                          <span>+</span>
                        </button>
                      )}
                    </div>
                  );
                }),
              )}
            </div>
            <div className="lobby__team-actions">
              <button type="button" className="btn btn--sm" onClick={() => nav({ name: 'memory', tab: 'loadout' })}>
                装備を変更
              </button>
              {nextSignal ? (
                <button type="button" className="btn btn--sm btn--primary" onClick={() => nav({ name: 'battleRun', encounterId: nextSignal.id })}>
                  NEXT: {nextSignal.name}
                </button>
              ) : (
                <button type="button" className="btn btn--sm btn--primary" onClick={() => nav({ name: 'battle' })}>
                  BATTLE
                </button>
              )}
            </div>
          </div>
        </section>

        <nav className="lobby__menu" aria-label="メインメニュー">
          {MENU.map((m, i) => (
            <MenuTile key={m.id} entry={m} index={i} badge={m.id === 'MEMORY' && pendingSync > 0 ? `SYNC ${pendingSync}` : undefined} onClick={() => nav(m.route)} />
          ))}
        </nav>
      </main>

      <section className="panel lobby__log" aria-label="システムログ">
        <div className="panel__title">
          <span>SYSTEM LOG</span>
          <small className="mono">{new Date().toLocaleDateString('ja-JP')}</small>
        </div>
        <ul>
          {logs.map((l, i) => (
            <li key={i} className={`lobby__log-line is-${l.tone}`} style={{ animationDelay: `${0.15 * i}s` }}>
              <span className="mono">{l.tone === 'alert' ? '!!' : l.tone === 'discover' ? '??' : '>'}</span>
              {l.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ExplorerPanel({ analysis }: { analysis: ReturnType<typeof analyzeLoadout> }) {
  const nav = useNav();
  const { save } = usePlayer();
  const main = analysis.main;
  const voice = useTypewriter(main ? (main.def.quote ?? main.def.description) : 'メインMemoryが同期されていない。LOADOUTで装備しよう。', 55);
  const color = ATTRIBUTE_META[analysis.attribute].color;
  const need = expToNext(save.profile.level);
  return (
    <article className="panel lobby__partner" style={{ ['--attr-c' as string]: color, ['--rarity-c' as string]: color } as CSSProperties}>
      <button type="button" className="lobby__partner-art lobby__partner-art--avatar" onClick={() => nav({ name: 'profile' })} aria-label="探索者のプロフィールを開く">
        <ExplorerAvatar color={save.profile.avatar.color} syncColor={color} animated />
      </button>
      <div className="lobby__partner-info">
        <p className="section-label">EXPLORER</p>
        <h2 className="lobby__partner-name">{save.profile.name}</h2>
        <div className="lobby__exp">
          <span className="mono">
            Lv.{save.profile.level} · EXP {save.profile.exp}/{need}
          </span>
          <div className="meter">
            <div className="meter__fill" style={{ width: `${Math.min(100, (save.profile.exp / need) * 100)}%` }} />
          </div>
        </div>
        <p className="lobby__sync">
          <span className="mono">SYNC</span>
          {main ? (
            <button type="button" className="lobby__sync-name" onClick={() => nav({ name: 'memoryDetail', instanceId: main.instance.instanceId })}>
              {main.def.name}
            </button>
          ) : (
            <span className="mute">未同期</span>
          )}
          <AttributeTag attribute={analysis.attribute} />
        </p>
        <blockquote className="lobby__quote">
          <span>{voice}</span>
          <span className="lobby__quote-cursor" aria-hidden />
        </blockquote>
        <div className="lobby__partner-stats mono">
          <span>POWER {playerPower(analysis).toLocaleString('ja-JP')}</span>
          <span>HP {analysis.total.hp.toLocaleString('ja-JP')}</span>
        </div>
      </div>
    </article>
  );
}

function MenuTile({ entry, index, badge, onClick }: { entry: MenuEntry; index: number; badge?: string; onClick: () => void }) {
  const planned = entry.status === 'planned';
  return (
    <button type="button" className={`menu-tile ${planned ? 'is-planned' : 'is-available'}`} onClick={onClick} style={{ animationDelay: `${0.05 * index}s` }}>
      <span className="menu-tile__code mono">{entry.code}</span>
      <span className="menu-tile__label">{entry.id}</span>
      <span className="menu-tile__ja">{entry.ja}</span>
      <span className="menu-tile__summary">{entry.summary}</span>
      <span className="menu-tile__status">
        <span className={`tag ${planned ? 'tag--planned' : ''}`} style={planned ? undefined : ({ ['--tag-c' as string]: 'var(--c-cyan)' } as CSSProperties)}>
          {planned ? `未実装 · PHASE ${entry.phase}` : 'READY'}
        </span>
        {badge && (
          <span className="tag tag--solid" style={{ ['--tag-c' as string]: 'var(--c-purple)' } as CSSProperties}>
            {badge}
          </span>
        )}
      </span>
    </button>
  );
}
