import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createOAuthClient } from "@/lib/calendar/auth";
import { saveTokens } from "@/lib/calendar/tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expected = cookieStore.get("relampago_oauth_state")?.value;
  cookieStore.delete("relampago_oauth_state");

  if (oauthError || !code || !state || state !== expected) {
    return NextResponse.redirect(new URL("/?google=denied", request.url));
  }

  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    await saveTokens(tokens);
    return NextResponse.redirect(new URL("/?google=connected", request.url));
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(new URL("/?google=denied", request.url));
  }
}
