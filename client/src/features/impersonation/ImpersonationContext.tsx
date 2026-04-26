import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setActingClientId } from '@/lib/api';

type ActingClient = { id: number; company_name: string } | null;

const Ctx = createContext<{
  acting: ActingClient;
  setActing: (c: ActingClient) => void;
  clear: () => void;
} | null>(null);

const STORAGE_KEY = 'dac_acting_as';

function loadInitial(): ActingClient {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'number' && typeof parsed.company_name === 'string') return parsed;
  } catch { /* noop */ }
  return null;
}

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [acting, setActingState] = useState<ActingClient>(loadInitial);
  const qc = useQueryClient();

  useEffect(() => {
    setActingClientId(acting?.id ?? null);
    if (acting) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(acting));
    else sessionStorage.removeItem(STORAGE_KEY);
    qc.invalidateQueries();
  }, [acting, qc]);

  const setActing = useCallback((c: ActingClient) => setActingState(c), []);
  const clear = useCallback(() => setActingState(null), []);
  const value = useMemo(() => ({ acting, setActing, clear }), [acting, setActing, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useImpersonation() {
  const c = useContext(Ctx);
  if (!c) throw new Error('ImpersonationProvider missing');
  return c;
}
