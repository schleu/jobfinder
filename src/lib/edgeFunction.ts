// Traduz erros do supabase.functions.invoke em mensagens úteis.
// - FunctionsHttpError: a função respondeu, mas com status de erro (tem `context: Response`).
// - FunctionsFetchError: a requisição nem chegou (rede, CORS ou função não publicada).
export async function describeFunctionError(error: unknown, functionName: string): Promise<string> {
  const err = error as { message?: string; context?: Response } | null;
  const res = err?.context;

  if (res) {
    try {
      const body = (await res.json()) as { error?: string; message?: string; code?: string };
      if (body?.error) return body.error;
      if (body?.code === 'NOT_FOUND' || res.status === 404) {
        return `A função "${functionName}" não foi encontrada. Publique com: supabase functions deploy ${functionName}`;
      }
      if (body?.message) return body.message;
    } catch { /* corpo não era JSON */ }
    return err?.message || `A função "${functionName}" respondeu ${res.status}.`;
  }

  return `Não foi possível falar com a função "${functionName}". Verifique se ela está publicada (supabase functions deploy ${functionName}) e se a conexão está ok.`;
}
