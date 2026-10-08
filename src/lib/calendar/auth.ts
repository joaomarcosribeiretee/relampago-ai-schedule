import { google } from "googleapis";
import { getConfig } from "../config";
import { readTokens, saveTokens, type StoredGoogleTokens } from "./tokens";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export function createOAuthClient() {
  const { googleClientId, googleClientSecret, googleRedirectUri } = getConfig();
  return new google.auth.OAuth2(googleClientId, googleClientSecret, googleRedirectUri);
}

export function googleAuthConfigured() {
  const { googleClientId, googleClientSecret } = getConfig();
  return Boolean(googleClientId && googleClientSecret);
}

export async function getAuthedClient() {
  const tokens = await readTokens();
  if (!tokens?.refresh_token && !tokens?.access_token) return null;
  if (!googleAuthConfigured()) return null;

  const client = createOAuthClient();
  client.setCredentials({
    access_token: tokens.access_token ?? undefined,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? undefined,
    token_type: tokens.token_type ?? undefined,
    id_token: tokens.id_token ?? undefined,
  });
  client.on("tokens", (fresh) => {
    void saveTokens(fresh as StoredGoogleTokens);
  });
  return client;
}
