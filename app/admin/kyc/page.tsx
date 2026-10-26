import Link from "next/link";
import { requireAdmin } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { getKyc, KYC_STATUS_LABEL, type KycFilaItem, type KycResumo } from "@/lib/kyc";
import AnaliseKyc from "@/components/kyc/AnaliseKyc";

export const dynamic = "force-dynamic";

export const metadata = { title: "Verificações de identidade" };

export default async function AdminKycPage() {
  await requireAdmin();
  const supabase = await createClient();
  const kyc = getKyc(supabase);

  const [fila, resumo] = await Promise.all([kyc.fila(), kyc.resumo()]);

  const vazio: KycResumo = { emAnalise: 0, aprovado: 0, recusado: 0, pendente: 0, naoIniciado: 0 };
  const itens: KycFilaItem[] = fila.ok ? fila.data : [];

  return (
    <main className="wrap" style={{ paddingTop: 28, paddingBottom: 56 }}>
      <p className="fine" style={{ marginBottom: 10 }}>
        <Link href="/admin">← Voltar ao painel</Link>
      </p>

      <div className="kyc-shell">
        <div className="kyc-topo">
          <div>
            <h1>Verificações de identidade</h1>
            <p>
              Confira os documentos, a selfie com o documento e a biometria antes de aprovar. Sem
              aprovação, o cliente não movimenta a conta nem pede empréstimo.
            </p>
          </div>
        </div>

        {!fila.ok && (
          <div className="alert alert-err" role="alert">
            {fila.error}
          </div>
        )}

        <div className="kyc-contadores">
          <div className="kyc-contador">
            <b>{resumo.ok ? resumo.data.emAnalise : vazio.emAnalise}</b>
            <span>Aguardando análise</span>
          </div>
          <div className="kyc-contador">
            <b>{resumo.ok ? resumo.data.pendente : vazio.pendente}</b>
            <span>Correção pedida</span>
          </div>
          <div className="kyc-contador">
            <b>{resumo.ok ? resumo.data.aprovado : vazio.aprovado}</b>
            <span>Aprovadas</span>
          </div>
          <div className="kyc-contador">
            <b>{resumo.ok ? resumo.data.recusado : vazio.recusado}</b>
            <span>Recusadas</span>
          </div>
          <div className="kyc-contador">
            <b>{resumo.ok ? resumo.data.naoIniciado : vazio.naoIniciado}</b>
            <span>Não iniciaram</span>
          </div>
        </div>

        {itens.length === 0 ? (
          <div className="kyc-bloco">
            <p className="fine">Nenhuma verificação enviada até agora.</p>
          </div>
        ) : (
          <AnaliseKyc itens={itens} />
        )}

        <div className="kyc-bloco">
          <p className="fine">
            Classificação de status: {Object.values(KYC_STATUS_LABEL).join(" · ")}.
          </p>
        </div>
      </div>
    </main>
  );
}
