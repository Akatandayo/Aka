import { useMemo, type CSSProperties } from 'react';
import { MENU, type MenuEntry } from '../../app/screens';
import { useNav } from '../../app/nav';
import { AttributeTag, CategoryTag, CurrencyAmount, RarityTag } from '../../components/memory/Badges';
import { MemoryArt } from '../../components/memory/MemoryArt';
import { MemoryCard } from '../../components/memory/MemoryCard';
import { useTypewriter } from '../../components/ui/useTypewriter';
import { ATTRIBUTE_META, RARITY_META } from '../../core/constants';
import { buildEntries, sortEntries, type MemoryEntry } from '../../core/memory/query';
import { collectionSummary } from '../../core/player/discovery';
import { getActiveTeam, teamEntries } from '../../core/player/teams';
import { usePlayer } from '../../state/GameProvider';
import { CURRENCIES } from '../../types/player';
import './LobbyScreen.css';

/** LOBBY: すべての機能への入口となるハブ画面 */
export function LobbyScreen() {
  const nav = useNav();
  const { save, data, saveStatus } = usePlayer();
  const team = getActiveTeam(save);
  const members = useMemo(() => teamEntries(save, data, team), [save, data, team]);
  const summary = useMemo(() => collectionSummary(save, data), [save, data]);

  // パートナー: 出撃チームのリーダー → お気に入り → 最高レア
  const partner: MemoryEntry | undefined = useMemo(() => {
    const leader = members.find((m) => m !== null);
    if (leader) return leader;
    const all = buildEntries(save, data);
    return all.find((e) => e.instance.favorite) ?? sortEntries(all, 'rarity', 'desc')[0];
  }, [members, save, data]);

  const pendingDiscoveries = summary.discovered - summary.owned;
  const rate = summary.total ? Math.round((summary.owned / summary.total) * 100) : 0;

  const logs = [
    { tone: 'alert', text: 'Memoryの流出を継続して観測中。流出規模は測定不能。' },
    { tone: 'info', text: `回収済み記録 ${summary.owned} / ${summary.total}（${rate}%）` },
    ...(pendingDiscoveries > 0
      ? [{ tone: 'discover', text: `存在を確認した未回収のMemoryが ${pendingDiscoveries} 件あります。` }]
      : []),
    {
      tone: saveStatus.error ? 'alert' : 'info',
      text: saveStatus.error
        ? `保存: ${saveStatus.error}`
        : `ローカルに自動保存中${saveStatus.lastSavedAt ? `（最終 ${new Date(saveStatus.lastSavedAt).toLocaleTimeString('ja-JP')}）` : ''}`,
    },
    { tone: 'mute', text: 'OFFLINE MODE — オンライン機能（アカウント・対戦・ランキング）は PHASE 5 で実装予定です。' },
  ];

  return (
    <div className="lobby">
      <header className="lobby__header">
        <div className="lobby__brand">
          <span className="lobby__brand-main glitch" data-text="NETWORK">
            NETWORK
          </span>
          <span className="lobby__brand-sub">Memory: Re:Collection</span>
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
          {partner ? <PartnerShowcase entry={partner} onOpen={() => nav({ name: 'memoryDetail', instanceId: partner.instance.instanceId })} /> : <div className="panel empty">Memoryを所持していません</div>}

          <div className="panel lobby__team">
            <div className="panel__title">
              <span>ACTIVE TEAM</span>
              <small>{team.name}</small>
            </div>
            <div className="lobby__team-grid">
              {members.map((m, i) =>
                m ? (
                  <MemoryCard
                    key={m.instance.instanceId}
                    def={m.def}
                    entry={m}
                    size="sm"
                    onClick={() => nav({ name: 'memoryDetail', instanceId: m.instance.instanceId })}
                    badge={i === 0 ? 'LEADER' : undefined}
                  />
                ) : (
                  <button key={i} type="button" className="lobby__slot-empty" onClick={() => nav({ name: 'memory', tab: 'team' })}>
                    <span>+</span>
                    <small>EMPTY</small>
                  </button>
                ),
              )}
            </div>
            <button type="button" className="btn btn--sm btn--block" onClick={() => nav({ name: 'memory', tab: 'team' })}>
              編成を変更
            </button>
          </div>
        </section>

        <nav className="lobby__menu" aria-label="メインメニュー">
          {MENU.map((m, i) => (
            <MenuTile key={m.id} entry={m} index={i} onClick={() => nav(m.route)} />
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

function PartnerShowcase({ entry, onOpen }: { entry: MemoryEntry; onOpen: () => void }) {
  const { def } = entry;
  const quote = useTypewriter(def.quote ?? def.description, 55);
  const vars = {
    ['--rarity-c' as string]: RARITY_META[def.rarity].color,
    ['--attr-c' as string]: ATTRIBUTE_META[def.attribute].color,
  } as CSSProperties;
  return (
    <article className="panel lobby__partner" style={vars}>
      <button type="button" className="lobby__partner-art" onClick={onOpen} aria-label={`${def.name} の詳細を開く`}>
        <MemoryArt def={def} animated />
      </button>
      <div className="lobby__partner-info">
        <p className="section-label">PARTNER MEMORY</p>
        <div className="lobby__partner-tags">
          <RarityTag rarity={def.rarity} solid />
          <CategoryTag category={def.category} />
          <AttributeTag attribute={def.attribute} />
        </div>
        <h2 className="lobby__partner-name">{def.name}</h2>
        {def.title && <p className="lobby__partner-title">{def.title}</p>}
        <blockquote className="lobby__quote">
          <span>{quote}</span>
          <span className="lobby__quote-cursor" aria-hidden />
        </blockquote>
        <div className="lobby__partner-stats mono">
          <span>Lv.{entry.instance.level}</span>
          <span>CP {entry.cp.toLocaleString('ja-JP')}</span>
        </div>
        <button type="button" className="btn btn--sm" onClick={onOpen}>
          記録を見る
        </button>
      </div>
    </article>
  );
}

function MenuTile({ entry, index, onClick }: { entry: MenuEntry; index: number; onClick: () => void }) {
  const planned = entry.status === 'planned';
  return (
    <button type="button" className={`menu-tile ${planned ? 'is-planned' : 'is-available'}`} onClick={onClick} style={{ animationDelay: `${0.05 * index}s` }}>
      <span className="menu-tile__code mono">{entry.code}</span>
      <span className="menu-tile__label">{entry.id}</span>
      <span className="menu-tile__ja">{entry.ja}</span>
      <span className="menu-tile__summary">{entry.summary}</span>
      <span className={`tag menu-tile__status ${planned ? 'tag--planned' : ''}`} style={planned ? undefined : { ['--tag-c' as string]: 'var(--c-cyan)' }}>
        {planned ? `未実装 · PHASE ${entry.phase}` : 'READY'}
      </span>
    </button>
  );
}
