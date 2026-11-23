// Edge Function "chat": conversa com IA gratuita usando as vagas do usuário como contexto.
// A chave da IA fica só aqui (secrets), nunca no bundle do front.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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
  status: string;
  status_note: string | null;
  applied_at: string | null;
  status_updated_at: string;
}

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

function buildSystemPrompt(jobs: JobRow[]) {
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
    '',
    `Resumo das vagas (${jobs.length} no total): ${summary}`,
    '',
    'Vagas:',
    list,
  ].join('\n');
}

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

  let messages: ChatMessage[];
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  // Mantém só o histórico recente e limita o tamanho de cada mensagem (economia de tokens).
  messages = messages
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return json({ error: 'Envie ao menos uma mensagem do usuário.' }, 400);
  }

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('company, role, site, url, salary, status, status_note, applied_at, status_updated_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (jobsError) return json({ error: `Falha ao ler as vagas: ${jobsError.message}` }, 500);

  const provider = (Deno.env.get('AI_PROVIDER') ?? 'openrouter').toLowerCase();
  const baseUrl = BASE_URLS[provider];
  const apiKey = Deno.env.get('AI_API_KEY');
  const model = Deno.env.get('AI_MODEL') ?? 'google/gemma-4-31b-it:free';

  if (!baseUrl) return json({ error: `Provedor "${provider}" não suportado. Use: ${Object.keys(BASE_URLS).join(', ')}.` }, 500);
  if (!apiKey) return json({ error: 'AI_API_KEY não configurada nos secrets da Edge Function.' }, 500);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = Deno.env.get('AI_APP_URL') ?? 'http://localhost:5173';
    headers['X-Title'] = 'jobFinder';
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: buildSystemPrompt((jobs ?? []) as JobRow[]) }, ...messages],
        temperature: 0.4,
        max_tokens: 900,
      }),
    });
  } catch (e) {
    return json({ error: `Não foi possível falar com a IA: ${(e as Error).message}` }, 502);
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    return json({ error: `A IA respondeu ${upstream.status}: ${raw.slice(0, 300)}` }, 502);
  }

  let reply: string | undefined;
  try {
    const data = JSON.parse(raw);
    reply = data?.choices?.[0]?.message?.content;
  } catch {
    return json({ error: 'Resposta inesperada da IA.' }, 502);
  }

  if (!reply?.trim()) return json({ error: 'A IA não retornou texto. Tente de novo.' }, 502);

  return json({ reply: reply.trim(), model });
});
