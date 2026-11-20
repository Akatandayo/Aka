import { CurrencyAmount } from '../memory/Badges';
import { usePlayer } from '../../state/GameProvider';
import type { Rewards } from '../../types/exploration';
import { CURRENCIES } from '../../types/player';

/** 報酬（通貨・アイテム）の表示 */
export function RewardList({ rewards }: { rewards: Rewards | undefined }) {
  const { data } = usePlayer();
  if (!rewards) return null;
  const cur = CURRENCIES.filter((c) => rewards.currencies?.[c]);
  const items = Object.entries(rewards.items ?? {});
  if (!cur.length && !items.length) return null;
  return (
    <span className="reward-list">
      {cur.map((c) => (
        <CurrencyAmount key={c} currency={c} amount={rewards.currencies![c]!} />
      ))}
      {items.map(([id, n]) => (
        <span key={id} className="tag">
          {data.itemById.get(id)?.name ?? id} ×{n}
        </span>
      ))}
    </span>
  );
}
