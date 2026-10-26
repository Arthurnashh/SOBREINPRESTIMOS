/**
 * Tradução das mensagens de erro de autenticação.
 *
 * O SDK do Supabase devolve erros genéricos: um 401 de chave inválida, um 502
 * de serviço fora do ar, excesso de tentativas e uma senha realmente errada
 * chegam todos com mensagens parecidas. Traduzir tudo para "senha incorreta"
 * faz o usuário trocar de senha por causa de indisponibilidade do provedor.
 *
 * Módulo sem dependência de framework (testável isoladamente).
 */
export function mensagemDeErroDeLogin(raw: string | undefined): string {
  const m = (raw ?? "").toLowerCase();

  if (/invalid login credentials|invalid_grant|invalid credentials/.test(m)) {
    return "E-mail ou senha incorretos.";
  }
  if (/user not found/.test(m)) {
    // Não revela se a conta existe.
    return "E-mail ou senha incorretos.";
  }
  if (/email[_ ]not[_ ]confirmed|email not confirmed|not confirmed/.test(m)) {
    return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  }
  if (/rate limit|too many requests|over_email_send_rate_limit/.test(m)) {
    return "Muitas tentativas seguidas. Aguarde um minuto e tente novamente.";
  }
  if (/invalid api key|no api key|jwt|unauthorized|forbidden/.test(m)) {
    return "O sistema de login está temporariamente indisponível. Tente novamente em instantes.";
  }
  if (/fetch failed|network|timeout|econnrefused|econnreset|502|503|504/.test(m)) {
    return "Não foi possível falar com o servidor de login. Tente novamente em instantes.";
  }
  return "Não foi possível entrar agora. Tente novamente em instantes.";
}
