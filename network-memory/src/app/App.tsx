import { useEffect, useRef, useState } from 'react';
import { Background } from '../components/layout/Background';
import { useToast } from '../components/ui/Toast';
import { BattleRunScreen } from '../screens/Battle/BattleRunScreen';
import { audio } from '../audio/audio';
import { ArchiveEntryScreen, ArchiveScreen } from '../screens/Archive/ArchiveScreen';
import { BattleScreen } from '../screens/Battle/BattleScreen';
import { LobbyScreen } from '../screens/Lobby/LobbyScreen';
import { MemoryDetailScreen } from '../screens/Memory/MemoryDetailScreen';
import { MemoryScreen } from '../screens/Memory/MemoryScreen';
import { PlannedScreen } from '../screens/Planned/PlannedScreen';
import { ProfileScreen } from '../screens/Profile/ProfileScreen';
import { SettingsScreen } from '../screens/Settings/SettingsScreen';
import { StoryPlayer } from '../screens/Story/StoryPlayer';
import { StoryScreen } from '../screens/Story/StoryScreen';
import { SyncScreen } from '../screens/Sync/SyncScreen';
import { TitleScreen } from '../screens/Title/TitleScreen';
import { WorldScreen } from '../screens/World/WorldScreen';
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
    case 'sync':
      return <SyncScreen key={route.memoryId} memoryId={route.memoryId} />;
    case 'battle':
      return <BattleScreen />;
    case 'battleRun':
      return <BattleRunScreen key={route.encounterId} encounterId={route.encounterId} />;
    case 'story':
      return <StoryScreen />;
    case 'storyPlay':
      return <StoryPlayer key={route.chapterId} chapterId={route.chapterId} />;
    case 'world':
      return <WorldScreen />;
    case 'worldDetail':
      return <WorldScreen key={route.worldId} worldId={route.worldId} />;
    case 'archive':
      return <ArchiveScreen category={route.category} />;
    case 'archiveEntry':
      return <ArchiveEntryScreen key={route.entryId} entryId={route.entryId} />;
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

  // 音声: ブラウザの自動再生制限のため、最初のユーザー操作で有効にする
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  const bgmVolume = save?.settings.bgmVolume ?? 0.6;
  const seVolume = save?.settings.seVolume ?? 0.8;
  useEffect(() => {
    audio.setVolumes(bgmVolume, seVolume);
  }, [bgmVolume, seVolume]);

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
