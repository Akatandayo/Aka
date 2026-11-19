import { DEFAULT_QUERY, type MemoryQuery } from '../../core/memory/query';
import { peekSessionState, useSessionState } from '../../state/sessionState';

/** MEMORY 一覧の検索条件（詳細画面の前後移動でも同じ並び順を使う） */
const KEY = 'memory.query';

export function useMemoryQuery() {
  return useSessionState<MemoryQuery>(KEY, DEFAULT_QUERY);
}

export function peekMemoryQuery(): MemoryQuery {
  return peekSessionState<MemoryQuery>(KEY, DEFAULT_QUERY);
}
