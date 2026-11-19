import { useNav } from '../../app/nav';
import { MENU_BY_ID, type MenuScreenId } from '../../app/screens';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import './PlannedScreen.css';

/**
 * 未実装画面の案内。
 * 仕様「未実装機能は、動作しているように見せかけず、明確に未実装と表示すること」に基づき、
 * ダミーの動作は一切行わず、予定している機能だけを示す。
 */
export function PlannedScreen({ screen }: { screen: MenuScreenId }) {
  const nav = useNav();
  const entry = MENU_BY_ID[screen];
  return (
    <ScreenFrame code={entry.code} title={entry.id} subtitle={entry.ja}>
      <section className="panel planned">
        <p className="planned__code mono">
          <span className="glitch" data-text="ACCESS DENIED">
            ACCESS DENIED
          </span>
        </p>
        <h2 className="planned__title">この機能は未実装です</h2>
        <p className="planned__lead">
          <strong>{entry.id}</strong>（{entry.ja}）は <strong className="planned__phase">PHASE {entry.phase}</strong> で実装予定です。現在は利用できません。
        </p>
        {entry.plannedFeatures && (
          <>
            <p className="section-label">PLANNED FEATURES 予定している機能</p>
            <ul className="planned__list">
              {entry.plannedFeatures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </>
        )}
        <div className="planned__actions">
          <button type="button" className="btn btn--primary" onClick={() => nav({ name: 'lobby' })}>
            LOBBY に戻る
          </button>
          <button type="button" className="btn" onClick={() => nav({ name: 'memory', tab: 'list' })}>
            MEMORY を見る
          </button>
        </div>
      </section>
    </ScreenFrame>
  );
}
