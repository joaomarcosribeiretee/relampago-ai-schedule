@AGENTS.md

# Relâmpago — continue daqui

Você vai evoluir este app. Não recrie o projeto, não troque a stack e não refaça o login do Google. O que já funciona deve continuar funcionando.

O dono é o João. A interface e a voz são em português do Brasil. O fuso é `America/Sao_Paulo`.

## O que é

Relâmpago é um assistente de voz pessoal, no espírito do Jarvis, inspirado no Relâmpago McQueen. A pessoa fala a rotina. O assistente escolhe a agenda certa, cria ou ajusta o evento e responde em voz.

O foco da tela é a conversa falada. O chat escrito existe, mas fica em segundo plano.

## O que já existe

Stack: Next.js 16 (App Router), TypeScript, Tailwind 4, OpenAI e Google Calendar API. Um usuário só. O app roda em `http://localhost:3000`.

Chaves em `.env` (não commitar, não imprimir, não mandar para o browser):

- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL` padrão `gpt-4.1-mini`
- `OPENAI_TRANSCRIBE_MODEL` padrão `gpt-4o-mini-transcribe`
- `OPENAI_TTS_MODEL` padrão `gpt-4o-mini-tts`
- `OPENAI_TTS_VOICE` padrão `ash`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback`
- `RELAMPAGO_TIMEZONE=America/Sao_Paulo`

O token do Google fica em `.data/google-token.json`. A conta conectada é `jmgarbelini82@gmail.com`. O OAuth já passou. Não peça para recriar o cliente, a menos que a conexão quebre.

Mapa:

```text
src/app/page.tsx                 tela
src/app/api/voice                áudio entra, fala sai
src/app/api/chat                 texto entra, fala sai
src/app/api/google               conectar a agenda
src/app/api/status               o que está configurado
src/components/Assistant.tsx     interface atual, âmbar, chat em evidência
src/lib/agent/prompt.ts          personalidade e regras
src/lib/agent/tools.ts           ferramentas do modelo
src/lib/agent/run.ts             ciclo de tool calling
src/lib/calendar/client.ts       Google Agenda
src/lib/calendar/auth.ts         OAuth
src/lib/voice                    transcrição e síntese
```

Ferramentas já ligadas: `list_calendars`, `list_events`, `find_free_slots`, `create_event`, `update_event`, `delete_event`. Apagar só com `confirmed: true` depois de um sim explícito. `calendarId` aceita o nome da agenda, não só o id.

Agendas reais desta conta:

- Treinos (Musculação)
- Trabalho
- Reuniões
- Estudos
- Dieta
- Vída Espiritual
- Projetos
- Compromissos
- Afazeres
- Recovery Aretria
- a principal, `jmgarbelini82@gmail.com`

Antes, um treino foi parar na agenda principal e foi duplicado. O evento "Treino de UPPER" de 2 de outubro de 2026, 20h–21h, já foi movido para Treinos (Musculação). Não crie de novo.

## Interface

Refaça `src/components/Assistant.tsx`. A tela atual está escura com âmbar e trata o campo de texto como parte central. Isso sai.

Queremos um visual atual, futurista e minimalista, vermelho, na temática do Relâmpago McQueen, sem virar desenho do filme Carros. Sem personagem, sem olhos de carro, sem logo da Pixar. É um cockpit: preto, vermelho de corrida, um fio de branco e metal escuro.

Referência de cor: fundo quase preto, vermelho `#E10600` como luz principal, um vermelho mais fundo para brilho, branco só para texto. O âmbar atual não continua.

A peça principal é o ato de falar:

- Um núcleo no centro. Em repouso, pulsa devagar. Ouvindo, reage ao microfone. Pensando, fica contido. Falando, acompanha a resposta em áudio.
- Onda ou anel de áudio de verdade, ligado ao microfone e ao playback. Não é uma barra decorativa parada.
- Pouco texto. Estado numa frase curta: "Pode falar", "Ouvindo", "Na pista", "Falando".
- Segurar a barra de espaço ou o núcleo continua gravando. No celular, o núcleo é o controle.
- A transcrição da fala pode aparecer, pequena, e sumir. Não é um chat ocupando a tela.
- O chat escrito fica atrás de um controle discreto, tipo "escrever". Aberto, é um painel secundário. Fechado, a tela é só voz.
- Conectar o Google continua acessível, sem competir com o núcleo.
- Tipografia grande, espaço sobrando, movimento curto. Tem que parecer produto de 2026, não painel de admin.

Estados que já existem e devem continuar claros: `idle`, `recording`, `thinking`, `speaking`. Se o navegador bloquear o áudio, mantenha o botão de ouvir a resposta.

## Voz do assistente

Ele fala como um agente, em frases curtas, prontas para ouvir. Faz referência a carro com precisão, sem piada em toda frase e sem forçar sotaque de desenho.

Serve: "Pista livre. Deixei o treino às oito, na agenda Treinos." "Esse horário está engarrafado. Tenho um vão às nove." "Acelerei e marquei a daily em Reuniões."

Não serve: parágrafo, markdown, lista, emoji, explicar a ferramenta, ler ISO, dizer que marcou sem a API ter devolvido `created: true`.

A voz da OpenAI pode mudar se outra cair melhor nesse tom. O texto do sistema em `src/lib/agent/prompt.ts` é que define o jeito. Inclua na instrução de TTS o mesmo tom: português do Brasil, calmo, direto, seguro.

Na confirmação, diga o quê, o dia, o horário e o nome da agenda.

## Agendas

Sempre que for criar ou mover algo:

1. Liste as agendas.
2. Escolha a que combina com a tarefa. Treino vai para Treinos (Musculação). Reunião para Reuniões. Trabalho para Trabalho. Estudo para Estudos. Refeição para Dieta. Oração ou lectio para Vída Espiritual. Projeto para Projetos. Compromisso pessoal para Compromissos. Tarefa solta para Afazeres.
3. Se nenhuma servir, crie uma agenda nova com um nome claro, na cor que fizer sentido, e use essa.
4. Antes de gravar, olhe o intervalo para não sobrepor em silêncio. Se houver conflito, avise e pergunte.
5. Diga o nome da agenda na resposta falada.

Novas capacidades, como ferramentas do agente e funções em `src/lib/calendar/client.ts`:

- Criar agenda. Use a API do Google Calendar (`calendars.insert` e deixe a agenda visível na lista). Fuso `America/Sao_Paulo`.
- Alterar a cor de uma agenda. Aceite pedido falado ("deixa Treinos mais vermelho", "Reuniões de azul"). Use `calendarList.patch` com `colorRgbFormat: true`, ou a paleta de `colors.get` quando bastar. A cor precisa aparecer no Google Agenda.
- Continuar aceitando o nome da agenda, não só o id.

Não apague agenda inteira sem um sim explícito. Não apague evento sem o sim que já existe.

## Como saber que ficou pronto

- Abrir o app e entender em um segundo que se fala com ele.
- Segurar espaço, falar "amanhã treino de upper às oito", ouvir a confirmação e ver o evento em Treinos (Musculação), não na agenda principal.
- Pedir uma agenda nova e uma troca de cor e ver as duas coisas no Google Agenda.
- O campo de escrever existe e funciona, sem ser o centro da tela.
- O vermelho e o núcleo de áudio estão no desktop e no celular.

Antes de usar API nova do Next 16, leia o guia em `node_modules/next/dist/docs/`.
