import { useTranslation } from 'react-i18next';
import { UserCircle, X } from 'lucide-react';
import { useImpersonation } from './ImpersonationContext';

export function ImpersonationBanner() {
  const { acting, clear } = useImpersonation();
  const { t } = useTranslation();
  if (!acting) return null;
  return (
    <div className="flex items-center gap-2 border-b border-accent/40 bg-accent/10 px-4 py-2 text-sm">
      <UserCircle className="h-4 w-4 text-accent" />
      <span className="font-medium">
        {t('impersonate.viewingAs')}: <span className="text-accent">{acting.company_name}</span>
      </span>
      <button className="btn-ghost ml-auto p-1" onClick={() => clear()} title={t('impersonate.exit')}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
