export type AppConfig = {
  openaiApiKey: string;
  openaiChatModel: string;
  openaiTranscribeModel: string;
  openaiTtsModel: string;
  openaiTtsVoice: string;
  openaiTtsSpeed: number;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  timezone: string;
};

export function getConfig(): AppConfig {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    openaiChatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini",
    openaiTranscribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    openaiTtsModel: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
    openaiTtsVoice: process.env.OPENAI_TTS_VOICE || "coral",
    openaiTtsSpeed: Number(process.env.OPENAI_TTS_SPEED) || 1.25,
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    googleRedirectUri:
      process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google/callback",
    timezone: process.env.RELAMPAGO_TIMEZONE || "America/Sao_Paulo",
  };
}
