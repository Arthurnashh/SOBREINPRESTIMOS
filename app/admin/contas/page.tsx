import Link from "next/link";
import { requireAdmin } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { brl, date, formatCpf } from "@/lib/format";
import { KYC_STATUS_LABEL, type KycStatus } from "@/lib/kyc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas" };

type Item = {
  id: string;
  full_name: string;
  cpf: string;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
  agency: string | null;
  number: string | null;
  check_digit: string | null;
  balance: number | null;
  overdraft: number | null;
  conta_status: string | null;
  cartao_last4: string | null;
  cartao_status: string | null;
  kyc_status: KycStatus;
  lancamentos: number;
  pedidos: number;
};

function SeloKyc({ status }: { status: KycStatus }) {
  const classe =
    status === "aprovado" ? "b-aprovado"
    : status === "recusado" ? "b-cancelado"
    : status === "em_analise" || status === "pendente" ? "b-em_analise"
    : "b-cancelado";
  return <span className={`badge ${classe}`}>{KYC_STATUS_LABEL[status] ?? status}</span>;
}

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 80);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_listar_contas", {
    p_busca: q || null,
    p_limite: 200,
    p_offset: 0,
  });

  const itens: Item[] = (data?.itens ?? []) as Item[];
  const total: number = data?.total ?? 0;

  // Totais do topo. Somados no servidor para a tela não recalcular à toa.
  const somaSaldo = itens.reduce((s, i) => s + Number(i.balance ?? 0), 0);
  const comKyc = itens.filter((i) => i.kyc_status === "aprovado").length;
  const semKyc = itens.filter((i) => i.kyc_status === "nao_iniciado").length;
  const bloqueadas = itens.filter((i) => i.conta_status === "bloqueada").length;

  return (
    <div className="stack" style={{ ["--gap" as string]: "24px" }}>
      <div>
        <h1 className="page-title">Contas</h1>
        <p className="muted">
          Todas as contas cadastradas — com ou sem verificação enviada. Clique em uma para ver
          tudo: dados, documentos, biometria, saldo, extrato, cartão e empréstimos.
        </p>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {([
          ["Contas", String(total)],
          ["Saldo somado", brl(somaSaldo)],
          ["KYC aprovado", String(comKyc)],
          ["Sem verificação", String(semKyc)],
          ["Bloqueadas", String(bloqueadas)],
        ] as const).map(([rotulo, valor]) => (
          <div className="card kpi-card" key={rotulo}>
            <div className="kpi-label">{rotulo}</div>
            <div className="kpi" style={{ fontSize: 26 }}>{valor}</div>
          </div>
        ))}
      </div>

      <form action="/admin/contas" method="get" className="card user-search">
        <div className="field">
          <label htmlFor="q">Buscar por nome, CPF ou telefone</label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            maxLength={80}
            placeholder="Nome, CPF ou telefone"
            type="search"
          />
        </div>
        <button className="btn btn-primary">Buscar</button>
        {q && <Link href="/admin/contas" className="btn btn-ghost">Limpar</Link>}
      </form>

      <section className="card">
        {error ? (
          <div className="alert alert-err" role="alert">
            Não foi possível carregar as contas: {error.message}
          </div>
        ) : !itens.length ? (
          <div className="empty">{q ? "Nenhuma conta corresponde à busca." : "Nenhuma conta cadastrada."}</div>
        ) : (
          <div className="table-scroll">
            <table className="users-table">
              <caption className="sr-only">Contas cadastradas</caption>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Conta</th>
                  <th scope="col">Saldo</th>
                  <th scope="col">Verificação</th>
                  <th scope="col">Cartão</th>
                  <th scope="col">Movimento</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id}>
                    <th scope="row">
                      <div>{i.full_name}</div>
                      <div className="fine">CPF {formatCpf(i.cpf)}</div>
                    </th>
                    <td data-label="Conta">
                      {i.number ? (
                        <>
                          <div>Ag. {i.agency}</div>
                          <div className="fine">Conta {i.number}-{i.check_digit}</div>
                        </>
                      ) : (
                        <span className="fine">sem conta</span>
                      )}
                      {i.conta_status === "bloqueada" && <span className="badge b-cancelado">Bloqueada</span>}
                    </td>
                    <td data-label="Saldo">
                      <strong>{brl(Number(i.balance ?? 0))}</strong>
                      {Number(i.overdraft ?? 0) > 0 && (
                        <div className="fine">limite {brl(Number(i.overdraft))}</div>
                      )}
                    </td>
                    <td data-label="Verificação"><SeloKyc status={i.kyc_status} /></td>
                    <td data-label="Cartão">
                      {i.cartao_last4 ? (
                        <>
                          <div>•••• {i.cartao_last4}</div>
                          <div className="fine">{i.cartao_status}</div>
                        </>
                      ) : (
                        <span className="fine">—</span>
                      )}
                    </td>
                    <td data-label="Movimento">
                      <div className="fine">{i.lancamentos} lançamento(s)</div>
                      <div className="fine">{i.pedidos} pedido(s)</div>
                    </td>
                    <td>
                      <Link href={`/admin/contas/${i.id}`} className="btn btn-ghost" style={{ height: 36 }}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="fine">
        Cadastro em {itens.length ? date(itens[0].created_at) : "—"} (mais recente). Mostrando{" "}
        {itens.length} de {total}.
      </p>
    </div>
  );
}
