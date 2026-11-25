import { useEffect, useState } from 'react';
import {
  CONTRACT_TYPES, STATUSES, WORK_MODELS,
  type ContractType, type JobDraft, type JobStatus, type WorkModel,
} from '../types';
import type { NewJob } from '../hooks/useJobs';

const EMPTY_FIELDS = { company: '', role: '', site: '', url: '', salary: '', note: '' };

export default function JobDraftCard({
  draft,
  onAdd,
  onDismiss,
}: {
  draft: JobDraft;
  onAdd: (job: NewJob) => Promise<string | null>;
  onDismiss: () => void;
}) {
  const [fields, setFields] = useState(() => ({
    company: draft.company,
    role: draft.role,
    site: draft.site,
    url: draft.url ?? '',
    salary: draft.salary ?? '',
    note: draft.status_note ?? '',
  }));
  const [status, setStatus] = useState<JobStatus>(draft.status);
  const [contract, setContract] = useState<ContractType | ''>(draft.contract_type ?? '');
  const [workModel, setWorkModel] = useState<WorkModel | ''>(draft.work_model ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFields({
      company: draft.company,
      role: draft.role,
      site: draft.site,
      url: draft.url ?? '',
      salary: draft.salary ?? '',
      note: draft.status_note ?? '',
    });
    setStatus(draft.status);
    setContract(draft.contract_type ?? '');
    setWorkModel(draft.work_model ?? '');
    setError(null);
  }, [draft]);

  const set = (key: keyof typeof EMPTY_FIELDS) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((f) => ({ ...f, [key]: e.target.value }));
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const company = fields.company.trim();
    const role = fields.role.trim();
    const site = fields.site.trim();
    if (!company || !role || !site) {
      setError('Preencha empresa, função e site.');
      return;
    }

    setBusy(true);
    setError(null);
    const err = await onAdd({
      company,
      role,
      site,
      url: fields.url.trim() || null,
      salary: fields.salary.trim() || null,
      contract_type: contract || null,
      work_model: workModel || null,
      status,
      status_note: fields.note.trim() || null,
    });
    setBusy(false);
    setError(err);
  };

  return (
    <form className="card form draft-card" onSubmit={submit}>
      <div>
        <h3>Adicionar vaga a partir do chat</h3>
        <p className="muted draft-hint">Revise os dados extraídos pela IA e edite o que precisar antes de salvar.</p>
      </div>

      <div className="cols">
        <label>Empresa *
          <input value={fields.company} onChange={set('company')} placeholder="Ex: Acme" required />
        </label>
        <label>Função *
          <input value={fields.role} onChange={set('role')} placeholder="Ex: Desenvolvedor Frontend" required />
        </label>
        <label>Site *
          <input value={fields.site} onChange={set('site')} placeholder="Ex: LinkedIn" required />
        </label>
        <label>Link da vaga
          <input type="url" value={fields.url} onChange={set('url')} placeholder="https://..." />
        </label>
        <label>Salário
          <input value={fields.salary} onChange={set('salary')} placeholder="Ex: R$ 8.000" />
        </label>
        <label>Contratação
          <select value={contract} onChange={(e) => { setContract(e.target.value as ContractType | ''); setError(null); }}>
            <option value="">Não informado</option>
            {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label>Modelo de trabalho
          <select value={workModel} onChange={(e) => { setWorkModel(e.target.value as WorkModel | ''); setError(null); }}>
            <option value="">Não informado</option>
            {WORK_MODELS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </label>
        <label>Status
          <select value={status} onChange={(e) => { setStatus(e.target.value as JobStatus); setError(null); }}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <label>Observação
        <input value={fields.note} onChange={set('note')} placeholder="Opcional — fica no histórico da vaga" />
      </label>

      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Adicionando...' : 'Adicionar vaga'}
        </button>
        <button type="button" className="link" onClick={onDismiss} disabled={busy}>Descartar</button>
        {error && <span className="error">{error}</span>}
      </div>
    </form>
  );
}
