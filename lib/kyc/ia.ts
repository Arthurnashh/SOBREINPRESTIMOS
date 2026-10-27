/**
 * Triagem automática do KYC por visão computacional.
 *
 * A ideia é tirar do admin o trabalho repetitivo — conferir se o documento é
 * legível, se é mesmo um RG/CNH e se os dados batem com o cadastro — e deixar
 * com ele só o que exige julgamento.
 *
 * LIMITES, escritos aqui de propósito:
 *
 *   1. Nenhuma IA barata diz se um documento é FALSIFICADO. Ela diz que
 *      "parece uma CNH". Uma falsificação bem feita passa. Por isso a
 *      aprovação automática exige confiança alta e margem grande.
 *   2. Comparação facial 1:1 em provedor de plano gratuito é fraca. Serve
 *      como sinal, não como prova.
 *   3. A responsabilidade pela liberação é da operação, não do provedor.
 *
 * O módulo é puro de propósito (sem rede, sem Supabase) para poder ser testado
 * sem chave de API: `montarPedido` e `interpretarResposta` são funções puras, e
 * só `analisar` fala com o provedor.
 */

export type KycDecisaoIA = "aprovar" | "revisar" | "recusar";

/** O que a IA conseguiu ler do documento. */
export type LeituraDocumento = {
  /** É mesmo um documento de identificação? */
  ehDocumento: boolean;
  tipoAparente: "rg" | "cnh" | "outro" | "indeterminado";
  /** Dá para ler os dados sem esforço? */
  legivel: boolean;
  nomeNoDocumento: string | null;
  cpfNoDocumento: string | null;
  /** Data de validade do documento, se houver (ISO YYYY-MM-DD). */
  validoAte: string | null;
  /** Sinais de adulteração visível (recorte, fonte estranha, etc.). */
  sinaisAdulteracao: string[];
};

export type ResultadoIA = {
  decisao: KycDecisaoIA;
  /** 0 a 1. Abaixo do limiar, nunca aprova sozinho. */
  confianca: number;
  /** Por que decidiu assim — vai para a trilha de auditoria. */
  motivos: string[];
  /** O que o admin precisa olhar, quando vai para a mão dele. */
  alertas: string[];
  documento: LeituraDocumento | null;
  /** Verificações que o provedor não conseguiu fazer. */
  naoVerificado: string[];
};

/**
 * Confiança mínima para aprovar sem passar pelo admin.
 *
 * Alto de propósito. O custo de errar para mais é um humano conferir algo
 * óbvio; o custo de errar para menos é liberar crédito para um golpista.
 */
export const CONFIANCA_MINIMA_APROVAR = 0.92;

/** Abaixo disto, recusa automática (documento ilegível ou não é documento). */
export const CONFIANCA_MINIMA_RECUSAR = 0.85;

/**
 * Decide o que fazer com a leitura, sem chamar ninguém.
 *
 * Separada da rede para poder testar os casos de borda exaustivamente — é aqui
 * que mora o risco de aprovar o que não devia.
 */
export function decidir(args: {
  confianca: number;
  documento: LeituraDocumento | null;
  /** Nome do cadastro, para conferir com o do documento. */
  nomeCadastro: string | null;
  cpfCadastro: string | null;
  /** A comparação facial foi feita e bateu? null = não deu para fazer. */
  faceBate: boolean | null;
  /** Hoje, em ISO, para checar validade do documento. */
  hoje: string;
}): ResultadoIA {
  const { confianca, documento, nomeCadastro, cpfCadastro, faceBate, hoje } = args;
  const motivos: string[] = [];
  const alertas: string[] = [];
  const naoVerificado: string[] = [];

  // Nada foi lido: não dá para decidir nada.
  if (!documento) {
    return {
      decisao: "revisar",
      confianca: 0,
      motivos: ["A análise não devolveu leitura do documento."],
      alertas: ["Análise automática indisponível — confira manualmente."],
      documento: null,
      naoVerificado: ["documento", "face"],
    };
  }

  // ---- recusa: nem é documento, ou não dá para ler ----
  if (!documento.ehDocumento) {
    motivos.push("A imagem enviada não foi reconhecida como documento de identificação.");
    return {
      decisao: "recusar",
      confianca,
      motivos,
      alertas: [],
      documento,
      naoVerificado: [],
    };
  }

  // ---- sinais que impedem aprovação automática ----

  if (!documento.legivel) {
    alertas.push("Documento ilegível ou parcialmente encoberto.");
  }

  if (documento.tipoAparente === "indeterminado" || documento.tipoAparente === "outro") {
    alertas.push("Não deu para confirmar se é RG ou CNH.");
  }

  if (documento.sinaisAdulteracao.length > 0) {
    alertas.push(`Possível adulteração: ${documento.sinaisAdulteracao.join("; ")}.`);
  }

  // Validade vencida: bloqueia aprovação automática.
  if (documento.validoAte) {
    if (documento.validoAte < hoje) {
      alertas.push(`Documento vencido em ${documento.validoAte}.`);
    }
  } else {
    naoVerificado.push("validade do documento");
  }

  // Confere nome e CPF contra o cadastro. Divergência é sinal forte de fraude
  // ou de documento de outra pessoa.
  if (documento.cpfNoDocumento && cpfCadastro) {
    const a = documento.cpfNoDocumento.replace(/\D/g, "");
    const b = cpfCadastro.replace(/\D/g, "");
    if (a && b && a !== b) {
      alertas.push("O CPF do documento não confere com o CPF do cadastro.");
    }
  } else {
    naoVerificado.push("CPF do documento");
  }

  if (documento.nomeNoDocumento && nomeCadastro) {
    if (!nomeCompativel(documento.nomeNoDocumento, nomeCadastro)) {
      alertas.push("O nome do documento não confere com o nome do cadastro.");
    }
  } else {
    naoVerificado.push("nome do documento");
  }

  // Face match. `null` significa que o provedor não conseguiu comparar.
  if (faceBate === null) {
    naoVerificado.push("comparação facial");
  } else if (!faceBate) {
    alertas.push("A selfie não confere com a foto do documento.");
  }

  // ---- decisão ----

  if (alertas.length > 0) {
    motivos.push("Há pontos que exigem conferência humana.");
    return { decisao: "revisar", confianca, motivos, alertas, documento, naoVerificado };
  }

  // Sem alerta, mas com verificações faltando: ainda pode aprovar sozinho,
  // desde que a confiança seja alta e a lacuna não seja a face.
  const lacunaGrave = naoVerificado.includes("comparação facial");

  if (confianca >= CONFIANCA_MINIMA_APROVAR && !lacunaGrave) {
    motivos.push("Documento legível, dados conferem e a selfie bate com o documento.");
    return { decisao: "aprovar", confianca, motivos, alertas, documento, naoVerificado };
  }

  motivos.push(
    lacunaGrave
      ? "A comparação facial não pôde ser concluída."
      : `Confiança ${(confianca * 100).toFixed(0)}% abaixo do mínimo para aprovar sozinho.`
  );
  return { decisao: "revisar", confianca, motivos, alertas, documento, naoVerificado };
}

/**
 * Nomes batem? Compara os conjuntos de palavras, sem ordem e sem acento.
 *
 * Exigir igualdade exata daria falso positivo à toa: "MARIA DA SILVA" e
 * "Maria Silva" são a mesma pessoa. Exigir só o primeiro nome daria falso
 * negativo perigoso: qualquer "João" passaria.
 */
export function nomeCompativel(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length > 2); // ignora "da", "de", "dos"

  const pa = new Set(norm(a));
  const pb = new Set(norm(b));
  if (pa.size === 0 || pb.size === 0) return false;

  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;

  // Exige SEMPRE pelo menos duas partes em comum.
  //
  // A versão anterior usava `Math.min(2, partes/2)`, o que numa lista de duas
  // partes caía para 1 — e aí bastava o primeiro nome bater: "JOAO SILVA" e
  // "JOAO PEREIRA" passavam como a mesma pessoa. Nome de duas partes é o caso
  // mais comum no Brasil, então a falha era a regra, não a exceção.
  //
  // Para nome de uma parte só (raro em documento), duas em comum é
  // impossível: nesse caso o nome precisa bater inteiro.
  if (pa.size === 1 || pb.size === 1) {
    const [unicoA] = pa;
    const [unicoB] = pb;
    return pa.size === 1 && pb.size === 1 && unicoA === unicoB;
  }

  return comuns >= 2;
}

/**
 * Monta o corpo da requisição para o provedor.
 *
 * Puro: recebe as imagens já em base64 e devolve o JSON. Não sabe qual
 * provedor é, o que permite testar sem rede.
 */
export function montarPedido(args: {
  modelo: string;
  imagens: { rotulo: string; base64: string; mime: string }[];
  nomeCadastro: string | null;
  cpfCadastro: string | null;
  hoje: string;
}): Record<string, unknown> {
  const { modelo, imagens, nomeCadastro, cpfCadastro, hoje } = args;

  const instrucao = [
    "Você confere documentos de identidade brasileiros (RG ou CNH) para uma",
    "análise de crédito. Analise as imagens e responda APENAS com um objeto",
    "JSON, sem texto em volta, neste formato exato:",
    "",
    "{",
    '  "ehDocumento": true|false,',
    '  "tipoAparente": "rg"|"cnh"|"outro"|"indeterminado",',
    '  "legivel": true|false,',
    '  "nomeNoDocumento": "string ou null",',
    '  "cpfNoDocumento": "string ou null",',
    '  "validoAte": "YYYY-MM-DD ou null",',
    '  "sinaisAdulteracao": ["string"],',
    '  "faceBate": true|false|null,',
    '  "confianca": 0.0 a 1.0,',
    '  "observacoes": "string"',
    "}",
    "",
    "Regras:",
    "- Seja conservador. Na dúvida, use confianca baixa e legivel=false.",
    "- `sinaisAdulteracao` deve listar apenas o que você realmente observou:",
    "  fonte inconsistente, recorte visível, campos borrados seletivamente,",
    "  foto colada, reflexo estranho. Não invente.",
    "- `faceBate` compara o rosto da selfie com a foto do documento. Use null",
    "  se não houver selfie ou se não for possível comparar.",
    "- `confianca` é a sua certeza sobre a análise como um todo.",
    "",
    `Hoje é ${hoje}.`,
    nomeCadastro ? `Nome no cadastro: ${nomeCadastro}.` : "",
    cpfCadastro ? `CPF no cadastro: ${cpfCadastro}.` : "",
    "Confira se o nome e o CPF do documento batem com os do cadastro.",
  ]
    .filter(Boolean)
    .join("\n");

  const conteudo: Record<string, unknown>[] = [{ type: "text", text: instrucao }];
  for (const img of imagens) {
    conteudo.push({ type: "text", text: img.rotulo });
    conteudo.push({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${img.base64}` },
    });
  }

  return {
    model: modelo,
    messages: [{ role: "user", content: conteudo }],
    temperature: 0,
    response_format: { type: "json_object" },
  };
}

/**
 * Interpreta a resposta do provedor.
 *
 * O modelo pode devolver JSON dentro de bloco markdown, com campo faltando ou
 * com tipo errado. Nada disso pode derrubar a análise: na dúvida, devolve um
 * resultado conservador que manda para a mão do admin.
 */
export function interpretarResposta(texto: string): {
  documento: LeituraDocumento | null;
  faceBate: boolean | null;
  confianca: number;
  observacoes: string | null;
} {
  const vazio = { documento: null, faceBate: null, confianca: 0, observacoes: null };

  let cru = texto.trim();
  // Remove cerca de markdown, se houver.
  const cerca = cru.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) cru = cerca[1].trim();
  // Se veio texto em volta, isola o primeiro objeto.
  if (!cru.startsWith("{")) {
    const i = cru.indexOf("{");
    const f = cru.lastIndexOf("}");
    if (i >= 0 && f > i) cru = cru.slice(i, f + 1);
  }

  let d: Record<string, unknown>;
  try {
    d = JSON.parse(cru) as Record<string, unknown>;
  } catch {
    return vazio;
  }

  const tipo = String(d.tipoAparente ?? "indeterminado");
  const tipoOk = ["rg", "cnh", "outro", "indeterminado"].includes(tipo);

  const sinais = Array.isArray(d.sinaisAdulteracao)
    ? d.sinaisAdulteracao.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const doc: LeituraDocumento = {
    ehDocumento: d.ehDocumento === true,
    tipoAparente: (tipoOk ? tipo : "indeterminado") as LeituraDocumento["tipoAparente"],
    legivel: d.legivel === true,
    nomeNoDocumento: typeof d.nomeNoDocumento === "string" ? d.nomeNoDocumento : null,
    cpfNoDocumento: typeof d.cpfNoDocumento === "string" ? d.cpfNoDocumento : null,
    validoAte:
      typeof d.validoAte === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.validoAte)
        ? d.validoAte
        : null,
    sinaisAdulteracao: sinais,
  };

  // Confiança fora da faixa é normalizada em vez de descartada.
  let conf = Number(d.confianca);
  if (!Number.isFinite(conf)) conf = 0;
  if (conf > 1) conf = conf > 100 ? 1 : conf / 100;
  if (conf < 0) conf = 0;

  return {
    documento: doc,
    faceBate: typeof d.faceBate === "boolean" ? d.faceBate : null,
    confianca: conf,
    observacoes: typeof d.observacoes === "string" ? d.observacoes : null,
  };
}

/* ========================== camada de rede ==============================
 *
 * Tudo abaixo fala com o provedor. O resto do arquivo é puro e testável sem
 * chave. Mantenho a separação para que a parte que decide — a que pode liberar
 * crédito — nunca dependa de rede para ser verificada.
 *
 * Provedor padrão: Google AI Studio (Gemini), que tem plano gratuito e aceita
 * imagem. A URL é compatível com o formato da OpenAI, então trocar de provedor
 * é trocar duas variáveis de ambiente.
 * ===================================================================== */

const PROVEDOR_PADRAO = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODELO_PADRAO = "gemini-2.0-flash";

/** O provedor está configurado? */
export function iaConfigurada(): boolean {
  return Boolean(process.env.IA_API_KEY?.trim());
}

export type EntradaAnalise = {
  documentoFrente: { base64: string; mime: string };
  selfie: { base64: string; mime: string } | null;
  nomeCadastro: string | null;
  cpfCadastro: string | null;
  hoje: string;
};

export type SaidaAnalise =
  | { ok: true; resultado: ResultadoIA; observacoes: string | null }
  | { ok: false; error: string };

/**
 * Analisa os documentos e devolve a decisão já calculada.
 *
 * Nunca lança: erro de rede, chave ausente ou resposta inválida viram
 * `{ ok: false }`, e quem chama manda o caso para a fila manual. Uma falha do
 * provedor não pode travar o KYC do cliente nem aprovar por engano.
 */
export async function analisar(entrada: EntradaAnalise): Promise<SaidaAnalise> {
  const chave = process.env.IA_API_KEY?.trim();
  if (!chave) return { ok: false, error: "Análise automática não configurada." };

  const url = process.env.IA_API_URL?.trim() || PROVEDOR_PADRAO;
  const modelo = process.env.IA_MODELO?.trim() || MODELO_PADRAO;

  const imagens: { rotulo: string; base64: string; mime: string }[] = [
    { rotulo: "Documento de identificação (frente):", ...entrada.documentoFrente },
  ];
  if (entrada.selfie) imagens.push({ rotulo: "Selfie do cliente:", ...entrada.selfie });

  const corpo = montarPedido({
    modelo,
    imagens,
    nomeCadastro: entrada.nomeCadastro,
    cpfCadastro: entrada.cpfCadastro,
    hoje: entrada.hoje,
  });

  // O KYC não pode ficar esperando o provedor indefinidamente: o cliente está
  // olhando a tela. 45s é folgado e ainda deixa margem para o timeout da rota.
  const controle = new AbortController();
  const alarme = setTimeout(() => controle.abort(), 45_000);

  let texto: string;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });

    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      return {
        ok: false,
        error: `Provedor respondeu ${resp.status}${detalhe ? `: ${detalhe.slice(0, 200)}` : ""}`,
      };
    }

    const json = (await resp.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const bruto = json.choices?.[0]?.message?.content;
    if (typeof bruto !== "string") return { ok: false, error: "Resposta do provedor sem conteúdo." };
    texto = bruto;
  } catch (e) {
    const abortado = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: abortado ? "O provedor demorou demais para responder." : "Falha ao chamar o provedor.",
    };
  } finally {
    clearTimeout(alarme);
  }

  const lido = interpretarResposta(texto);
  const resultado = decidir({
    confianca: lido.confianca,
    documento: lido.documento,
    nomeCadastro: entrada.nomeCadastro,
    cpfCadastro: entrada.cpfCadastro,
    faceBate: lido.faceBate,
    hoje: entrada.hoje,
  });

  return { ok: true, resultado, observacoes: lido.observacoes };
}

