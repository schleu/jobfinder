// Edge Function "chat": conversa com IA gratuita usando as vagas do usuário como contexto.
// Também extrai os dados de uma vaga (texto ou link) para o usuário confirmar no app.
// A chave da IA fica só aqui (secrets), nunca no bundle do front.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { scrapeJobLink, siteFromUrl, type ScrapedJob } from './scrape.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface JobRow {
  company: string;
  role: string;
  site: string;
  url: string | null;
  salary: string | null;
  contract_type: string | null;
  work_model: string | null;
  status: string;
  status_note: string | null;
  applied_at: string | null;
  status_updated_at: string;
}

interface Preferences {
  contract_type: string | null;
  work_model: string | null;
}

type ContractType = 'clt' | 'pj';
type WorkModel = 'remoto' | 'hibrido' | 'presencial';
type JobStatus = 'nova' | 'cadastrado' | 'em_processo' | 'aprovado' | 'reprovado' | 'cancelada';
type JsonObject = Record<string, unknown>;

interface JobDraft {
  company: string;
  role: string;
  site: string;
  url: string | null;
  salary: string | null;
  description: string | null;
  contract_type: ContractType | null;
  work_model: WorkModel | null;
  status: JobStatus;
  status_note: string | null;
}

interface CompletionResult {
  text: string | null;
  model: string;
  fallback: boolean;
  failure: string;
  status: number;
}

const CONTRACT_LABEL: Record<string, string> = { clt: 'CLT', pj: 'PJ' };
const WORK_LABEL: Record<string, string> = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' };
const STATUS_VALUES = ['nova', 'cadastrado', 'em_processo', 'aprovado', 'reprovado', 'cancelada'] as const;

const contractText = (v: string | null) => CONTRACT_LABEL[v ?? ''] ?? 'não informado';
const workText = (v: string | null) => WORK_LABEL[v ?? ''] ?? 'não informado';

const STATUS_LABEL: Record<string, string> = {
  nova: 'Nova',
  cadastrado: 'Cadastrado',
  em_processo: 'Em processo',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  cancelada: 'Cancelada',
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

// Qualquer provedor compatível com a API da OpenAI serve; basta trocar AI_PROVIDER.
const BASE_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
};

// Modelos free oferecidos no seletor do chat. O secret AI_MODELS (separado por vírgula)
// substitui esta lista; o AI_MODEL padrão é sempre permitido.
const DEFAULT_MODELS = [
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'inclusionai/ling-3.2-flash:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'baidu/ernie-5.5-flash-preview:free',
  'nvidia/nemotron-3.5-lightning:free',
];

// Troca de modelo automática em caso de 429/5xx (free tier costuma limitar por provedor).
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 40_000;

const EXTRACTION_SYSTEM = [
  'Você extrai dados de vagas de emprego para um painel de candidaturas.',
  'Responda SOMENTE com um objeto JSON válido, sem markdown, sem comentários e sem texto fora do JSON.',
  'Formato exato:',
  '{"company":"","role":"","site":"","url":"","salary":"","description":null,"contract_type":null,"work_model":null,"status":"nova","status_note":null}',
  '',
  'Regras:',
  '- company: empresa contratante. role: título/cargo da vaga.',
  '- site: plataforma onde a vaga está publicada (LinkedIn, Gupy, Indeed...). Se não souber, deduza do domínio do link.',
  '- url: link completo da vaga.',
  '- salary: valor como aparece (ex.: "R$ 8.000"). Se a vaga não informar, use "Não informado"; se disser que será combinado na entrevista, use "Na entrevista".',
  '- description: descrição da vaga em texto simples, sem HTML (responsabilidades, requisitos, benefícios). null se não houver.',
  '- contract_type: "clt", "pj" ou null. work_model: "remoto", "hibrido", "presencial" ou null.',
  '- status: "nova" por padrão; "cadastrado" se o usuário já se candidatou; "em_processo" se já está em processo.',
  '- status_note: observação curta e útil (requisitos, tecnologias), ou null.',
  '- Nunca invente empresa, cargo, salário ou descrição. Deixe "" (ou null em description) quando o dado não estiver disponível.',
  '- Use os dados raspados da página e o link quando existirem; se o link estiver bloqueado, use o que o usuário escreveu.',
].join('\n');

function buildSystemPrompt(jobs: JobRow[], prefs: Preferences) {
  const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const counts = new Map<string, number>();
  for (const j of jobs) counts.set(j.status, (counts.get(j.status) ?? 0) + 1);

  const summary = jobs.length
    ? [...counts.entries()]
        .map(([status, n]) => `${STATUS_LABEL[status] ?? status}: ${n}`)
        .join(' · ')
    : 'nenhuma vaga cadastrada';

  const list = jobs.length
    ? jobs
        .map((j) => {
          const parts = [
            `${j.company} — ${j.role}`,
            `site: ${j.site}`,
            `status: ${STATUS_LABEL[j.status] ?? j.status}`,
            `salário: ${j.salary ?? 'não informado'}`,
            `contratação: ${contractText(j.contract_type)}`,
            `modelo: ${workText(j.work_model)}`,
            `atualizada em: ${fmtDate(j.status_updated_at)}`,
          ];
          if (j.applied_at) parts.push(`candidatura em: ${fmtDate(j.applied_at)}`);
          if (j.status_note) parts.push(`observação: ${j.status_note}`);
          if (j.url) parts.push(`link: ${j.url}`);
          return `- ${parts.join(' | ')}`;
        })
        .join('\n')
    : '(o usuário ainda não cadastrou vagas)';

  return [
    'Você é o assistente do jobFinder, um painel de acompanhamento de candidaturas a vagas.',
    'Responda sempre em português do Brasil, de forma curta, direta e prática.',
    `Hoje é ${today}.`,
    '',
    'Regras:',
    '- Use apenas os dados de vagas fornecidos abaixo; nunca invente empresas, salários ou status.',
    '- Se a resposta não estiver nos dados, diga o que falta e como o usuário pode cadastrar.',
    '- Ao listar vagas, use bullets curtos com empresa, função e status.',
    '- Não use tabelas. Markdown simples (negrito, listas) é bem-vindo.',
    '- Quando fizer sentido, sugira próximos passos de candidatura, follow-up ou preparação de entrevista.',
    '- Para adicionar uma vaga, o usuário pode colar o link ou descrever os dados; o app mostra um cartão de confirmação.',
    '',
    `Resumo das vagas (${jobs.length} no total): ${summary}`,
    `Preferências do usuário — contratação: ${contractText(prefs.contract_type)}, modelo de trabalho: ${workText(prefs.work_model)}.`,
    '',
    'Vagas:',
    list,
  ].join('\n');
}

function allowedModels(defaultModel: string) {
  const envList = (Deno.env.get('AI_MODELS') ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const base = envList.length ? envList : DEFAULT_MODELS;
  return [...new Set([defaultModel, ...base])];
}

// ---------------------------------------------------------------------------
// Detecção da intenção de adicionar vaga e extração dos dados
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s<>"')]+/i;
const JOB_NOUN_RE = /\b(vaga|vagas|candidatura|emprego|posi[çc][ãa]o|oportunidade)\b/i;
const ADD_VERB = '(adicion\\w*|cadastr\\w*|salv\\w*|inclu\\w*|registr\\w*|inser\\w*|cri\\w*)';

function firstUrl(text: string): string | null {
  const match = text.match(URL_RE);
  return match ? match[0].replace(/[.,;]+$/, '') : null;
}

function detectJobIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  const hasUrl = URL_RE.test(t);
  const addVerb = new RegExp(`\\b${ADD_VERB}\\b`, 'i');

  // Link + verbo/nome de vaga, ou um link praticamente sozinho, é cadastro.
  if (hasUrl) {
    if (JOB_NOUN_RE.test(t) || addVerb.test(t)) return true;
    return t.replace(URL_RE, '').trim().length <= 20;
  }

  if (!JOB_NOUN_RE.test(t)) return false;

  const imperative = new RegExp(`(^|[.!?]\\s*)${ADD_VERB}\\b`, 'i').test(t)
    || new RegExp(`\\b(quero|queria|preciso|vou|pode|poderia|consegue|conseguiria|gostaria de|me ajuda a|me ajude a)\\s+${ADD_VERB}\\b`, 'i').test(t);

  // Perguntas do tipo "como adicionar uma vaga?" são conversa, não pedido de cadastro.
  return imperative && !/^\s*(como|onde|quando|por que|porque|qual|quais|quanto|quantos|quantas)\b/i.test(t);
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 300) : '';
}

function asNullable(value: unknown): string | null {
  return asText(value) || null;
}

function asDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, 8000) : null;
}

// Salário: valor informado, "Não informado" (vira null) ou "Na entrevista".
function normalizeSalary(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (/^n[ãa]o informad[oa]$/i.test(text)) return null;
  if (!/\d/.test(text) && /(a combinar|combinar|na entrevista|entrevista|negoci[áa]vel|a definir|compat[íi]vel com o mercado|negotiable|to be discussed)/i.test(text)) {
    return 'Na entrevista';
  }
  return text.slice(0, 300);
}

function normalizeContract(value: unknown): ContractType | null {
  const text = asText(value).toLowerCase();
  if (!text) return null;
  if (/\bpj\b|pessoa jur[ií]dica|contractor|freela/.test(text)) return 'pj';
  if (/\bclt\b|pessoa f[ií]sica|efetivo/.test(text)) return 'clt';
  return null;
}

function normalizeWorkModel(value: unknown): WorkModel | null {
  const text = asText(value).toLowerCase();
  if (!text) return null;
  if (/remot|home.?office|telecommut/.test(text)) return 'remoto';
  if (/h[iíy]brid/.test(text)) return 'hibrido';
  if (/presencial|on.?site/.test(text)) return 'presencial';
  return null;
}

function normalizeStatus(value: unknown): JobStatus {
  const text = asText(value).toLowerCase().replace(/\s+/g, '_');
  return (STATUS_VALUES as readonly string[]).includes(text) ? text as JobStatus : 'nova';
}

function parseJsonObject(raw: string): JsonObject | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : null;
  } catch {
    return null;
  }
}

function normalizeJobDraft(data: JsonObject | null, rawUrl: string | null, scraped: ScrapedJob | null): JobDraft {
  const url = asNullable(data?.url) || scraped?.url || rawUrl;
  return {
    company: asText(data?.company) || scraped?.company || '',
    role: asText(data?.role) || scraped?.role || '',
    site: asText(data?.site) || scraped?.site || siteFromUrl(url) || '',
    url,
    salary: normalizeSalary(asNullable(data?.salary) ?? scraped?.salary ?? null),
    description: asDescription(data?.description) ?? scraped?.description ?? null,
    contract_type: normalizeContract(data?.contract_type),
    work_model: normalizeWorkModel(data?.work_model) ?? scraped?.work_model ?? null,
    status: normalizeStatus(data?.status),
    status_note: asNullable(data?.status_note) ?? scraped?.status_note ?? null,
  };
}

function buildExtractionPrompt(userText: string, rawUrl: string | null, scraped: ScrapedJob | null): string {
  const sections = [
    'Extraia os dados da vaga abaixo.',
    '',
    'Mensagem do usuário:',
    `"""${userText.slice(0, 2000)}"""`,
  ];

  if (rawUrl) sections.push('', `Link da vaga: ${rawUrl}`);
  if (scraped?.hints) sections.push('', `Dados raspados da página:\n${scraped.hints}`);
  if (scraped?.text) sections.push('', `Texto extraído da página:\n${scraped.text}`);
  if (scraped?.error) sections.push('', `Aviso: ${scraped.error}`);

  return sections.join('\n');
}

function draftReply(job: JobDraft, scraped: ScrapedJob | null, aiFailed: boolean): string {
  if (aiFailed) {
    const link = scraped?.error ? ' nem abrir o link' : '';
    return `Não consegui falar com a IA agora${link}. Preencha os dados abaixo para adicionar a vaga.`;
  }

  const missing = [
    job.company ? '' : 'empresa',
    job.role ? '' : 'função',
    job.site ? '' : 'site',
  ].filter(Boolean);

  const linkNote = scraped?.error ? ' Não consegui abrir o link, então complete o que faltar.' : '';

  if (missing.length) {
    return `Encontrei parte dos dados. Complete ${missing.join(', ')} abaixo e confirme para adicionar a vaga.${linkNote}`;
  }
  return `Encontrei esta vaga. Revise os campos abaixo e confirme para adicionar.${linkNote}`;
}

// ---------------------------------------------------------------------------
// Chamada ao provedor com fallback de modelo
// ---------------------------------------------------------------------------

async function requestCompletion(opts: {
  baseUrl: string;
  headers: Record<string, string>;
  candidates: string[];
  requested: string;
  messages: unknown[];
  temperature: number;
  maxTokens: number;
}): Promise<CompletionResult> {
  let failure = '';
  let lastStatus = 0;

  for (const candidate of opts.candidates) {
    try {
      const res = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: opts.headers,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        body: JSON.stringify({
          model: candidate,
          messages: opts.messages,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
        }),
      });

      if (!res.ok) {
        lastStatus = res.status;
        failure = `A IA respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`;
        // 429/5xx podem ser do provedor: vale tentar outro modelo. Outros erros não.
        if (res.status !== 429 && res.status < 500) break;
        continue;
      }

      const raw = await res.text();
      let content: unknown;
      try {
        const data = JSON.parse(raw);
        content = data?.choices?.[0]?.message?.content;
      } catch {
        return {
          text: null,
          model: candidate,
          fallback: candidate !== opts.requested,
          failure: 'Resposta inesperada da IA.',
          status: 502,
        };
      }

      if (typeof content === 'string' && content.trim()) {
        return {
          text: content.trim(),
          model: candidate,
          fallback: candidate !== opts.requested,
          failure: '',
          status: 200,
        };
      }

      lastStatus = 200;
      failure = 'A IA não retornou texto. Tente de novo.';
    } catch (e) {
      lastStatus = 0;
      failure = `Não foi possível falar com a IA: ${(e as Error).message}`;
    }
  }

  return { text: null, model: opts.requested, fallback: false, failure, status: lastStatus };
}

function failureResponse(result: CompletionResult) {
  if (result.status === 429) {
    return json(
      { error: 'Os modelos testados estão temporariamente limitados (429). Tente novamente em alguns minutos ou escolha outro modelo no seletor.' },
      502,
    );
  }
  return json({ error: result.failure || 'Nenhum modelo conseguiu responder. Tente novamente.' }, 502);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const provider = (Deno.env.get('AI_PROVIDER') ?? 'openrouter').toLowerCase();
  const baseUrl = BASE_URLS[provider];
  const apiKey = Deno.env.get('AI_API_KEY');
  const defaultModel = Deno.env.get('AI_MODEL') ?? 'google/gemma-4-31b-it:free';

  if (!baseUrl) return json({ error: `Provedor "${provider}" não suportado. Use: ${Object.keys(BASE_URLS).join(', ')}.` }, 500);
  if (!apiKey) return json({ error: 'AI_API_KEY não configurada nos secrets da Edge Function.' }, 500);

  const allowed = allowedModels(defaultModel);

  // Lista usada pelo seletor de modelo do front.
  if (body.action === 'models') {
    return json({ models: allowed, default: defaultModel });
  }

  let messages: ChatMessage[] = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];

  // Mantém só o histórico recente e limita o tamanho de cada mensagem (economia de tokens).
  messages = messages
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return json({ error: 'Envie ao menos uma mensagem do usuário.' }, 400);
  }

  const requested = typeof body.model === 'string' && allowed.includes(body.model) ? body.model : defaultModel;
  const candidates = [requested, ...allowed.filter((m) => m !== requested)].slice(0, MAX_ATTEMPTS);
  const lastUserMessage = messages[messages.length - 1].content;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = Deno.env.get('AI_APP_URL') ?? 'http://localhost:5173';
    headers['X-Title'] = 'jobFinder';
  }

  // Pedido de cadastro: raspa o link (quando houver), extrai a vaga com a IA
  // e devolve um rascunho para o front confirmar.
  if (detectJobIntent(lastUserMessage)) {
    const rawUrl = firstUrl(lastUserMessage);
    const scraped = rawUrl ? await scrapeJobLink(rawUrl) : null;

    const result = await requestCompletion({
      baseUrl,
      headers,
      candidates,
      requested,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM },
        { role: 'user', content: buildExtractionPrompt(lastUserMessage, rawUrl, scraped) },
      ],
      temperature: 0.1,
      maxTokens: 800,
    });

    const parsed = result.text ? parseJsonObject(result.text) : null;
    const job = normalizeJobDraft(parsed, rawUrl, scraped);

    // Se nem a IA nem o link renderam nada aproveitável, devolve o erro original.
    if (!result.text && !job.company && !job.role && !job.site && !job.url) {
      return failureResponse(result);
    }

    return json({
      reply: draftReply(job, scraped, !result.text),
      job,
      model: result.model,
      requested_model: requested,
      fallback: result.fallback,
    });
  }

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('company, role, site, url, salary, contract_type, work_model, status, status_note, applied_at, status_updated_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (jobsError) return json({ error: `Falha ao ler as vagas: ${jobsError.message}` }, 500);

  // Preferências são opcionais: se a migração ainda não foi aplicada, o chat segue sem elas.
  const { data: prefs } = await supabase
    .from('user_settings')
    .select('contract_type, work_model')
    .maybeSingle();

  const systemPrompt = buildSystemPrompt((jobs ?? []) as JobRow[], {
    contract_type: (prefs?.contract_type as string | null) ?? null,
    work_model: (prefs?.work_model as string | null) ?? null,
  });

  const result = await requestCompletion({
    baseUrl,
    headers,
    candidates,
    requested,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: 0.4,
    maxTokens: 900,
  });

  if (!result.text) return failureResponse(result);

  return json({
    reply: result.text,
    model: result.model,
    requested_model: requested,
    fallback: result.fallback,
  });
});
