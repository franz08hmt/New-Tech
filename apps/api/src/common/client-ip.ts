import { isIP } from "node:net";

// Validate first; URL serialization canonicalizes IPv6 without DNS/network I/O.
// https://nodejs.org/docs/latest-v24.x/api/url.html#urlhostname
export function normalizeIp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const family = isIP(value);
  if (family === 4) return value;
  // Interface zones are not valid forwarded client identities.
  if (family !== 6 || value.includes("%")) return undefined;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16),
    low = parseInt(mapped[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}
