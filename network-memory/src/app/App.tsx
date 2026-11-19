import { useEffect, useRef, useState } from 'react';
import { Background } from '../components/layout/Background';
import { useToast } from '../components/ui/Toast';
import { LobbyScreen } from '../screens/Lobby/LobbyScreen';
import { MemoryDetailScreen } from '../screens/Memory/MemoryDetailScreen';
import { MemoryScreen } from '../screens/Memory/MemoryScreen';
import { PlannedScreen } from '../screens/Planned/PlannedScreen';
import { ProfileScreen } from '../screens/Profile/ProfileScreen';
import { SettingsScreen } from '../screens/Settings/SettingsScreen';
import { TitleScreen } from '../screens/Title/TitleScreen';
import { useGame } from '../state/GameProvider';
import { NavContext } from './nav';
import { useHashRoute, type Route } from './router';

function renderRoute(route: Route) {
  switch (route.name) {
    case 'lobby':
      return <LobbyScreen />;
    case 'memory':
      return <MemoryScreen tab={route.tab} />;
    case 'memoryDetail':
      return <MemoryDetailScreen instanceId={route.instanceId} />;
    case 'profile':
      return <ProfileScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'planned':
      return <PlannedScreen screen={route.screen} />;
  }
}

export function App() {
  const { save, dispatch, startupNotices } = useGame();
  const toast = useToast();
  const [route, navigate] = useHashRoute();
  const [entered, setEntered] = useState(false);

  // セーブデータが消えたら（初期化時）タイトルに戻す
  useEffect(() => {
    if (!save) setEntered(false);
  }, [save]);

  // 起動時の通知（破損データの退避・修復など）
  const notified = useRef(false);
  useEffect(() => {
    if (notified.current) return;
    notified.current = true;
    for (const n of startupNotices) toast.push({ tone: 'warn', title: 'セーブデータ', body: n, durationMs: 9000 });
  }, [startupNotices, toast]);

  const enter = () => {
    dispatch({ type: 'TOUCH_LOGIN', at: new Date().toISOString() });
    setEntered(true);
    if (route.name !== 'lobby') navigate({ name: 'lobby' }, { replace: true });
  };

  return (
    <NavContext.Provider value={navigate}>
      <Background />
      {!save || !entered ? <TitleScreen onEnter={enter} /> : renderRoute(route)}
    </NavContext.Provider>
  );
}
