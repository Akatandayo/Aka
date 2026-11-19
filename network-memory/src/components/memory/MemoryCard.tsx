import type { CSSProperties } from 'react';
import { ATTRIBUTE_META, RARITY_META } from '../../core/constants';
import type { MemoryEntry } from '../../core/memory/query';
import type { MemoryDefinition } from '../../types/memory';
import { MemoryArt, type ArtMask } from './MemoryArt';
import './MemoryCard.css';

interface Props {
  def: MemoryDefinition;
  entry?: MemoryEntry;
  mask?: ArtMask;
  /** 右上に表示する小さなバッジ（編成中など） */
  badge?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
  animated?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}

/** 一覧・編成で使うカード */
export function MemoryCard({ def, entry, mask = null, badge, selected, disabled, onClick, size = 'md', animated, style, ariaLabel }: Props) {
  const rarity = RARITY_META[def.rarity];
  const attr = ATTRIBUTE_META[def.attribute];
  const hidden = mask === 'unknown';
  const name = hidden ? '？？？' : def.name;
  const vars = {
    ...style,
    ['--rarity-c' as string]: rarity.color,
    ['--attr-c' as string]: attr.color,
  } as CSSProperties;

  const content = (
    <>
      <div className="mcard__frame">
        <MemoryArt def={def} mask={mask} animated={animated} />
        {!hidden && (
          <span className="mcard__rarity" title={rarity.label}>
            {rarity.short}
          </span>
        )}
        {!hidden && !mask && <span className="mcard__attr" title={attr.label} />}
        {entry?.instance.favorite && (
          <span className="mcard__fav" aria-label="お気に入り">
            ★
          </span>
        )}
        {badge && <span className="mcard__badge">{badge}</span>}
      </div>
      <div className="mcard__meta">
        <span className="mcard__name">{name}</span>
        {entry && (
          <span className="mcard__sub mono">
            <span>Lv.{entry.instance.level}</span>
            <span className="mcard__cp">CP {entry.cp.toLocaleString('ja-JP')}</span>
          </span>
        )}
      </div>
    </>
  );

  const className = `mcard mcard--${size} mcard--${def.rarity.toLowerCase()} ${selected ? 'is-selected' : ''} ${mask ? 'is-masked' : ''}`;

  if (onClick) {
    return (
      <button type="button" className={className} style={vars} onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={ariaLabel ?? name}>
        {content}
      </button>
    );
  }
  return (
    <div className={className} style={vars}>
      {content}
    </div>
  );
}
