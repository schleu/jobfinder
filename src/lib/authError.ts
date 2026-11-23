// Traduz erros do Supabase Auth em mensagens úteis.
// O `code` vem do servidor e é mais estável que o texto em inglês.
export function describeAuthError(error: unknown): string {
  const err = error as { message?: string; code?: string; status?: number } | null;
  const code = err?.code ?? '';
  const message = (err?.message ?? '').toLowerCase();

  if (code === 'over_email_send_rate_limit' || message.includes('email rate limit')) {
    return 'Muitos e-mails foram enviados em pouco tempo. Aguarde alguns minutos e tente novamente. Se precisar de mais envios, configure um SMTP próprio no Supabase (Authentication → SMTP Settings).';
  }

  if (code === 'over_request_rate_limit' || err?.status === 429 || message.includes('rate limit')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.';
  }

  return err?.message || 'Não foi possível concluir a operação. Tente novamente.';
}
