import { useNav } from '../../app/nav';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { MemoryListView } from './MemoryListView';
import { LoadoutView } from './LoadoutView';
import './MemoryScreen.css';

/** MEMORY: 同期した Memory の管理（一覧 / 装備） */
export function MemoryScreen({ tab }: { tab: 'list' | 'loadout' }) {
  const nav = useNav();
  return (
    <ScreenFrame code="03" title="MEMORY" subtitle={tab === 'list' ? '同期済みの記録' : 'Memory装備'}>
      <div className="tabs memory-tabs" role="tablist">
        <button type="button" role="tab" className="tab" aria-selected={tab === 'list'} onClick={() => nav({ name: 'memory', tab: 'list' }, { replace: true })}>
          LIST
          <small>一覧</small>
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'loadout'} onClick={() => nav({ name: 'memory', tab: 'loadout' }, { replace: true })}>
          LOADOUT
          <small>装備</small>
        </button>
      </div>
      {tab === 'list' ? <MemoryListView /> : <LoadoutView />}
    </ScreenFrame>
  );
}
