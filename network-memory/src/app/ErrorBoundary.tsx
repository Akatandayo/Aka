import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** 描画中の予期しないエラーで画面が真っ白にならないようにする */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[NETWORK] 予期しないエラー', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="panel" style={{ maxWidth: 520 }}>
          <p className="mono" style={{ color: 'var(--c-error)', letterSpacing: '0.2em', fontSize: 12 }}>
            !! SYSTEM ERROR
          </p>
          <h1 style={{ fontFamily: 'var(--f-body)', fontSize: 20, margin: '8px 0' }}>予期しないエラーが発生しました</h1>
          <p className="dim" style={{ fontSize: 14 }}>
            セーブデータは自動保存されています。LOBBY に戻るか、ページを再読み込みしてください。
          </p>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: 'var(--c-text-mute)', margin: '12px 0' }}>
            {this.state.error.message}
          </pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                window.location.hash = '#/lobby';
                this.setState({ error: null });
              }}
            >
              LOBBY に戻る
            </button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              再読み込み
            </button>
          </div>
        </div>
      </div>
    );
  }
}
