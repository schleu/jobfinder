import { Fragment, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { describeFunctionError } from '../lib/edgeFunction';
import { ensureJobSite } from '../lib/jobSites';
import { useJobs, type NewJob } from '../hooks/useJobs';
import { normalizeSalary } from '../lib/salary';
import JobDraftCard from './JobDraftCard';
import {
  STATUSES,
  type ContractType, type JobDraft, type JobStatus, type WorkModel,
} from '../types';

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Quantas vagas em processo eu tenho?',
  'Quais vagas eu ainda não apliquei?',
  'Me ajude a priorizar as candidaturas de hoje.',
];

// Espelha DEFAULT_MODELS da Edge Function (usada até a lista real chegar).
const DEFAULT_MODELS = [
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'inclusionai/ling-3.2-flash:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'baidu/ernie-5.5-flash-preview:free',
  'nvidia/nemotron-3.5-lightning:free',
];

const storageKey = (userId: string) => `jobfinder:chat:${userId}`;
const modelKey = (userId: string) => `jobfinder:model:${userId}`;
const modelLabel = (id: string) => id.replace(/:free$/, '') + (id.endsWith(':free') ? ' (free)' : '');

// Valida o rascunho devolvido pela Edge Function antes de abrir o cartão de confirmação.
function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function toDraft(value: unknown): JobDraft | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const text = (field: unknown) => typeof field === 'string' ? field : '';

  const contract = v.contract_type === 'clt' || v.contract_type === 'pj'
    ? v.contract_type as ContractType
    : null;
  const workModel = v.work_model === 'remoto' || v.work_model === 'hibrido' || v.work_model === 'presencial'
    ? v.work_model as WorkModel
    : null;
  const status = STATUSES.some((s) => s.value === v.status) ? v.status as JobStatus : 'nova';

  return {
    company: text(v.company),
    role: text(v.role),
    site: text(v.site),
    url: safeHttpUrl(v.url),
    salary: normalizeSalary(typeof v.salary === 'string' ? v.salary : null),
    description: typeof v.description === 'string' ? v.description : null,
    contract_type: contract,
    work_model: workModel,
    status,
    status_note: typeof v.status_note === 'string' ? v.status_note : null,
  };
}

let modelsCache: { models: string[]; default: string } | null = null;

function loadHistory(userId: string): Msg[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.filter((m) => m?.role && typeof m.content === 'string') : [];
  } catch {
    return [];
  }
}

function initialModel(userId: string): string {
  try {
    const saved = localStorage.getItem(modelKey(userId));
    if (saved) return saved;
  } catch { /* storage indisponível */ }
  return modelsCache?.default ?? DEFAULT_MODELS[0];
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : p.startsWith('`') && p.endsWith('`') ? (
          <code key={i}>{p.slice(1, -1)}</code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

// Markdown mínimo: parágrafos, títulos, bullets e negrito/código inline.
function MessageText({ content }: { content: string }) {
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    out.push(
      <ul key={`ul-${out.length}`}>
        {bullets.map((b, i) => <li key={i}><Inline text={b} /></li>)}
      </ul>,
    );
    bullets = [];
  };

  content.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flush();
    if (!line.trim()) return;
    const heading = line.match(/^#+\s+(.*)$/);
    out.push(<p key={i} className={heading ? 'msg-h' : undefined}><Inline text={heading ? heading[1] : line} /></p>);
  });
  flush();

  return <div className="msg-text">{out}</div>;
}

export default function ChatPanel({ userId }: { userId: string }) {
  const { addJob } = useJobs();
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory(userId));
  const [models, setModels] = useState<string[]>(modelsCache?.models ?? DEFAULT_MODELS);
  const [model, setModel] = useState<string>(() => initialModel(userId));
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [lastFallback, setLastFallback] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  // Lista de modelos permitidos vem da Edge Function (respeita o secret AI_MODELS).
  useEffect(() => {
    let alive = true;
    const apply = (list: string[], def: string) => {
      if (!alive || !list.length) return;
      setModels(list);
      setModel((current) => (list.includes(current) ? current : list.includes(def) ? def : list[0]));
    };

    if (modelsCache) {
      apply(modelsCache.models, modelsCache.default);
    } else {
      supabase.functions.invoke('chat', { body: { action: 'models' } }).then(({ data, error: invokeError }) => {
        if (invokeError) return;
        const list = Array.isArray(data?.models)
          ? data.models.filter((m: unknown): m is string => typeof m === 'string')
          : [];
        const def = typeof data?.default === 'string' ? data.default : '';
        if (!list.length) return;
        modelsCache = { models: list, default: def || list[0] };
        apply(list, def || list[0]);
      });
    }

    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    try { localStorage.setItem(storageKey(userId), JSON.stringify(messages.slice(-50))); } catch { /* quota cheia */ }
  }, [messages, userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => {
    if (draft) draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [draft]);

  const changeModel = (value: string) => {
    setModel(value);
    try { localStorage.setItem(modelKey(userId), value); } catch { /* storage indisponível */ }
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setError(null);
    setNotice(null);
    setBusy(true);

    const { data, error: invokeError } = await supabase.functions.invoke('chat', {
      body: { messages: next.slice(-12), model },
    });

    setBusy(false);

    if (invokeError) {
      setError(await describeFunctionError(invokeError, 'chat'));
      return;
    }

    const reply = typeof data?.reply === 'string' ? data.reply : null;
    const nextDraft = toDraft(data?.job);
    if (!reply && !nextDraft) {
      setError(data?.error ?? 'Não foi possível falar com a IA.');
      return;
    }
    setLastModel(typeof data?.model === 'string' ? data.model : null);
    setLastFallback(data?.fallback === true);
    if (nextDraft) setDraft(nextDraft);
    setMessages((m) => [
      ...m,
      { role: 'assistant', content: reply ?? 'Encontrei os dados da vaga. Confira e confirme abaixo.' },
    ]);
    inputRef.current?.focus();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const startNewJob = () => {
    setInput('Adicionar vaga: ');
    setError(null);
    setNotice(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const addDraft = async (job: NewJob): Promise<string | null> => {
    const url = safeHttpUrl(job.url);
    const safeJob: NewJob = { ...job, url };

    // Evita duplicar a mesma vaga já cadastrada (mesmo link ou mesmos dados básicos).
    const { data: same } = await supabase
      .from('jobs')
      .select('id')
      .eq('company', safeJob.company)
      .eq('role', safeJob.role)
      .eq('site', safeJob.site)
      .limit(1);
    if (same?.length) return 'Essa vaga já está cadastrada.';

    if (url) {
      const { data: byUrl } = await supabase.from('jobs').select('id').eq('url', url).limit(1);
      if (byUrl?.length) return 'Essa vaga já está cadastrada.';
    }

    const err = await addJob(safeJob);
    if (err) return err;

    setDraft(null);
    setNotice('Vaga adicionada. Confira na aba Vagas.');
    await ensureJobSite(safeJob.site, url);
    return null;
  };

  const clear = () => {
    setMessages([]);
    setError(null);
    setDraft(null);
    setNotice(null);
    setLastModel(null);
    setLastFallback(false);
    try { localStorage.removeItem(storageKey(userId)); } catch { /* ignore */ }
  };

  return (
    <section className="chat">
      <div className="chat-head">
        <h2>Chat com IA</h2>
        <div className="chat-tools">
          <label className="model-pick" title="Modelo usado nas respostas">
            Modelo
            <select value={model} onChange={(e) => changeModel(e.target.value)} disabled={busy}>
              {models.map((m) => <option key={m} value={m}>{modelLabel(m)}</option>)}
            </select>
          </label>
          <button className="link" onClick={startNewJob} disabled={busy}>+ Nova vaga</button>
          {messages.length > 0 && <button className="link" onClick={clear}>Limpar conversa</button>}
        </div>
      </div>

      <div className="chat-log card">
        {!messages.length && (
          <div className="chat-intro">
            <p>Pergunte sobre as suas vagas ou peça para adicionar uma nova colando o link ou descrevendo os dados.</p>
            <div className="chips">
              <button className="chip" onClick={startNewJob} disabled={busy}>+ Adicionar vaga</button>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'user' ? 'user' : 'bot'}`}>
            <MessageText content={m.content} />
          </div>
        ))}

        {busy && <div className="bubble bot typing" aria-live="polite">pensando…</div>}
        {error && <p className="error">{error}</p>}
        <div ref={endRef} />
      </div>

      {draft && (
        <div ref={draftRef}>
          <JobDraftCard
            draft={draft}
            onAdd={addDraft}
            onDismiss={() => setDraft(null)}
          />
        </div>
      )}

      {notice && <p className="success chat-notice" role="status">{notice}</p>}

      <form className="chat-form" onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="Pergunte algo ou cole o link de uma vaga…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          disabled={busy}
        />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>
          {busy ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
      <p className="muted chat-hint">
        Enter envia · Shift+Enter quebra linha · cole o link de uma vaga para adicioná-la pelo chat · o histórico fica só neste navegador.
        {lastModel && (
          <> · última resposta: <strong>{lastModel}</strong>{lastFallback ? ' (fallback automático)' : ''}</>
        )}
      </p>
    </section>
  );
}
