import { removerChavePix } from "@/app/actions/banco";
import { date } from "@/lib/format";
import FormChavePix from "./FormChavePix";
import Operacoes from "./Operacoes";
import type { PixKey, PixCharge } from "@/lib/banking";

const TIPO_CHAVE: Record<string, string> = {
  cpf: "CPF",
  email: "E-mail",
  telefone: "Celular",
  aleatoria: "Aleatória",
};

function mascararChave(tipo: string, valor: string) {
  if (tipo === "email") {
    const [nome, dominio] = valor.split("@");
    if (!dominio) return valor;
    return `${nome.slice(0, 2)}${"•".repeat(Math.max(2, nome.length - 2))}@${dominio}`;
  }
  if (tipo === "cpf") return `•••.•••.•••-${valor.slice(-2)}`;
  if (tipo === "telefone") return `•••••${valor.slice(-4)}`;
  return `${valor.slice(0, 4)}••••${valor.slice(-4)}`;
}

/** Painel "Área PIX": chaves, operações e cobranças. */
export default function PainelPix({
  chaves,
  cobrancas,
  disponivel,
}: {
  chaves: PixKey[];
  cobrancas: PixCharge[];
  disponivel: number;
}) {
  const abertas = cobrancas.filter((c) => c.status === "aberta");

  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" }}>
      <section className="bank-secao">
        <header>
          <h2>Área PIX</h2>
          <span className="bank-chip">Disponível {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(disponivel)}</span>
        </header>
        <Operacoes disponivel={disponivel} />
      </section>

      <section className="bank-secao">
        <header>
          <h2>Minhas chaves</h2>
          <span className="bank-chip">{chaves.length} cadastrada{chaves.length === 1 ? "" : "s"}</span>
        </header>
        {!chaves.length ? (
          <p className="fine">
            Cadastre uma chave para receber PIX. Você pode ter CPF, e-mail, celular e chave aleatória.
          </p>
        ) : (
          <div>
            {chaves.map((k) => (
              <div className="bank-linha" key={k.id}>
                <div>
                  <div className="quem">{mascararChave(k.keyType, k.keyValue)}</div>
                  <div className="quando">
                    {TIPO_CHAVE[k.keyType] ?? k.keyType} · {date(k.createdAt)}
                  </div>
                </div>
                <form action={removerChavePix}>
                  <input type="hidden" name="id" value={k.id} />
                  <button className="link-btn">Remover</button>
                </form>
              </div>
            ))}
          </div>
        )}
        <FormChavePix />
      </section>

      {abertas.length > 0 && (
        <section className="bank-secao">
          <header>
            <h2>Cobranças aguardando pagamento</h2>
          </header>
          <div>
            {abertas.map((c) => (
              <div className="bank-linha" key={c.id}>
                <div>
                  <div className="quem">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.amount)}
                  </div>
                  <div className="quando">
                    {c.description || "Cobrança PIX"} · {date(c.createdAt)}
                  </div>
                </div>
                <span className="bank-chip alerta">Aberta</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
