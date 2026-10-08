import OpenAI from "openai";
import { getConfig } from "./config";

let client: OpenAI | null = null;
let clientKey = "";

export function getOpenAI() {
  const { openaiApiKey } = getConfig();
  if (!openaiApiKey) {
    throw new Error("Falta OPENAI_API_KEY no arquivo .env.local.");
  }

  if (!client || clientKey !== openaiApiKey) {
    client = new OpenAI({ apiKey: openaiApiKey });
    clientKey = openaiApiKey;
  }

  return client;
}
