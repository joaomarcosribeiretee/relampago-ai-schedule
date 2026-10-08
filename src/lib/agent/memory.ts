import { promises as fs } from "fs";
import path from "path";

export type RememberedEvent = {
  id: string;
  summary: string;
  calendar: string;
  calendarId: string;
  start: string | null;
  startLabel: string | null;
};

const memoryPath = path.join(process.cwd(), ".data", "session-memory.json");

function asEvent(value: unknown): RememberedEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as RememberedEvent;
  if (typeof event.id !== "string" || !event.id) return null;
  if (typeof event.summary !== "string" || typeof event.calendar !== "string") return null;
  return {
    id: event.id,
    summary: event.summary,
    calendar: event.calendar,
    calendarId: typeof event.calendarId === "string" ? event.calendarId : event.calendar,
    start: typeof event.start === "string" ? event.start : null,
    startLabel: typeof event.startLabel === "string" ? event.startLabel : null,
  };
}

export async function readMemory(): Promise<RememberedEvent[]> {
  try {
    const raw = JSON.parse(await fs.readFile(memoryPath, "utf8")) as { events?: unknown };
    if (!Array.isArray(raw.events)) return [];
    return raw.events.map(asEvent).filter((event): event is RememberedEvent => Boolean(event));
  } catch {
    return [];
  }
}

export async function rememberEvents(incoming: RememberedEvent[]) {
  if (!incoming.length) return;
  const current = await readMemory();
  const merged = [...incoming, ...current.filter((event) => !incoming.some((item) => item.id === event.id))].slice(0, 30);
  await fs.mkdir(path.dirname(memoryPath), { recursive: true });
  await fs.writeFile(memoryPath, JSON.stringify({ events: merged }, null, 2), "utf8");
}

export function memoryFromResult(result: Record<string, unknown>): RememberedEvent[] {
  const bags = [result.events, result.matches, result.event ? [result.event] : []];
  const found = bags.flatMap((bag) => (Array.isArray(bag) ? bag.map(asEvent) : [])).filter((event): event is RememberedEvent => Boolean(event));
  const single = asEvent(result);
  if (single && (result.created === true || result.updated === true || result.deleted === true)) found.unshift(single);
  return found;
}

export function formatMemory(events: RememberedEvent[]) {
  if (!events.length) return "";
  const lines = events.slice(0, 12).map((event) => {
    const when = event.startLabel || "horário não informado";
    return `- ${event.summary}, ${when}, agenda ${event.calendar}, eventId ${event.id}, calendarId ${event.calendarId}`;
  });
  return `\n\nEventos que você acabou de ver ou alterar. Se a pessoa disser "essa", "aquela", "a de agora" ou "a que você marcou", use estes ids. Não leia o id em voz alta.\n${lines.join("\n")}`;
}
