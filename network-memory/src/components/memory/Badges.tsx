import type { CSSProperties } from 'react';
import { ATTRIBUTE_META, CATEGORY_META, CURRENCY_META, RARITY_META } from '../../core/constants';
import type { Attribute, MemoryCategory, Rarity } from '../../types/memory';
import type { Currency } from '../../types/player';

const tagStyle = (color: string): CSSProperties => ({ ['--tag-c' as string]: color });

export function RarityTag({ rarity, solid = false, short = false }: { rarity: Rarity; solid?: boolean; short?: boolean }) {
  const m = RARITY_META[rarity];
  return (
    <span className={`tag ${solid ? 'tag--solid' : ''} rarity-tag rarity-tag--${rarity.toLowerCase()}`} style={tagStyle(m.color)} title={m.label}>
      {short ? m.short : m.label}
    </span>
  );
}

export function AttributeTag({ attribute, withJa = false }: { attribute: Attribute; withJa?: boolean }) {
  const m = ATTRIBUTE_META[attribute];
  return (
    <span className="tag" style={tagStyle(m.color)} title={`${m.label}（${m.ja}）: ${m.description}`}>
      ◆ {m.label}
      {withJa && <span style={{ fontFamily: 'var(--f-body)', letterSpacing: 0 }}>{m.ja}</span>}
    </span>
  );
}

export function CategoryTag({ category }: { category: MemoryCategory }) {
  const m = CATEGORY_META[category];
  return (
    <span className="tag" title={m.ja}>
      {m.label}
    </span>
  );
}

export function CurrencyAmount({ currency, amount, compact = false }: { currency: Currency; amount: number; compact?: boolean }) {
  const m = CURRENCY_META[currency];
  return (
    <span className="currency" style={{ ['--cur-c' as string]: m.color }} title={`${m.label}（${m.ja}）: ${m.description}`}>
      <span className="currency__icon" aria-hidden />
      {!compact && <span className="currency__label">{m.label}</span>}
      <span className="currency__value mono">{amount.toLocaleString('ja-JP')}</span>
    </span>
  );
}
