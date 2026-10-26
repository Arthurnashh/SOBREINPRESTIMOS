import Header from "@/components/Header";
import { SignUpForm } from "@/components/AuthForms";
import { isValidRequest } from "@/lib/loan";

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ valor?: string; parcelas?: string }>;
}) {
  const { valor, parcelas } = await searchParams;
  const intent = isValidRequest(Number(valor), Number(parcelas))
    ? `valor=${Number(valor)}&parcelas=${Number(parcelas)}`
    : undefined;

  return (
    <>
      <Header />
      <main className="auth">
        <SignUpForm intent={intent} />
      </main>
    </>
  );
}
