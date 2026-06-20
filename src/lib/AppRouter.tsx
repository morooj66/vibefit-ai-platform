import type { ReactNode } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';

function readHuggingFaceRouterMode(): string | undefined {
  try {
    const value = window.huggingface?.variables?.VITE_ROUTER_MODE;
    return typeof value === 'string' ? value.trim().toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

function resolveRouterMode(): 'hash' | 'browser' {
  const envMode = import.meta.env.VITE_ROUTER_MODE?.trim().toLowerCase();
  if (envMode === 'hash') return 'hash';

  const hfMode = readHuggingFaceRouterMode();
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
