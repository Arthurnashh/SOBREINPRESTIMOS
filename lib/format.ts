const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const brl = (n: number) => brlFmt.format(n);

export const pct = (n: number, digits = 2) =>
  `${(n * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;

export const date = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export const formatCpf = (cpf: string) =>
  cpf.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
