import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string };

const Ctx = createContext<{ push: (kind: Toast['kind'], message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setItems((arr) => [...arr, { id, kind, message }]);
    setTimeout(() => setItems((arr) => arr.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto rounded-lg border px-4 py-3 shadow-lg text-sm max-w-sm',
              t.kind === 'error' && 'bg-danger text-danger-fg border-danger',
              t.kind === 'success' && 'bg-success text-white border-success',
              t.kind === 'info' && 'bg-card text-fg border-border',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('ToastProvider missing');
  return c;
}
