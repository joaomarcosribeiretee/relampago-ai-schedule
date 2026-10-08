"use client";

import { useEffect, useRef, type RefObject } from "react";

export type Phase = "idle" | "recording" | "thinking" | "speaking";

const RED = [225, 6, 0] as const;
const TICKS = 120;
const BANDS = TICKS / 2;
const WAVE_POINTS = 160;

type Props = {
  phase: Phase;
  analyser: RefObject<AnalyserNode | null>;
};

function rgba([r, g, b]: readonly number[], a: number) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Desenha o núcleo: tacômetro de ticks, anel de onda e o núcleo vermelho.
// Tudo lê o AnalyserNode ativo (microfone ou resposta) a cada quadro.
export function VoiceCore({ phase, analyser }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<Phase>(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bands = new Float32Array(BANDS);
    const targets = new Float32Array(BANDS);
    let freq = new Uint8Array(0);
    let wave = new Uint8Array(0);
    let level = 0;
    let hold = 0;
    let spin = 0;
    let size = 0;
    let frame = 0;
    let last = performance.now();

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = Math.min(rect.width, rect.height);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    function sample(time: number) {
      const node = analyser.current;
      const current = phaseRef.current;
      let rms = 0;

      if (node && (current === "recording" || current === "speaking")) {
        if (freq.length !== node.frequencyBinCount) {
          freq = new Uint8Array(node.frequencyBinCount);
          wave = new Uint8Array(node.fftSize);
        }
        node.getByteFrequencyData(freq);
        node.getByteTimeDomainData(wave);

        for (let i = 0; i < wave.length; i += 1) {
          const v = (wave[i] - 128) / 128;
          rms += v * v;
        }
        rms = Math.sqrt(rms / wave.length);

        // Faixa da voz: ~90 Hz a ~6 kHz (fftSize 512), em escala logarítmica.
        const lo = 1;
        const hi = Math.min(freq.length - 1, 64);
        for (let i = 0; i < BANDS; i += 1) {
          const t = i / (BANDS - 1);
          const bin = Math.round(lo * Math.pow(hi / lo, t));
          const raw = freq[bin] / 255;
          targets[i] = Math.min(1, Math.pow(raw, 1.6) * 1.35);
        }
      } else if (current === "speaking") {
        // Sem analisador (contexto de áudio travado): envelope sintético de fala.
        const env = 0.35 + 0.3 * Math.sin(time * 0.011) * Math.sin(time * 0.0047);
        rms = Math.max(0, env * 0.35);
        for (let i = 0; i < BANDS; i += 1) {
          const t = i / BANDS;
          targets[i] = Math.max(0, env * (1 - t) * (0.6 + 0.4 * Math.sin(time * 0.02 + i * 0.7)));
        }
      } else {
        targets.fill(0);
      }

      return rms;
    }

    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      if (!ctx || !canvas || size === 0) return;

      const dt = Math.min(64, now - last);
      last = now;
      const time = reduced ? now * 0.35 : now;
      const current = phaseRef.current;
      const live = current === "recording" || current === "speaking";

      const rms = sample(time);
      const ease = 1 - Math.pow(0.001, dt / 1000);
      level += (Math.min(1, rms * 4.2) - level) * Math.min(1, ease * 9);
      hold += ((current === "thinking" ? 1 : 0) - hold) * Math.min(1, ease * 4);
      spin += dt * 0.0032;
      for (let i = 0; i < BANDS; i += 1) {
        const target = targets[i];
        const speed = target > bands[i] ? 0.55 : 0.12;
        bands[i] += (target - bands[i]) * speed;
      }

      const w = canvas.width / Math.min(window.devicePixelRatio || 1, 2);
      const h = canvas.height / Math.min(window.devicePixelRatio || 1, 2);
      const cx = w / 2;
      const cy = h / 2;
      const breath = 0.5 + 0.5 * Math.sin(time * 0.0016);

      ctx.clearRect(0, 0, w, h);

      // Halo de fundo.
      const haloR = size * (0.34 + level * 0.1 + (current === "idle" ? breath * 0.02 : 0));
      const halo = ctx.createRadialGradient(cx, cy, size * 0.08, cx, cy, haloR * 1.5);
      halo.addColorStop(0, rgba(RED, 0.22 + level * 0.25));
      halo.addColorStop(0.5, rgba([120, 0, 0], 0.08 + level * 0.1));
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // Tacômetro: ticks ao redor, espelhados, acesos pela frequência.
      const tickR = size * 0.44;
      for (let i = 0; i < TICKS; i += 1) {
        const angle = -Math.PI / 2 + (i / TICKS) * Math.PI * 2;
        const band = i < BANDS ? i : TICKS - 1 - i;
        let v = bands[band];

        if (current === "thinking") {
          const head = (spin * 0.55) % (Math.PI * 2);
          const rel = (angle + Math.PI / 2 - head + Math.PI * 4) % (Math.PI * 2);
          v = Math.max(0, 1 - rel / 1.1) * 0.9 * hold;
        } else if (current === "idle") {
          v = breath * 0.06;
        }

        const major = i % 10 === 0;
        const len = (major ? 9 : 5) + v * size * 0.06;
        const inner = tickR;
        const outer = tickR + len;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(cx + cos * inner, cy + sin * inner);
        ctx.lineTo(cx + cos * outer, cy + sin * outer);
        ctx.lineWidth = major ? 2 : 1.5;
        ctx.lineCap = "round";
        if (v > 0.08) {
          ctx.strokeStyle = rgba(v > 0.75 ? [255, 70, 50] : RED, 0.35 + v * 0.65);
        } else {
          ctx.strokeStyle = major ? "rgba(255,255,255,0.28)" : "rgba(140,140,150,0.18)";
        }
        ctx.stroke();
      }

      // Anel de onda.
      const waveR = size * 0.33;
      const amp = size * 0.07;
      ctx.save();
      ctx.shadowColor = rgba(RED, 0.9);
      ctx.shadowBlur = 18 + level * 30;
      ctx.beginPath();
      for (let p = 0; p <= WAVE_POINTS; p += 1) {
        const t = p / WAVE_POINTS;
        const angle = -Math.PI / 2 + t * Math.PI * 2;
        const pos = t <= 0.5 ? t * 2 : (1 - t) * 2;
        const idx = Math.min(BANDS - 1, Math.floor(pos * (BANDS - 1)));
        const wobble =
          Math.sin(angle * 2 + time * 0.0011) * 0.6 + Math.sin(angle * 3 - time * 0.0007) * 0.4;
        const idleAmp = current === "idle" ? 0.006 + breath * 0.008 : 0.003;
        const r = waveR * (1 - hold * 0.06) + (live ? bands[idx] * amp : 0) + wobble * size * idleAmp * (1 - hold);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = rgba([255, 40, 20], 0.55 + level * 0.45 - hold * 0.25);
      ctx.lineWidth = 1.6 + level * 1.4;
      ctx.stroke();
      ctx.restore();

      // Pensando: dois arcos girando, contidos.
      if (hold > 0.02) {
        ctx.save();
        ctx.globalAlpha = hold;
        ctx.lineCap = "round";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = rgba(RED, 0.95);
        ctx.shadowColor = rgba(RED, 1);
        ctx.shadowBlur = 16;
        const arcR = waveR * 0.86;
        for (let k = 0; k < 2; k += 1) {
          const a = spin * 1.4 + k * Math.PI;
          ctx.beginPath();
          ctx.arc(cx, cy, arcR, a, a + 0.9);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Núcleo.
      const idlePulse = current === "idle" ? breath * 0.045 : 0;
      const coreR = size * 0.2 * (1 + level * 0.32 + idlePulse - hold * 0.16);
      ctx.save();
      ctx.shadowColor = rgba(RED, 0.85);
      ctx.shadowBlur = size * (0.08 + level * 0.12 + idlePulse);
      const core = ctx.createRadialGradient(
        cx - coreR * 0.25,
        cy - coreR * 0.3,
        coreR * 0.05,
        cx,
        cy,
        coreR,
      );
      core.addColorStop(0, "#FF5A3C");
      core.addColorStop(0.32, "#E10600");
      core.addColorStop(0.78, "#8A0400");
      core.addColorStop(1, "#3A0000");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Aro de metal escuro e um fio de luz.
      ctx.beginPath();
      ctx.arc(cx, cy, coreR + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 0.86, Math.PI * 1.08, Math.PI * 1.42);
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + level * 0.25})`;
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.stroke();

      // Gravando: um anel fino que respira com a voz.
      if (current === "recording") {
        ctx.beginPath();
        ctx.arc(cx, cy, coreR + 14 + level * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.12 + level * 0.4})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [analyser]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
