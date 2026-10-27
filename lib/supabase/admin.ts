import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./server";

/**
 * Cliente com a chave de serviço (`service_role`).
 *
 * Só pode ser importado por código de servidor: Server Actions, Route
 * Handlers e scripts. Ela ignora a RLS, por isso é usada apenas onde a
 * regra já foi validada antes — confirmar um pagamento do gateway, por
 * exemplo.
 */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
