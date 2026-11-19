import { useMemo, useState, type CSSProperties } from 'react';
import { ExplorerAvatar } from '../../components/battle/ExplorerAvatar';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { CurrencyAmount } from '../../components/memory/Badges';
import { useToast } from '../../components/ui/Toast';
import { ATTRIBUTE_META, CURRENCY_META, RARITY_META } from '../../core/constants';
import { expToNext } from '../../core/memory/stats';
import { analyzeLoadout, playerBaseStats } from '../../core/player/character';
import { getActiveLoadout } from '../../core/player/loadout';
import { buildEntries } from '../../core/memory/query';
import { collectionSummary } from '../../core/player/discovery';
import { PLAYER_BIO_MAX, PLAYER_NAME_MAX } from '../../core/save/schema';
import { usePlayer } from '../../state/GameProvider';
import { RARITIES, STAT_KEYS } from '../../types/memory';
import { CURRENCIES, type TransactionReason } from '../../types/player';
import './ProfileScreen.css';

const REASON_LABEL: Record<TransactionReason, string> = {
  NEW_GAME: '探索者登録',
  DEV_GRANT: '開発者ツール',
  MEMORY_LEVEL_UP: 'レベルアップ',
  SKILL_UPGRADE: 'スキル強化',
  LIMIT_BREAK: '限界突破',
  FUSION: '融合',
  SHOP_PURCHASE: 'SHOP',
  QUEST_REWARD: 'クエスト報酬',
  BATTLE_REWARD: 'バトル報酬',
  STORY_REWARD: 'ストーリー報酬',
  DUPLICATE_MEMORY: '重複Memoryの断片化',
  ADJUSTMENT: '調整',
};

export function ProfileScreen() {
  const toast = useToast();
  const { save, data, dispatch, saveStatus } = usePlayer();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(save.profile.name);

  const summary = useMemo(() => collectionSummary(save, data), [save, data]);
  const entries = useMemo(() => buildEntries(save, data), [save, data]);
  const byRarity = useMemo(() => {
    const ownedIds = new Set(entries.map((e) => e.def.id));
    return RARITIES.map((r) => ({
      rarity: r,
      total: data.memories.filter((m) => m.rarity === r).length,
      owned: data.memories.filter((m) => m.rarity === r && ownedIds.has(m.id)).length,
    }));
  }, [entries, data]);
  const totalFragments = useMemo(() => [...data.storyById.values()].reduce((n, s) => n + s.fragments.length, 0), [data]);

  const commit = () => {
    const name = draft.trim();
    if (!name) {
      toast.push({ tone: 'warn', title: '探索者名を入力してください' });
      return;
    }
    dispatch({ type: 'RENAME_PLAYER', name });
    setEditing(false);
    toast.push({ tone: 'success', title: '探索者名を変更しました' });
  };

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const analysis = useMemo(() => analyzeLoadout(save, data, getActiveLoadout(save)), [save, data]);
  const base = playerBaseStats(save.profile.level);
  const need = expToNext(save.profile.level);
  const clears = Object.keys(save.battle.encounters).length;

  return (
    <ScreenFrame code="07" title="PROFILE" subtitle="探索者情報">
      <div className="profile">
        <section className="panel profile__card">
          <div className="profile__avatar">
            <ExplorerAvatar color={save.profile.avatar.color} syncColor={ATTRIBUTE_META[analysis.attribute].color} animated />
            <div className="profile__colors" role="radiogroup" aria-label="探索者のカラー">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={save.profile.avatar.color === c}
                  aria-label={`カラー ${c}`}
                  className="profile__color"
                  style={{ ['--sw' as string]: c } as CSSProperties}
                  onClick={() => dispatch({ type: 'UPDATE_PROFILE', avatar: { color: c } })}
                />
              ))}
            </div>
          </div>
          <div className="profile__main">
            <p className="section-label">EXPLORER</p>
            {editing ? (
              <form
                className="profile__edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  commit();
                }}
              >
                <input className="input" value={draft} maxLength={PLAYER_NAME_MAX} onChange={(e) => setDraft(e.target.value)} autoFocus aria-label="探索者名" />
                <button type="submit" className="btn btn--sm btn--primary">
                  保存
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => {
                    setDraft(save.profile.name);
                    setEditing(false);
                  }}
                >
                  取消
                </button>
              </form>
            ) : (
              <div className="profile__name-row">
                <h2 className="profile__name">{save.profile.name}</h2>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(true)}>
                  名前を変更
                </button>
              </div>
            )}
            <p className="profile__title">{save.profile.title}</p>
            <div className="profile__exp">
              <span className="mono">
                Lv.{save.profile.level} · EXP {save.profile.exp} / {need}
              </span>
              <div className="meter">
                <div className="meter__fill" style={{ width: `${Math.min(100, (save.profile.exp / need) * 100)}%` }} />
              </div>
            </div>
            <BioEditor bio={save.profile.bio} onSave={(bio) => dispatch({ type: 'UPDATE_PROFILE', bio })} />
            <dl className="profile__meta">
              <div>
                <dt>EXPLORER ID</dt>
                <dd className="mono">{save.profile.playerId}</dd>
              </div>
              <div>
                <dt>LEVEL</dt>
                <dd className="mono">{save.profile.level}</dd>
              </div>
              <div>
                <dt>REGISTERED</dt>
                <dd>{new Date(save.profile.createdAt).toLocaleDateString('ja-JP')}</dd>
              </div>
              <div>
                <dt>LAST LOGIN</dt>
                <dd>{new Date(save.profile.lastLoginAt).toLocaleString('ja-JP')}</dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="profile__grid">
          <section className="panel">
            <div className="panel__title">
              <span>EXPLORER STATUS</span>
              <small>主人公の基礎能力（装備前）</small>
            </div>
            <table className="profile__rarity">
              <tbody>
                {STAT_KEYS.map((k) => (
                  <tr key={k}>
                    <th scope="row" className="mono">
                      {k.toUpperCase()}
                    </th>
                    <td className="mono">{base[k]}</td>
                    <td className="mono mute">装備込み {analysis.total[k]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="section-label" style={{ marginTop: 14 }}>
              BATTLE 戦績
            </p>
            <p className="mono profile__battle">
              WIN {save.battle.wins} · LOSE {save.battle.losses} · RETREAT {save.battle.retreats} · 鎮静化した流出反応 {clears}/{data.encounters.length}
            </p>
          </section>

          <section className="panel">
            <div className="panel__title">
              <span>COLLECTION</span>
              <small>回収状況</small>
            </div>
            <div className="profile__rates">
              <Rate label="回収率" value={summary.owned} total={summary.total} color="var(--c-cyan)" />
              <Rate label="発見率" value={summary.discovered} total={summary.total} color="var(--c-purple)" />
              <Rate label="閲覧した記録" value={save.archive.readFragmentIds.length} total={totalFragments} color="var(--c-success)" />
            </div>
            <table className="profile__rarity">
              <tbody>
                {byRarity.map((r) => (
                  <tr key={r.rarity}>
                    <th scope="row">
                      <span className="tag" style={{ ['--tag-c' as string]: RARITY_META[r.rarity].color } as CSSProperties}>
                        {r.rarity}
                      </span>
                    </th>
                    <td className="mono">
                      {r.owned} / {r.total}
                    </td>
                    <td className="mono mute">{pct(r.owned, r.total)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel__title">
              <span>WALLET</span>
              <small>所持通貨</small>
            </div>
            <ul className="profile__wallet">
              {CURRENCIES.map((c) => (
                <li key={c}>
                  <CurrencyAmount currency={c} amount={save.wallet[c]} />
                  <span className="profile__cur-desc">{CURRENCY_META[c].description}</span>
                </li>
              ))}
            </ul>
            <p className="section-label" style={{ marginTop: 14 }}>
              TRANSACTIONS 取引履歴
            </p>
            {save.transactions.length === 0 ? (
              <p className="mute">取引履歴はありません。</p>
            ) : (
              <ul className="profile__tx">
                {save.transactions.slice(0, 15).map((t) => (
                  <li key={t.id}>
                    <span className="mono mute">{new Date(t.at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{REASON_LABEL[t.reason]}</span>
                    <span className={`mono ${t.amount > 0 ? 'is-plus' : 'is-minus'}`}>
                      {t.amount > 0 ? '+' : ''}
                      {t.amount.toLocaleString('ja-JP')} {t.currency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="panel">
          <div className="panel__title">
            <span>CONNECTION</span>
            <small>オンライン状態</small>
          </div>
          <div className="profile__online">
            <span className="tag" style={{ ['--tag-c' as string]: 'var(--c-warn)' } as CSSProperties}>
              OFFLINE
            </span>
            <p>
              データはこの端末のブラウザに保存されています
              {saveStatus.storage === 'memory' && <strong className="profile__warn">（現在ブラウザ保存が使えないため、タブを閉じると消えます）</strong>}。
            </p>
          </div>
          <p className="notice notice--planned" style={{ marginTop: 12 }}>
            アカウント登録・ログイン・データ同期・フレンド・ランキングは PHASE 5（Supabase連携）で実装予定です。現在は利用できません。
          </p>
        </section>
      </div>
    </ScreenFrame>
  );
}

function Rate({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="profile__rate">
      <div className="profile__rate-head">
        <span>{label}</span>
        <span className="mono">
          {value} / {total} <span className="mute">({p}%)</span>
        </span>
      </div>
      <div className="meter" style={{ ['--meter-c' as string]: color } as CSSProperties}>
        <div className="meter__fill" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

const AVATAR_COLORS = ['#3ee8ff', '#9b6bff', '#4dffa6', '#ffc94d', '#ff7ad9', '#ff3b5c', '#e8f2ff'];

function BioEditor({ bio, onSave }: { bio: string; onSave: (bio: string) => void }) {
  const [draft, setDraft] = useState(bio);
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div className="profile__bio">
        <p className={bio ? '' : 'mute'}>{bio || '紹介文は未設定です。'}</p>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(true)}>
          紹介文を編集
        </button>
      </div>
    );
  }
  return (
    <form
      className="profile__bio profile__bio--edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
        setEditing(false);
      }}
    >
      <textarea className="input profile__bio-input" value={draft} maxLength={PLAYER_BIO_MAX} rows={3} onChange={(e) => setDraft(e.target.value)} aria-label="紹介文" />
      <span className="mono mute">
        {draft.length}/{PLAYER_BIO_MAX}
      </span>
      <div className="profile__edit">
        <button type="submit" className="btn btn--sm btn--primary">
          保存
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => {
            setDraft(bio);
            setEditing(false);
          }}
        >
          取消
        </button>
      </div>
    </form>
  );
}
