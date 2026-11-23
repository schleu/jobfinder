import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Job, JobStatus } from '../types';

export interface NewJob {
  company: string; role: string; site: string; url: string | null; salary: string | null;
  status: JobStatus; status_note: string | null;
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setJobs(data as Job[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: JobStatus) => {
    const { error } = await supabase.from('jobs').update({ status }).eq('id', id);
    if (error) setError(error.message);
    else load();
  };

  const addJob = async (job: NewJob): Promise<string | null> => {
    const { error } = await supabase.from('jobs').insert(job);
    if (error) {
      setError(error.message);
      return error.message;
    }
    setError(null);
    await load();
    return null;
  };

  return { jobs, error, setStatus, addJob, reload: load };
}
