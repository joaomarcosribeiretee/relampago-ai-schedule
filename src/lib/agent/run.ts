import type OpenAI from "openai";
import { runCalendarTool } from "../calendar/client";
import { getConfig } from "../config";
import { getOpenAI } from "../openai";
import type { ChatTurn } from "../types";
import { formatMemory, memoryFromResult, readMemory, rememberEvents } from "./memory";
import { buildSystemPrompt } from "./prompt";
import { agentTools } from "./tools";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function parseArgs(raw: string) {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

// O texto vira fala: tira marcação que o modelo às vezes deixa escapar.
function cleanForSpeech(text: string) {
  return text
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}

export function sanitizeHistory(input: unknown): ChatTurn[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((item): item is ChatTurn => {
      if (!item || typeof item !== "object") return false;
      const turn = item as ChatTurn;
      return (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string";
    })
    .slice(-20)
    .map((turn) => ({
      role: turn.role,
      content: turn.content.slice(0, 2000),
    }));
}

export async function runAgent(userText: string, history: ChatTurn[]) {
  const openai = getOpenAI();
  const { openaiChatModel } = getConfig();
  const memory = formatMemory(await readMemory());
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() + memory },
    ...sanitizeHistory(history),
    { role: "user", content: userText.slice(0, 4000) },
  ];

  for (let step = 0; step < 10; step += 1) {
    const completion = await openai.chat.completions.create({
      model: openaiChatModel,
      temperature: 0.3,
      messages,
      tools: agentTools,
    });

    const message = completion.choices[0]?.message;
    if (!message) break;

    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      return cleanForSpeech(message.content ?? "") || "Pronto.";
    }

    messages.push(message);

    for (const call of calls) {
      const result =
        call.type === "function"
          ? await runCalendarTool(call.function.name, parseArgs(call.function.arguments))
          : { error: "Tipo de ferramenta não suportado." };

      if (!("error" in result)) await rememberEvents(memoryFromResult(result));
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "Rodei muitas voltas e não fechei. Pode repetir mais curto?";
}
