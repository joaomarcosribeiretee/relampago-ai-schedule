import { VOICE_STYLE } from "../agent/prompt";
import { getConfig } from "../config";
import { getOpenAI } from "../openai";

export async function speak(text: string) {
  const { openaiTtsModel, openaiTtsVoice, openaiTtsSpeed } = getConfig();
  const response = await getOpenAI().audio.speech.create({
    model: openaiTtsModel,
    voice: openaiTtsVoice,
    input: text,
    instructions: VOICE_STYLE,
    speed: Math.min(1.6, Math.max(0.8, openaiTtsSpeed)),
  });

  return Buffer.from(await response.arrayBuffer());
}
