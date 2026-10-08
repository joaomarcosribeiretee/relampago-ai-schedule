export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type TurnResponse = {
  userText: string;
  assistantText: string;
  audioBase64: string | null;
};

export type StatusResponse = {
  openai: boolean;
  googleConfigured: boolean;
  googleConnected: boolean;
  timezone: string;
  chatModel: string;
};
