// Scraper de links de vaga usado pela Edge Function `chat`.
// Não executa JavaScript: extrai o que está no HTML/JSON público da página.
// Ordem de tentativa: API específica do site (LinkedIn/Greenhouse/Lever) e, depois,
// JSON-LD JobPosting, dados embutidos de SPAs (__NEXT_DATA__ etc.) e meta tags.

export type WorkModel = 'remoto' | 'hibrido' | 'presencial';

export interface ScrapedJob {
  url: string;
  site: string | null;
  company: string;
  role: string;
  salary: string | null;
  description: string;
  work_model: WorkModel | null;
  status_note: string | null;
  text: string;
  hints: string;
  error?: string;
}

interface PageMeta {
  title: string;
  description: string;
  siteName: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
}

interface ExtractedData {
  company?: string;
  role?: string;
  salary?: string | null;
  work_model?: WorkModel | null;
  status_note?: string | null;
  description?: string;
  url?: string;
}

interface JobCandidate {
  obj: JsonObject;
  score: number;
}

type JsonObject = Record<string, unknown>;

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;
const MAX_HTML = 600_000;
const MAX_TEXT = 12_000;
const MAX_HINTS = 8_000;
const MAX_DESCRIPTION = 8_000;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Sec-Fetch-Mode': 'navigate',
  'Upgrade-Insecure-Requests': '1',
};

const SITE_NAMES: Record<string, string> = {
  'linkedin.com': 'LinkedIn',
  'gupy.io': 'Gupy',
  'indeed.com': 'Indeed',
  'glassdoor.com': 'Glassdoor',
  'catho.com.br': 'Catho',
  'vagas.com.br': 'Vagas.com',
  'infojobs.com.br': 'InfoJobs',
  'trampos.co': 'Trampos',
  'programathor.com.br': 'Programathor',
  'remoteok.com': 'Remote OK',
  'wellfound.com': 'Wellfound',
  'workana.com': 'Workana',
  '99jobs.com': '99jobs',
  'solides.com.br': 'Sólides',
  'kenoby.com': 'Kenoby',
  'greenhouse.io': 'Greenhouse',
  'lever.co': 'Lever',
  'workday.com': 'Workday',
  'smartrecruiters.com': 'SmartRecruiters',
  'ashbyhq.com': 'Ashby',
  'breezy.hr': 'Breezy',
};

const GENERIC_SUBDOMAINS = new Set([
  'www', 'jobs', 'job', 'careers', 'carreiras', 'boards', 'portal', 'app', 'job-boards',
  'vagas', 'emprego', 'empregos', 'recrutamento', 'recruiting',
]);

// ---------------------------------------------------------------------------
// Utilidades de texto/URL
// ---------------------------------------------------------------------------

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)));
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|ul|ol)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function safeHttpUrl(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const privateHost = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
      || host === '[::1]'
      || host === '[::]'
      || host.endsWith('.localhost')
      || host.endsWith('.local')
      || host.endsWith('.internal');
    return privateHost ? null : url;
  } catch {
    return null;
  }
}

export function siteFromUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    for (const [domain, name] of Object.entries(SITE_NAMES)) {
      if (host === domain || host.endsWith(`.${domain}`)) return name;
    }
    return host;
  } catch {
    return null;
  }
}

function cleanSiteName(name: string): string {
  const value = name.trim();
  if (!value || /^(home|in[ií]cio|vagas|jobs|carreiras|careers)$/i.test(value)) return '';
  return value;
}

function isIdLike(segment: string): boolean {
  return /^\d+$/.test(segment)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
    || /^[0-9a-f]{16,}$/i.test(segment);
}

function slugToText(slug: string): string {
  return decodeEntities(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Usa o próprio caminho do link como último recurso (ex.: LinkedIn /jobs/view/cargo-at-empresa-123).
function inferFromUrl(url: URL): { role: string; company: string } {
  const segments = url.pathname.split('/').filter(Boolean);
  let slug = '';

  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = decodeURIComponent(segments[i]).replace(/\.[a-z0-9]+$/i, '');
    if (segment && !isIdLike(segment) && segment.length > 2) {
      slug = segment;
      break;
    }
  }

  slug = slug.replace(/[-_]\d{4,}$/, '').trim();
  let role = '';
  let company = '';

  const at = slug.match(/^(.+?)[-_](?:at|na|em)[-_](.+)$/i);
  if (at) {
    role = at[1];
    company = at[2];
  } else {
    role = slug;
    const parts = url.hostname.toLowerCase().split('.');
    if (parts.length > 2 && !GENERIC_SUBDOMAINS.has(parts[0])) company = parts[0];
  }

  role = slugToText(role).replace(/^(?:vaga|vagas|job|jobs)[-_ ]+/i, '').trim();
  company = slugToText(company).trim();

  return { role: role.length >= 3 ? role : '', company };
}

function valueToString(value: unknown): string {
  if (typeof value === 'string') return stripHtml(value);
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const obj = value as JsonObject;
    const name = obj.name ?? obj.title ?? obj.label ?? obj.value;
    if (typeof name === 'string') return stripHtml(name);
    if (typeof name === 'number') return String(name);
  }
  return '';
}

function firstString(obj: JsonObject, keys: string[]): string {
  for (const key of keys) {
    const text = valueToString(obj[key]);
    if (text) return text;
  }
  return '';
}

function employmentLabel(value: string): string {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const labels: Record<string, string> = {
    full_time: 'Tempo integral',
    part_time: 'Meio período',
    contractor: 'Contrato',
    temporary: 'Temporário',
    intern: 'Estágio',
    internship: 'Estágio',
    freelance: 'Freelance',
  };
  return labels[key] ?? value.trim();
}

function workModelFromValue(value: unknown): WorkModel | null {
  if (typeof value === 'boolean') return value ? 'remoto' : null;
  const text = valueToString(value).toLowerCase();
  if (!text) return null;
  if (/remot|home.?office|telecommut|anywhere|distributed/.test(text)) return 'remoto';
  if (/h[iíy]brid/.test(text)) return 'hibrido';
  if (/presencial|on.?site|in.?person/.test(text)) return 'presencial';
  return null;
}

function workModelFromObject(obj: JsonObject): WorkModel | null {
  for (const key of ['workplaceType', 'workModel', 'modality', 'locationType', 'workplace', 'remote', 'isRemote', 'remoteWork']) {
    const model = workModelFromValue(obj[key]);
    if (model) return model;
  }
  return null;
}

function salaryFromValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return null;

  const obj = value as JsonObject;
  const currency = valueToString(obj.currency ?? obj.currency_type ?? obj.currencyCode);
  const label = currency === 'BRL' ? 'R$' : currency === 'USD' ? 'US$' : currency;
  const rawValue = obj.value ?? obj.amount ?? obj;

  if (rawValue && typeof rawValue === 'object') {
    const v = rawValue as JsonObject;
    const unit = valueToString(v.unitText ?? v.period ?? v.interval).toLowerCase();
    const suffix = unit.includes('hour') ? '/hora' : unit.includes('month') ? '/mês' : unit.includes('year') ? '/ano' : '';
    const min = v.minValue ?? v.min ?? v.value;
    const max = v.maxValue ?? v.max;

    if (min !== undefined && min !== null && min !== '') {
      const range = max !== undefined && max !== null && max !== '' ? `${min} – ${max}` : String(min);
      return `${label ? `${label} ` : ''}${range}${suffix}`.trim();
    }
  }

  const flat = typeof rawValue === 'string' || typeof rawValue === 'number' ? String(rawValue) : '';
  return flat ? `${label ? `${label} ` : ''}${flat}`.trim() : null;
}

function locationText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(locationText).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const obj = value as JsonObject;
    const address = obj.address;
    if (typeof address === 'string') return address.trim();
    if (address && typeof address === 'object') {
      const a = address as JsonObject;
      const text = [a.addressLocality, a.addressRegion, a.addressCountry].map(valueToString).filter(Boolean).join(', ');
      if (text) return text;
    }
    return valueToString(obj.name) || valueToString(obj['@value']);
  }
  return '';
}

// ---------------------------------------------------------------------------
// HTML: meta tags, JSON-LD e dados embutidos de SPAs
// ---------------------------------------------------------------------------

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? '');
  }
  return attrs;
}

function extractMeta(html: string): PageMeta {
  const tags: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\s+([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if (key && !tags[key]) tags[key] = attrs.content ?? '';
  }

  const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1]
    ?? '';

  return {
    title,
    description: tags['description'] ?? '',
    siteName: tags['og:site_name'] ?? tags['application-name'] ?? '',
    canonical: decodeEntities(canonical),
    ogTitle: tags['og:title'] ?? tags['twitter:title'] ?? '',
    ogDescription: tags['og:description'] ?? tags['twitter:description'] ?? '',
    ogUrl: tags['og:url'] ?? '',
  };
}

function findJobPosting(value: unknown, depth = 0): JsonObject | null {
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;

  const obj = value as JsonObject;
  const type = obj['@type'];
  const types = Array.isArray(type) ? type.map(String) : [String(type ?? '')];
  if (types.some((t) => t.toLowerCase() === 'jobposting')) return obj;

  for (const [key, child] of Object.entries(obj)) {
    if (key === '@context') continue;
    if (child && typeof child === 'object') {
      const found = findJobPosting(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function extractJsonLd(html: string): ExtractedData | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1].trim());
      const posting = findJobPosting(parsed);
      if (!posting) continue;

      const company = valueToString(posting.hiringOrganization);
      const role = valueToString(posting.title) || valueToString(posting.name);
      const salary = salaryFromValue(posting.baseSalary ?? posting.estimatedSalary);
      const remote = valueToString(posting.jobLocationType).toUpperCase().includes('TELECOMMUTE');
      const location = locationText(posting.jobLocation);
      const employment = employmentLabel(valueToString(posting.employmentType));
      const description = stripHtml(valueToString(posting.description));

      const noteParts = [
        location ? `Local: ${location}` : remote ? 'Remoto' : '',
        employment ? `Tipo: ${employment}` : '',
      ].filter(Boolean);

      if (company || role || salary || description) {
        return {
          company: company || undefined,
          role: role || undefined,
          salary,
          work_model: remote ? 'remoto' : null,
          status_note: noteParts.length ? noteParts.join(' · ').slice(0, 300) : description.slice(0, 300) || null,
          description: description || undefined,
          url: valueToString(posting.url) || undefined,
        };
      }
    } catch {
      // Bloco JSON-LD inválido: tenta o próximo.
    }
  }

  return null;
}

function hasValue(obj: JsonObject, keys: string[]): boolean {
  return keys.some((key) => {
    const value = obj[key];
    return (typeof value === 'string' && value.trim().length > 0)
      || typeof value === 'number'
      || (value !== null && typeof value === 'object');
  });
}

function scoreJobObject(obj: JsonObject): number {
  let score = 0;
  if (hasValue(obj, ['title', 'jobTitle', 'role', 'cargo', 'position'])) score += 2;
  if (hasValue(obj, ['company', 'companyName', 'employer', 'hiringOrganization', 'organization'])) score += 2;
  if (hasValue(obj, ['description', 'descriptionHtml', 'descriptionPlain', 'responsibilities', 'requirements', 'content', 'lists'])) score += 2;
  if (hasValue(obj, ['salary', 'salaryRange', 'compensation', 'remuneration', 'wage', 'payInputRanges', 'pay_input_ranges'])) score += 1;
  if (hasValue(obj, ['location', 'city', 'workplace', 'workplaceType', 'modality', 'remote', 'isRemote'])) score += 1;
  return score;
}

function collectJobCandidates(value: unknown, out: JobCandidate[], depth = 0): void {
  if (depth > 8 || out.length > 250) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJobCandidates(item, out, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;

  const obj = value as JsonObject;
  const score = scoreJobObject(obj);
  if (score >= 4) out.push({ obj, score });

  for (const child of Object.values(obj)) {
    if (child && typeof child === 'object') collectJobCandidates(child, out, depth + 1);
  }
}

// Extrai um JSON atribuído no HTML (ex.: window.__INITIAL_STATE__ = {...}).
function extractAssignedJson(html: string, marker: string): unknown | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = html.indexOf('{', markerIndex);
  if (start < 0 || start > markerIndex + 500) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  const limit = Math.min(html.length, start + 300_000);

  for (let i = start; i < limit; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractEmbeddedJob(html: string): { data: JsonObject; snippet: string } | null {
  const values: unknown[] = [];

  for (const match of html.matchAll(/<script[^>]*(?:type=["']application\/json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      values.push(JSON.parse(match[1].trim()));
    } catch {
      // JSON inválido: ignora.
    }
  }

  for (const marker of ['__INITIAL_STATE__', '__APOLLO_STATE__', '__PRELOADED_STATE__', '__NUXT__']) {
    const parsed = extractAssignedJson(html, marker);
    if (parsed) values.push(parsed);
  }

  const candidates: JobCandidate[] = [];
  for (const value of values) collectJobCandidates(value, candidates);
  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return { data: best.obj, snippet: truncate(JSON.stringify(best.obj), MAX_HINTS) };
}

function mapEmbeddedJob(data: JsonObject): ExtractedData {
  const role = firstString(data, ['title', 'jobTitle', 'role', 'cargo', 'position']);
  const company = firstString(data, ['companyName', 'company', 'employer', 'hiringOrganization', 'organization']);
  const description = firstString(data, ['descriptionPlain', 'description', 'descriptionHtml', 'content', 'responsibilities', 'requirements']);
  const location = firstString(data, ['location', 'city', 'workplace', 'address']);
  const salary = salaryFromValue(
    data.salary ?? data.salaryRange ?? data.compensation ?? data.remuneration ?? data.wage ?? data.payInputRanges ?? data.pay_input_ranges,
  );
  const workModel = workModelFromObject(data) ?? workModelFromValue(location);
  const noteParts = [
    location ? `Local: ${location}` : '',
    description ? truncate(stripHtml(description), 220) : '',
  ].filter(Boolean);

  return {
    role: role || undefined,
    company: company || undefined,
    salary,
    work_model: workModel,
    status_note: noteParts.length ? noteParts.join(' · ').slice(0, 300) : null,
    description: description ? truncate(stripHtml(description), MAX_DESCRIPTION) : undefined,
  };
}

function titleRole(title: string): string {
  let cleaned = title.replace(/\s*[|–—]\s*.*$/, '').trim();
  cleaned = cleaned.replace(/\s+(?:na|no|at)\s+[^|–—]+$/i, '');
  cleaned = cleaned.replace(/^vaga\s+(?:de|para)\s+/i, '');
  return cleaned.trim();
}

function titleCompany(title: string): string {
  const cleaned = title.replace(/\s*[|–—]\s*.*$/, '').trim();
  const match = cleaned.match(/\b(?:na|no|at)\s+([^|–—]+?)(?:\s*[-–—]\s*|\s*\|.*)?$/i);
  return match ? match[1].trim() : '';
}

// ---------------------------------------------------------------------------
// Requisições
// ---------------------------------------------------------------------------

async function fetchWithRedirects(start: URL): Promise<{ res: Response; finalUrl: URL }> {
  let current = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), {
      headers: BROWSER_HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      let next: URL | null = null;
      try {
        next = location ? safeHttpUrl(new URL(location, current).toString()) : null;
      } catch {
        next = null;
      }
      if (!next) throw new Error('O link redirecionou para um endereço não permitido.');
      try { await res.body?.cancel(); } catch { /* ignora */ }
      current = next;
      continue;
    }

    return { res, finalUrl: current };
  }

  throw new Error('O link redirecionou vezes demais.');
}

async function fetchJson(url: URL): Promise<unknown | null> {
  try {
    const { res } = await fetchWithRedirects(url);
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, 1_000_000);
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Páginas genéricas
// ---------------------------------------------------------------------------

async function htmlToText(html: string): Promise<string> {
  return truncate(stripHtml(html), MAX_TEXT);
}

async function parseHtmlPage(html: string, finalUrl: URL, sourceSite?: string): Promise<ScrapedJob> {
  const meta = extractMeta(html);
  const jsonLd = extractJsonLd(html);
  const embedded = extractEmbeddedJob(html);

  // Páginas de login/anti-bot não têm dados da vaga: melhor avisar do que inventar.
  const blockedTitle = /\b(log ?in|sign ?in|entrar|authwall|just a moment|attention required|um momento)\b/i.test(meta.title);
  if (!jsonLd && !embedded && blockedTitle) {
    return emptyScraped(finalUrl.toString(), 'O site pediu login (ou bloqueou o acesso) para mostrar a vaga.');
  }

  const embeddedData = embedded ? mapEmbeddedJob(embedded.data) : null;
  const fromUrl = inferFromUrl(finalUrl);
  const title = meta.ogTitle || meta.title;

  const company = jsonLd?.company || embeddedData?.company || titleCompany(title) || fromUrl.company || '';
  const role = jsonLd?.role || embeddedData?.role || titleRole(title) || fromUrl.role || '';
  const salary = jsonLd?.salary ?? embeddedData?.salary ?? null;
  const description = truncate(
    jsonLd?.description || embeddedData?.description || stripHtml(meta.description) || '',
    MAX_DESCRIPTION,
  );
  const workModel = jsonLd?.work_model ?? embeddedData?.work_model ?? null;
  const statusNote = embeddedData?.status_note || jsonLd?.status_note || truncate(meta.description, 300) || null;
  const site = sourceSite || cleanSiteName(meta.siteName) || siteFromUrl(finalUrl.toString());

  const hintParts = [
    `URL final: ${finalUrl.toString()}`,
    meta.title ? `Título: ${meta.title}` : '',
    meta.ogTitle && meta.ogTitle !== meta.title ? `Título (og): ${meta.ogTitle}` : '',
    meta.siteName ? `Site: ${meta.siteName}` : '',
    meta.description ? `Descrição: ${truncate(meta.description, 600)}` : '',
    meta.ogDescription && meta.ogDescription !== meta.description ? `Descrição (og): ${truncate(meta.ogDescription, 600)}` : '',
    meta.canonical ? `URL canônica: ${meta.canonical}` : '',
    jsonLd ? `JSON-LD JobPosting:\n${truncate(JSON.stringify(jsonLd), 4000)}` : '',
    embedded ? `Dados embutidos da página:\n${embedded.snippet}` : '',
  ].filter(Boolean);

  return {
    url: finalUrl.toString(),
    site,
    company,
    role,
    salary,
    description,
    work_model: workModel,
    status_note: statusNote,
    text: await htmlToText(html),
    hints: truncate(hintParts.join('\n\n'), MAX_HINTS),
  };
}

function parseJsonPage(body: string, finalUrl: URL): ScrapedJob {
  try {
    const parsed = JSON.parse(body);
    const candidates: JobCandidate[] = [];
    collectJobCandidates(parsed, candidates);
    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0]?.obj;
    if (!best) {
      return {
        url: finalUrl.toString(),
        site: siteFromUrl(finalUrl.toString()),
        company: '',
        role: '',
        salary: null,
        description: '',
        work_model: null,
        status_note: null,
        text: truncate(body, MAX_TEXT),
        hints: truncate(body, MAX_HINTS),
      };
    }

    const data = mapEmbeddedJob(best);
    return {
      url: finalUrl.toString(),
      site: siteFromUrl(finalUrl.toString()),
      company: data.company || '',
      role: data.role || '',
      salary: data.salary ?? null,
      description: data.description || '',
      work_model: data.work_model ?? null,
      status_note: data.status_note ?? null,
      text: truncate(stripHtml(body), MAX_TEXT),
      hints: `JSON da vaga:\n${truncate(JSON.stringify(best), MAX_HINTS)}`,
    };
  } catch {
    return emptyScraped(finalUrl.toString(), 'O link retornou um JSON inválido.');
  }
}

async function scrapeGeneric(url: URL): Promise<ScrapedJob> {
  try {
    const { res, finalUrl } = await fetchWithRedirects(url);
    if (!res.ok) return emptyScraped(finalUrl.toString(), `O site respondeu ${res.status}.`);

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const size = Number(res.headers.get('content-length') ?? '0');
    if (size > 3_000_000) return emptyScraped(finalUrl.toString(), 'A página é muito grande para analisar.');

    const body = (await res.text()).slice(0, MAX_HTML);

    if (contentType.includes('application/json') || /^\s*[\[{]/.test(body)) {
      return parseJsonPage(body, finalUrl);
    }

    if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
      return emptyScraped(finalUrl.toString(), 'O link não retornou uma página de texto.');
    }

    return await parseHtmlPage(body, finalUrl);
  } catch (e) {
    return emptyScraped(url.toString(), `Não foi possível abrir o link (${(e as Error).message}).`);
  }
}

function emptyScraped(url: string, error?: string): ScrapedJob {
  return {
    url,
    site: siteFromUrl(url),
    company: '',
    role: '',
    salary: null,
    description: '',
    work_model: null,
    status_note: null,
    text: '',
    hints: '',
    error,
  };
}

// ---------------------------------------------------------------------------
// Scrapers específicos
// ---------------------------------------------------------------------------

function firstMatch(html: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const text = stripHtml(match[1]);
      if (text) return text;
    }
  }
  return '';
}

async function scrapeLinkedIn(url: URL): Promise<ScrapedJob | null> {
  const idMatch = url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})(?:\/|$)/i)
    ?? url.search.match(/[?&](?:currentJobId|jobId)=(\d{6,})/i);
  if (!idMatch) return null;

  const guestUrl = new URL(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${idMatch[1]}`);
  let html: string;
  try {
    const { res } = await fetchWithRedirects(guestUrl);
    if (!res.ok) return null;
    html = (await res.text()).slice(0, MAX_HTML);
  } catch {
    return null;
  }

  const role = firstMatch(html, [
    /<h1[^>]*class="[^"]*(?:top-card-layout__title|topcard__title)[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h2[^>]*class="[^"]*(?:top-card-layout__title|topcard__title)[^"]*"[^>]*>([\s\S]*?)<\/h2>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ]);
  const company = firstMatch(html, [
    /<a[^>]*class="[^"]*(?:topcard__org-name-link|topcard__org-name)[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    /<span[^>]*class="[^"]*topcard__flavor[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]);
  const location = firstMatch(html, [
    /<span[^>]*class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]);
  const salary = firstMatch(html, [
    /<span[^>]*class="[^"]*(?:compensation__salary|salary)[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    /<div[^>]*class="[^"]*(?:compensation__salary|salary)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ]);
  const description = firstMatch(html, [
    /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
  ]);

  if (!role && !company) return null;

  const canonical = `https://www.linkedin.com/jobs/view/${idMatch[1]}`;
  const base = await parseHtmlPage(html, url, 'LinkedIn');
  const noteParts = [
    location ? `Local: ${location}` : '',
    description ? truncate(description, 220) : '',
  ].filter(Boolean);

  return {
    ...base,
    url: canonical,
    site: 'LinkedIn',
    company: company || base.company,
    role: role || base.role,
    salary: base.salary ?? (salary || null),
    description: base.description || truncate(description, MAX_DESCRIPTION),
    work_model: base.work_model ?? workModelFromValue(location),
    status_note: base.status_note || (noteParts.length ? noteParts.join(' · ').slice(0, 300) : null),
    hints: [
      base.hints,
      role ? `LinkedIn: cargo ${role}` : '',
      company ? `LinkedIn: empresa ${company}` : '',
      location ? `LinkedIn: local ${location}` : '',
      salary ? `LinkedIn: salário ${salary}` : '',
      description ? `LinkedIn: descrição\n${truncate(description, 3000)}` : '',
    ].filter(Boolean).join('\n\n').slice(0, MAX_HINTS),
  };
}

function greenhouseSalary(value: unknown): string | null {
  if (!Array.isArray(value) || !value.length) return null;

  const range = value[0] as JsonObject;
  const currency = valueToString(range.currency_type ?? range.currency);
  const label = currency === 'BRL' ? 'R$' : currency === 'USD' ? 'US$' : currency;
  const min = Number(range.min_cents ?? range.min ?? 0) / (range.min_cents !== undefined ? 100 : 1);
  const max = Number(range.max_cents ?? range.max ?? 0) / (range.max_cents !== undefined ? 100 : 1);
  const interval = valueToString(range.interval).toLowerCase();
  const suffix = interval.includes('month') ? '/mês' : interval.includes('year') ? '/ano' : interval.includes('hour') ? '/hora' : '';

  if (!min && !max) return null;
  const rangeText = max ? `${min || ''} – ${max}`.trim() : String(min);
  return `${label ? `${label} ` : ''}${rangeText}${suffix}`.trim();
}

async function scrapeGreenhouse(url: URL): Promise<ScrapedJob | null> {
  if (!url.hostname.toLowerCase().endsWith('greenhouse.io')) return null;

  const match = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
  if (!match) return null;

  const board = match[1];
  const jobId = match[2];
  const api = new URL(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${jobId}?questions=false`);
  const data = await fetchJson(api);
  if (!data || typeof data !== 'object') return null;

  const job = data as JsonObject;
  const role = valueToString(job.title);
  if (!role) return null;

  const locationValue = job.location;
  const location = typeof locationValue === 'string'
    ? locationValue
    : valueToString((locationValue as JsonObject)?.name);
  const company = valueToString(job.company_name) || board;
  const content = valueToString(job.content);
  const salary = greenhouseSalary(job.pay_input_ranges ?? job.pay_input_range);
  const workModel = workModelFromValue(location) ?? workModelFromValue(job.workplace_type);
  const noteParts = [
    location ? `Local: ${location}` : '',
    content ? truncate(stripHtml(content), 220) : '',
  ].filter(Boolean);

  return {
    url: valueToString(job.absolute_url) || url.toString(),
    site: 'Greenhouse',
    company,
    role,
    salary,
    description: truncate(stripHtml(content), MAX_DESCRIPTION),
    work_model: workModel,
    status_note: noteParts.length ? noteParts.join(' · ').slice(0, 300) : null,
    text: truncate(stripHtml(content), MAX_TEXT),
    hints: `Greenhouse API:\n${truncate(JSON.stringify(job), MAX_HINTS)}`,
  };
}

async function scrapeLever(url: URL): Promise<ScrapedJob | null> {
  if (!url.hostname.toLowerCase().endsWith('lever.co')) return null;

  const match = url.pathname.match(/^\/([^/]+)\/([^/?#]+)/);
  if (!match) return null;

  const companySlug = match[1];
  const postingId = match[2];
  const apiHost = url.hostname.toLowerCase().includes('eu.lever.co') ? 'api.eu.lever.co' : 'api.lever.co';
  const api = new URL(`https://${apiHost}/v0/postings/${encodeURIComponent(companySlug)}/${encodeURIComponent(postingId)}`);
  const data = await fetchJson(api);
  if (!data || typeof data !== 'object') return null;

  const job = data as JsonObject;
  const role = valueToString(job.text) || valueToString(job.title);
  if (!role) return null;

  const categories = (job.categories && typeof job.categories === 'object' ? job.categories : {}) as JsonObject;
  const location = valueToString(categories.location);
  const commitment = valueToString(categories.commitment);
  const description = [
    valueToString(job.descriptionPlain),
    valueToString(job.additionalPlain),
    ...(Array.isArray(job.lists) ? job.lists.map((item) => valueToString((item as JsonObject).content)) : []),
  ].filter(Boolean).join('\n\n');
  const salary = salaryFromValue(job.salaryRange);
  const workModel = workModelFromValue(location);
  const noteParts = [
    location ? `Local: ${location}` : '',
    commitment ? `Contratação: ${commitment}` : '',
    description ? truncate(stripHtml(description), 220) : '',
  ].filter(Boolean);

  return {
    url: valueToString(job.hostedUrl) || url.toString(),
    site: 'Lever',
    company: companySlug,
    role,
    salary,
    description: truncate(stripHtml(description), MAX_DESCRIPTION),
    work_model: workModel,
    status_note: noteParts.length ? noteParts.join(' · ').slice(0, 300) : null,
    text: truncate(stripHtml(description), MAX_TEXT),
    hints: `Lever API:\n${truncate(JSON.stringify(job), MAX_HINTS)}`,
  };
}

async function scrapeSiteSpecific(url: URL): Promise<ScrapedJob | null> {
  try {
    const host = url.hostname.toLowerCase();
    if (host.endsWith('linkedin.com')) return await scrapeLinkedIn(url);
    if (host.endsWith('greenhouse.io')) return await scrapeGreenhouse(url);
    if (host.endsWith('lever.co')) return await scrapeLever(url);
  } catch {
    // Falha na API específica: cai no scraping genérico.
  }
  return null;
}

function mergeScraped(primary: ScrapedJob, fallback: ScrapedJob): ScrapedJob {
  return {
    url: primary.url || fallback.url,
    site: primary.site || fallback.site,
    company: primary.company || fallback.company,
    role: primary.role || fallback.role,
    salary: primary.salary ?? fallback.salary,
    description: primary.description || fallback.description,
    work_model: primary.work_model ?? fallback.work_model,
    status_note: primary.status_note || fallback.status_note,
    text: [primary.text, fallback.text].filter(Boolean).join('\n\n').slice(0, MAX_TEXT),
    hints: [primary.hints, fallback.hints].filter(Boolean).join('\n\n').slice(0, MAX_HINTS),
    error: primary.error ?? fallback.error,
  };
}

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

export async function scrapeJobLink(rawUrl: string): Promise<ScrapedJob> {
  const url = safeHttpUrl(rawUrl);
  if (!url) return emptyScraped(rawUrl, 'O link não é um endereço http/https público válido.');

  const specific = await scrapeSiteSpecific(url);

  // Se a API específica já trouxe empresa e cargo, não precisa baixar a página de novo.
  if (specific && specific.company && specific.role) return specific;

  const generic = await scrapeGeneric(url);
  return specific ? mergeScraped(specific, generic) : generic;
}
