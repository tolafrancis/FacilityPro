import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';

// App management (migration 0088): flags, announcements, settings, templates.

const num = z.coerce.number();
const nstr = z.string().nullable();

export const FlagSchema = z.object({
  key: z.string(), kind: z.enum(['feature', 'module']), description: nstr, enabled: z.boolean(), rollout_pct: num,
  updated_at: z.string(), overrides_on: num, overrides_off: num, tenants_on: num, tenants_total: num,
});
export type Flag = z.infer<typeof FlagSchema>;

export function useFlags() {
  return useQuery({
    queryKey: ['admin_flags'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_flags');
      if (error) throw error;
      return z.array(FlagSchema).parse(data ?? []);
    },
  });
}

export const AnnouncementSchema = z.object({
  id: z.string(), title: z.string(), body: z.string(), level: z.enum(['info', 'warning', 'critical']),
  audience: z.enum(['all', 'plans', 'tenants']), plan_codes: z.array(z.string()), org_ids: z.array(z.string()),
  published_at: nstr, expires_at: nstr, created_at: z.string(), state: z.enum(['draft', 'scheduled', 'live', 'ended']),
  tenants: num, dismissed: num, author_email: nstr,
});
export type AdminAnnouncement = z.infer<typeof AnnouncementSchema>;

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: ['admin_announcements'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_announcements');
      if (error) throw error;
      return z.array(AnnouncementSchema).parse(data ?? []);
    },
  });
}

export const SettingsSchema = z.object({
  app_name: z.string(), default_lng: z.string(), supported_lngs: z.array(z.string()), default_timezone: z.string(),
  email_from_name: z.string(), email_from_address: nstr, support_email: nstr, maintenance_mode: z.boolean(),
  maintenance_message: nstr, maintenance_until: nstr, mobile_min_version: nstr, mobile_latest_version: nstr,
  mobile_force_update: z.boolean(), updated_at: z.string(),
});
export type PlatformSettings = z.infer<typeof SettingsSchema>;

export function usePlatformSettings() {
  return useQuery({
    queryKey: ['admin_platform_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_platform_settings').select('*').eq('id', 1).single();
      if (error) throw error;
      return SettingsSchema.parse(data);
    },
  });
}

export const TemplateSchema = z.object({
  key: z.string(), channel: z.enum(['email', 'sms']), lng: z.string(), subject: nstr, body: z.string(),
  variables: z.array(z.string()), updated_at: z.string(),
});
export type Template = z.infer<typeof TemplateSchema>;

export function useTemplates() {
  return useQuery({
    queryKey: ['admin_templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_message_templates').select('*').order('key').order('lng');
      if (error) throw error;
      return z.array(TemplateSchema).parse(data ?? []);
    },
  });
}

/** Same filling as the database (fp_render_template), for the preview. */
export function renderTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

/** Placeholders used in a template that it doesn't declare. */
export function unknownPlaceholders(text: string, allowed: string[]) {
  return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).filter((k) => !allowed.includes(k)))];
}

export const VERSION = /^\d{1,4}(\.\d{1,4}){0,2}$/;
export function compareVersions(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
