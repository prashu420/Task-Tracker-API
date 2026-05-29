const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parse a short duration string like "15m", "7d", "30s" into milliseconds.
 * Used to derive refresh-token expiry Dates from the same env values
 * (e.g. JWT_REFRESH_TTL) that configure JWT signing.
 */
export function parseDurationToMs(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration "${value}" (expected forms like 15m, 7d)`);
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}
