import { useState } from 'react';
import { useResume } from '../hooks/useResume';
import type { ResumeAnalysis } from '../types';

const scoreColor = (score: number) =>
  score >= 75 ? '#86efac' : score >= 50 ? '#fcd34d' : '#fca5a5';

const fmtDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

function Result({ row }: { row: { data: ResumeAnalysis; model: string | null; created_at: string } }) {
  const a = row.data;
  const strengths = a.pontos_fortes ?? [];
  const weaknesses = a.pontos_fracos ?? [];
  const keywords = a.palavras_chave ?? [];
  const suggestions = a.sugestoes ?? [];
  const adherence = a.aderencia_funcoes ?? [];
  const score = Math.max(0, Math.min(100, Math.round(a.nota_geral ?? 0)));
  const years = a.anos_experiencia ?? 0;

  return (
    <div className="card">
      <div className="resume-score">
        <div className="score-badge" style={{ borderColor: scoreColor(score), color: scoreColor(score) }}>
          {score}
        </div>
        <div>
          <strong>Nota geral do currículo</strong>
          <p className="muted resume-sub">
            {a.nivel}
            {years > 0 ? ` · ${years} ${years === 1 ? 'ano' : 'anos'} de experiência` : ''}
          </p>
        </div>
        <p className="muted resume-meta">
          {row.model ? `${row.model} · ` : ''}
          {fmtDate(row.created_at)}
        </p>
      </div>

      {a.resumo && <p className="resume-summary">{a.resumo}</p>}

      <div className="resume-cols">
        <List title="Pontos fortes" items={strengths} />
        <List title="Pontos a melhorar" items={weaknesses} />
      </div>

      {keywords.length > 0 && (
        <div className="resume-block">
          <h3>Palavras-chave detectadas</h3>
          <div className="chips">
            {keywords.map((word) => <span key={word} className="chip">{word}</span>)}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="resume-block">
          <h3>Sugestões</h3>
          <ul>{suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}

      <div className="resume-block">
        <h3>Aderência às funções procuradas</h3>
        {adherence.length ? (
          adherence.map((item) => (
            <div key={item.funcao} className="adh">
              <div className="adh-head">
                <span>{item.funcao}</span>
                <strong style={{ color: scoreColor(item.nota) }}>{item.nota}%</strong>
              </div>
              <div className="adh-bar">
                <span style={{ width: `${Math.max(0, Math.min(100, item.nota))}%`, background: scoreColor(item.nota) }} />
              </div>
              {item.justificativa && <small>{item.justificativa}</small>}
            </div>
          ))
        ) : (
          <p className="muted">
            Cadastre funções procuradas em Configurações e reanalise para ver a aderência do currículo.
          </p>
        )}
      </div>
    </div>
  );
}

export default function ResumePanel({ userId }: { userId: string }) {
  const r = useResume(userId);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = r.uploading || r.analyzing;

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    const ok = await r.uploadResume(file);
    setNotice(ok ? 'Currículo enviado. Clique em Analisar com IA.' : null);
  };

  const onAnalyze = async () => {
    setNotice(null);
    await r.analyzeResume();
  };

  return (
    <section className="resume">
      <div className="card">
        <div className="resume-head">
          <div>
            <h2>Currículo</h2>
            <p className="muted">
              {r.loading
                ? 'Carregando…'
                : r.settings?.resume_path
                  ? 'PDF enviado. Envie outro para substituir.'
                  : 'Nenhum PDF enviado.'}
            </p>
          </div>
          <button className="primary" onClick={onAnalyze} disabled={busy || !r.settings?.resume_path}>
            {r.analyzing ? 'Analisando…' : r.analysis ? 'Reanalisar com IA' : 'Analisar com IA'}
          </button>
        </div>

        <div className="resume-actions">
          <input
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={(e) => {
              onUpload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {r.uploading && <span className="muted">enviando…</span>}
          {r.analyzing && <span className="muted">lendo seu currículo… isso pode levar alguns segundos.</span>}
        </div>

        {notice && <p className="success">{notice}</p>}
        {r.error && <p className="error">{r.error}</p>}
      </div>

      {r.analysis ? (
        <Result row={r.analysis} />
      ) : (
        !r.loading && r.settings?.resume_path && (
          <div className="card empty muted">
            Nenhuma análise ainda. Clique em <strong>Analisar com IA</strong> para gerar pontos fortes, lacunas,
            palavras-chave e a aderência às funções que você procura.
          </div>
        )
      )}
    </section>
  );
}
