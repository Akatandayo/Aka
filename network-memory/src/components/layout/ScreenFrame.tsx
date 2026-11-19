import type { ReactNode } from 'react';
import { useNav } from '../../app/nav';
import type { Route } from '../../app/router';
import { useGame } from '../../state/GameProvider';
import { CURRENCIES } from '../../types/player';
import { CurrencyAmount } from '../memory/Badges';
import './ScreenFrame.css';

interface Props {
  code: string;
  title: string;
  subtitle: string;
  /** 戻り先（省略時は LOBBY） */
  back?: { route: Route; label: string };
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}

/** LOBBY 以外の各画面の共通フレーム（上部バー + コンテンツ領域） */
export function ScreenFrame({ code, title, subtitle, back, actions, children, wide }: Props) {
  const nav = useNav();
  const { save } = useGame();
  const target = back ?? { route: { name: 'lobby' } as Route, label: 'LOBBY' };

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar__inner">
          <button type="button" className="topbar__back" onClick={() => nav(target.route)} aria-label={`${target.label} に戻る`}>
            <span aria-hidden>◀</span>
            <span className="topbar__back-label">{target.label}</span>
          </button>
          <div className="topbar__title">
            <span className="topbar__code mono">{code}</span>
            <h1>
              {title}
              <small>{subtitle}</small>
            </h1>
          </div>
          {actions && <div className="topbar__actions">{actions}</div>}
          {save && (
            <div className="topbar__wallet" aria-label="所持通貨">
              {CURRENCIES.map((c) => (
                <CurrencyAmount key={c} currency={c} amount={save.wallet[c]} compact />
              ))}
            </div>
          )}
        </div>
      </header>
      <main className={`screen__body ${wide ? 'screen__body--wide' : ''}`}>{children}</main>
    </div>
  );
}
