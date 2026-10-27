"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FACE_SHOTS, type FaceAngle } from "@/lib/kyc";
import {
  analisarQuadro,
  deslocamentoHorizontal,
  diferencaEntreQuadros,
  prontoParaCapturar,
  qualidadeParaNota,
  QUADROS_ESTAVEIS,
  type MetricasQuadro,
} from "@/lib/kyc/visao";
import { IconeCadeado, IconeCartao, IconeEscudo, IconePerfil } from "../Icones";

type Props = {
  onFace: (angle: FaceAngle, blob: Blob) => Promise<{ ok: boolean; error?: string }>;
  onConcluir: (dados: { livenessPassed: boolean; livenessScore: number; qualityScore: number }) => void;
};

const LADO = 320;

/**
 * Captura automática.
 *
 * O enquadramento bom sozinho não basta para disparar: nos ângulos de virar a
 * cabeça o rosto ainda está em movimento quando a prova de vida é confirmada,
 * e a captura seria recusada por tremor (`movimento > 45`). Então esperamos o
 * quadro ficar bom, a prova de vida confirmada E o movimento cair.
 *
 * São dois quadros estáveis seguidos, a 400 ms cada: ~800 ms entre "ficou
 * pronto" e a foto. O contador na tela avisa antes para ninguém ser pego de
 * surpresa; o botão continua funcionando para quem quiser forçar.
 */
const INTERVALO_MS = 400;

export default function CapturaFacial({ onFace, onConcluir }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anteriorRef = useRef<ImageData | null>(null);
  const frontalRef = useRef<ImageData | null>(null);
  /** Movimento atual, fora do estado, para não recriar `analisar` a cada quadro. */
  const movimentoRef = useRef(0);
  /** Quantos quadros seguidos estão prontos e parados. */
  const estaveisRef = useRef(0);
  /** Trava para o automático e o botão nunca capturarem o mesmo ângulo duas vezes. */
  const disparandoRef = useRef(false);
  /**
   * Índice para o qual `metricas`/`provaDeVida`/`movimento` já foram medidos.
   *
   * Sem isto o automático disparava o ângulo SEGUINTE com os dados do
   * anterior: logo após capturar, `provaDeVida` ainda era true e
   * `metricas.ok` ainda era do quadro antigo, então o novo ângulo era
   * fotografado antes de a pessoa se mexer — e a prova de vida falhava no
   * fim. O automático só age quando o analisador já rodou para o índice atual.
   */
  const medidoRef = useRef(-1);

  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [indice, setIndice] = useState(0);
  const [metricas, setMetricas] = useState<MetricasQuadro | null>(null);
  const [movimento, setMovimento] = useState(0);
  const [deslocamento, setDeslocamento] = useState(0);
  const [capturando, setCapturando] = useState(false);
  const [notas, setNotas] = useState<number[]>([]);
  /** Para cada ângulo já capturado: houve movimento confirmado? */
  const [provas, setProvas] = useState<boolean[]>([]);
  const [provaDeVida, setProvaDeVida] = useState(false);
  const [salvando, setSalvando] = useState(false);
  /** Quadros estáveis já acumulados — alimenta o contador da tela. */
  const [estaveis, setEstaveis] = useState(0);

  const atual = FACE_SHOTS[indice];
  const ultimo = indice === FACE_SHOTS.length - 1;

  /* ------------------------------ câmera ------------------------------ */
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelado = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        setPronto(true);
      } catch (e) {
        const nome = e instanceof Error ? e.name : "";
        if (nome === "NotAllowedError") {
          setErro("Você precisa permitir o acesso à câmera para fazer a verificação.");
        } else if (nome === "NotFoundError") {
          setErro("Não encontrei uma câmera neste aparelho.");
        } else {
          setErro("Não foi possível abrir a câmera. Feche outros apps que estejam usando ela.");
        }
      }
    })();

    return () => {
      cancelado = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /* --------------------- análise contínua do quadro -------------------- */
  const analisar = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.readyState < 2) return;

    c.width = LADO;
    c.height = LADO;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // recorte quadrado central — o rosto deve caber aqui
    const ladoMenor = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - ladoMenor) / 2;
    const sy = (v.videoHeight - ladoMenor) / 2;
    ctx.drawImage(v, sx, sy, ladoMenor, ladoMenor, 0, 0, LADO, LADO);

    const m = analisarQuadro(ctx, LADO, LADO);
    setMetricas(m);
    // Marca que este quadro já corresponde ao ângulo atual — o automático
    // depende disto para não disparar com dados do ângulo anterior.
    medidoRef.current = indice;

    const quadro = ctx.getImageData(0, 0, LADO, LADO);
    const anterior = anteriorRef.current;

    // movimento em relação ao quadro anterior.
    // Lido de um ref, não do estado: `analisar` também ESCREVE o movimento, e
    // depender do estado fazia o callback ser recriado a cada mudança — o que
    // reiniciava o intervalo de 400 ms o tempo todo e atrapalhava a própria
    // medição de movimento que a prova de vida usa.
    let mov = movimentoRef.current;
    if (anterior) {
      mov = diferencaEntreQuadros(anterior, quadro);
      movimentoRef.current = mov;
      setMovimento(Math.round(mov));
    }

    // prova de vida: comparar o ângulo atual com o frontal
    if (frontalRef.current && atual.angle !== "frontal") {
      const desl = deslocamentoHorizontal(frontalRef.current, quadro, LADO);
      setDeslocamento(Number(desl.toFixed(3)));

      /*
       * Limites alcançáveis. O de "perto" era tamanho > 0.12, mas um rosto
       * normal mede por volta de 0.10 no enquadramento correto — ou seja, era
       * impossível cumprir sem colar o rosto na lente. O de virar a cabeça cai
       * para 0.012, que ainda separa "virou" de "parado" (ruído fica abaixo).
       */
      let confirmou = false;
      if (atual.angle === "direita" || atual.angle === "esquerda") {
        confirmou = Math.abs(desl) >= 0.012;
      } else if (atual.angle === "sorriso") {
        confirmou = mov > 2;
      } else if (atual.angle === "perto") {
        // aproximar aumenta a área de pele em relação ao quadro anterior
        confirmou = m.tamanho > 0.12 || mov > 2;
      }

      // Só marca o ângulo ATUAL. Antes o sinal ficava ligado para sempre e um
      // único movimento validava todos os ângulos seguintes.
      if (confirmou) setProvaDeVida(true);
    }

    // guarda o quadro para comparar com o próximo — é a base do movimento
    anteriorRef.current = quadro;
    // `movimento` sai das dependências de propósito: é lido via ref.
  }, [atual.angle, indice]);

  useEffect(() => {
    if (!pronto) return;
    const id = window.setInterval(analisar, INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [pronto, analisar]);

  useEffect(() => {
    setProvaDeVida(false);
    estaveisRef.current = 0;
    setEstaveis(0);
  }, [indice]);

  /* ------------------------------ captura ----------------------------- */
  const capturar = useCallback(async () => {
    // O automático e o botão podem coincidir; sem a trava o mesmo ângulo
    // subiria duas vezes e o segundo envio sobrescreveria o primeiro.
    if (disparandoRef.current) return;

    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) {
      setErro("A câmera ainda não está pronta. Aguarde um instante.");
      return;
    }

    // O quadro precisa ter sido analisado ao menos uma vez.
    if (!metricas) {
      setErro("Só um instante: ainda estou analisando o enquadramento.");
      return;
    }

    // Antes o botão ficava desabilitado e a pessoa não entendia por quê.
    // Agora clicamos sempre e explicamos o que ajustar.
    if (!metricas.ok) {
      setErro(metricas.problemas[0] ?? "Ajuste o enquadramento e tente de novo.");
      return;
    }

    // Movimento NÃO bloqueia mais a captura. A prova de vida depende de a
    // pessoa virar o rosto, então recusar por movimento contradizia a própria
    // instrução da tela. Só barramos tremor extremo, com folga bem maior.
    if (movimento > 45) {
      setErro("Segure firme por um instante e toque de novo.");
      return;
    }

    disparandoRef.current = true;
    setCapturando(true);
    setErro(null);
    estaveisRef.current = 0;
    setEstaveis(0);

    // guarda o frontal como referência da prova de vida
    if (atual.angle === "frontal") {
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (ctx) frontalRef.current = ctx.getImageData(0, 0, LADO, LADO);
    }

    const blob = await new Promise<Blob | null>((res) =>
      c.toBlob((b) => res(b), "image/jpeg", 0.92)
    );

    if (!blob) {
      setErro("Não consegui capturar a foto. Tente novamente.");
      setCapturando(false);
      disparandoRef.current = false;
      return;
    }

    const r = await onFace(atual.angle, blob);
    if (!r.ok) {
      setErro(r.error ?? "Falha ao enviar a foto.");
      setCapturando(false);
      disparandoRef.current = false;
      return;
    }

    const novas = [...notas, qualidadeParaNota(metricas)];
    setNotas(novas);

    // Registra se ESTE ângulo teve movimento confirmado. O frontal não exige
    // movimento; os outros quatro exigem.
    const exigiaMovimento = atual.angle !== "frontal";
    const novasProvas = [...provas, !exigiaMovimento || provaDeVida];
    setProvas(novasProvas);
    setCapturando(false);

    if (ultimo) {
      setSalvando(true);
      const media = Math.round(novas.reduce((a, b) => a + b, 0) / novas.length);

      /*
       * Antes isto era `livenessPassed: true` fixo — dizia que houve prova de
       * vida mesmo quando a pessoa nunca se mexeu. Agora só é verdade se
       * TODOS os ângulos que exigem movimento o confirmaram.
       */
      const movimentosOk = novasProvas.filter(Boolean).length;
      const provou = novasProvas.length === FACE_SHOTS.length && novasProvas.every(Boolean);

      if (!provou) {
        setErro(
          "Não confirmei o movimento em todos os ângulos. Refaça virando a cabeça, sorrindo e aproximando quando for pedido."
        );
        setSalvando(false);
        disparandoRef.current = false;
        return;
      }

      onConcluir({
        livenessPassed: true,
        livenessScore: Number((movimentosOk / FACE_SHOTS.length).toFixed(2)),
        qualityScore: Number((media / 100).toFixed(2)),
      });
      setSalvando(false);
    } else {
      setIndice((i) => i + 1);
    }
    disparandoRef.current = false;
  }, [atual.angle, metricas, movimento, notas, provas, provaDeVida, ultimo, onFace, onConcluir]);

  /* --------------------------- captura automática ---------------------- */
  /*
   * Conta quadros seguidos em que dá para capturar: enquadramento bom, prova
   * de vida confirmada (quando o ângulo exige) e rosto parado. Ao atingir
   * QUADROS_ESTAVEIS, dispara sozinho.
   *
   * A espera existe porque o movimento é justamente a prova de vida: capturar
   * no instante em que ele é detectado pegaria a pessoa ainda virando, e a
   * foto seria recusada por tremor.
   */
  useEffect(() => {
    if (!pronto || capturando || salvando) return;

    // Só depois de o analisador ter rodado para ESTE ângulo. Sem isto o
    // ângulo seguinte era fotografado com os dados do anterior.
    if (medidoRef.current !== indice) return;

    const exigiaMovimento = atual.angle !== "frontal";
    const podeCapturar = prontoParaCapturar({
      metricas,
      provaDeVida,
      movimento,
      exigeMovimento: exigiaMovimento,
      medidoPara: medidoRef.current,
      indice,
    });

    if (!podeCapturar) {
      if (estaveisRef.current !== 0) {
        estaveisRef.current = 0;
        setEstaveis(0);
      }
      return;
    }

    if (estaveisRef.current >= QUADROS_ESTAVEIS) return;

    estaveisRef.current += 1;
    setEstaveis(estaveisRef.current);

    if (estaveisRef.current >= QUADROS_ESTAVEIS) void capturar();
  }, [pronto, capturando, salvando, metricas, provaDeVida, movimento, atual.angle, indice, capturar]);

  /* ------------------------------- render ----------------------------- */
  const tom = metricas?.ok ? "ok" : "ruim";

  const exigiaMovimento = atual.angle !== "frontal";
  const podeCapturar = prontoParaCapturar({
    metricas,
    provaDeVida,
    movimento,
    exigeMovimento: exigiaMovimento,
    medidoPara: medidoRef.current,
    indice,
  });
  /** Contador regressivo visível: quantos quadros faltam para disparar. */
  const faltam = podeCapturar ? Math.max(QUADROS_ESTAVEIS - estaveis, 0) : 0;
  const vaiDisparar = podeCapturar && faltam > 0;

  /**
   * O que fazer AGORA, neste ângulo, considerando o que o quadro já mostra.
   * É o que faltava: com o enquadramento bom a tela não dizia mais nada.
   */
  const acaoAgora = (() => {
    if (vaiDisparar) return "capturando sozinho, segure assim";
    if (atual.angle === "frontal") {
      return metricas?.ok ? "capturando…" : "centralize o rosto";
    }
    if (atual.angle === "direita" || atual.angle === "esquerda") {
      if (provaDeVida) return "movimento confirmado, agora fique parado";
      return `vire devagar para a ${atual.angle === "direita" ? "direita" : "esquerda"}`;
    }
    if (atual.angle === "sorriso") {
      return provaDeVida ? "sorriso confirmado, segure" : "sorria de leve e segure";
    }
    if (atual.angle === "perto") {
      return provaDeVida ? "pronto, segure assim" : "aproxime o rosto da câmera";
    }
    return "segure o enquadramento";
  })();

  /** Objetivo da prova de vida neste ângulo. */
  const alvoProva = (() => {
    if (atual.angle === "direita" || atual.angle === "esquerda") {
      return `Vire a cabeça para a ${atual.angle === "direita" ? "direita" : "esquerda"} até o medidor confirmar.`;
    }
    if (atual.angle === "sorriso") return "Sorria de leve e segure por um instante.";
    if (atual.angle === "perto") return "Aproxime o rosto devagar, sem encostar na câmera.";
    return "Olhe de frente para a câmera e fique parado.";
  })();

  return (
    <div className="kyc-camera">
      <div className="kyc-camera-topo">
        <span className="kyc-passo">
          Ângulo {indice + 1} de {FACE_SHOTS.length}
        </span>
        <span className="kyc-angulo">{atual.label}</span>
      </div>

      <div className="kyc-video-wrap">
        <video ref={videoRef} playsInline muted className="kyc-video" />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <div className={`kyc-mascara ${tom}`} aria-hidden />
        {vaiDisparar && (
          <div className="kyc-contador" role="status" aria-live="polite">
            <span className="kyc-contador-aro" aria-hidden />
            {faltam === 1 ? "Capturando…" : "Não se mexa…"}
          </div>
        )}
        {metricas && (
          <div className={`kyc-dica ${tom}`}>
            {/* Antes, quando o enquadramento ficava bom, a dica virava só
                "Enquadramento bom" e a instrução do ângulo desaparecia — a
                pessoa não sabia mais o que fazer. Agora o estado do
                enquadramento e a ação pedida aparecem juntos. */}
            {metricas.ok ? `Tudo certo — ${acaoAgora}` : metricas.problemas[0]}
          </div>
        )}
      </div>

      <p className="kyc-instrucao">{atual.instrucao}</p>

      {erro && (
        <div className="alert alert-err" role="alert">
          {erro}
        </div>
      )}

      {/* Alvos dos medidores batem com o que o analisador realmente exige.
          Antes pediam nitidez 120 com corte real em 18: a barra vivia quase
          vazia e parecia impossível, mesmo com a foto boa. */}
      <div className="kyc-medidores">
        <Medidor rotulo="Nitidez" valor={metricas?.nitidez ?? 0} alvo={40} />
        <Medidor rotulo="Luz" valor={metricas?.brilho ?? 0} alvo={130} ideal />
        <Medidor rotulo="Rosto" valor={Math.round((metricas?.tamanho ?? 0) * 100)} alvo={6} />
      </div>

      {/* A orientação fica sempre visível: diz o objetivo do ângulo E o que
          fazer agora, com ou sem enquadramento bom. */}
      <div className={`kyc-prova${provaDeVida ? " ok" : ""}`}>
        <IconeEscudo size={16} />
        <span>
          <strong>{atual.label}:</strong> {alvoProva}
          {indice > 0 && (
            <>
              {" "}
              <em>{provaDeVida ? "Movimento confirmado." : "Ainda não detectei o movimento."}</em>
            </>
          )}
        </span>
      </div>

      <div className="kyc-bolinhas">
        {FACE_SHOTS.map((f, i) => (
          <span
            key={f.angle}
            className={`kyc-bolinha${i < indice ? " feito" : ""}${i === indice ? " atual" : ""}`}
            title={f.label}
          />
        ))}
      </div>

      <button
        className="bank-acao principal kyc-btn"
        onClick={capturar}
        disabled={!pronto || capturando || salvando}
      >
        <IconePerfil size={18} />
        {salvando
          ? "Concluindo…"
          : capturando
            ? "Capturando…"
            : vaiDisparar
              ? "Capturando sozinho…"
              : ultimo
                ? "Concluir biometria agora"
                : `Capturar ${atual.label.toLowerCase()} agora`}
      </button>

      {/* A captura é automática: o botão é atalho para quem não quer esperar. */}
      <p className="fine kyc-aviso-clique">
        {metricas && !metricas.ok
          ? `A foto sai sozinha assim que ajustar: ${metricas.problemas[0]}`
          : "A foto é tirada sozinha quando o enquadramento fica verde. O botão é só um atalho."}
      </p>

      <p className="fine kyc-privacidade">
        <IconeCadeado size={14} /> As fotos ficam guardadas em área privada, visíveis só para você e
        para a análise. Nada é publicado.
      </p>
    </div>
  );
}

function Medidor({
  rotulo,
  valor,
  alvo,
  ideal = false,
}: {
  rotulo: string;
  valor: number;
  alvo: number;
  ideal?: boolean;
}) {
  const pct = Math.min(100, Math.round((valor / (alvo * 2)) * 100));
  const bom = ideal ? valor >= 50 && valor <= 205 : valor >= alvo * 0.35;
  return (
    <div className="kyc-medidor">
      <span className="rot">{rotulo}</span>
      <span className="barra">
        <span className={`preenche${bom ? " bom" : ""}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}
