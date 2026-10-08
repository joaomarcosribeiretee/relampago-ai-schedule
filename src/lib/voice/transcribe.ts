import { toFile } from "openai";
import { getConfig } from "../config";
import { getOpenAI } from "../openai";

export async function transcribeAudio(data: Buffer, mimeType: string) {
  const { openaiTranscribeModel } = getConfig();
  const extension = mimeType.includes("mp4") || mimeType.includes("m4a")
    ? "m4a"
    : mimeType.includes("wav")
      ? "wav"
      : "webm";

  const file = await toFile(data, `fala.${extension}`, {
    type: mimeType || "audio/webm",
  });

  const result = await getOpenAI().audio.transcriptions.create({
    file,
    model: openaiTranscribeModel,
    language: "pt",
  });

  return result.text.trim();
}
