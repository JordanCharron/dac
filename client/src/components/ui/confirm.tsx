import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}

interface Pending extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

const Ctx = createContext<{ confirm: (opts: ConfirmOptions) => Promise<boolean> } | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...opts, resolve });
      }),
    [],
  );

  function close(value: boolean) {
    if (pending) {
      pending.resolve(value);
      setPending(null);
    }
  }

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => close(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 p-5">
              <div
                className={`rounded-full p-2 ${pending.variant === 'danger' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                {pending.title && <h3 className="mb-1 font-semibold">{pending.title}</h3>}
                <p className="text-sm text-muted-fg">{pending.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t bg-muted/30 px-4 py-3">
              <button className="btn-secondary" onClick={() => close(false)}>
                {pending.cancelLabel ?? t('common.cancel')}
              </button>
              <button
                className={pending.variant === 'danger' ? 'btn-danger' : 'btn-primary'}
                onClick={() => close(true)}
                autoFocus
              >
                {pending.confirmLabel ?? t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const c = useContext(Ctx);
  if (!c) throw new Error('ConfirmProvider missing');
  return c.confirm;
}
