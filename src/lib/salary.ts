// Valores especiais aceitos no campo Salário, além do valor em si.
export const SALARY_NOT_INFORMED = 'Não informado';
export const SALARY_INTERVIEW = 'Na entrevista';
export const SALARY_SUGGESTIONS = [SALARY_NOT_INFORMED, SALARY_INTERVIEW];

// Textos que indicam salário combinado depois, sem valor numérico.
const NEGOTIABLE_RE = /(a combinar|combinar|na entrevista|entrevista|negoci[áa]vel|a definir|compat[íi]vel com o mercado|negotiable|to be discussed)/i;

export function normalizeSalary(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;

  if (/^n[ãa]o informad[oa]$/i.test(text)) return null;
  // Só troca por "Na entrevista" quando não há valor numérico na frase.
  if (!/\d/.test(text) && NEGOTIABLE_RE.test(text)) return SALARY_INTERVIEW;

  return text;
}

export const salaryLabel = (salary: string | null) => salary ?? SALARY_NOT_INFORMED;
