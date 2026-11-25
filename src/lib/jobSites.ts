import { supabase } from './supabase';

// Sites comuns usados nas vagas, para quando o link completo não estiver disponível.
const KNOWN_SITE_URLS: Record<string, string> = {
  linkedin: 'https://www.linkedin.com',
  gupy: 'https://portal.gupy.io',
  indeed: 'https://br.indeed.com',
  glassdoor: 'https://www.glassdoor.com.br',
  catho: 'https://www.catho.com.br',
  'vagas.com': 'https://www.vagas.com.br',
  infojobs: 'https://www.infojobs.com.br',
  trampos: 'https://trampos.co',
  programathor: 'https://programathor.com.br',
  'remote ok': 'https://remoteok.com',
  wellfound: 'https://wellfound.com',
  workana: 'https://www.workana.com',
  '99jobs': 'https://www.99jobs.com',
  solides: 'https://solides.com.br',
  sólides: 'https://solides.com.br',
  kenoby: 'https://kenoby.com',
  greenhouse: 'https://boards.greenhouse.io',
  lever: 'https://jobs.lever.co',
  workday: 'https://www.workday.com',
  smartrecruiters: 'https://jobs.smartrecruiters.com',
  ashby: 'https://jobs.ashbyhq.com',
};

function baseUrlForSite(name: string): string | null {
  return KNOWN_SITE_URLS[name.trim().toLowerCase()] ?? null;
}

function baseUrlFromJobLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return null;
  }
}

// Adiciona o site da vaga em Configurações quando ele ainda não existe.
// É um extra do cadastro pelo chat: falhas aqui nunca devem impedir a vaga de ser salva.
export async function ensureJobSite(site: string, url: string | null): Promise<void> {
  const name = site.trim();
  if (!name) return;

  const baseUrl = (url ? baseUrlFromJobLink(url) : null) ?? baseUrlForSite(name);
  if (!baseUrl) return;

  try {
    const { data, error } = await supabase.from('job_sites').select('id, name');
    if (error) return;

    const exists = (data ?? []).some(
      (row) => String(row.name ?? '').trim().toLowerCase() === name.toLowerCase(),
    );
    if (exists) return;

    await supabase.from('job_sites').insert({ name, url: baseUrl });
  } catch {
    // URL inválida ou falha de rede: ignora.
  }
}
