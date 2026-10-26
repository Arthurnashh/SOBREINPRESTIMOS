export const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function isValidCpf(input: string) {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const isValidPhone = (s: string) => {
  const d = onlyDigits(s);
  return d.length === 10 || d.length === 11;
};

export type PixKeyType = "cpf" | "email" | "telefone" | "aleatoria";

export function isValidPixKey(type: PixKeyType, key: string) {
  switch (type) {
    case "cpf":
      return isValidCpf(key);
    case "email":
      return isValidEmail(key) && key.length <= 77;
    case "telefone":
      return isValidPhone(key);
    case "aleatoria":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key.trim());
  }
}
