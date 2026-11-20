import type { CSSProperties } from 'react';
import { RewardList } from '../../components/ui/RewardList';
import { useToast } from '../../components/ui/Toast';
import { fillText } from '../../core/story/engine';
import { questObjectives, questStatus, questUnlockText, type QuestStatus } from '../../core/world/quests';
import { usePlayer } from '../../state/GameProvider';
import type { QuestDefinition } from '../../types/exploration';

const STATUS: Record<QuestStatus, { text: string; color: string }> = {
  locked: { text: 'LOCKED', color: 'var(--c-text-mute)' },
  available: { text: '受注可能', color: 'var(--c-cyan)' },
  active: { text: '進行中', color: 'var(--c-warn)' },
  ready: { text: '報告できる', color: 'var(--c-success)' },
  completed: { text: '達成', color: 'var(--c-text-mute)' },
};

/** サブクエストの一覧（受注・達成状況・報告） */
export function QuestList({ quests, showLocked = true }: { quests: QuestDefinition[]; showLocked?: boolean }) {
  const toast = useToast();
  const { save, data, dispatch } = usePlayer();
  const order: QuestStatus[] = ['ready', 'active', 'available', 'locked', 'completed'];
  const list = quests
    .map((q) => ({ q, st: questStatus(save, data, q) }))
    .filter((x) => showLocked || x.st !== 'locked')
    .sort((a, b) => order.indexOf(a.st) - order.indexOf(b.st));
  if (!list.length) return <p className="dim">受けられる依頼はありません。</p>;
  return (
    <ul className="quest-list">
      {list.map(({ q, st }) => {
        const giver = data.characterById.get(q.giver);
        const meta = STATUS[st];
        const objectives = questObjectives(save, data, q);
        return (
          <li key={q.id} className={`quest is-${st}`} style={{ ['--q-c' as string]: meta.color, ['--giver-c' as string]: giver?.color ?? 'var(--c-cyan)' } as CSSProperties}>
            <div className="quest__head">
              <strong className="quest__title">{st === 'locked' ? '？？？' : q.title}</strong>
              <span className="tag" style={{ ['--tag-c' as string]: meta.color } as CSSProperties}>
                {meta.text}
              </span>
            </div>
            {st === 'locked' ? (
              <p className="mute quest__req">受注条件: {questUnlockText(save, data, q).join(' / ')}</p>
            ) : (
              <>
                <p className="quest__giver">
                  依頼人 <span>{giver?.name ?? q.giver}</span>
                </p>
                <p className="dim quest__desc">{fillText(q.description, save.profile.name)}</p>
                {st !== 'available' && (
                  <ul className="quest__objectives">
                    {objectives.map((o) => (
                      <li key={o.label} className={o.met || st === 'completed' ? 'is-met' : ''}>
                        {o.label}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="quest__foot">
                  <span className="quest__rewards">
                    <span className="mono mute">REWARD</span>
                    <RewardList rewards={q.rewards} />
                  </span>
                  {st === 'available' && (
                    <button
                      type="button"
                      className="btn btn--sm btn--primary"
                      onClick={() => {
                        dispatch({ type: 'QUEST_ACCEPT', questId: q.id, at: new Date().toISOString() });
                        toast.push({ tone: 'info', title: `サブクエスト「${q.title}」を受注しました` });
                      }}
                    >
                      受注する
                    </button>
                  )}
                  {st === 'ready' && (
                    <button
                      type="button"
                      className="btn btn--sm btn--primary"
                      onClick={() => {
                        dispatch({ type: 'QUEST_CLAIM', questId: q.id, at: new Date().toISOString() });
                        toast.push({ tone: 'success', title: `「${q.title}」達成`, body: q.completeText ? `${giver?.name ?? ''}「${fillText(q.completeText, save.profile.name)}」` : undefined, durationMs: 6000 });
                      }}
                    >
                      報告する
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
