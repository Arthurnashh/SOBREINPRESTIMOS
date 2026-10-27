import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import { ForgotPasswordForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Recuperar senha", robots: { index: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <AuthShell>
      <ForgotPasswordForm invalidLink={erro === "link"} />
    </AuthShell>
  );
}
