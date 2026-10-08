import type OpenAI from "openai";

type Tool = OpenAI.Chat.Completions.ChatCompletionTool;

export const agentTools: Tool[] = [
  {
    type: "function",
    function: {
      name: "list_calendars",
      description: "Lista as agendas da conta conectada.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_events",
      description: "Lista eventos entre dois instantes. Cada evento vem com a agenda onde está; use esse calendarId para alterar ou apagar.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          timeMin: { type: "string", description: "Início ISO 8601 com offset -03:00." },
          timeMax: { type: "string", description: "Fim ISO 8601 com offset -03:00." },
          calendarId: { type: "string", description: "Nome da agenda, como Treinos (Musculação). Sem isso, olha todas as agendas." },
        },
        required: ["timeMin", "timeMax"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_events",
      description:
        "Acha eventos pelo jeito que a pessoa falou, sem precisar do título exato. Use para procurar, mover ou apagar. Passe as palavras dela em query e o dia em timeMin e timeMax quando ela disser o dia.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Palavras da pessoa, como daily, treino, reunião com o Caio. Não precisa ser o título.",
          },
          timeMin: { type: "string", description: "Início ISO 8601 com offset -03:00, se ela disse o dia." },
          timeMax: { type: "string", description: "Fim ISO 8601 com offset -03:00." },
          calendarId: { type: "string", description: "Nome da agenda, só se ela apontou uma." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_free_slots",
      description: "Acha horários livres entre 8h e 21h no intervalo pedido.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          timeMin: { type: "string" },
          timeMax: { type: "string" },
          durationMinutes: { type: "number", description: "Duração de cada buraco. Padrão 60." },
          calendarId: { type: "string", description: "Nome da agenda. Sem isso, olha a principal." },
        },
        required: ["timeMin", "timeMax"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description:
        "Cria um evento. O summary é uma linha curta de agenda, organizada, sem ser uma frase. Para o dia inteiro, allDay=true e end é o dia seguinte (exclusivo).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: {
            type: "string",
            description:
              "Linha curta e limpa, como numa agenda de verdade. Parêntese ou travessão só se ajudar. Exemplos soltos: Trabalho (Lucy), Daily - Time de Tecnologia, Café da Manha.",
          },
          description: { type: "string" },
          start: { type: "string", description: "ISO 8601 com offset, ou YYYY-MM-DD se allDay." },
          end: { type: "string" },
          allDay: { type: "boolean" },
          recurrence: {
            type: "array",
            items: { type: "string" },
            description: "Ex.: RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
          },
          calendarId: {
            type: "string",
            description: "Nome da agenda de destino, como Treinos (Musculação). Obrigatório quando existir uma agenda do assunto.",
          },
        },
        required: ["summary", "start", "end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_event",
      description:
        "Altera título ou horário de um evento, ou move o evento para outra agenda. Se mudar só o início, a duração se mantém.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          eventId: { type: "string" },
          calendarId: { type: "string", description: "Agenda onde o evento está hoje." },
          summary: { type: "string" },
          description: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          destinationCalendarId: { type: "string", description: "Nome da agenda para onde o evento vai." },
        },
        required: ["eventId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_event",
      description:
        "Apaga um evento na hora, sem pedir confirmação. Se não tiver o id, mande query com as palavras da pessoa. Se houver vários, apaga o mais provável.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          eventId: { type: "string", description: "Id, se você já achou o evento." },
          calendarId: { type: "string", description: "Agenda onde ele está." },
          query: { type: "string", description: "Como a pessoa chamou, tipo a daily ou o treino de amanhã." },
          timeMin: { type: "string" },
          timeMax: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar",
      description:
        "Cria uma agenda nova na conta, visível na lista, no fuso America/Sao_Paulo. Use só quando nenhuma agenda existente servir ou quando a pessoa pedir.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Nome curto e claro, como Leitura ou Viagens." },
          color: {
            type: "string",
            description: "Cor em português (vermelho, azul, verde, roxo, laranja, amarelo, rosa, grafite...) ou hex #RRGGBB.",
          },
          description: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_calendar",
      description:
        "Edita uma agenda: troca o nome, a cor, ou os dois. Use quando a pessoa pedir para renomear ou mudar a cor de uma lista.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          calendarId: { type: "string", description: "Nome atual da agenda." },
          name: { type: "string", description: "Nome novo, se ela quiser renomear." },
          color: { type: "string", description: "Cor em português ou hex #RRGGBB, se ela quiser mudar a cor." },
        },
        required: ["calendarId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_calendar_color",
      description:
        "Troca a cor de uma agenda no Google Agenda. Para pedidos relativos, como mais vermelho, escolha um hex vivo, como #E10600.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          calendarId: { type: "string", description: "Nome da agenda, como Reuniões." },
          color: { type: "string", description: "Cor em português ou hex #RRGGBB." },
        },
        required: ["calendarId", "color"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_calendar",
      description:
        "Apaga uma agenda inteira com todos os eventos. confirmed=true somente depois de um sim explícito para apagar essa agenda.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          calendarId: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["calendarId", "confirmed"],
      },
    },
  },
];
