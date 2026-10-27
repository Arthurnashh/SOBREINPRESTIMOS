import { LOAN } from "./config";

/**
 * Periodicidade de pagamento.
 *
 * A taxa é sempre definida em % ao MÊS (LOAN.monthlyRate, hoje 3,99% a.m.) e
 * convertida para o período por juros compostos. Assim mudar a taxa num lugar
 * só (lib/config.ts) ajusta as três modalidades.
 */
export const PERIODICIDADES = ["semanal", "quinzenal", "mensal"] as const;
export type Periodicidade = (typeof PERIODICIDADES)[number];

export const PERIODO: Record<
  Periodicidade,
  {
    label: string;
    /** Dias entre parcelas. Também usado para o vencimento. */
    dias: number;
    /** Quantas parcelas cabem em um mês (para converter a taxa). */
    porMes: number;
    /** Prefixo da contagem: "6 semanas", "6 quinzenas", "6 meses". */
    unidade: string;
    /** Opções de prazo oferecidas nesta modalidade. */
    opcoes: readonly number[];
  }
> = {
  semanal: { label: "Semanal", dias: 7, porMes: 4.345, unidade: "semanas", opcoes: [12, 24] },
  quinzenal: { label: "Quinzenal", dias: 15, porMes: 2.174, unidade: "quinzenas", opcoes: [12, 18] },
  mensal: { label: "Mensal", dias: 30, porMes: 1, unidade: "meses", opcoes: [6, 12, 18, 24] },
};

export function ehPeriodicidade(v: string): v is Periodicidade {
  return (PERIODICIDADES as readonly string[]).includes(v);
}

/**
 * Converte a taxa mensal para a taxa do período.
 *
 * Ex.: 3,99% a.m. em 4,345 semanas por mês →
 *   (1 + 0,0399)^(1/4,345) − 1 ≈ 0,90% por semana.
 *
 * É juros compostos equivalentes: o custo total fica parecido nas três
 * modalidades, mudando apenas o intervalo entre os pagamentos.
 */
export function taxaDoPeriodo(monthlyRate: number, p: Periodicidade): number {
  return Math.pow(1 + monthlyRate, 1 / PERIODO[p].porMes) - 1;
}

export type Simulation = {
  amount: number;
  installments: number;
  monthlyRate: number;
  iof: number;
  financed: number;
  installmentValue: number;
  total: number;
  totalInterest: number;
  cetMonthly: number;
  cetYearly: number;
  /** Novidade: periodicidade e taxa efetiva do período. */
  periodicidade: Periodicidade;
  taxaPeriodo: number;
  /** Dias entre parcelas, para projetar os vencimentos. */
  diasPeriodo: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Parcela fixa pela Tabela Price. */
export function pmt(pv: number, rate: number, n: number) {
  if (rate === 0) return pv / n;
  return (pv * rate) / (1 - Math.pow(1 + rate, -n));
}

/**
 * IOF estimado para pessoa física: 0,38% fixo + 0,0082% ao dia sobre o
 * principal amortizado em cada parcela (dias limitados a 365).
 *
 * O `diasPorParcela` entrou com a periodicidade: quem paga semanalmente
 * amortiza mais rápido, então o IOF diário é menor.
 */
export function estimateIof(amount: number, rate: number, n: number, diasPorParcela = 30) {
  const p = pmt(amount, rate, n);
  let balance = amount;
  let daily = 0;
  for (let k = 1; k <= n; k++) {
    const amort = p - balance * rate;
    balance -= amort;
    daily += amort * 0.000082 * Math.min(diasPorParcela * k, 365);
  }
  return round2(amount * 0.0038 + daily);
}

/** Taxa mensal que iguala o valor recebido ao fluxo de parcelas (CET). */
function cet(received: number, installment: number, n: number) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const pv = (installment * (1 - Math.pow(1 + mid, -n))) / mid;
    if (pv > received) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Valida valor, prazo e periodicidade.
 *
 * O prazo aceito depende da modalidade (PERIODO[p].opcoes): semanal até 24
 * semanas, quinzenal até 18 quinzenas, mensal até 24 meses.
 */
export function isValidRequest(
  amount: number,
  installments: number,
  periodicidade: Periodicidade = "mensal"
) {
  const faixa = PERIODO[periodicidade] ?? PERIODO.mensal;
  return (
    Number.isFinite(amount) &&
    amount >= LOAN.min &&
    amount <= LOAN.max &&
    amount % LOAN.step === 0 &&
    (faixa.opcoes as readonly number[]).includes(installments)
  );
}

/**
 * Simulação sem nenhuma tarifa antecipada: o cliente recebe o valor
 * integral e o IOF é financiado junto com as parcelas.
 *
 * O CET é sempre apresentado em base mensal e anual, mesmo quando o
 * pagamento é semanal — é assim que a regulamentação exige.
 */
export function simulate(
  amount: number,
  installments: number,
  monthlyRate: number = LOAN.monthlyRate,
  periodicidade: Periodicidade = "mensal"
): Simulation {
  const dias = PERIODO[periodicidade].dias;
  const taxa = taxaDoPeriodo(monthlyRate, periodicidade);

  const iof = estimateIof(amount, taxa, installments, dias);
  const financed = round2(amount + iof);
  const installmentValue = round2(pmt(financed, taxa, installments));
  const total = round2(installmentValue * installments);

  // O CET é a taxa mensal que reproduz o fluxo. Para semanal/quinzenal, o
  // número de parcelas é convertido para meses antes de calcular.
  const mesesEquivalentes = installments / PERIODO[periodicidade].porMes;
  const cetMensalDoFluxo = cet(amount, installmentValue, mesesEquivalentes);

  return {
    amount,
    installments,
    monthlyRate,
    iof,
    financed,
    installmentValue,
    total,
    totalInterest: round2(total - amount),
    cetMonthly: cetMensalDoFluxo,
    cetYearly: Math.pow(1 + cetMensalDoFluxo, 12) - 1,
    periodicidade,
    taxaPeriodo: taxa,
    diasPeriodo: dias,
  };
}

/**
 * Datas de vencimento das parcelas.
 *
 * A primeira vence um período depois da liberação, e as demais em sequência.
 * Devolve ISO (YYYY-MM-DD) para gravar direto em coluna `date`.
 */
export function vencimentos(base: Date, n: number, periodicidade: Periodicidade): string[] {
  const dias = PERIODO[periodicidade].dias;
  const out: string[] = [];
  for (let k = 1; k <= n; k++) {
    const d = new Date(base.getTime() + dias * k * 24 * 60 * 60 * 1000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
