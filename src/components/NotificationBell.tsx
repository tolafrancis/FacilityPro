import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../lib/queries';
import { formatDate } from '../lib/ui';

export default function NotificationBell() {
  const { t, i18n } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notifications = useNotifications(user?.id);
  const [open, setOpen] = useState(false);

  // New notifications arrive live (Supabase Realtime, RLS applies); the
  // 60-second poll in useNotifications is the fallback.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fp_notifications', filter: `user_id=eq.${user.id}` },
        () => void queryClient.invalidateQueries({ queryKey: ['notifications', user.id] })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const items = notifications.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('fp_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const ids = items.filter((n) => !n.read_at).map((n) => n.id);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('fp_notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
        aria-label={t('notifications.title')}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-line bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-4 py-2">
              <p className="text-sm font-medium text-ink">{t('notifications.title')}</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  className="text-xs font-medium text-brand hover:text-brand-600"
                >
                  {t('notifications.markAllRead')}
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-auto">
              {items.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-ink-muted">
                  {t('notifications.empty')}
                </li>
              ) : (
                items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.read_at) markRead.mutate(n.id);
                        if (n.link) {
                          setOpen(false);
                          navigate(n.link);
                        }
                      }}
                      className={`flex w-full flex-col items-start gap-0.5 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface ${
                        n.read_at ? '' : 'bg-brand-50/50'
                      }`}
                    >
                      <span className="text-sm font-medium text-ink">{n.title}</span>
                      {n.body && <span className="text-xs text-ink-muted">{n.body}</span>}
                      <span className="text-[11px] text-ink-muted">{formatDate(n.created_at, lng)}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
