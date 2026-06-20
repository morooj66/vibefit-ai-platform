import type { ReactNode } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';

function resolveRouterMode(): 'hash' | 'browser' {
  const envMode = import.meta.env.VITE_ROUTER_MODE?.trim().toLowerCase();
  if (envMode === 'hash') return 'hash';

  const hfMode = window.huggingface?.variables?.VITE_ROUTER_MODE?.trim().toLowerCase();
  if (hfMode === 'hash') return 'hash';

  return 'browser';
}

export function AppRouter({ children }: { children: ReactNode }) {
  const mode = resolveRouterMode();

  if (mode === 'hash') {
    return <HashRouter>{children}</HashRouter>;
  }

  return <BrowserRouter>{children}</BrowserRouter>;
}
