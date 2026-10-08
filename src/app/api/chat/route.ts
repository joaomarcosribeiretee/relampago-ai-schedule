import { NextResponse } from "next/server";
import { sanitizeHistory } from "@/lib/agent/run";
import { respondToUser } from "@/lib/assistant";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Não consegui responder agora.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: unknown; history?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "Escreva ou fale alguma coisa." }, { status: 400 });
    }

    const result = await respondToUser(message, sanitizeHistory(body.history));
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
