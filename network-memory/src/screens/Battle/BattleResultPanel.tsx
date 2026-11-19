import { MemoryCard } from '../../components/memory/MemoryCard';
import type { BattleSummary } from '../../core/battle/result';
import { usePlayer } from '../../state/GameProvider';

const TITLE = { victory: 'VICTORY', defeat: 'DEFEAT', retreat: 'RETREAT' } as const;
const SUB = {
  victory: '流出反応を鎮静化した',
  defeat: '記録の同期が途切れた……',
  retreat: '接続を切断し、撤退した',
} as const;

export function BattleResultPanel({
  summary,
  encounterName,
  onRetry,
  onExit,
  onSync,
}: {
  summary: BattleSummary;
  encounterName: string;
  onRetry: () => void;
  onExit: () => void;
  onSync: (memoryId: string) => void;
}) {
  const { save, data } = usePlayer();
  const pending = summary.detected.filter((d) => d.kind === 'pending' || d.kind === 'already_pending');
  return (
    <div className="bt-result" role="dialog" aria-modal="true" aria-label="戦闘結果">
      <div className={`panel bt-result__panel is-${summary.result}`}>
        <p className="bt-result__kicker mono">{encounterName}</p>
        <h2 className="bt-result__title glitch" data-text={TITLE[summary.result]}>
          {TITLE[summary.result]}
        </h2>
        <p className="bt-result__sub">{SUB[summary.result]}</p>

        {summary.result === 'victory' ? (
          <div className="bt-result__body">
            <dl className="bt-result__rewards">
              <div>
                <dt>EXP</dt>
                <dd className="mono">+{summary.exp}</dd>
              </div>
              {Object.entries(summary.currencies).map(([c, n]) => (
                <div key={c}>
                  <dt>{c}</dt>
                  <dd className="mono">+{n}</dd>
                </div>
              ))}
              {Object.entries(summary.items).map(([id, n]) => (
                <div key={id}>
                  <dt>ITEM</dt>
                  <dd>
                    {data.itemById.get(id)?.name} ×{n}
                  </dd>
                </div>
              ))}
            </dl>

            {summary.level.after > summary.level.before && (
              <p className="bt-result__lvup">
                <span className="mono">LEVEL UP</span> 探索者 Lv.{summary.level.before} → <strong>Lv.{summary.level.after}</strong>
              </p>
            )}
            {summary.memoryGrowth.length > 0 && (
              <div className="bt-result__growth">
                <p className="section-label">SYNC GROWTH 同期の深化</p>
                <ul>
                  {summary.memoryGrowth.map((g) => (
                    <li key={g.instanceId}>
                      {data.memoryById.get(g.memoryId)?.name} <span className="mono">Lv.{g.before} → Lv.{g.after}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.unlockedRecords.length > 0 && (
              <p className="notice notice--planned">
                新しい記録が解放されました: {summary.unlockedRecords.map((r) => `『${data.memoryById.get(r.memoryId)?.name}』${r.title}`).join(' / ')}
              </p>
            )}
            {summary.detected.some((d) => d.kind === 'duplicate') && (
              <p className="notice">
                {summary.detected
                  .filter((d) => d.kind === 'duplicate')
                  .map((d) => `『${data.memoryById.get(d.memoryId)?.name}』は同期済みのため、FRAGMENT ${d.fragments} に変換されました。`)
                  .join(' ')}
              </p>
            )}
            {pending.length > 0 && (
              <div className="bt-result__detect">
                <p className="bt-result__detect-title mono">!! MEMORY SIGNAL DETECTED</p>
                <div className="bt-result__detect-list">
                  {pending.map((d) => {
                    const def = data.memoryById.get(d.memoryId)!;
                    const owned = save.memories.some((m) => m.memoryId === d.memoryId);
                    return (
                      <div key={d.memoryId} className="bt-result__detect-item">
                        <MemoryCard def={def} size="sm" mask={owned ? null : 'silhouette'} />
                        <button type="button" className="btn btn--purple btn--sm" disabled={owned} onClick={() => onSync(d.memoryId)}>
                          {owned ? '同期済み' : '接触する'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="dim bt-result__hint">
            {summary.result === 'defeat'
              ? 'LOADOUTで装備を見直すか、他の流出反応で探索者と Memory を成長させてから再挑戦しよう。属性相性も重要だ。'
              : '撤退しても、使用したアイテムは消費されている。'}
          </p>
        )}

        <div className="bt-result__actions">
          <button type="button" className="btn" onClick={onRetry}>
            もう一度接続
          </button>
          <button type="button" className="btn btn--primary" onClick={onExit}>
            流出反応一覧へ
          </button>
        </div>
      </div>
    </div>
  );
}
