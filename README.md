# Relâmpago

Assistente de voz pessoal. Você fala a rotina; ele escolhe a agenda certa no Google Agenda, cria ou ajusta o evento e responde em voz.

A tela é um cockpit: fundo preto, vermelho de corrida e um núcleo no centro. O chat escrito existe, atrás de um controle discreto.

## Como falar com ele

Toque o núcleo, ou a barra de espaço, e fale. Quando você para, ele espera cerca de um segundo de silêncio e envia sozinho. Um segundo toque envia na hora. Tocar de novo enquanto ele responde interrompe o áudio.

Ele grava mesmo se o horário já estiver ocupado e avisa o que ficou junto. Apagar um evento acontece na hora. Apagar uma agenda inteira pede confirmação, porque leva todos os eventos com ela.

## Fluxo

```text
Microfone
  -> transcrição (OpenAI)
  -> Relâmpago escolhe a agenda e a ação
  -> Google Agenda
  -> resposta falada (OpenAI)
```

Treino vai para Treinos (Musculação), reunião para Reuniões, trabalho para Trabalho, estudo para Estudos, refeição para Dieta. Se nenhuma lista servir, ele cria uma.

## Stack

- Next.js 16 e TypeScript
- OpenAI: transcrição, decisão e voz
- Google Calendar API, uma conta só
- Token do Google em `.data/google-token.json`, fora do Git

| Uso | Padrão |
| --- | --- |
| Conversa | `gpt-4.1-mini` |
| Fala para texto | `gpt-4o-mini-transcribe` |
| Texto para fala | `gpt-4o-mini-tts`, voz `coral`, ritmo `1.25` |

O fuso padrão é `America/Sao_Paulo`.

## Como rodar

É preciso Node.js 20 ou mais novo.

```bash
copy .env.example .env
npm install
npm run dev
```

Abra `http://localhost:3000`.

No `.env`:

- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` de um cliente OAuth do tipo Aplicativo da Web
- `GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback`

No Google Cloud, ative a Google Calendar API. Na tela de consentimento, deixe o app externo e em teste, e adicione o seu Gmail como usuário de teste. Enquanto estiver em teste, o Google expira a conexão em 7 dias.

## Mapa do código

```text
src/app/page.tsx              tela
src/app/api/voice             áudio entra, fala sai
src/app/api/chat              texto entra, fala sai
src/app/api/google            conexão com a agenda
src/components/Assistant.tsx  núcleo, silêncio e painel de escrever
src/components/VoiceCore.tsx  anel de áudio
src/lib/agent                 prompt, ferramentas e memória da conversa
src/lib/calendar              OAuth e Google Agenda
src/lib/voice                 transcrição e síntese
```

As rotas locais não pedem senha. Rode na sua máquina.
