import { createId } from '../id';
import { CURRENCIES, type Currency, type PlayerSave, type Transaction, type TransactionReason, type Wallet } from '../../types/player';

/**
 * 通貨の増減を一元管理する共通処理。
 *
 * - すべての通貨変動は必ずこのモジュールを経由する（直接 wallet を書き換えない）。
 * - 複数の変動はアトミックに適用される（1つでも失敗したら全体を取り消す）。
 * - 変動はすべて Transaction として記録される（PHASE 5 でサーバーの Transactions テーブルと対応）。
 * - オンライン報酬などはサーバー側検証が必須。ここはローカル処理用。
 */

export const MAX_BALANCE = 999_999_999;
/** セーブに保持する取引履歴の件数上限 */
export const TRANSACTION_HISTORY_LIMIT = 200;

export interface CurrencyChange {
  currency: Currency;
  amount: number;
  reason: TransactionReason;
  note?: string;
}

export type EconomyResult =
  | { ok: true; save: PlayerSave; transactions: Transaction[] }
  | { ok: false; error: string };

export function emptyWallet(): Wallet {
  return { DATA: 0, FRAGMENT: 0, CORE: 0, CREDIT: 0 };
}

export function canAfford(wallet: Wallet, cost: Partial<Wallet>): boolean {
  return CURRENCIES.every((c) => wallet[c] >= (cost[c] ?? 0));
}

export function applyCurrencyChanges(save: PlayerSave, changes: CurrencyChange[], at: string): EconomyResult {
  const wallet: Wallet = { ...save.wallet };
  const txs: Transaction[] = [];
  for (const ch of changes) {
    if (!(CURRENCIES as readonly string[]).includes(ch.currency)) {
      return { ok: false, error: `不明な通貨です: ${String(ch.currency)}` };
    }
    if (!Number.isSafeInteger(ch.amount) || ch.amount === 0) {
      return { ok: false, error: `不正な数量です: ${ch.amount}` };
    }
    const next = wallet[ch.currency] + ch.amount;
    if (next < 0) {
      return { ok: false, error: `${ch.currency} が不足しています（必要: ${-ch.amount} / 所持: ${wallet[ch.currency]}）` };
    }
    if (next > MAX_BALANCE) {
      return { ok: false, error: `${ch.currency} の所持上限を超えます` };
    }
    wallet[ch.currency] = next;
    txs.push({
      id: createId('tx'),
      at,
      currency: ch.currency,
      amount: ch.amount,
      balanceAfter: next,
      reason: ch.reason,
      ...(ch.note ? { note: ch.note } : {}),
    });
  }
  const transactions = [...txs.slice().reverse(), ...save.transactions].slice(0, TRANSACTION_HISTORY_LIMIT);
  return { ok: true, save: { ...save, wallet, transactions }, transactions: txs };
}
