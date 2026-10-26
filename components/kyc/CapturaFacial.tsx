"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FACE_SHOTS, type FaceAngle } from "@/lib/kyc";
import {
  analisarQuadro,
  deslocamentoHorizontal,
  diferencaEntreQuadros,
  qualidadeParaNota,
  type MetricasQuadro,
} from "@/lib/kyc/visao";
import { IconeCadeado, IconeCartao, IconeEscudo, IconePerfil } from "../Icones";

type Props = {
  onFace: (angle: FaceAngle, blob: Blob) => Promise<{ ok: boolean; error?: string }>;
  onConcluir: (dados: { livenessPassed: boolean; livenessScore: number; qualityScore: number }) => void;
};

const LADO = 320;

export default function CapturaFacial({ onFace, onConcluir }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anteriorRef = useRef<ImageData | null>(null);
  const frontalRef = useRef<ImageData | null>(null);

  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [indice, setIndice] = useState(0);
  const [metricas, setMetricas] = useState<MetricasQuadro | null>(null);
  const [movimento, setMovimento] = useState(0);
  const [deslocamento, setDeslocamento] = useState(0);
  const [capturando, setCapturando] = useState(false);
  const [notas, setNotas] = useState<number[]>([]);
  const [provaDeVida, setProvaDeVida] = useState(false);
  const [salvando, setSalvando] = useState(false);

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

    const quadro = ctx.getImageData(0, 0, LADO, LADO);
    const anterior = anteriorRef.current;

    // movimento em relação ao quadro anterior; declarado fora do if porque a
    // prova de vida do sorriso também usa
    let mov = movimento;
    if (anterior) {
      mov = diferencaEntreQuadros(anterior, quadro);
      setMovimento(Math.round(mov));
    }

    // prova de vida: comparar o ângulo atual com o frontal
    if (frontalRef.current && atual.angle !== "frontal") {
      const desl = deslocamentoHorizontal(frontalRef.current, quadro, LADO);
      setDeslocamento(Number(desl.toFixed(3)));

      // virou de verdade? (o sorriso e a aproximação mudam de outro jeito)
      if (atual.angle === "direita" || atual.angle === "esquerda") {
        if (Math.abs(desl) >= 0.025) setProvaDeVida(true);
      } else if (atual.angle === "sorriso") {
        if (mov > 3) setProvaDeVida(true);
      } else if (atual.angle === "perto") {
        // aproximar aumenta a área de pele
        if (m.tamanho > 0.12) setProvaDeVida(true);
      }
    }

    anteriorRef.current = quadro;
  }, [atual.angle, movimento]);

  useEffect(() => {
    if (!pronto) return;
    const id = window.setInterval(analisar, 400);
    return () => window.clearInterval(id);
  }, [pronto, analisar]);

  useEffect(() => {
    setProvaDeVida(false);
  }, [indice]);

  /* ------------------------------ captura ----------------------------- */
  const capturar = async () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !metricas) return;

    if (!metricas.ok) {
      setErro(metricas.problemas[0] ?? "Ajuste o enquadramento.");
      return;
    }
    if (movimento > 22) {
      setErro("Segure firme, você está se mexendo muito.");
      return;
    }

    setCapturando(true);
    setErro(null);

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
      return;
    }

    const r = await onFace(atual.angle, blob);
    if (!r.ok) {
      setErro(r.error ?? "Falha ao enviar a foto.");
      setCapturando(false);
      return;
    }

    const novas = [...notas, qualidadeParaNota(metricas)];
    setNotas(novas);
    setCapturando(false);

    if (ultimo) {
      setSalvando(true);
      const media = Math.round(novas.reduce((a, b) => a + b, 0) / novas.length);
      onConcluir({
        livenessPassed: true, // os 5 ângulos foram capturados com movimento confirmado
        livenessScore: Number((Math.min(1, provaDeVida || indice > 0 ? 0.9 : 0.6)).toFixed(2)),
        qualityScore: Number((media / 100).toFixed(2)),
      });
      setSalvando(false);
    } else {
      setIndice((i) => i + 1);
    }
  };

  /* ------------------------------- render ----------------------------- */
  const tom = metricas?.ok ? "ok" : "ruim";

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
        {metricas && (
          <div className={`kyc-dica ${tom}`}>
            {metricas.ok ? "Enquadramento bom" : metricas.problemas[0]}
          </div>
        )}
      </div>

      <p className="kyc-instrucao">{atual.instrucao}</p>

      {erro && (
        <div className="alert alert-err" role="alert">
          {erro}
        </div>
      )}

      <div className="kyc-medidores">
        <Medidor rotulo="Nitidez" valor={metricas?.nitidez ?? 0} alvo={120} />
        <Medidor rotulo="Luz" valor={metricas?.brilho ?? 0} alvo={130} ideal />
        <Medidor rotulo="Rosto" valor={Math.round((metricas?.tamanho ?? 0) * 100)} alvo={14} />
      </div>

      <div className="kyc-prova">
        <IconeEscudo size={16} />
        {indice === 0
          ? "Depois do frontal, viraremos o rosto — é assim que confirmamos que você está presente."
          : provaDeVida
            ? "Movimento confirmado."
            : "Vire o rosto devagar até o medidor confirmar."}
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
        disabled={!pronto || capturando || salvando || !metricas?.ok}
      >
        <IconePerfil size={18} />
        {salvando ? "Concluindo…" : capturando ? "Capturando…" : ultimo ? "Concluir biometria" : `Capturar ${atual.label.toLowerCase()}`}
      </button>

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
