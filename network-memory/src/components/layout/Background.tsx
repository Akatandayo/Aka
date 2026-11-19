/** 全画面共通のデジタルグリッド背景 */
export function Background() {
  return (
    <div className="app-bg" aria-hidden>
      <div className="app-bg__grid" />
      <div className="app-bg__sweep" />
      <div className="app-bg__noise" />
      <div className="app-bg__scan" />
    </div>
  );
}
