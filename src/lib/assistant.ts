import { runAgent } from "./agent/run";
import type { ChatTurn, TurnResponse } from "./types";
import { speak } from "./voice/speak";

export async function respondToUser(userText: string, history: ChatTurn[]): Promise<TurnResponse> {
  const clean = userText.trim();
  const assistantText = clean
    ? await runAgent(clean, history)
    : "Não te ouvi direito. Pode repetir?";

  let audioBase64: string | null = null;
  try {
    const audio = await speak(assistantText);
    audioBase64 = audio.toString("base64");
  } catch (error) {
    console.error("Falha ao gerar a fala:", error);
  }

  return {
    userText: clean,
    assistantText,
    audioBase64,
  };
}
