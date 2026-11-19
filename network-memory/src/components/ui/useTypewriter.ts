import { useEffect, useState } from 'react';

/** 文字送り演出。演出軽量モードでは即時表示する */
export function useTypewriter(text: string, msPerChar = 45): string {
  const reduced =
    typeof document !== 'undefined' &&
    (document.documentElement.dataset.fx === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [count, setCount] = useState(reduced ? text.length : 0);

  useEffect(() => {
    if (reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let i = 0;
    const chars = Array.from(text);
    const t = window.setInterval(() => {
      i++;
      setCount(i);
      if (i >= chars.length) window.clearInterval(t);
    }, msPerChar);
    return () => window.clearInterval(t);
  }, [text, msPerChar, reduced]);

  return Array.from(text).slice(0, count).join('');
}
