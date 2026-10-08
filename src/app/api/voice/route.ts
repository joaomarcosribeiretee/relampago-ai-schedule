import { NextResponse } from "next/server";
import { sanitizeHistory } from "@/lib/agent/run";
import { respondToUser } from "@/lib/assistant";
import { transcribeAudio } from "@/lib/voice/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Não consegui ouvir agora.";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "Não recebi áudio." }, { status: 400 });
    }

    const history = sanitizeHistory(JSON.parse(String(form.get("history") || "[]")));
    const bytes = Buffer.from(await audio.arrayBuffer());
    const userText = await transcribeAudio(bytes, audio.type || "audio/webm");
    const result = await respondToUser(userText, history);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
