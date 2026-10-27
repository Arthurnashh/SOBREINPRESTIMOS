import AuthShell from "@/components/AuthShell";
import { SignInForm } from "@/components/AuthForms";
import { safeAuthNext } from "@/lib/auth-redirect";

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string; senha?: string }>;
}) {
  const { next, erro, senha } = await searchParams;
  return (
    <AuthShell>
      <SignInForm
        next={safeAuthNext(next)}
        notice={senha === "alterada" ? "Senha atualizada. Entre com sua nova senha." : erro === "link" ? "O link expirou ou é inválido. Entre com e-mail e senha." : undefined}
      />
    </AuthShell>
  );
}
