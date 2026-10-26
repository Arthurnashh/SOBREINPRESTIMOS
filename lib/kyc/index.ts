import type { SupabaseClient } from "@supabase/supabase-js";
import { KycService } from "./service";

export * from "./types";
export { KycService };

export function getKyc(supabase: SupabaseClient): KycService {
  return new KycService(supabase);
}
