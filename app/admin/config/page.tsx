import { headers } from "next/headers";
import AdminGatewayForm from "@/components/AdminGatewayForm";
import { requireAdmin } from "@/lib/account";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuração do gateway" };

type Config = {
  environment: string;
  enabled: boolean;
  taxa_pct: number;
  webhook_token: string;
  tem_chave: boolean;
  chave_final: string;
  tem_segredo: boolean;
};

function urlBase(host: string | null, proto: string) {
  const env = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (/^https:\/\//.test(env) && !/localhost/.test(env)) return env;
  if (host && !/^localhost|^127\./.test(host)) return `${proto}://${host}`;
  return env;
}

export default async function AdminConfigPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_gateway_config_get");

  if (error) {
    return (
      <div className="card">
        <div className="alert alert-warn">
          <div>
            <strong>Migração pendente.</strong> Rode o <code>supabase/loan8.sql</code> no SQL
            Editor para habilitar a configuração do gateway.
          </div>
        </div>
      </div>
    );
  }

  const cfg = (data ?? {}) as Config;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = urlBase(host, proto);
  const webhookUrl = cfg.webhook_token
    ? `${base}/api/paguecom/webhook?token=${cfg.webhook_token}`
    : `${base}/api/paguecom/webhook`;

  return (
    <div className="stack" style={{ ["--gap" as string]: "18px", maxWidth: 720 }}>
      <div>
        <h1 className="page-title">Configuração do gateway</h1>
        <p className="muted">
          Cobrança Pix da taxa de confiança. Sem a chave configurada e o campo ativo, o cliente vê
          o aviso de que o pagamento ainda não está disponível.
        </p>
      </div>

      <AdminGatewayForm
        environment={cfg.environment === "sandbox" ? "sandbox" : "producao"}
        enabled={Boolean(cfg.enabled)}
        taxaPct={Number(cfg.taxa_pct ?? 0.5)}
        temChave={Boolean(cfg.tem_chave)}
        chaveFinal={cfg.chave_final ?? ""}
        temSegredo={Boolean(cfg.tem_segredo)}
        webhookUrl={webhookUrl}
      />
    </div>
  );
}
