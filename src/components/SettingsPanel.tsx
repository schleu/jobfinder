import { useEffect, useRef, useState } from 'react';
import { CONTRACT_TYPES, WORK_MODELS, type ContractType, type JobSite, type WorkModel } from '../types';
import { useSettings } from '../hooks/useSettings';

// Botão de salvar com estado: "Salvando…" enquanto envia e "Salvo ✓" por alguns segundos.
function SaveButton({ onSave, label = 'Salvar' }: { onSave: () => Promise<boolean>; label?: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const click = async () => {
    setState('saving');
    const ok = await onSave();
    if (!ok) {
      setState('idle');
      return;
    }
    setState('saved');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2500);
  };

  return (
    <button
      type="button"
      className={state === 'saved' ? 'primary ok' : 'primary'}
      onClick={click}
      disabled={state === 'saving'}
    >
      {state === 'saving' ? 'Salvando…' : state === 'saved' ? 'Salvo ✓' : label}
    </button>
  );
}

export default function SettingsPanel({ userId }: { userId: string }) {
  const s = useSettings(userId);
  const [min, setMin] = useState<string | null>(null);
  const [max, setMax] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractType | '' | null>(null);
  const [workModel, setWorkModel] = useState<WorkModel | '' | null>(null);
  const [role, setRole] = useState('');
  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const num = (v: string | null, saved: number | null) => {
    const raw = v ?? String(saved ?? '');
    return raw === '' ? null : Number(raw);
  };

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Aviso temporário para ações sem botão "Salvar" (listas de funções e sites).
  const flash = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  };

  const addRole = async () => {
    const ok = await s.addRole(role.trim());
    if (ok) {
      setRole('');
      flash('Função adicionada.');
    }
  };

  const removeRole = async (id: string) => {
    if (await s.removeRole(id)) flash('Função removida.');
  };

  const addSite = async () => {
    const ok = await s.addSite(siteName.trim(), siteUrl.trim());
    if (ok) {
      setSiteName('');
      setSiteUrl('');
      flash('Site adicionado.');
    }
  };

  const removeSite = async (id: string) => {
    if (await s.removeSite(id)) flash('Site removido.');
  };

  const toggleSite = async (site: JobSite) => {
    if (await s.toggleSite(site)) flash(site.active ? 'Site pausado.' : 'Site ativado.');
  };

  return (
    <section className="grid">
      {s.error && <p className="error full" role="alert">{s.error}</p>}
      {toast && <p className="success full toast" role="status" aria-live="polite">{toast}</p>}

      <div className="card">
        <h2>Faixa salarial</h2>
        <div className="row">
          <input type="number" placeholder="Mínimo" value={min ?? s.settings.salary_min ?? ''} onChange={(e) => setMin(e.target.value)} />
          <input type="number" placeholder="Máximo" value={max ?? s.settings.salary_max ?? ''} onChange={(e) => setMax(e.target.value)} />
          <SaveButton onSave={() => s.saveSettings({
            salary_min: num(min, s.settings.salary_min),
            salary_max: num(max, s.settings.salary_max),
          })} />
        </div>
      </div>

      <div className="card">
        <h2>Preferências de vaga</h2>
        <div className="row">
          <label className="field">Contratação
            <select
              value={contract ?? s.settings.contract_type ?? ''}
              onChange={(e) => setContract(e.target.value as ContractType | '')}
            >
              <option value="">Sem preferência</option>
              {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="field">Modelo de trabalho
            <select
              value={workModel ?? s.settings.work_model ?? ''}
              onChange={(e) => setWorkModel(e.target.value as WorkModel | '')}
            >
              <option value="">Sem preferência</option>
              {WORK_MODELS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </label>
          <SaveButton onSave={() => s.saveSettings({
            contract_type: (contract ?? s.settings.contract_type) || null,
            work_model: (workModel ?? s.settings.work_model) || null,
          })} />
        </div>
        <p className="muted">Orientam a análise do currículo e o contexto do chat.</p>
      </div>

      <div className="card">
        <h2>Funções procuradas</h2>
        <div className="row">
          <input
            placeholder="Ex: desenvolvedor frontend sr"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRole(); } }}
          />
          <button className="primary" disabled={!role.trim()} onClick={addRole}>Adicionar</button>
        </div>
        <ul className="list">
          {s.roles.map((r) => <li key={r.id}>{r.title}<button className="link" onClick={() => removeRole(r.id)}>Remover</button></li>)}
        </ul>
      </div>

      <div className="card">
        <h2>Sites de vagas</h2>
        <div className="row">
          <input placeholder="Nome" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          <input placeholder="https://..." value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          <button className="primary" disabled={!siteName.trim() || !siteUrl.trim()} onClick={addSite}>Adicionar</button>
        </div>
        <ul className="list">
          {s.sites.map((w) => (
            <li key={w.id}>
              <span className={w.active ? '' : 'muted'}>{w.name}</span>
              <span>
                <button className="link" onClick={() => toggleSite(w)}>{w.active ? 'Pausar' : 'Ativar'}</button>
                <button className="link" onClick={() => removeSite(w.id)}>Remover</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
