export const LOAN = {
  min: 1000,
  max: 20000,
  step: 500,
  installmentOptions: [6, 12, 18, 24] as const,
  monthlyRate: Number(process.env.NEXT_PUBLIC_TAXA_MENSAL ?? "0.0399"),
  // Limite do produto no painel; não representa uma definição de teto legal.
  maxMonthlyRate: 0.2,
};

export const COMPANY = {
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACIDADE_EMAIL ?? "",
  name: process.env.NEXT_PUBLIC_EMPRESA_NOME ?? "SobreImpréstimos",
  cnpj: process.env.NEXT_PUBLIC_EMPRESA_CNPJ ?? "00.000.000/0001-00",
  partner:
    process.env.NEXT_PUBLIC_INSTITUICAO_PARCEIRA ?? "[instituição financeira parceira]",
};
