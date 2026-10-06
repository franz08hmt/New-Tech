import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { authUnavailable, type AuthSettings } from "./auth-config.js";
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
export interface EncryptedTokens {
  version: string;
  iv: string;
  tag: string;
  data: string;
}
export const randomToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function sealTokens(
  tokens: SessionTokens,
  sessionHash: string,
  config: AuthSettings,
): EncryptedTokens {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", config.encryptionKey, iv);
  cipher.setAAD(Buffer.from(`${sessionHash}:${config.keyVersion}`));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  return {
    version: config.keyVersion,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}
export function openTokens(
  encrypted: EncryptedTokens,
  sessionHash: string,
  config: AuthSettings,
): SessionTokens {
  try {
    if (encrypted.version !== config.keyVersion) throw new Error();
    const iv = Buffer.from(encrypted.iv, "base64"),
      tag = Buffer.from(encrypted.tag, "base64");
    if (iv.length !== 12 || tag.length !== 16 || encrypted.data.length > 40_000)
      throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", config.encryptionKey, iv);
    decipher.setAAD(Buffer.from(`${sessionHash}:${encrypted.version}`));
    decipher.setAuthTag(tag);
    const tokens = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encrypted.data, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
    if (
      typeof tokens.accessToken !== "string" ||
      typeof tokens.refreshToken !== "string" ||
      !Number.isFinite(tokens.expiresAt)
    )
      throw new Error();
    return tokens;
  } catch {
    return authUnavailable();
  }
}
