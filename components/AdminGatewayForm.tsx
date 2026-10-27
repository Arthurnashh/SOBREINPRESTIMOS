"use client";

import { useActionState } from "react";
import { salvarGateway, type GatewayFormState } from "@/app/actions/gateway";

type Props = {
  environment: string;
  enabled: boolean;
  taxaPct: number;
  temChave: boolean;
  chaveFinal: string;
  temSegredo: boolean;
  webhookUrl: string;
};

export default function AdminGatewayForm({
  environment,
  enabled,
  taxaPct,
  temChave,
  chaveFinal,
  temSegredo,
  webhookUrl,
}: Props) {
  const [estado, acao, pendente] = useActionState<GatewayFormState, FormData>(
    salvarGateway,
    undefined
  );

  return (
    <form action={acao} className="card stack" style={{ ["--gap" as string]: "16px" }}>
      <div>
        <h2 style={{ fontSize: 22, marginBottom: 6 }}>PagueCom — cobrança Pix</h2>
        <p className="muted">
          As credenciais ficam no banco e são usadas apenas pelo servidor. A chave de API é gerada
          em{" "}
          <a href="https://app.paguecom.link" target="_blank" rel="noreferrer">
            app.paguecom.link
          </a>{" "}
          (Configurações → API) e a documentação está em{" "}
          <a href="https://app.paguecom.link/docs" target="_blank" rel="noreferrer">
            app.paguecom.link/docs
          </a>
          .
        </p>
      </div>

      <label className="field">
        <span>Ambiente</span>
        <select name="environment" defaultValue={environment}>
          <option value="producao">Produção (api.paguecom.link)</option>
          <option value="sandbox">Sandbox (sandbox.paguecom.link)</option>
        </select>
      </label>

      <label className="field">
        <span>Chave de API {temChave ? `(configurada${chaveFinal ? ` — final ${chaveFinal}` : ""})` : "(não configurada)"}</span>
        <input
          type="password"
          name="api_key"
          autoComplete="off"
          placeholder={temChave ? "Deixe em branco para manter a atual" : "Cole a chave de API"}
        />
      </label>

      <label className="field">
        <span>
          Segredo do webhook{" "}
          {temSegredo ? "(configurado)" : "(opcional — a validação principal é a consulta ao gateway)"}
        </span>
        <input
          type="password"
          name="webhook_secret"
          autoComplete="off"
          placeholder={temSegredo ? "Deixe em branco para manter o atual" : "whsec_… (opcional)"}
        />
      </label>

      <label className="field">
        <span>Taxa de confiança (% da parcela)</span>
        <input
          type="number"
          name="taxa_pct"
          min={0.01}
          max={100}
          step={0.5}
          defaultValue={(taxaPct * 100).toFixed(2)}
          required
        />
        <span className="fine">
          50 = metade da parcela. Vale para as próximas liberações; pedidos já liberados mantêm o
          percentual gravado neles.
        </span>
      </label>

      <label className="check">
        <input type="checkbox" name="enabled" defaultChecked={enabled} />
        <span>Ativar cobrança Pix da taxa de confiança</span>
      </label>

      <div>
        <div className="kpi-label">URL do webhook</div>
        <p className="fine" style={{ wordBreak: "break-all" }}>
          {webhookUrl || "Configure NEXT_PUBLIC_SITE_URL para gerar a URL do webhook."}
        </p>
        <p className="fine">
          Cadastre esta URL no painel do PagueCom (Webhooks) assinando <code>charge.paid</code> e{" "}
          <code>charge.expired</code>. Mesmo sem webhook, a tela consulta o gateway a cada 5
          segundos e libera a conta quando o pagamento aparece.
        </p>
      </div>

      {estado?.error && (
        <div className="alert alert-err" role="alert">
          {estado.error}
        </div>
      )}
      {estado?.success && (
        <div className="alert alert-ok" role="status">
          {estado.success}
        </div>
      )}

      <div>
        <button type="submit" className="btn btn-primary" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </form>
  );
}
