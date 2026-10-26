"use server";

import { revalidatePath } from "next/cache";
import { getBanking } from "@/lib/banking";
import { createClient } from "@/lib/supabase/server";
import { isValidPixKey, onlyDigits, type PixKeyType } from "@/lib/validation";
import { parsePixAmount } from "@/lib/banking/demo-state";

export type PixReceipt = {
  id: string; demo: boolean; date: string; amount: number; destination: string; description: string;
};
export type PixFormState = {
  error?: string;
  receipt?: PixReceipt;
  fields?: { keyType: string; key: string; amount: string; description: string };
} | undefined;

const KEY_TYPES: PixKeyType[] = ["cpf", "email", "telefone", "aleatoria"];

export async function sendPix(_prev: PixFormState, formData: FormData): Promise<PixFormState> {
  const keyType = String(formData.get("keyType")) as PixKeyType;
  const rawKey = String(formData.get("key") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "");
  const amount = rawAmount.length > 30 ? null : parsePixAmount(rawAmount);
  const description = String(formData.get("description") ?? "").slice(0, 140);
  const fail = (error: string): PixFormState => ({ error, fields: { keyType, key: rawKey.slice(0, 77), amount: rawAmount.slice(0, 30), description } });

  if (!KEY_TYPES.includes(keyType)) return fail("Tipo de chave inválido.");
  if (rawKey.length > 77 || !isValidPixKey(keyType, rawKey)) return fail("Chave PIX inválida para o tipo escolhido.");
  if (amount === null) return fail("Informe um valor válido com até duas casas decimais.");

  const key = keyType === "cpf" || keyType === "telefone" ? onlyDigits(rawKey) : rawKey;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sessão expirada. Entre novamente.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("external_account_id")
    .eq("id", user.id)
    .single();

  const banking = getBanking(user.id);
  const result = await banking.sendPix(profile?.external_account_id ?? null, {
    keyType,
    key,
    amount,
    description: description || undefined,
  });

  if (!result.ok) return fail(result.error);

  revalidatePath("/conta");
  revalidatePath("/conta/pix");
  return { receipt: {
    id: result.data.id, demo: banking.isDemo, date: new Date().toISOString(), amount,
    destination: `••••${key.slice(-4)}`, description,
  } };
}
