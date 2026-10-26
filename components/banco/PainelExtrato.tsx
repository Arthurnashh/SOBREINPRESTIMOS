import { brl, date } from "@/lib/format";
import {
  DEPOSIT_LABEL,
  KIND_LABEL,
  WITHDRAW_LABEL,
  type Boleto,
  type Deposit,
  type Receipt,
  type Topup,
  type Transaction,
  type Withdrawal,
} from "@/lib/banking";

/** Painel "Extrato" — lista completa + histórico por tipo + comprovantes. */
export default function PainelExtrato({
  extrato,
  depositos,
  saques,
  recargas,
  boletos,
  comprovantes,
}: {
  extrato: Transaction[];
  depositos: Deposit[];
  saques: Withdrawal[];
  recargas: Topup[];
  boletos: Boleto[];
  comprovantes: Receipt[];
}) {
  const entradas = extrato.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const saidas = extrato.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" }}>
      <section className="bank-secao">
        <header>
          <h2>Extrato</h2>
          <span className="bank-chip">{extrato.length} lançamentos</span>
        </header>

        {!extrato.length ? (
          <p className="fine">Nenhuma movimentação ainda. Seu extrato começa na primeira operação.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <div>
                <div className="fine">Total de entradas</div>
                <div className="valor entra" style={{ fontSize: 20, fontWeight: 700 }}>
                  + {brl(entradas)}
                </div>
              </div>
              <div>
                <div className="fine">Total de saídas</div>
                <div className="valor sai" style={{ fontSize: 20, fontWeight: 700 }}>
                  − {brl(saidas)}
                </div>
              </div>
            </div>
            <div>
              {extrato.map((t) => (
                <div className="bank-linha" key={t.id}>
                  <div>
                    <div className="quem">{t.description}</div>
                    <div className="quando">
                      {KIND_LABEL[t.kind]} · {date(t.createdAt)}
                      {t.counterparty ? ` · ${t.counterparty}` : ""}
                    </div>
                  </div>
                  <span className={`valor ${t.amount >= 0 ? "entra" : "sai"}`}>
                    {t.amount >= 0 ? "+ " : "− "}
                    {brl(Math.abs(t.amount))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {depositos.length > 0 && (
        <section className="bank-secao">
          <header>
            <h2>Depósitos recebidos</h2>
          </header>
          {depositos.map((d) => (
            <div className="bank-linha" key={d.id}>
              <div>
                <div className="quem">{DEPOSIT_LABEL[d.method]}</div>
                <div className="quando">
                  {date(d.createdAt)}
                  {d.origin ? ` · ${d.origin}` : ""}
                </div>
              </div>
              <span className="valor entra">+ {brl(d.amount)}</span>
            </div>
          ))}
        </section>
      )}

      {saques.length > 0 && (
        <section className="bank-secao">
          <header>
            <h2>Saques</h2>
          </header>
          {saques.map((s) => (
            <div className="bank-linha" key={s.id}>
              <div>
                <div className="quem">{WITHDRAW_LABEL[s.method]}</div>
                <div className="quando">
                  {date(s.createdAt)} · código de retirada {s.code}
                </div>
              </div>
              <span className="valor sai">− {brl(s.amount)}</span>
            </div>
          ))}
        </section>
      )}

      {recargas.length > 0 && (
        <section className="bank-secao">
          <header>
            <h2>Recargas de celular</h2>
          </header>
          {recargas.map((r) => (
            <div className="bank-linha" key={r.id}>
              <div>
                <div className="quem">{r.carrier}</div>
                <div className="quando">
                  ••••{r.phone.slice(-4)} · {date(r.createdAt)}
                </div>
              </div>
              <span className="valor sai">− {brl(r.amount)}</span>
            </div>
          ))}
        </section>
      )}

      {boletos.length > 0 && (
        <section className="bank-secao">
          <header>
            <h2>Boletos pagos</h2>
          </header>
          {boletos.map((b) => (
            <div className="bank-linha" key={b.id}>
              <div>
                <div className="quem">{b.beneficiary}</div>
                <div className="quando">
                  ••••{b.barcode.slice(-6)} · {date(b.paidAt)}
                </div>
              </div>
              <span className="valor sai">− {brl(b.amount)}</span>
            </div>
          ))}
        </section>
      )}

      {comprovantes.length > 0 && (
        <section className="bank-secao">
          <header>
            <h2>Comprovantes guardados</h2>
          </header>
          {comprovantes.map((c) => {
            const valor = c.payload?.amount;
            return (
              <div className="bank-linha" key={c.id}>
                <div>
                  <div className="quem">{c.title}</div>
                  <div className="quando">{date(c.createdAt)}</div>
                </div>
                {typeof valor === "number" && <span className="valor">{brl(valor)}</span>}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
