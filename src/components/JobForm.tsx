import { useState } from 'react';
import { STATUSES, type JobStatus } from '../types';
import type { NewJob } from '../hooks/useJobs';

const EMPTY = {
  company: '', role: '', site: '', url: '', salary: '', note: '',
};

export default function JobForm({ onAdd, onClose }: { onAdd: (job: NewJob) => Promise<string | null>; onClose: () => void }) {
  const [fields, setFields] = useState(EMPTY);
  const [status, setStatus] = useState<JobStatus>('nova');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    setDone(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setDone(false);
    const err = await onAdd({
      company: fields.company.trim(),
      role: fields.role.trim(),
      site: fields.site.trim(),
      url: fields.url.trim() || null,
      salary: fields.salary.trim() || null,
      status,
      status_note: fields.note.trim() || null,
    });
    setBusy(false);
    setError(err);
    if (!err) {
      setFields(EMPTY);
      setStatus('nova');
      setDone(true);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Adicionar vaga manualmente</h2>
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
        <label>Status
          <select value={status} onChange={(e) => { setStatus(e.target.value as JobStatus); setDone(false); }}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>
      <label>Observação
        <input value={fields.note} onChange={set('note')} placeholder="Opcional — fica no histórico da vaga" />
      </label>
      <div className="actions">
        <button className="primary" disabled={busy} type="submit">{busy ? 'Salvando...' : 'Adicionar vaga'}</button>
        <button type="button" className="link" onClick={onClose}>Fechar</button>
        {error && <span className="error">{error}</span>}
        {done && <span className="success">Vaga adicionada.</span>}
      </div>
    </form>
  );
}
