import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { gameData, type GameData } from '../core/data/gameData';
import { SaveManager, createBrowserStore, parseSaveText } from '../core/save/storage';
import type { PlayerSave } from '../types/player';
import { gameReducer, type GameAction } from './gameReducer';

export interface SaveStatus {
  storage: 'local' | 'memory';
  lastSavedAt: string | null;
  error: string | null;
}

interface GameContextValue {
  data: GameData;
  save: PlayerSave | null;
  dispatch: (action: GameAction) => void;
  saveStatus: SaveStatus;
  /** 即時保存（自動保存も行われている） */
  saveNow: () => boolean;
  importSave: (text: string) => { ok: true; issues: string[] } | { ok: false; error: string };
  resetSave: () => void;
  /** 起動時に検出した問題（破損データの退避など） */
  startupNotices: string[];
}

const GameContext = createContext<GameContextValue | null>(null);

const AUTOSAVE_DELAY_MS = 400;

export function GameProvider({ children }: { children: ReactNode }) {
  const manager = useMemo(() => new SaveManager(createBrowserStore(), gameData), []);
  const [initial] = useState(() => manager.load());
  const [save, dispatch] = useReducer(
    (s: PlayerSave | null, a: GameAction) => gameReducer(s, a, gameData),
    initial.status === 'loaded' ? initial.save : null,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    storage: manager.storageKind,
    lastSavedAt: initial.status === 'loaded' ? initial.save.updatedAt : null,
    error: manager.storageKind === 'memory' ? 'この環境ではブラウザに保存できません（タブを閉じると消えます）' : null,
  });

  const startupNotices = useMemo(() => {
    const notices: string[] = [];
    if (initial.status === 'corrupted') {
      notices.push(
        `セーブデータを読み込めませんでした（${initial.error}）。` +
          (initial.backupKey ? `元のデータは ${initial.backupKey} に退避しました。` : ''),
      );
    }
    if (initial.status === 'loaded' && initial.issues.length) {
      notices.push(`セーブデータを修復しました: ${initial.issues.join(' / ')}`);
    }
    if (import.meta.env.DEV && gameData.issues.length) {
      notices.push(`マスターデータに ${gameData.issues.length} 件の問題があります（コンソール参照）`);
    }
    return notices;
  }, [initial]);

  // ---- 自動保存
  const pending = useRef<PlayerSave | null>(null);
  const flush = useCallback((): boolean => {
    const target = pending.current;
    if (!target) return true;
    pending.current = null;
    const r = manager.save(target);
    setSaveStatus((s) => (r.ok ? { ...s, lastSavedAt: r.at, error: s.storage === 'memory' ? s.error : null } : { ...s, error: r.error }));
    return r.ok;
  }, [manager]);

  useEffect(() => {
    if (!save) {
      pending.current = null;
      return;
    }
    pending.current = save;
    const t = window.setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [save, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  // ---- 演出設定を DOM に反映
  const fx = save?.settings.fx ?? 'full';
  useEffect(() => {
    document.documentElement.dataset.fx = fx;
  }, [fx]);

  const saveNow = useCallback(() => {
    if (!save) return false;
    pending.current = save;
    return flush();
  }, [save, flush]);

  const importSave = useCallback<GameContextValue['importSave']>(
    (text) => {
      const r = parseSaveText(text, gameData);
      if (!r.ok) return r;
      dispatch({ type: 'LOAD', save: r.save });
      return { ok: true, issues: r.issues };
    },
    [],
  );

  const resetSave = useCallback(() => {
    pending.current = null;
    manager.clear();
    dispatch({ type: 'RESET' });
    setSaveStatus((s) => ({ ...s, lastSavedAt: null }));
  }, [manager]);

  const value = useMemo<GameContextValue>(
    () => ({ data: gameData, save, dispatch, saveStatus, saveNow, importSave, resetSave, startupNotices }),
    [save, saveStatus, saveNow, importSave, resetSave, startupNotices],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame は GameProvider の内側で使用してください');
  return ctx;
}

/** セーブデータが存在する前提の画面用 */
export function usePlayer(): GameContextValue & { save: PlayerSave } {
  const ctx = useGame();
  if (!ctx.save) throw new Error('セーブデータがありません');
  return ctx as GameContextValue & { save: PlayerSave };
}
