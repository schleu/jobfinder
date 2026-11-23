import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ResumeAnalysis, ResumeAnalysisRow, Settings } from '../types';

export function useResume(userId: string) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysisRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([
      supabase.from('user_settings').select('*').maybeSingle(),
      supabase.from('resume_analyses').select('resume_path, model, data, created_at').maybeSingle(),
    ]);
    if (s.data) setSettings(s.data as Settings);
    setAnalysis((a.data as ResumeAnalysisRow | null) ?? null);
    setError(s.error?.message ?? a.error?.message ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const uploadResume = async (file: File): Promise<boolean> => {
    setUploading(true);
    setError(null);

    const path = `${userId}/resume.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(path, file, { upsert: true, contentType: 'application/pdf' });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return false;
    }

    // Preserva a faixa salarial: o upsert sem essas colunas as zeraria.
    const { error: settingsError } = await supabase.from('user_settings').upsert({
      user_id: userId,
      salary_min: settings?.salary_min ?? null,
      salary_max: settings?.salary_max ?? null,
      resume_path: path,
    });

    if (settingsError) {
      setError(settingsError.message);
      setUploading(false);
      return false;
    }

    // A análise anterior não vale mais para o novo PDF.
    await supabase.from('resume_analyses').delete().eq('user_id', userId);

    setSettings((prev) => ({ salary_min: null, salary_max: null, ...prev, resume_path: path }));
    setAnalysis(null);
    setUploading(false);
    return true;
  };

  const analyzeResume = async () => {
    if (!settings?.resume_path) {
      setError('Envie um currículo em PDF antes de analisar.');
      return;
    }

    setAnalyzing(true);
    setError(null);

    const { data, error: invokeError } = await supabase.functions.invoke('analyze-resume', { body: {} });

    if (invokeError) {
      // Erros HTTP vêm da Edge Function no corpo da resposta (context).
      let detail: string | null = null;
      try {
        const res = (invokeError as { context?: Response }).context;
        if (res && typeof res.json === 'function') detail = (await res.json())?.error ?? null;
      } catch { /* corpo não era JSON */ }
      setError(detail ?? invokeError.message ?? 'Não foi possível analisar o currículo.');
      setAnalyzing(false);
      return;
    }

    const result = data?.analysis as ResumeAnalysis | undefined;
    if (!result) {
      setError(data?.error ?? 'A IA não retornou uma análise válida.');
      setAnalyzing(false);
      return;
    }

    const row = {
      user_id: userId,
      resume_path: settings.resume_path,
      model: typeof data?.model === 'string' ? data.model : null,
      data: result,
    };

    const { error: saveError } = await supabase.from('resume_analyses').upsert(row);
    if (saveError) setError(`Análise gerada, mas não foi salva: ${saveError.message}`);

    setAnalysis({
      resume_path: row.resume_path,
      model: row.model,
      data: result,
      created_at: new Date().toISOString(),
    });
    setAnalyzing(false);
  };

  return {
    settings,
    analysis,
    loading,
    uploading,
    analyzing,
    error,
    uploadResume,
    analyzeResume,
    reload: load,
  };
}
