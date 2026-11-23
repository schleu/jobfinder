import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { JobRole, JobSite, Settings } from '../types';

export function useSettings(userId: string) {
  const [settings, setSettings] = useState<Settings>({ salary_min: null, salary_max: null, resume_path: null });
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [sites, setSites] = useState<JobSite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, r, w] = await Promise.all([
      supabase.from('user_settings').select('*').maybeSingle(),
      supabase.from('job_roles').select('*').order('title'),
      supabase.from('job_sites').select('*').order('name'),
    ]);
    if (s.data) setSettings(s.data as Settings);
    setRoles((r.data ?? []) as JobRole[]);
    setSites((w.data ?? []) as JobSite[]);
    setError(s.error?.message ?? r.error?.message ?? w.error?.message ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    setError(error?.message ?? null);
    await load();
  };
  const saveSettings = (patch: Partial<Settings>) =>
    run(supabase.from('user_settings').upsert({ user_id: userId, ...settings, ...patch }));
  return {
    settings, roles, sites, error, saveSettings,
    addRole: (title: string) => run(supabase.from('job_roles').insert({ title })),
    removeRole: (id: string) => run(supabase.from('job_roles').delete().eq('id', id)),
    addSite: (name: string, url: string) => run(supabase.from('job_sites').insert({ name, url })),
    removeSite: (id: string) => run(supabase.from('job_sites').delete().eq('id', id)),
    toggleSite: (s: JobSite) => run(supabase.from('job_sites').update({ active: !s.active }).eq('id', s.id)),
  };
}
