import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useTranslation } from 'react-i18next';

export function useAdminStream() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const es = new EventSource('/api/admin/stream', { withCredentials: true });
    es.addEventListener('order_submitted', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        toast.push('info', `🔔 ${t('notif.newOrder', { company: data.company_name, number: data.order_number })}`);
        qc.invalidateQueries({ queryKey: ['admin-orders'] });
        qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
        qc.invalidateQueries({ queryKey: ['admin-dashboard-metrics'] });
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRpgAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YXgAAAAAAP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A');
          audio.volume = 0.5;
          void audio.play().catch(() => {});
        } catch { /* noop */ }
      } catch { /* noop */ }
    });
    return () => es.close();
  }, [qc, toast, t]);
}
