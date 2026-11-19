import { useCallback, useEffect, useState } from 'react';
import type { MenuScreenId } from './screens';

/**
 * ハッシュベースの軽量ルーター。
 * - ブラウザの戻る/進む・スマホの戻るジェスチャーに対応
 * - 静的ホスティング（サブパス配置）でもリロードで 404 にならない
 */
export type Route =
  | { name: 'lobby' }
  | { name: 'memory'; tab: 'list' | 'loadout' }
  | { name: 'memoryDetail'; instanceId: string }
  | { name: 'sync'; memoryId: string }
  | { name: 'battle' }
  | { name: 'battleRun'; encounterId: string }
  | { name: 'profile' }
  | { name: 'settings' }
  | { name: 'planned'; screen: MenuScreenId };

const PLANNED: Record<string, MenuScreenId> = {
  story: 'STORY',
  world: 'WORLD',
  archive: 'ARCHIVE',
  shop: 'SHOP',
};

export function parseHash(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));
  const [head, sub] = parts;
  switch (head) {
    case undefined:
    case 'lobby':
      return { name: 'lobby' };
    case 'memory':
      // 'team' は PHASE 1 の URL（互換のため装備画面へ）
      if (sub === 'loadout' || sub === 'team') return { name: 'memory', tab: 'loadout' };
      if (sub) return { name: 'memoryDetail', instanceId: sub };
      return { name: 'memory', tab: 'list' };
    case 'sync':
      return sub ? { name: 'sync', memoryId: sub } : { name: 'memory', tab: 'list' };
    case 'battle':
      return sub ? { name: 'battleRun', encounterId: sub } : { name: 'battle' };
    case 'profile':
      return { name: 'profile' };
    case 'settings':
      return { name: 'settings' };
    default:
      if (PLANNED[head]) return { name: 'planned', screen: PLANNED[head] };
      return { name: 'lobby' };
  }
}

export function toHash(route: Route): string {
  switch (route.name) {
    case 'lobby':
      return '#/lobby';
    case 'memory':
      return route.tab === 'loadout' ? '#/memory/loadout' : '#/memory';
    case 'memoryDetail':
      return `#/memory/${encodeURIComponent(route.instanceId)}`;
    case 'sync':
      return `#/sync/${encodeURIComponent(route.memoryId)}`;
    case 'battle':
      return '#/battle';
    case 'battleRun':
      return `#/battle/${encodeURIComponent(route.encounterId)}`;
    case 'profile':
      return '#/profile';
    case 'settings':
      return '#/settings';
    case 'planned':
      return `#/${route.screen.toLowerCase()}`;
  }
}

export function useHashRoute(): [Route, (route: Route, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: Route, opts?: { replace?: boolean }) => {
    const hash = toHash(next);
    if (opts?.replace) {
      window.history.replaceState(null, '', hash);
      setRoute(parseHash(hash));
    } else if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      setRoute(parseHash(hash));
    }
    window.scrollTo({ top: 0 });
  }, []);

  return [route, navigate];
}
