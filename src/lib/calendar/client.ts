import { google, type calendar_v3 } from "googleapis";
import { getConfig } from "../config";
import { hourInTimeZone, labelInTimeZone } from "../time";
import { getAuthedClient } from "./auth";
import { foregroundFor, normalize, resolveColor } from "./colors";

export type CalendarHandle = {
  calendar: calendar_v3.Calendar;
  timeZone: string;
};

type ToolResult = Record<string, unknown>;
type CalendarEntry = calendar_v3.Schema$CalendarListEntry;

function googleMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const message = (
      error as { response?: { data?: { error?: { message?: string } } } }
    ).response?.data?.error?.message;
    if (message) return message;
  }
  if (error instanceof Error) return error.message;
  return "Falha ao falar com o Google Agenda.";
}

export async function openCalendar(): Promise<CalendarHandle | { error: string }> {
  const auth = await getAuthedClient();
  if (!auth) {
    return {
      error:
        "Google Agenda ainda não está conectada. A pessoa precisa usar o botão Conectar Google Agenda.",
    };
  }

  return {
    calendar: google.calendar({ version: "v3", auth }),
    timeZone: getConfig().timezone,
  };
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown) {
  return value === true;
}

function asRules(value: unknown) {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return undefined;
  const rules = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return rules.length ? rules : undefined;
}

function eventTimes(event: calendar_v3.Schema$Event) {
  return {
    start: event.start?.dateTime || event.start?.date || null,
    end: event.end?.dateTime || event.end?.date || null,
  };
}

function entryName(item: CalendarEntry) {
  return item.summaryOverride || item.summary || item.id || "";
}

async function calendarEntries(handle: CalendarHandle) {
  const response = await handle.calendar.calendarList.list({ maxResults: 100 });
  return (response.data.items ?? []).filter((item) => !item.deleted);
}

// Aceita id, nome exato, nome sem acento ("Vida Espiritual") ou só o começo ("Treinos").
function findCalendar(items: CalendarEntry[], raw: string) {
  const wanted = normalize(raw);
  const name = (item: CalendarEntry) => normalize(entryName(item));
  const base = (item: CalendarEntry) => name(item).split(" (")[0];
  return (
    items.find((item) => item.id === raw) ||
    items.find((item) => name(item) === wanted) ||
    items.find((item) => base(item) === wanted) ||
    items.find((item) => name(item).startsWith(wanted)) ||
    items.find((item) => wanted.length > 2 && name(item).includes(wanted))
  );
}

async function resolveCalendar(handle: CalendarHandle, raw?: string) {
  const items = await calendarEntries(handle);

  if (raw) {
    const named = findCalendar(items, raw);
    if (!named?.id) return { error: `Não achei a agenda "${raw}".` };
    return { id: named.id, name: entryName(named), entry: named };
  }

  const primary = items.find((item) => item.primary);
  if (!primary?.id) return { error: "Não achei a agenda principal." };
  return { id: primary.id, name: entryName(primary), entry: primary };
}

export async function listCalendars(handle: CalendarHandle): Promise<ToolResult> {
  const items = await calendarEntries(handle);
  return {
    calendars: items.map((item) => ({
      id: item.id,
      name: entryName(item),
      primary: Boolean(item.primary),
      color: item.backgroundColor,
      writable: item.accessRole === "owner" || item.accessRole === "writer",
    })),
  };
}

type Conflict = { summary: string; calendar: string; startLabel: string | null };

// Procura o que já ocupa o intervalo em todas as agendas graváveis.
async function findConflicts(
  handle: CalendarHandle,
  start: string,
  end: string,
  excludeEventId?: string,
): Promise<Conflict[]> {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return [];

  const items = (await calendarEntries(handle)).filter(
    (item) => item.id && !item.hidden && (item.accessRole === "owner" || item.accessRole === "writer"),
  );

  const lists = await Promise.all(
    items.map(async (item) => {
      try {
        const response = await handle.calendar.events.list({
          calendarId: item.id!,
          timeMin: new Date(startMs).toISOString(),
          timeMax: new Date(endMs).toISOString(),
          singleEvents: true,
          maxResults: 10,
        });
        return (response.data.items ?? []).map((event) => ({ event, item }));
      } catch {
        return [];
      }
    }),
  );

  return lists
    .flat()
    .filter(({ event }) => {
      if (event.status === "cancelled" || event.transparency === "transparent") return false;
      if (!event.start?.dateTime || !event.end?.dateTime) return false;
      if (excludeEventId && (event.id === excludeEventId || event.recurringEventId === excludeEventId)) {
        return false;
      }
      return Date.parse(event.start.dateTime) < endMs && Date.parse(event.end.dateTime) > startMs;
    })
    .map(({ event, item }) => ({
      summary: event.summary || "(sem título)",
      calendar: entryName(item),
      startLabel: event.start?.dateTime ? labelInTimeZone(event.start.dateTime, handle.timeZone) : null,
    }));
}


export async function listEvents(handle: CalendarHandle, args: Record<string, unknown>): Promise<ToolResult> {
  const timeMin = asString(args.timeMin);
  const timeMax = asString(args.timeMax);
  if (!timeMin || !timeMax) {
    return { error: "Informe timeMin e timeMax em ISO 8601." };
  }

  const raw = asString(args.calendarId);
  let targets: { id: string; name: string }[];
  if (raw) {
    const calendar = await resolveCalendar(handle, raw);
    if ("error" in calendar) return calendar;
    targets = [calendar];
  } else {
    targets = (await calendarEntries(handle))
      .filter((item) => item.id && item.accessRole !== "freeBusyReader")
      .map((item) => ({ id: item.id!, name: entryName(item) }));
  }

  const lists = await Promise.all(
    targets.map(async (target) => {
      const response = await handle.calendar.events.list({
        calendarId: target.id,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 25,
      });
      return (response.data.items ?? []).map((event) => ({ event, target }));
    }),
  );

  const events = lists
    .flat()
    .map(({ event, target }) => {
      const times = eventTimes(event);
      return {
        id: event.id,
        summary: event.summary || "(sem título)",
        start: times.start,
        end: times.end,
        startLabel: times.start ? labelInTimeZone(times.start, handle.timeZone) : null,
        calendar: target.name,
        calendarId: target.id,
      };
    })
    .sort((a, b) => Date.parse(a.start || "") - Date.parse(b.start || ""))
    .slice(0, 40);

  return { calendars: targets.map((target) => target.name), events };
}

export async function createEvent(handle: CalendarHandle, args: Record<string, unknown>): Promise<ToolResult> {
  const summary = asString(args.summary);
  const start = asString(args.start);
  const end = asString(args.end);
  if (!summary || !start || !end) {
    return { error: "Para criar, preciso de summary, start e end." };
  }

  const calendar = await resolveCalendar(handle, asString(args.calendarId));
  if ("error" in calendar) return calendar;
  const calendarId = calendar.id;
  const allDay = asBoolean(args.allDay);
  const timeZone = handle.timeZone;
  const recurrence = asRules(args.recurrence);

  const overlaps = allDay ? [] : await findConflicts(handle, start, end);

  const response = await handle.calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description: asString(args.description),
      recurrence,
      start: allDay ? { date: start.slice(0, 10) } : { dateTime: start, timeZone },
      end: allDay ? { date: end.slice(0, 10) } : { dateTime: end, timeZone },
    },
  });

  const times = eventTimes(response.data);
  return {
    created: true,
    id: response.data.id,
    summary: response.data.summary,
    start: times.start,
    end: times.end,
    startLabel: times.start ? labelInTimeZone(times.start, timeZone) : null,
    calendar: calendar.name,
    calendarId,
    recurring: Boolean(recurrence?.length),
    overlaps,
  };
}

export async function updateEvent(handle: CalendarHandle, args: Record<string, unknown>): Promise<ToolResult> {
  const eventId = asString(args.eventId);
  if (!eventId) return { error: "Falta o eventId." };

  const calendar = await resolveCalendar(handle, asString(args.calendarId));
  if ("error" in calendar) return calendar;
  const calendarId = calendar.id;
  let start = asString(args.start);
  let end = asString(args.end);
  const summary = asString(args.summary);
  const description = asString(args.description);
  const destinationRaw = asString(args.destinationCalendarId);
  const timeZone = handle.timeZone;

  if (!start && !end && !summary && !description && !destinationRaw) {
    return { error: "Diga o que muda: título, início, fim ou agenda." };
  }

  const current = await handle.calendar.events.get({ calendarId, eventId });
  const currentStart = current.data.start?.dateTime;
  const currentEnd = current.data.end?.dateTime;

  // Mudou só o início: mantém a duração.
  if (start && !end && currentStart && currentEnd) {
    const duration = Date.parse(currentEnd) - Date.parse(currentStart);
    end = new Date(Date.parse(start) + duration).toISOString();
  }
  if (end && !start && currentStart) start = currentStart;

  const overlaps = start && end ? await findConflicts(handle, start, end, eventId) : [];

  let destination: { id: string; name: string } | null = null;
  if (destinationRaw) {
    const resolved = await resolveCalendar(handle, destinationRaw);
    if ("error" in resolved) return resolved;
    if (resolved.id !== calendarId) destination = resolved;
  }

  let data = current.data;
  if (start || end || summary || description) {
    const response = await handle.calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        summary,
        description,
        start: start ? { dateTime: start, timeZone } : undefined,
        end: end ? { dateTime: end, timeZone } : undefined,
      },
    });
    data = response.data;
  }

  if (destination) {
    const moved = await handle.calendar.events.move({
      calendarId,
      eventId,
      destination: destination.id,
    });
    data = moved.data;
  }

  const times = eventTimes(data);
  return {
    updated: true,
    id: data.id,
    summary: data.summary,
    start: times.start,
    end: times.end,
    startLabel: times.start ? labelInTimeZone(times.start, timeZone) : null,
    calendar: destination ? destination.name : calendar.name,
    calendarId: destination ? destination.id : calendarId,
    moved: Boolean(destination),
    overlaps,
  };
}

const FAMILIES = [
  ["reuniao", "reunioes", "daily", "call", "sprint", "review", "retro", "hands"],
  ["treino", "treinos", "academia", "upper", "lower", "musculacao"],
  ["trabalho", "lucy"],
  ["estudo", "estudos", "aula", "curso"],
  ["dieta", "almoco", "jantar", "cafe"],
  ["lectio", "missa", "terco", "oracao", "espiritual"],
  ["projeto", "projetos"],
  ["compromisso", "medico", "consulta", "dentista"],
];

const SEARCH_STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos",
  "um", "uma", "para", "pra", "com", "que", "me", "minha", "meu", "aquele", "aquela",
  "essa", "esse", "isso", "por", "favor", "pode", "apaga", "apagar", "apague",
  "cancela", "cancelar", "cancele", "remove", "remover", "tira", "tirar", "marca",
  "evento", "eventos", "agenda", "hoje", "amanha", "ontem",
]);

function dayStamp(timeZone: string, offsetDays: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDays * 86400000));
}

function asInstant(value: string | undefined, fallback: string, endOfDay = false) {
  if (!value) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return endOfDay ? `${value}T23:59:59-03:00` : `${value}T00:00:00-03:00`;
  }
  return value;
}

function searchWindow(timeZone: string, timeMin?: string, timeMax?: string) {
  return {
    timeMin: asInstant(timeMin, `${dayStamp(timeZone, -1)}T00:00:00-03:00`),
    timeMax: asInstant(timeMax, `${dayStamp(timeZone, 21)}T23:59:59-03:00`, true),
  };
}

function searchTokens(query: string) {
  const tokens = normalize(query)
    .split(" ")
    .filter((token) => token.length > 2 && !SEARCH_STOPWORDS.has(token));
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const family = FAMILIES.find((group) =>
      group.some((word) => token === word || token.includes(word) || (token.length >= 4 && word.includes(token))),
    );
    family?.forEach((word) => expanded.add(word));
    if (token.length > 5) expanded.add(token.slice(0, 5));
  }
  return [...expanded];
}

function eventScore(tokens: string[], summary: string, calendar: string) {
  if (!tokens.length) return 1;
  const hay = normalize(`${summary} ${calendar}`);
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += token.length > 4 ? 3 : 2;
  }
  return score;
}

async function collectEvents(handle: CalendarHandle, timeMin: string, timeMax: string, calendarRaw?: string) {
  let targets = (await calendarEntries(handle)).filter((item) => item.id && item.accessRole !== "freeBusyReader");
  if (calendarRaw) {
    const calendar = findCalendar(targets, calendarRaw);
    if (calendar) targets = [calendar];
  }

  const lists = await Promise.all(
    targets.map(async (target) => {
      try {
        const response = await handle.calendar.events.list({
          calendarId: target.id!,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 40,
        });
        return (response.data.items ?? []).map((event) => ({ event, target }));
      } catch {
        return [];
      }
    }),
  );

  return lists.flat().flatMap(({ event, target }) => {
    if (!event.id || event.status === "cancelled") return [];
    const times = eventTimes(event);
    return [
      {
        id: event.id,
        summary: event.summary || "(sem título)",
        start: times.start,
        end: times.end,
        startLabel: times.start ? labelInTimeZone(times.start, handle.timeZone) : null,
        calendar: entryName(target),
        calendarId: target.id!,
      },
    ];
  });
}

export async function searchEvents(handle: CalendarHandle, args: Record<string, unknown>): Promise<ToolResult> {
  const query = asString(args.query) || "";
  const window = searchWindow(handle.timeZone, asString(args.timeMin), asString(args.timeMax));
  const tokens = searchTokens(query);
  let events = await collectEvents(handle, window.timeMin, window.timeMax, asString(args.calendarId));
  if (!events.length && asString(args.calendarId)) {
    events = await collectEvents(handle, window.timeMin, window.timeMax);
  }

  const ranked = events
    .map((event) => ({ ...event, score: eventScore(tokens, event.summary, event.calendar) }))
    .filter((event) => event.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(a.start || "") - Date.parse(b.start || ""))
    .slice(0, 6)
    .map(({ score: _score, ...event }) => event);

  if (!ranked.length) {
    return {
      found: false,
      query,
      events: [],
      message: "Nenhum evento parecido nesse período.",
    };
  }

  return {
    found: true,
    query,
    count: ranked.length,
    events: ranked,
    best: ranked[0],
    message:
      ranked.length > 1
        ? "Tem mais de um parecido. O primeiro é o mais provável. Use esse e faça. Não pergunte qual."
        : "Achei um. Faça o que foi pedido.",
  };
}

export async function deleteEvent(handle: CalendarHandle, args: Record<string, unknown>): Promise<ToolResult> {
  let eventId = asString(args.eventId);
  let calendarRaw = asString(args.calendarId);
  const query = asString(args.query);

  if (!eventId) {
    const found = await searchEvents(handle, {
      query: query || calendarRaw,
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      calendarId: query ? undefined : calendarRaw,
    });
    const matches = Array.isArray(found.events) ? found.events : [];
    if (!matches.length) {
      return { deleted: false, found: false, message: "Não achei um evento com essa descrição." };
    }
    const match = matches[0] as { id?: string; calendarId?: string; summary?: string; startLabel?: string; calendar?: string };
    eventId = match.id;
    calendarRaw = match.calendarId || match.calendar;
  }

  if (!eventId) return { error: "Não consegui identificar o evento." };

  const calendar = await resolveCalendar(handle, calendarRaw);
  if ("error" in calendar) return calendar;
  const current = await handle.calendar.events.get({ calendarId: calendar.id, eventId }).catch(() => null);
  await handle.calendar.events.delete({ calendarId: calendar.id, eventId });
  return {
    deleted: true,
    id: eventId,
    eventId,
    summary: current?.data.summary || query || "evento",
    calendar: calendar.name,
    calendarId: calendar.id,
    start: current?.data.start?.dateTime || current?.data.start?.date || null,
    startLabel: current?.data.start?.dateTime
      ? labelInTimeZone(current.data.start.dateTime, handle.timeZone)
      : null,
  };
}

export async function findFreeSlots(handle: CalendarHandle, args: Record<string, unknown>): Promise<ToolResult> {
  const timeMin = asString(args.timeMin);
  const timeMax = asString(args.timeMax);
  if (!timeMin || !timeMax) {
    return { error: "Informe timeMin e timeMax em ISO 8601." };
  }

  const durationMinutes = typeof args.durationMinutes === "number" ? args.durationMinutes : 60;
  const calendar = await resolveCalendar(handle, asString(args.calendarId));
  if ("error" in calendar) return calendar;
  const calendarId = calendar.id;
  const windowStart = new Date(timeMin);
  const windowEnd = new Date(timeMax);
  if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime())) {
    return { error: "Datas inválidas." };
  }

  const response = await handle.calendar.freebusy.query({
    requestBody: {
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      timeZone: handle.timeZone,
      items: [{ id: calendarId }],
    },
  });

  const calendars = response.data.calendars ?? {};
  const busyBlocks = calendars[calendarId]?.busy ?? Object.values(calendars)[0]?.busy ?? [];
  const busy = busyBlocks
    .map((block) => ({
      start: Date.parse(block.start || ""),
      end: Date.parse(block.end || ""),
    }))
    .filter((block) => !Number.isNaN(block.start) && !Number.isNaN(block.end));

  const duration = Math.max(15, durationMinutes) * 60 * 1000;
  const step = 30 * 60 * 1000;
  const now = Date.now();
  let cursor = Math.max(windowStart.getTime(), now);
  const slots: { start: string; end: string; label: string }[] = [];

  while (cursor + duration <= windowEnd.getTime() && slots.length < 6) {
    const slotEnd = cursor + duration;
    const hour = hourInTimeZone(new Date(cursor), handle.timeZone);
    const occupied = busy.some((block) => cursor < block.end && block.start < slotEnd);

    if (!occupied && hour >= 8 && hour < 21) {
      const start = new Date(cursor).toISOString();
      slots.push({
        start,
        end: new Date(slotEnd).toISOString(),
        label: labelInTimeZone(start, handle.timeZone),
      });
      cursor += duration;
    } else {
      cursor += step;
    }
  }

  return { durationMinutes, slots };
}

export async function createCalendar(handle: CalendarHandle, args: Record<string, unknown>): Promise<ToolResult> {
  const name = asString(args.name);
  if (!name) return { error: "Falta o nome da agenda." };

  const existing = (await calendarEntries(handle)).find(
    (item) => normalize(entryName(item)) === normalize(name),
  );
  if (existing?.id) {
    return {
      created: false,
      alreadyExists: true,
      name: entryName(existing),
      message: "Essa agenda já existe. Use ela em vez de criar outra.",
    };
  }

  const colorRaw = asString(args.color);
  const color = colorRaw ? resolveColor(colorRaw) : null;
  if (colorRaw && !color) {
    return { error: `Não reconheci a cor "${colorRaw}". Use um nome simples, como azul, ou um hex.` };
  }

  const inserted = await handle.calendar.calendars.insert({
    requestBody: {
      summary: name,
      description: asString(args.description),
      timeZone: handle.timeZone,
    },
  });
  const id = inserted.data.id;
  if (!id) return { error: "O Google não devolveu o id da agenda nova." };

  // Deixa a agenda visível na lista, já com a cor pedida.
  const entry = await handle.calendar.calendarList.patch({
    calendarId: id,
    colorRgbFormat: Boolean(color),
    requestBody: {
      selected: true,
      hidden: false,
      ...(color ? { backgroundColor: color, foregroundColor: foregroundFor(color) } : {}),
    },
  });

  return {
    created: true,
    id,
    name: inserted.data.summary,
    color: entry.data.backgroundColor,
  };
}

export async function updateCalendar(handle: CalendarHandle, args: Record<string, unknown>): Promise<ToolResult> {
  const calendarRaw = asString(args.calendarId);
  const newName = asString(args.name);
  const colorRaw = asString(args.color);
  if (!calendarRaw) return { error: "Falta a agenda." };
  if (!newName && !colorRaw) return { error: "Diga o que muda: o nome ou a cor." };

  const calendar = await resolveCalendar(handle, calendarRaw);
  if ("error" in calendar) return calendar;

  let name = calendar.name;
  if (newName && normalize(newName) !== normalize(calendar.name)) {
    if (calendar.entry.primary) {
      if (!colorRaw) return { updated: false, error: "A agenda principal não troca de nome." };
    } else {
      await handle.calendar.calendars.patch({
        calendarId: calendar.id,
        requestBody: { summary: newName },
      });
      name = newName;
    }
  }

  let color = calendar.entry.backgroundColor;
  if (colorRaw) {
    const resolved = resolveColor(colorRaw);
    if (!resolved) {
      return { error: `Não reconheci a cor "${colorRaw}". Use um nome simples, como azul, ou um hex.` };
    }
    const entry = await handle.calendar.calendarList.patch({
      calendarId: calendar.id,
      colorRgbFormat: true,
      requestBody: { backgroundColor: resolved, foregroundColor: foregroundFor(resolved) },
    });
    color = entry.data.backgroundColor;
  }

  return {
    updated: true,
    calendar: name,
    previousName: calendar.name,
    color,
  };
}

export async function setCalendarColor(handle: CalendarHandle, args: Record<string, unknown>): Promise<ToolResult> {
  const calendarRaw = asString(args.calendarId);
  const colorRaw = asString(args.color);
  if (!calendarRaw || !colorRaw) return { error: "Preciso da agenda e da cor." };

  const color = resolveColor(colorRaw);
  if (!color) {
    return { error: `Não reconheci a cor "${colorRaw}". Use um nome simples, como azul, ou um hex.` };
  }

  const calendar = await resolveCalendar(handle, calendarRaw);
  if ("error" in calendar) return calendar;

  const entry = await handle.calendar.calendarList.patch({
    calendarId: calendar.id,
    colorRgbFormat: true,
    requestBody: { backgroundColor: color, foregroundColor: foregroundFor(color) },
  });

  return {
    updated: true,
    calendar: calendar.name,
    previousColor: calendar.entry.backgroundColor,
    color: entry.data.backgroundColor,
  };
}

export async function deleteCalendar(handle: CalendarHandle, args: Record<string, unknown>): Promise<ToolResult> {
  const calendarRaw = asString(args.calendarId);
  if (!calendarRaw) return { error: "Falta a agenda." };

  const entry = findCalendar(await calendarEntries(handle), calendarRaw);
  if (!entry?.id) return { error: `Não achei a agenda "${calendarRaw}".` };
  if (entry.primary) return { deleted: false, error: "A agenda principal não pode ser apagada." };
  const name = entryName(entry);

  if (!asBoolean(args.confirmed)) {
    return {
      deleted: false,
      needsConfirmation: true,
      calendar: name,
      message: "Apagar a agenda apaga todos os eventos dela. Pergunte se a pessoa confirma.",
    };
  }

  if (entry.accessRole === "owner") {
    await handle.calendar.calendars.delete({ calendarId: entry.id });
  } else {
    await handle.calendar.calendarList.delete({ calendarId: entry.id });
  }
  return { deleted: true, calendar: name };
}

export async function runCalendarTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const opened = await openCalendar();
  if ("error" in opened) return opened;

  try {
    switch (name) {
      case "list_calendars":
        return await listCalendars(opened);
      case "list_events":
        return await listEvents(opened, args);
      case "find_events":
        return await searchEvents(opened, args);
      case "find_free_slots":
        return await findFreeSlots(opened, args);
      case "create_event":
        return await createEvent(opened, args);
      case "update_event":
        return await updateEvent(opened, args);
      case "delete_event":
        return await deleteEvent(opened, args);
      case "create_calendar":
        return await createCalendar(opened, args);
      case "update_calendar":
        return await updateCalendar(opened, args);
      case "set_calendar_color":
        return await setCalendarColor(opened, args);
      case "delete_calendar":
        return await deleteCalendar(opened, args);
      default:
        return { error: `Ferramenta desconhecida: ${name}` };
    }
  } catch (error) {
    return { error: googleMessage(error) };
  }
}
