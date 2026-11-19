import { useNav } from '../../app/nav';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { MemoryListView } from './MemoryListView';
import { TeamEditView } from './TeamEditView';
import './MemoryScreen.css';

/** MEMORY: 所持Memoryの管理（一覧 / 編成） */
export function MemoryScreen({ tab }: { tab: 'list' | 'team' }) {
  const nav = useNav();
  return (
    <ScreenFrame code="03" title="MEMORY" subtitle={tab === 'list' ? '所持記録' : '編成'}>
      <div className="tabs memory-tabs" role="tablist">
        <button type="button" role="tab" className="tab" aria-selected={tab === 'list'} onClick={() => nav({ name: 'memory', tab: 'list' }, { replace: true })}>
          LIST
          <small>一覧</small>
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'team'} onClick={() => nav({ name: 'memory', tab: 'team' }, { replace: true })}>
          TEAM
          <small>編成</small>
        </button>
      </div>
      {tab === 'list' ? <MemoryListView /> : <TeamEditView />}
    </ScreenFrame>
  );
}
