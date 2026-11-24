import { useState } from 'react';
import { CONTRACT_TYPES, WORK_MODELS, type ContractType, type WorkModel } from '../types';
import { useSettings } from '../hooks/useSettings';

export default function SettingsPanel({ userId }: { userId: string }) {
  const s = useSettings(userId);
  const [min, setMin] = useState<string | null>(null);
  const [max, setMax] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractType | '' | null>(null);
  const [workModel, setWorkModel] = useState<WorkModel | '' | null>(null);
  const [role, setRole] = useState('');
  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const num = (v: string | null, saved: number | null) => {
    const raw = v ?? String(saved ?? '');
    return raw === '' ? null : Number(raw);
  };

  return (
    <section className="grid">
      {s.error && <p className="error full">{s.error}</p>}

      <div className="card">
        <h2>Faixa salarial</h2>
        <div className="row">
          <input type="number" placeholder="Mínimo" value={min ?? s.settings.salary_min ?? ''} onChange={(e) => setMin(e.target.value)} />
          <input type="number" placeholder="Máximo" value={max ?? s.settings.salary_max ?? ''} onChange={(e) => setMax(e.target.value)} />
          <button className="primary" onClick={() => s.saveSettings({
            salary_min: num(min, s.settings.salary_min),
            salary_max: num(max, s.settings.salary_max),
          })}>Salvar</button>
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
          <button className="primary" onClick={() => s.saveSettings({
            contract_type: (contract ?? s.settings.contract_type) || null,
            work_model: (workModel ?? s.settings.work_model) || null,
          })}>Salvar</button>
        </div>
        <p className="muted">Orientam a análise do currículo e o contexto do chat.</p>
      </div>

      <div className="card">
        <h2>Funções procuradas</h2>
        <div className="row">
          <input placeholder="Ex: desenvolvedor frontend sr" value={role} onChange={(e) => setRole(e.target.value)} />
          <button className="primary" disabled={!role.trim()} onClick={() => { s.addRole(role.trim()); setRole(''); }}>Adicionar</button>
        </div>
        <ul className="list">
          {s.roles.map((r) => <li key={r.id}>{r.title}<button className="link" onClick={() => s.removeRole(r.id)}>Remover</button></li>)}
        </ul>
      </div>

      <div className="card">
        <h2>Sites de vagas</h2>
        <div className="row">
          <input placeholder="Nome" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          <input placeholder="https://..." value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          <button className="primary" disabled={!siteName.trim() || !siteUrl.trim()} onClick={() => { s.addSite(siteName.trim(), siteUrl.trim()); setSiteName(''); setSiteUrl(''); }}>Adicionar</button>
        </div>
        <ul className="list">
          {s.sites.map((w) => (
            <li key={w.id}>
              <span className={w.active ? '' : 'muted'}>{w.name}</span>
              <span>
                <button className="link" onClick={() => s.toggleSite(w)}>{w.active ? 'Pausar' : 'Ativar'}</button>
                <button className="link" onClick={() => s.removeSite(w.id)}>Remover</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
