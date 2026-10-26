import { createDemoProvider } from "./demo";
import { partnerProvider } from "./partner";
import type { BankingProvider } from "./types";

export function getBanking(demoUserId?: string): BankingProvider {
  return process.env.BAAS_PROVIDER === "parceiro" ? partnerProvider : createDemoProvider(demoUserId);
}

export type * from "./types";
