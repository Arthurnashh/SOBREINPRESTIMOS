import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <><Header /><main className="wrap legal"><article className="card stack">{children}</article></main><Footer /></>;
}
