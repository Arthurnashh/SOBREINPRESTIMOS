import Link from "next/link";
import Simulator from "@/components/Simulator";
import { requireSession, STATUS_LABEL, type LoanRequest } from "@/lib/account";
import { brl } from "@/lib/format";
import { isValidRequest } from "@/lib/loan";

export default async function EmprestimoPage({
  searchParams,
}: {
  searchParams: Promise<{ valor?: string; parcelas?: string }>;
}) {
  const { valor, parcelas } = await searchParams;
  const { supabase } = await requireSession();

  const { data: open } = await supabase
    .from("loan_requests")
    .select("id, amount, installments, status")
    .in("status", ["em_analise", "aprovado"])
    .limit(1)
    .maybeSingle<Pick<LoanRequest, "id" | "amount" | "installments" | "status">>();

  const preset = isValidRequest(Number(valor), Number(parcelas));

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px", maxWidth: 560 }}>
      <div>
        <h1 className="page-title">Pedir empréstimo</h1>
        <p className="muted">
          Escolha valor e prazo. O pedido vai para análise e você recebe o contrato antes de
          assinar.
        </p>
      </div>

      {open ? (
        <div className="card stack">
          <div className="alert alert-warn">
            <div>
              <strong>Você já tem um pedido em andamento</strong>
              {brl(Number(open.amount))} em {open.installments}x · {STATUS_LABEL[open.status]}
            </div>
          </div>
          <Link href="/conta" className="btn btn-ghost">
            Ver meus pedidos
          </Link>
        </div>
      ) : (
        <Simulator
          mode="request"
          initialAmount={preset ? Number(valor) : 5000}
          initialInstallments={preset ? Number(parcelas) : 12}
        />
      )}
    </div>
  );
}
