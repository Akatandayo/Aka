import { useMemo, useState, type CSSProperties } from 'react';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { CurrencyAmount } from '../../components/memory/Badges';
import { useToast } from '../../components/ui/Toast';
import { CURRENCY_META, RARITY_META } from '../../core/constants';
import { buildEntries } from '../../core/memory/query';
import { collectionSummary } from '../../core/player/discovery';
import { PLAYER_NAME_MAX } from '../../core/save/schema';
import { usePlayer } from '../../state/GameProvider';
import { RARITIES } from '../../types/memory';
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

  return (
    <ScreenFrame code="07" title="PROFILE" subtitle="探索者情報">
      <div className="profile">
        <section className="panel profile__card">
          <div className="profile__emblem mono" aria-hidden>
            <span>EX</span>
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
