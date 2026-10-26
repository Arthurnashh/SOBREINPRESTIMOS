/**
 * Ícones da conta bancária.
 *
 * Desenhados à mão em SVG, traço 1.8, grade 24x24, cantos arredondados —
 * nada de emoji nem biblioteca externa. `currentColor` deixa a cor vir do CSS.
 */
import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 22, children, ...resto }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {children}
    </svg>
  );
}

export function IconeInicio(p: Props) {
  return (
    <Base {...p}>
      <path d="M3.5 10.5 12 3.8l8.5 6.7" />
      <path d="M5.5 9.6V20h13V9.6" />
      <path d="M9.8 20v-5.2h4.4V20" />
    </Base>
  );
}

export function IconePix(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 3.6 20.4 12 12 20.4 3.6 12z" />
      <path d="M8.4 12h7.2" />
      <path d="M12 8.4v7.2" />
    </Base>
  );
}

export function IconeCartao(p: Props) {
  return (
    <Base {...p}>
      <rect x="2.6" y="5.4" width="18.8" height="13.2" rx="2.6" />
      <path d="M2.6 9.8h18.8" />
      <path d="M6.4 14.6h3.4" />
    </Base>
  );
}

export function IconeExtrato(p: Props) {
  return (
    <Base {...p}>
      <path d="M6 3.4h8.6L19 7.8V20.6H6z" />
      <path d="M14.2 3.4v4.6H19" />
      <path d="M9 12.4h6" />
      <path d="M9 15.8h4.4" />
    </Base>
  );
}

export function IconePerfil(p: Props) {
  return (
    <Base {...p}>
      <circle cx="12" cy="8.4" r="3.8" />
      <path d="M4.8 20.2c1.1-3.6 3.9-5.4 7.2-5.4s6.1 1.8 7.2 5.4" />
    </Base>
  );
}

export function IconeConfig(p: Props) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6" />
      <path d="M18.6 5.4 16.8 7.2M7.2 16.8l-1.8 1.8M18.6 18.6l-1.8-1.8M7.2 7.2 5.4 5.4" />
    </Base>
  );
}

/* ------------------------------ operações ------------------------------ */

export function IconeEnviar(p: Props) {
  return (
    <Base {...p}>
      <path d="M20.4 3.6 10.6 13.4" />
      <path d="M20.4 3.6 14.2 20.4l-3.6-7-7-3.6z" />
    </Base>
  );
}

export function IconeReceber(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 3.6v11.2" />
      <path d="M7.6 10.6 12 15l4.4-4.4" />
      <path d="M4.6 19.4h14.8" />
    </Base>
  );
}

export function IconeTransferir(p: Props) {
  return (
    <Base {...p}>
      <path d="M4.4 8.6h13.2" />
      <path d="M13.8 4.8l3.8 3.8-3.8 3.8" />
      <path d="M19.6 15.4H6.4" />
      <path d="M10.2 11.6 6.4 15.4l3.8 3.8" />
    </Base>
  );
}

export function IconeDepositar(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 3.8v10.4" />
      <path d="M7.8 10.4 12 14.6l4.2-4.2" />
      <path d="M4.8 17.4v2.4h14.4v-2.4" />
    </Base>
  );
}

export function IconeSacar(p: Props) {
  return (
    <Base {...p}>
      <rect x="2.8" y="6.2" width="18.4" height="12" rx="2.4" />
      <path d="M2.8 10.4h18.4" />
      <circle cx="12" cy="14.4" r="2.2" />
    </Base>
  );
}

export function IconeBoleto(p: Props) {
  return (
    <Base {...p}>
      <path d="M3.4 6.4h17.2v11.2H3.4z" />
      <path d="M7.2 9.4v5.2M10.4 9.4v5.2M13.8 9.4v5.2M17 9.4v5.2" />
    </Base>
  );
}

export function IconeRecarga(p: Props) {
  return (
    <Base {...p}>
      <rect x="6.4" y="2.8" width="11.2" height="18.4" rx="2.6" />
      <path d="M10.4 5.6h3.2" />
      <path d="M12 9.6v5.2" />
      <path d="M9.6 12.2 12 9.6l2.4 2.6" />
    </Base>
  );
}

export function IconeAgendar(p: Props) {
  return (
    <Base {...p}>
      <rect x="3.4" y="5" width="17.2" height="15.6" rx="2.4" />
      <path d="M3.4 9.6h17.2" />
      <path d="M8.2 3.4v3.2M15.8 3.4v3.2" />
      <path d="M12 12.6v3.4l2.2 1.4" />
    </Base>
  );
}

/* --------------------------- ações de interface --------------------------- */

export function IconeOlho(p: Props) {
  return (
    <Base {...p}>
      <path d="M2.6 12S6.2 5.8 12 5.8 21.4 12 21.4 12 17.8 18.2 12 18.2 2.6 12 2.6 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </Base>
  );
}

export function IconeOlhoFechado(p: Props) {
  return (
    <Base {...p}>
      <path d="M4 5.2 20 18.8" />
      <path d="M9.4 6.3A9.6 9.6 0 0 1 12 5.8c5.8 0 9.4 6.2 9.4 6.2a17 17 0 0 1-3 3.7" />
      <path d="M6.2 7.9A17 17 0 0 0 2.6 12s3.6 6.2 9.4 6.2a9.4 9.4 0 0 0 3.5-.7" />
    </Base>
  );
}

export function IconeCopiar(p: Props) {
  return (
    <Base {...p}>
      <rect x="8.6" y="8.6" width="11.8" height="11.8" rx="2.2" />
      <path d="M15.4 8.6V5.8a2.2 2.2 0 0 0-2.2-2.2H5.8A2.2 2.2 0 0 0 3.6 5.8v7.4a2.2 2.2 0 0 0 2.2 2.2h1.4" />
    </Base>
  );
}

export function IconeCadeado(p: Props) {
  return (
    <Base {...p}>
      <rect x="4.6" y="10.4" width="14.8" height="9.8" rx="2.4" />
      <path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6" />
    </Base>
  );
}

export function IconeCadeadoAberto(p: Props) {
  return (
    <Base {...p}>
      <rect x="4.6" y="10.4" width="14.8" height="9.8" rx="2.4" />
      <path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.3-1.3" />
    </Base>
  );
}

export function IconeSair(p: Props) {
  return (
    <Base {...p}>
      <path d="M9.8 20.2H5.4a2 2 0 0 1-2-2V5.8a2 2 0 0 1 2-2h4.4" />
      <path d="M15.4 16.4 19.8 12l-4.4-4.4" />
      <path d="M19.8 12H9.4" />
    </Base>
  );
}

export function IconeEscudo(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 2.8 19.4 6v6c0 4.4-3 7.6-7.4 9.2C7.6 19.6 4.6 16.4 4.6 12V6z" />
      <path d="M9 12.2l2.2 2.2 4-4.2" />
    </Base>
  );
}

export function IconeChip(p: Props) {
  return (
    <Base {...p}>
      <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.2" />
      <path d="M9.6 6.4V3.8M14.4 6.4V3.8M9.6 20.2v-2.6M14.4 20.2v-2.6M6.4 9.6H3.8M6.4 14.4H3.8M20.2 9.6h-2.6M20.2 14.4h-2.6" />
    </Base>
  );
}

export function IconeAproximacao(p: Props) {
  return (
    <Base {...p}>
      <path d="M6.6 4.4a10.6 10.6 0 0 1 0 15.2" />
      <path d="M10 7.6a6.6 6.6 0 0 1 0 8.8" />
      <path d="M13.4 10.4a2.8 2.8 0 0 1 0 3.2" />
    </Base>
  );
}
