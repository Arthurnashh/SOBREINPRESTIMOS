export const LOAN = {
  min: 500,
  max: 20000,
  step: 100,
  installmentOptions: [6, 12, 18, 24] as const,
  monthlyRate: Number(process.env.NEXT_PUBLIC_TAXA_MENSAL ?? "0.0399"),
  // Limite do produto no painel; não representa uma definição de teto legal.
  maxMonthlyRate: 0.2,
};

export const COMPANY = {
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACIDADE_EMAIL ?? "",
  name: process.env.NEXT_PUBLIC_EMPRESA_NOME ?? "SobreImpréstimos",
  // Sem CNPJ configurado, o rodapé não inventa um número — omite a linha.
  cnpj: process.env.NEXT_PUBLIC_EMPRESA_CNPJ ?? "",
  partner: process.env.NEXT_PUBLIC_INSTITUICAO_PARCEIRA ?? "",
};

/** O CNPJ 00.000.000/0001-00 é placeholder: não serve para exibir ao público. */
export function cnpjValido(cnpj: string) {
  const d = cnpj.replace(/\D/g, "");
  return d.length === 14 && !/^0+$/.test(d) && d !== "00000000000100";
}
