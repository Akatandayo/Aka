import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 英数字のみ同梱フォントを使う（日本語は端末のフォント）。latin サブセットに絞って容量を抑える
import '@fontsource/chakra-petch/latin-400.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import { GameProvider } from './state/GameProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <GameProvider>
          <App />
        </GameProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
