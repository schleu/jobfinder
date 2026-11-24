export type JobStatus = 'nova' | 'cadastrado' | 'em_processo' | 'aprovado' | 'reprovado' | 'cancelada';

export const STATUSES: { value: JobStatus; label: string }[] = [
  { value: 'nova', label: 'Nova' },
  { value: 'cadastrado', label: 'Cadastrado' },
  { value: 'em_processo', label: 'Em processo' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'cancelada', label: 'Cancelada' },
];
export const statusLabel = (s: JobStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;

export interface Job {
  id: string; company: string; role: string; site: string; url: string | null; salary: string | null;
  status: JobStatus; status_note: string | null; applied_at: string | null; status_updated_at: string; created_at: string;
}
export interface HistoryRow { id: string; status: JobStatus; note: string | null; source: string; created_at: string }
export interface Settings { salary_min: number | null; salary_max: number | null; resume_path: string | null }
export interface JobRole { id: string; title: string }
export interface JobSite { id: string; name: string; url: string; active: boolean }

export interface ResumeAdherence { funcao: string; nota: number; justificativa: string }
export interface ResumeAnalysis {
  resumo: string;
  nivel: string;
  anos_experiencia: number;
  pontos_fortes: string[];
  pontos_fracos: string[];
  palavras_chave: string[];
  sugestoes: string[];
  aderencia_funcoes: ResumeAdherence[];
  nota_geral: number;
}
export interface ResumeAnalysisRow {
  resume_path: string;
  model: string | null;
  data: ResumeAnalysis;
  text: string | null;
  created_at: string;
}
