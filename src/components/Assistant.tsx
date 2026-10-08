"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatTurn, StatusResponse, TurnResponse } from "@/lib/types";
import { VoiceCore, type Phase } from "./VoiceCore";

const notices: Record<string, string> = {
  connected: "Google Agenda conectada.",
  denied: "A conexão com o Google foi cancelada ou expirou. Tente de novo.",
  "missing-config": "Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.",
};

const phaseLabel: Record<Phase, string> = {
  idle: "Pode falar",
  recording: "Ouvindo",
  thinking: "Na pista",
  speaking: "Falando",
};

const MIN_RECORDING_MS = 450;
const SILENCE_AFTER_SPEECH_MS = 1000;
const MIN_SPEECH_MS = 280;

type Caption = { user: string | null; assistant: string | null };

export function Assistant({ googleNotice }: { googleNotice: string | null }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(googleNotice ? notices[googleNotice] ?? null : null);
  const [pendingAudio, setPendingAudio] = useState<string | null>(null);
  const [caption, setCaption] = useState<Caption>({ user: null, assistant: null });
  const [captionVisible, setCaptionVisible] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [clock, setClock] = useState<string | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const turnsRef = useRef<ChatTurn[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wantRecordingRef = useRef(false);
  const recordStartRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceFrameRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finishPlaybackRef = useRef<(() => void) | null>(null);
  const captionTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const changePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    turnsRef.current = turns;
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  useEffect(() => {
    void fetch("/api/status")
      .then((response) => response.json())
      .then((data: StatusResponse) => setStatus(data))
      .catch(() => setError("Não consegui ler o status do Relâmpago."));
  }, []);

  useEffect(() => {
    const format = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
    const tick = () => setClock(format.format(new Date()));
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, []);

  // Tira o ?google= da URL e some com o aviso depois de um tempo.
  useEffect(() => {
    if (!googleNotice) return;
    window.history.replaceState(null, "", window.location.pathname);
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [googleNotice]);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(id);
  }, [error]);

  const showCaption = useCallback((next: Caption, holdMs: number | null) => {
    if (captionTimer.current) window.clearTimeout(captionTimer.current);
    setCaption(next);
    setCaptionVisible(true);
    if (holdMs !== null) {
      captionTimer.current = window.setTimeout(() => setCaptionVisible(false), holdMs);
    }
  }, []);

  const fadeCaption = useCallback((afterMs: number) => {
    if (captionTimer.current) window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => setCaptionVisible(false), afterMs);
  }, []);

  // O contexto de áudio precisa nascer num gesto (toque, tecla, envio).
  const ensureAudioContext = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        audioCtxRef.current = new Ctor();
      }
      if (audioCtxRef.current.state === "suspended") void audioCtxRef.current.resume();
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  const makeAnalyser = useCallback((ctx: AudioContext) => {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    return analyser;
  }, []);

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    finishPlaybackRef.current?.();
  }, []);

  const playAudio = useCallback(
    async (audioBase64: string | null) => {
      if (!audioBase64) {
        changePhase("idle");
        return;
      }
      stopPlayback();

      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
      audioRef.current = audio;
      const ctx = audioCtxRef.current;
      analyserRef.current = null;
      if (ctx && ctx.state === "running") {
        try {
          const source = ctx.createMediaElementSource(audio);
          const analyser = makeAnalyser(ctx);
          source.connect(analyser);
          analyser.connect(ctx.destination);
          analyserRef.current = analyser;
        } catch {
          analyserRef.current = null;
        }
      }

      changePhase("speaking");
      try {
        await audio.play();
        setPendingAudio(null);
        await new Promise<void>((resolve) => {
          finishPlaybackRef.current = resolve;
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
        });
      } catch {
        setPendingAudio(audioBase64);
      } finally {
        if (audioRef.current === audio) {
          audioRef.current = null;
          analyserRef.current = null;
          finishPlaybackRef.current = null;
          if (phaseRef.current === "speaking") changePhase("idle");
        }
        fadeCaption(4500);
      }
    },
    [changePhase, fadeCaption, makeAnalyser, stopPlayback],
  );

  const handleTurn = useCallback(
    async (data: TurnResponse, addUserTurn = true) => {
      setTurns((current) => [
        ...current,
        ...(addUserTurn && data.userText ? [{ role: "user" as const, content: data.userText }] : []),
        { role: "assistant" as const, content: data.assistantText },
      ]);
      showCaption({ user: data.userText || null, assistant: data.assistantText }, null);
      await playAudio(data.audioBase64);
    },
    [playAudio, showCaption],
  );

  const sendText = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || phaseRef.current === "thinking" || phaseRef.current === "recording") return;

      ensureAudioContext();
      stopPlayback();
      const history = turnsRef.current;
      setError(null);
      setPendingAudio(null);
      setTurns((current) => [...current, { role: "user", content: text }]);
      showCaption({ user: text, assistant: null }, null);
      changePhase("thinking");
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history }),
        });
        const data = (await response.json()) as TurnResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || "Falha ao responder.");
        await handleTurn({ ...data, userText: text }, false);
      } catch (cause) {
        changePhase("idle");
        fadeCaption(0);
        setError(cause instanceof Error ? cause.message : "Falha ao responder.");
      }
    },
    [changePhase, ensureAudioContext, fadeCaption, handleTurn, showCaption, stopPlayback],
  );

  const sendAudio = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (durationMs < MIN_RECORDING_MS || blob.size < 800) {
        changePhase("idle");
        setError("Segure enquanto fala.");
        return;
      }

      changePhase("thinking");
      setError(null);
      setPendingAudio(null);
      const form = new FormData();
      const extension = blob.type.includes("mp4") ? "m4a" : "webm";
      form.set("audio", blob, `fala.${extension}`);
      form.set("history", JSON.stringify(turnsRef.current));

      try {
        const response = await fetch("/api/voice", { method: "POST", body: form });
        const data = (await response.json()) as TurnResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || "Falha ao ouvir.");
        await handleTurn(data);
      } catch (cause) {
        changePhase("idle");
        setError(cause instanceof Error ? cause.message : "Falha ao ouvir.");
      }
    },
    [changePhase, handleTurn],
  );

  const stopSilenceWatch = useCallback(() => {
    if (silenceFrameRef.current !== null) {
      window.cancelAnimationFrame(silenceFrameRef.current);
      silenceFrameRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    wantRecordingRef.current = false;
    stopSilenceWatch();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, [stopSilenceWatch]);

  const watchForSilence = useCallback(
    (analyser: AnalyserNode) => {
      const samples = new Uint8Array(analyser.fftSize);
      let floor = 0.012;
      let speechMs = 0;
      let silenceMs = 0;
      let heardSpeech = false;
      let last = performance.now();

      const tick = () => {
        if (!wantRecordingRef.current) return;
        const now = performance.now();
        const elapsed = now - last;
        last = now;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const sample = (samples[index] - 128) / 128;
          sum += sample * sample;
        }
        const level = Math.sqrt(sum / samples.length);
        if (level < floor * 1.6) floor = floor * 0.92 + level * 0.08;
        const speaking = level > Math.max(0.02, floor * 3.2);

        if (speaking) {
          speechMs += elapsed;
          silenceMs = 0;
          if (speechMs >= MIN_SPEECH_MS) heardSpeech = true;
        } else if (heardSpeech) {
          silenceMs += elapsed;
          if (silenceMs >= SILENCE_AFTER_SPEECH_MS) {
            stopRecording();
            return;
          }
        }

        silenceFrameRef.current = window.requestAnimationFrame(tick);
      };

      silenceFrameRef.current = window.requestAnimationFrame(tick);
    },
    [stopRecording],
  );

  const startRecording = useCallback(async () => {
    if (recorderRef.current || wantRecordingRef.current) return;
    if (phaseRef.current === "thinking") return;
    if (phaseRef.current === "speaking") stopPlayback();

    wantRecordingRef.current = true;
    setError(null);
    setPendingAudio(null);
    const ctx = ensureAudioContext();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      wantRecordingRef.current = false;
      setError("Libere o microfone no navegador para falar comigo.");
      return;
    }

    // Soltou antes do microfone abrir.
    if (!wantRecordingRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    streamRef.current = stream;

    let vad: AnalyserNode | null = null;
    if (ctx) {
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = makeAnalyser(ctx);
        vad = ctx.createAnalyser();
        vad.fftSize = 512;
        vad.smoothingTimeConstant = 0.12;
        source.connect(analyser);
        source.connect(vad);
        analyserRef.current = analyser;
      } catch {
        analyserRef.current = null;
        vad = null;
      }
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stopSilenceWatch();
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      analyserRef.current = null;
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      void sendAudio(blob, performance.now() - recordStartRef.current);
    };

    recorderRef.current = recorder;
    recordStartRef.current = performance.now();
    recorder.start();
    if (vad) watchForSilence(vad);
    if (captionTimer.current) window.clearTimeout(captionTimer.current);
    setCaptionVisible(false);
    changePhase("recording");
  }, [changePhase, ensureAudioContext, makeAnalyser, sendAudio, stopPlayback, stopSilenceWatch, watchForSilence]);

  // Toque começa. O silêncio envia. Um segundo toque envia na hora.
  const onCorePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      ensureAudioContext();
      if (phaseRef.current === "thinking") return;
      if (phaseRef.current === "recording" || wantRecordingRef.current) {
        stopRecording();
        return;
      }
      void startRecording();
    },
    [ensureAudioContext, startRecording, stopRecording],
  );

  useEffect(() => {
    function isTyping(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanelOpen(false);
        return;
      }
      if (event.code !== "Space" || isTyping(event.target)) return;
      event.preventDefault();
      if (event.repeat) return;
      if (wantRecordingRef.current || phaseRef.current === "recording") stopRecording();
      else void startRecording();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startRecording, stopRecording]);

  useEffect(() => {
    if (panelOpen) window.setTimeout(() => inputRef.current?.focus(), 220);
  }, [panelOpen]);

  useEffect(
    () => () => {
      if (silenceFrameRef.current !== null) window.cancelAnimationFrame(silenceFrameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      audioRef.current?.pause();
      void audioCtxRef.current?.close();
    },
    [],
  );

  const connected = Boolean(status?.googleConnected);
  const busy = phase === "thinking";

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden">
      <Backdrop phase={phase} />

      <header className="relative z-10 flex items-center justify-between gap-4 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pt-7">
        <div className="flex items-center gap-3">
          <BoltMark />
          <span className="font-mono text-[11px] tracking-[0.42em] text-white/80">RELÂMPAGO</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.18em]">
          {clock ? <span className="hidden text-white/40 sm:inline">SÃO PAULO {clock}</span> : null}
          {status === null ? null : connected ? (
            <span className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E10600] shadow-[0_0_8px_#E10600]" />
              AGENDA
            </span>
          ) : (
            <a
              href="/api/google/auth"
              className="flex items-center gap-2 rounded-full border border-[#E10600]/60 px-3 py-1.5 text-white transition hover:bg-[#E10600]/15"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
              CONECTAR GOOGLE
            </a>
          )}
        </div>
      </header>

      <div
        className={`pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-5 transition duration-500 ${
          notice ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
        aria-live="polite"
      >
        {notice ? (
          <p className="rounded-full border border-white/10 bg-black/70 px-4 py-2 text-sm text-white/80 backdrop-blur">
            {notice}
          </p>
        ) : null}
      </div>

      <main
        className={`relative z-10 flex flex-1 flex-col items-center justify-center px-5 transition duration-500 ${
          panelOpen ? "md:pr-[420px]" : ""
        }`}
      >
        <div className="relative">
          {/* Linhas de pista saindo do núcleo, como um visor. */}
          <span className="pointer-events-none absolute right-full top-1/2 h-px w-[24vw] bg-gradient-to-r from-transparent to-[#E10600]/45" />
          <span className="pointer-events-none absolute left-full top-1/2 h-px w-[24vw] bg-gradient-to-l from-transparent to-[#E10600]/45" />
        <button
          type="button"
          aria-label={phase === "recording" ? "Toque para enviar agora" : "Toque para falar"}
          aria-pressed={phase === "recording"}
          disabled={busy}
          onPointerDown={onCorePointerDown}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (phaseRef.current === "recording") stopRecording();
              else void startRecording();
            }
          }}
          className="core-button relative aspect-square w-[min(86vw,52dvh,560px)] rounded-full outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:cursor-progress"
        >
          <VoiceCore phase={phase} analyser={analyserRef} />
        </button>
        </div>

        <div className="mt-2 flex flex-col items-center text-center sm:mt-4">
          <h1
            key={phase}
            className="phase-in text-[clamp(2.6rem,7vw,5rem)] font-semibold leading-none tracking-[-0.04em] text-white"
          >
            {phaseLabel[phase]}
          </h1>
          <p className="mt-4 h-4 font-mono text-[11px] uppercase tracking-[0.32em] text-white/35">
            {phase === "idle" ? (
              <>
                <span className="pointer-coarse:hidden">Toque e fale. Eu envio quando você parar</span>
                <span className="hidden pointer-coarse:inline">Toque e fale</span>
              </>
            ) : phase === "recording" ? (
              "Pode parar de falar"
            ) : phase === "thinking" ? (
              "Olhando a agenda"
            ) : (
              "Toque para interromper"
            )}
          </p>

          <div className="mt-6 flex min-h-20 max-w-xl flex-col items-center gap-2 px-2" aria-live="polite">
            {error ? (
              <p className="text-sm text-[#FF6A5C]">{error}</p>
            ) : (
              <div
                className={`flex flex-col items-center gap-2 transition duration-700 ${
                  captionVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                }`}
              >
                {caption.user ? <p className="text-sm text-white/40">“{caption.user}”</p> : null}
                {caption.assistant ? (
                  <p className="text-base leading-relaxed text-white/85 sm:text-lg">{caption.assistant}</p>
                ) : null}
              </div>
            )}
            {pendingAudio ? (
              <button
                type="button"
                onClick={() => {
                  ensureAudioContext();
                  void playAudio(pendingAudio);
                }}
                className="mt-1 flex items-center gap-2 rounded-full border border-[#E10600]/60 px-4 py-2 font-mono text-[11px] tracking-[0.24em] text-white transition hover:bg-[#E10600]/15"
              >
                <PlayIcon />
                OUVIR RESPOSTA
              </button>
            ) : null}
          </div>
        </div>
      </main>

      <footer
        className={`relative z-10 flex items-center justify-center px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] transition duration-500 ${
          panelOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[11px] tracking-[0.3em] text-white/40 transition hover:text-white/80"
        >
          <PenIcon />
          ESCREVER
        </button>
      </footer>

      <div
        onClick={() => setPanelOpen(false)}
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] transition duration-300 md:hidden ${
          panelOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-hidden={!panelOpen}
        inert={!panelOpen}
        className={`fixed z-40 flex flex-col border-white/10 bg-[#0B0B0D]/95 backdrop-blur-xl transition duration-300 ease-out
          inset-x-0 bottom-0 h-[72dvh] rounded-t-3xl border-t
          md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[400px] md:rounded-none md:border-l md:border-t-0
          ${panelOpen ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full md:translate-y-0"}`}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <span className="font-mono text-[11px] tracking-[0.32em] text-white/50">CONVERSA</span>
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="rounded-full p-2 text-white/40 transition hover:text-white"
            aria-label="Fechar"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">
          {turns.length === 0 ? (
            <p className="pt-6 text-sm leading-relaxed text-white/35">
              Escreva como falaria. Por exemplo: amanhã treino de upper às oito.
            </p>
          ) : (
            turns.map((turn, index) =>
              turn.role === "user" ? (
                <p key={index} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-white/[0.07] px-4 py-2.5 text-sm text-white/85">
                  {turn.content}
                </p>
              ) : (
                <div key={index} className="flex max-w-[92%] gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E10600] shadow-[0_0_8px_#E10600]" />
                  <p className="text-sm leading-relaxed text-white/75">{turn.content}</p>
                </div>
              ),
            )
          )}
          {busy ? <p className="font-mono text-[11px] tracking-[0.3em] text-[#E10600]">NA PISTA…</p> : null}
          <div ref={listEndRef} />
        </div>

        <form
          className="flex items-center gap-2 border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft;
            setDraft("");
            void sendText(text);
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escreva aqui"
            enterKeyHint="send"
            className="h-12 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#E10600]/70"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy || phase === "recording"}
            aria-label="Enviar"
            className="grid h-12 w-12 place-items-center rounded-full bg-[#E10600] text-white shadow-[0_0_24px_rgba(225,6,0,0.45)] transition hover:bg-[#FF1A0F] disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
          >
            <SendIcon />
          </button>
        </form>
      </aside>
    </div>
  );
}

function Backdrop({ phase }: { phase: Phase }) {
  const active = phase === "recording" || phase === "speaking";
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div
        className={`absolute left-1/2 top-[40%] h-[120vmax] w-[120vmax] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-700 ${
          active ? "opacity-100" : "opacity-60"
        }`}
        style={{ background: "radial-gradient(circle, rgba(225,6,0,0.16) 0%, rgba(120,0,0,0.06) 28%, transparent 55%)" }}
      />
      <div className="absolute inset-0 grain opacity-[0.035]" />
    </div>
  );
}

function BoltMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#E10600" d="M13.5 1.5 4 13.5h6.5L9 22.5l10-13h-6.8z" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true">
      <path fill="#E10600" d="M7 4.5v15l12-7.5z" />
    </svg>
  );
}
