import {
  sealTokens,
  openTokens,
  type EncryptedTokens,
} from "./session-crypto.js";
import type { AuthSettings } from "./auth-config.js";
// Distinct AAD purpose; a session-token envelope cannot decrypt as a verifier.
const purpose = (attempt: string, pre: string) =>
  `examate:oauth:google:pkce:v1:${attempt}:${pre}`;
export function sealVerifier(
  verifier: string,
  attempt: string,
  pre: string,
  c: AuthSettings,
) {
  return sealTokens(
    { accessToken: verifier, refreshToken: "", expiresAt: 0 },
    purpose(attempt, pre),
    c,
  );
}
export function openVerifier(
  value: EncryptedTokens,
  attempt: string,
  pre: string,
  c: AuthSettings,
) {
  const v = openTokens(value, purpose(attempt, pre), c);
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(v.accessToken) ||
    v.refreshToken !== "" ||
    v.expiresAt !== 0
  )
    throw Error("OAUTH_VERIFIER_INVALID");
  return v.accessToken;
}
