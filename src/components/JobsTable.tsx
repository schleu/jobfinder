import { Fragment, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  CONTRACT_TYPES, STATUSES, WORK_MODELS, statusLabel,
  type ContractType, type HistoryRow, type Job, type JobStatus, type WorkModel,
} from '../types';
import { useJobs } from '../hooks/useJobs';
import { salaryLabel } from '../lib/salary';
import JobForm from './JobForm';

const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR');

function History({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  useEffect(() => {
    supabase.from('job_status_history').select('*').eq('job_id', jobId).order('created_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []) as HistoryRow[]));
  }, [jobId]);
  if (!rows.length) return <p className="muted">Sem histórico ainda.</p>;
  return (
    <ul className="history">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="muted">{fmt(r.created_at)}</span> {statusLabel(r.status)} ({r.source === 'claude_code' ? 'Claude Code' : 'manual'})
          {r.note ? `: ${r.note}` : ''}
        </li>
      ))}
    </ul>
  );
}

export default function JobsTable() {
  const { jobs, error, setStatus, updateJob, addJob } = useJobs();
  const [filter, setFilter] = useState<JobStatus | 'todas'>('todas');
  const [open, setOpen] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const shown: Job[] = filter === 'todas' ? jobs : jobs.filter((j) => j.status === filter);
  const count = (s: JobStatus) => jobs.filter((j) => j.status === s).length;

  return (
    <section>
      <div className="toolbar">
        <div className="chips">
          <button className={filter === 'todas' ? 'chip on' : 'chip'} onClick={() => setFilter('todas')}>Todas ({jobs.length})</button>
          {STATUSES.map((s) => (
            <button key={s.value} className={filter === s.value ? 'chip on' : 'chip'} onClick={() => setFilter(s.value)}>
              {s.label} ({count(s.value)})
            </button>
          ))}
        </div>
        <button className={formOpen ? 'primary' : 'chip'} onClick={() => setFormOpen(!formOpen)}>
          {formOpen ? 'Cancelar' : '+ Adicionar vaga'}
        </button>
      </div>
      {formOpen && <JobForm onAdd={addJob} onClose={() => setFormOpen(false)} />}
      {error && <p className="error">{error}</p>}
      {!shown.length ? (
        <p className="muted empty">Nenhuma vaga aqui. Adicione manualmente pelo botão acima ou rode a skill de scraping do Claude Code.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead><tr><th>Empresa</th><th>Função</th><th>Site</th><th>Salário</th><th>Contratação</th><th>Modelo</th><th>Status</th><th>Atualizada</th></tr></thead>
            <tbody>
              {shown.map((j) => (
                <Fragment key={j.id}>
                  <tr>
                    <td>{j.company}</td>
                    <td><button className="link" onClick={() => setOpen(open === j.id ? null : j.id)}>{j.role}</button></td>
                    <td>{j.url ? <a href={j.url} target="_blank" rel="noreferrer">{j.site}</a> : j.site}</td>
                    <td>{salaryLabel(j.salary)}</td>
                    <td>
                      <select
                        className="mini"
                        value={j.contract_type ?? ''}
                        onChange={(e) => updateJob(j.id, { contract_type: (e.target.value || null) as ContractType | null })}
                      >
                        <option value="">—</option>
                        {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        className="mini"
                        value={j.work_model ?? ''}
                        onChange={(e) => updateJob(j.id, { work_model: (e.target.value || null) as WorkModel | null })}
                      >
                        <option value="">—</option>
                        {WORK_MODELS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className={`st st-${j.status}`} value={j.status} onChange={(e) => setStatus(j.id, e.target.value as JobStatus)}>
                        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="muted">{fmt(j.status_updated_at)}</td>
                  </tr>
                  {open === j.id && (
                    <tr>
                      <td colSpan={8}>
                        {j.description && (
                          <div className="job-description">
                            <h4>Descrição da vaga</h4>
                            <p>{j.description}</p>
                          </div>
                        )}
                        <History jobId={j.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
