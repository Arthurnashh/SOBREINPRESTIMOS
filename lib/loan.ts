import { LOAN } from "./config";

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
 */
export function estimateIof(amount: number, rate: number, n: number) {
  const p = pmt(amount, rate, n);
  let balance = amount;
  let daily = 0;
  for (let k = 1; k <= n; k++) {
    const amort = p - balance * rate;
    balance -= amort;
    daily += amort * 0.000082 * Math.min(30 * k, 365);
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

export function isValidRequest(amount: number, installments: number) {
  return (
    Number.isFinite(amount) &&
    amount >= LOAN.min &&
    amount <= LOAN.max &&
    amount % LOAN.step === 0 &&
    (LOAN.installmentOptions as readonly number[]).includes(installments)
  );
}

/**
 * Simulação sem nenhuma tarifa antecipada: o cliente recebe o valor
 * integral e o IOF é financiado junto com as parcelas.
 */
export function simulate(
  amount: number,
  installments: number,
  monthlyRate: number = LOAN.monthlyRate
): Simulation {
  const iof = estimateIof(amount, monthlyRate, installments);
  const financed = round2(amount + iof);
  const installmentValue = round2(pmt(financed, monthlyRate, installments));
  const total = round2(installmentValue * installments);
  const cetMonthly = cet(amount, installmentValue, installments);
  return {
    amount,
    installments,
    monthlyRate,
    iof,
    financed,
    installmentValue,
    total,
    totalInterest: round2(total - amount),
    cetMonthly,
    cetYearly: Math.pow(1 + cetMonthly, 12) - 1,
  };
}
