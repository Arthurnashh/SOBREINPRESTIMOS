import type { SupabaseClient } from "@supabase/supabase-js";
import { BankService } from "./service";

/**
 * Toda leitura de saldo e toda movimentação passam pela conta do cliente
 * no Postgres. Não existe estado bancário no navegador.
 */
export function getBanking(supabase: SupabaseClient): BankService {
  return new BankService(supabase);
}

export { BankService };
export {
  KIND_LABEL,
  DEPOSIT_LABEL,
  WITHDRAW_LABEL,
  SCHEDULE_STATUS_LABEL,
  mensagemBanco,
} from "./types";
export type * from "./types";
