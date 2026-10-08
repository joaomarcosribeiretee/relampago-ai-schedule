import { promises as fs } from "fs";
import path from "path";

export type StoredGoogleTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  token_type?: string | null;
  id_token?: string | null;
};

const tokenPath = path.join(process.cwd(), ".data", "google-token.json");

export async function readTokens(): Promise<StoredGoogleTokens | null> {
  try {
    const raw = await fs.readFile(tokenPath, "utf8");
    return JSON.parse(raw) as StoredGoogleTokens;
  } catch {
    return null;
  }
}

export async function saveTokens(next: StoredGoogleTokens) {
  const current = await readTokens();
  const merged: StoredGoogleTokens = {
    ...current,
    ...next,
    refresh_token: next.refresh_token || current?.refresh_token,
  };

  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

export async function isGoogleConnected() {
  const tokens = await readTokens();
  return Boolean(tokens?.refresh_token || tokens?.access_token);
}
