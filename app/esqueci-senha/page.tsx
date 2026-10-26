import type { Metadata } from "next";
import Header from "@/components/Header";
import { ForgotPasswordForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Recuperar senha", robots: { index: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return <><Header /><main className="auth"><ForgotPasswordForm invalidLink={erro === "link"} /></main></>;
}
