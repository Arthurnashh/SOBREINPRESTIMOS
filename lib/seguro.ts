/**
 * Declaração de garantias do pedido de empréstimo.
 *
 * Fica em lib/ e não em app/actions/loans.ts porque um arquivo "use server"
 * só pode exportar funções async — exportar constantes de lá quebra o build.
 *
 * A lista espelha o CHECK de `loan_requests.seguro_tipo` no banco
 * (supabase/loan3.sql). Se um lado mudar, o outro precisa acompanhar.
 */
export const SEGURO_TIPOS = [
  "veiculo",
  "imovel",
  "vida",
  "residencial",
  "consignado",
  "fiador",
  "nenhum",
  "outro",
] as const;

export type SeguroTipo = (typeof SEGURO_TIPOS)[number];

export const SEGURO_LABEL: Record<SeguroTipo, string> = {
  veiculo: "Tenho veículo em meu nome",
  imovel: "Tenho imóvel próprio",
  vida: "Tenho seguro de vida",
  residencial: "Tenho seguro residencial",
  consignado: "Tenho margem consignável ou convênio",
  fiador: "Tenho fiador",
  nenhum: "Não tenho nenhuma dessas garantias",
  outro: "Outra situação",
};

export function ehSeguroTipo(v: string): v is SeguroTipo {
  return (SEGURO_TIPOS as readonly string[]).includes(v);
}
