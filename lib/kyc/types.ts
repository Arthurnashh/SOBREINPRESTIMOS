/** Tipos do KYC — verificação de identidade do cliente. */

export type KycStatus = "nao_iniciado" | "em_analise" | "aprovado" | "recusado" | "pendente";

export const KYC_STATUS_LABEL: Record<KycStatus, string> = {
  nao_iniciado: "Não iniciada",
  em_analise: "Em análise",
  aprovado: "Aprovada",
  recusado: "Recusada",
  pendente: "Correção solicitada",
};

export type KycDocType = "cnh" | "rg";
export type KycProofType = "luz" | "agua" | "telefone" | "internet" | "banco" | "outro";

export const DOC_LABEL: Record<KycDocType, string> = {
  cnh: "CNH — Carteira Nacional de Habilitação",
  rg: "RG — Cédula de Identidade",
};

export const PROOF_LABEL: Record<KycProofType, string> = {
  luz: "Conta de luz",
  agua: "Conta de água",
  telefone: "Conta de telefone",
  internet: "Conta de internet",
  banco: "Extrato ou fatura de banco",
  outro: "Outro comprovante",
};

/** Os cinco ângulos da captura facial. */
export type FaceAngle = "frontal" | "direita" | "esquerda" | "sorriso" | "perto";

export type FaceShot = {
  angle: FaceAngle;
  label: string;
  instrucao: string;
};

export const FACE_SHOTS: FaceShot[] = [
  { angle: "frontal", label: "Frontal", instrucao: "Olhe de frente para a câmera, rosto centralizado" },
  { angle: "direita", label: "Vire à direita", instrucao: "Vire o rosto devagar para a sua direita" },
  { angle: "esquerda", label: "Vire à esquerda", instrucao: "Vire o rosto devagar para a sua esquerda" },
  { angle: "sorriso", label: "Sorria", instrucao: "Sorria de forma natural, com a boca aberta" },
  { angle: "perto", label: "Aproxime", instrucao: "Aproxime o rosto da câmera, sem encostar" },
];

export type KycSubmission = {
  status: KycStatus;
  fullName: string | null;
  cpf: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  motherName: string | null;

  cep: string | null;
  address: string | null;
  addressNumber: string | null;
  addressExtra: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;

  docType: KycDocType | null;
  docNumber: string | null;
  docIssuer: string | null;
  docState: string | null;
  proofType: KycProofType | null;

  temDocFrente: boolean;
  temDocVerso: boolean;
  temComprovante: boolean;
  temSelfieDoc: boolean;
  temBiometria: boolean;

  livenessPassed: boolean;
  livenessScore: number | null;
  qualityScore: number | null;

  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  podeMovimentar: boolean;
};

export type KycFilaItem = {
  userId: string;
  nome: string;
  cpf: string | null;
  status: KycStatus;
  docType: KycDocType | null;
  cidade: string | null;
  state: string | null;
  livenessScore: number | null;
  qualityScore: number | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export type KycPaths = Partial<Record<
  "doc_frente" | "doc_verso" | "comprovante" | "selfie_doc" |
  "face_frontal" | "face_direita" | "face_esquerda" | "face_sorriso" | "face_perto",
  string | null
>>;

export type KycDetalhe = {
  userId: string;
  status: KycStatus;
  fullName: string | null;
  cpf: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  motherName: string | null;
  cep: string | null;
  address: string | null;
  addressNumber: string | null;
  addressExtra: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  docType: KycDocType | null;
  docNumber: string | null;
  docIssuer: string | null;
  docState: string | null;
  proofType: KycProofType | null;
  paths: KycPaths;
  livenessPassed: boolean;
  livenessScore: number | null;
  qualityScore: number | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export type KycResumo = {
  emAnalise: number;
  aprovado: number;
  recusado: number;
  pendente: number;
  naoIniciado: number;
};

/** Traduz os erros técnicos do banco para português claro. */
export function mensagemKyc(msg: string): string {
  const m = msg.toLowerCase();

  if (m.includes("não autenticado")) return "Sua sessão expirou. Entre novamente.";
  if (m.includes("acesso restrito")) return "Esta ação é restrita à administração.";
  if (m.includes("envio não encontrado")) return "Verificação não encontrada.";
  if (m.includes("já está em análise")) return "Sua verificação já está em análise.";
  if (m.includes("já foi aprovada")) return "Sua verificação já foi aprovada.";
  if (m.includes("cadastro não iniciado")) return "Comece preenchendo seus dados.";
  if (m.includes("caminho de arquivo inválido")) return "Não foi possível anexar o arquivo. Tente de novo.";
  if (m.includes("tipo de arquivo desconhecido")) return "Tipo de anexo não reconhecido.";
  if (m.includes("explique o motivo")) return "Explique o motivo da recusa.";
  if (m.includes("decisão inválida")) return "Decisão inválida.";
  if (m.includes("ainda não enviou")) return "O cliente ainda não enviou a verificação.";

  // falta concluir: <lista>
  const falta = msg.match(/falta concluir:\s*(.+)$/i);
  if (falta) return `Falta concluir: ${falta[1]}.`;

  if (m.includes("nome completo")) return "Informe o nome completo (nome e sobrenome).";
  if (m.includes("data de nascimento no futuro")) return "Data de nascimento no futuro.";
  if (m.includes("18 anos")) return "É preciso ter 18 anos ou mais.";
  if (m.includes("data de nascimento inválida")) return "Data de nascimento inválida.";
  if (m.includes("informe a data de nascimento")) return "Informe a data de nascimento.";
  if (m.includes("nome completo da mãe")) return "Informe o nome completo da mãe.";
  if (m.includes("celular inválido")) return "Celular inválido.";
  if (m.includes("e-mail inválido")) return "E-mail inválido.";
  if (m.includes("cep inválido")) return "CEP inválido.";
  if (m.includes("informe o logradouro")) return "Informe o logradouro.";
  if (m.includes("informe o número")) return "Informe o número.";
  if (m.includes("informe o bairro")) return "Informe o bairro.";
  if (m.includes("informe a cidade")) return "Informe a cidade.";
  if (m.includes("uf do documento inválida")) return "UF do documento inválida.";
  if (m.includes("uf inválida")) return "UF inválida.";
  if (m.includes("escolha cnh ou rg")) return "Escolha CNH ou RG.";
  if (m.includes("número do documento")) return "Informe o número do documento.";
  if (m.includes("órgão emissor")) return "Informe o órgão emissor.";

  if (m.includes("verificação de identidade pendente"))
    return "Conclua sua verificação de identidade para movimentar a conta.";

  return "Não foi possível concluir. Tente novamente.";
}
