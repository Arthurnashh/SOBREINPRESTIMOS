import { removerChavePix } from "@/app/actions/banco";
import { requireSession } from "@/lib/account";
import { getBanking, KIND_LABEL } from "@/lib/banking";
import { brl, date } from "@/lib/format";
import FormChavePix from "@/components/banco/FormChavePix";
import Operacoes from "@/components/banco/Operacoes";

export const dynamic = "force-dynamic";

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

export default async function BancoPage() {
  const { supabase, profile } = await requireSession();
  const bank = getBanking(supabase);

  await bank.ensureAccount();
  await bank.ensureCard();

  const [account, card, chaves, extrato, boletos, resumo] = await Promise.all([
    bank.getAccount(),
    bank.getCard(),
    bank.getPixKeys(),
    bank.getStatement(30),
    bank.getBoletos(10),
    bank.getSummary(),
  ]);

  if (!account) {
    return (
      <div className="card">
        <div className="alert alert-warn">
          Não foi possível abrir sua conta agora. Tente novamente em alguns instantes ou fale com o
          atendimento.
        </div>
      </div>
    );
  }

  const mes = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      <div>
        <h1 className="page-title">Conta bancária</h1>
        <p className="muted">
          Ag. {account.agency} · Conta {account.number}-{account.checkDigit}
        </p>
      </div>

      {/* ---------------- saldo ---------------- */}
      <div className="grid-2">
        <section className="card">
          <div className="kpi-label">Saldo disponível</div>
          <div className="kpi">{brl(account.balance)}</div>
          {account.overdraft > 0 && (
            <p className="muted" style={{ marginTop: 6 }}>
              Limite de crédito: {brl(account.overdraft)} · Total disponível {brl(account.available)}
            </p>
          )}
          <p className="fine" style={{ marginTop: 8 }}>
            Conta {account.status === "ativa" ? "ativa" : account.status}
          </p>
        </section>

        <section className="card">
          <div className="kpi-label">Movimentação em {mes}</div>
          <div style={{ display: "flex", gap: 24, marginTop: 4 }}>
            <div>
              <div className="fine">Entradas</div>
              <div className="in" style={{ fontSize: 22, fontWeight: 700 }}>
                + {brl(resumo.inflow)}
              </div>
            </div>
            <div>
              <div className="fine">Saídas</div>
              <div className="out" style={{ fontSize: 22, fontWeight: 700 }}>
                − {brl(resumo.outflow)}
              </div>
            </div>
          </div>
          <p className="fine" style={{ marginTop: 10 }}>
            {resumo.transactions} {resumo.transactions === 1 ? "movimentação" : "movimentações"} no total
          </p>
        </section>
      </div>

      {/* ---------------- operações ---------------- */}
      <Operacoes disponivel={account.available} />

      {/* ---------------- cartão ---------------- */}
      <section className="card stack">
        <h2 style={{ fontSize: 22 }}>Cartão virtual</h2>
        {card ? (
          <>
            <div className="vcard">
              <div className="meta">
                <span>{card.brand}</span>
                <span>{card.status === "ativo" ? "Ativo" : card.status === "bloqueado" ? "Bloqueado" : "Cancelado"}</span>
              </div>
              <div className="num">•••• •••• •••• {card.last4}</div>
              <div className="meta">
                <span>{card.holder || profile?.full_name}</span>
                <span>
                  {String(card.expiryMonth).padStart(2, "0")}/{String(card.expiryYear).slice(-2)}
                </span>
              </div>
            </div>
            <p className="fine">
              Use o cartão para compras online. O saldo é debitado da sua conta. Número completo e CVV
              ficam disponíveis no app da instituição emissora.
            </p>
          </>
        ) : (
          <div className="vcard off">
            <div className="meta">
              <span>Cartão virtual</span>
            </div>
            <div className="num">•••• •••• •••• ••••</div>
            <p className="fine">Seu cartão está sendo emitido.</p>
          </div>
        )}
      </section>

      {/* ---------------- chaves pix ---------------- */}
      <section className="card stack">
        <h2 style={{ fontSize: 22 }}>Chaves PIX</h2>
        {!chaves.length ? (
          <div className="empty">Nenhuma chave cadastrada ainda.</div>
        ) : (
          <ul className="list">
            {chaves.map((k) => (
              <li key={k.id}>
                <div>
                  <strong>{mascararChave(k.keyType, k.keyValue)}</strong>
                  <div className="fine">
                    {TIPO_CHAVE[k.keyType] ?? k.keyType} · {date(k.createdAt)}
                  </div>
                </div>
                <form action={removerChavePix}>
                  <input type="hidden" name="id" value={k.id} />
                  <button className="link-btn">Remover</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <FormChavePix />
      </section>

      {/* ---------------- extrato ---------------- */}
      <section className="card stack">
        <h2 style={{ fontSize: 22 }}>Extrato</h2>
        {!extrato.length ? (
          <div className="empty">Nenhuma movimentação ainda.</div>
        ) : (
          <ul className="list">
            {extrato.map((t) => (
              <li key={t.id}>
                <div>
                  <div>{t.description}</div>
                  <div className="fine">
                    {KIND_LABEL[t.kind]} · {date(t.createdAt)}
                    {t.counterparty ? ` · ${t.counterparty}` : ""}
                  </div>
                </div>
                <span className={t.amount >= 0 ? "in" : "out"}>
                  {t.amount >= 0 ? "+ " : "− "}
                  {brl(Math.abs(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- boletos ---------------- */}
      {boletos.length > 0 && (
        <section className="card stack">
          <h2 style={{ fontSize: 22 }}>Boletos pagos</h2>
          <ul className="list">
            {boletos.map((b) => (
              <li key={b.id}>
                <div>
                  <div>{b.beneficiary}</div>
                  <div className="fine">
                    ••••{b.barcode.slice(-6)} · {date(b.paidAt)}
                  </div>
                </div>
                <span className="out">− {brl(b.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
