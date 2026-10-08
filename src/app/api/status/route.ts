import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { googleAuthConfigured } from "@/lib/calendar/auth";
import { isGoogleConnected } from "@/lib/calendar/tokens";
import type { StatusResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const config = getConfig();
  const body: StatusResponse = {
    openai: Boolean(config.openaiApiKey),
    googleConfigured: googleAuthConfigured(),
    googleConnected: await isGoogleConnected(),
    timezone: config.timezone,
    chatModel: config.openaiChatModel,
  };

  return NextResponse.json(body);
}
