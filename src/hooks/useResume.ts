import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { describeFunctionError } from '../lib/edgeFunction';
import type { ResumeAnalysis, ResumeAnalysisRow, Settings } from '../types';

const MAX_RESUME_MB = 5;

// Valida o arquivo antes do upload. Retorna a mensagem de erro ou null se estiver ok.
async function validateResumeFile(file: File): Promise<string | null> {
  const looksPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!looksPdf) return 'Formato inválido. Envie o currículo em PDF (.pdf).';

  if (file.size === 0) return 'O arquivo está vazio. Envie um PDF válido.';
  if (file.size > MAX_RESUME_MB * 1024 * 1024) {
    return `O PDF deve ter no máximo ${MAX_RESUME_MB} MB.`;
  }

  // Extensão e MIME podem mentir: confere a assinatura "%PDF-" no início do arquivo.
  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const signature = String.fromCharCode(...head);
    if (signature !== '%PDF-') return 'O arquivo não parece ser um PDF válido.';
  } catch {
    return 'Não foi possível ler o arquivo. Tente novamente.';
  }

  return null;
}

export function useResume(userId: string) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [history, setHistory] = useState<ResumeAnalysisRow[]>([]);
  const [analysis, setAnalysis] = useState<ResumeAnalysisRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([
      supabase.from('user_settings').select('*').maybeSingle(),
      supabase
        .from('resume_analyses')
        .select('id, resume_path, model, data, text, created_at')
        .order('created_at', { ascending: false }),
    ]);
    if (s.data) setSettings(s.data as Settings);
    const rows = (a.data ?? []) as ResumeAnalysisRow[];
    setHistory(rows);
    setAnalysis(rows[0] ?? null);
    setError(s.error?.message ?? a.error?.message ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const uploadResume = async (file: File): Promise<boolean> => {
    const invalid = await validateResumeFile(file);
    if (invalid) {
      setError(invalid);
      return false;
    }

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

    // O histórico é preservado: análises antigas continuam disponíveis na lista.
    setSettings((prev) => ({
      salary_min: null, salary_max: null, contract_type: null, work_model: null, ...prev, resume_path: path,
    }));
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
      setError(await describeFunctionError(invokeError, 'analyze-resume'));
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
      text: typeof data?.text === 'string' ? data.text : null,
    };

    const { error: saveError } = await supabase.from('resume_analyses').insert(row);

    if (saveError) {
      setError(`Análise gerada, mas não foi salva: ${saveError.message}`);
      // Mostra o resultado mesmo sem ter salvo no histórico.
      setAnalysis({
        id: '',
        resume_path: row.resume_path,
        model: row.model,
        data: result,
        text: row.text,
        created_at: new Date().toISOString(),
      });
    } else {
      // Recarrega para trazer a análise nova no topo do histórico.
      await load();
    }

    setAnalyzing(false);
  };

  const removeAnalysis = async (id: string) => {
    const { error: deleteError } = await supabase.from('resume_analyses').delete().eq('id', id);
    if (deleteError) {
      setError(deleteError.message);
      return false;
    }
    await load();
    return true;
  };

  return {
    settings,
    history,
    analysis,
    loading,
    uploading,
    analyzing,
    error,
    uploadResume,
    analyzeResume,
    removeAnalysis,
    reload: load,
  };
}
