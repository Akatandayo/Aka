import { createContext, useContext } from 'react';
import type { Route } from './router';

export type Navigate = (route: Route, opts?: { replace?: boolean }) => void;

export const NavContext = createContext<Navigate | null>(null);

export function useNav(): Navigate {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav は NavContext の内側で使用してください');
  return nav;
}
