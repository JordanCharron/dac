import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';

export type Me = {
  id: number;
  username: string;
  role: 'admin' | 'client';
  must_change_password: boolean;
  client_id: number | null;
} | null;

const Ctx = createContext<{
  me: Me;
  loading: boolean;
  refresh: () => void;
  logout: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await apiGet<NonNullable<Me>>('/api/auth/me');
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });

  const value = useMemo(
    () => ({
      me: data ?? null,
      loading: isLoading,
      refresh: () => refetch(),
      logout: async () => {
        await apiPost('/api/auth/logout');
        qc.clear();
        refetch();
      },
    }),
    [data, isLoading, qc, refetch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
