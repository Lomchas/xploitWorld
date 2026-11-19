/** Parses a numeric address without opening a connection. */
export function normalizeAddress(value: string): string | undefined {
  if (value.length > 45) return undefined;
  if (value.includes(":") && /^[a-fA-F0-9:]+$/.test(value)) {
    try {
      return new URL("http://[" + value + "]/").hostname.slice(1, -1);
    } catch {
      return undefined;
    }
  }
  const octets = value.split(".");
  if (
    octets.length === 4 &&
    octets.every(
      (octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) < 256,
    )
  )
    return value;
  return undefined;
}
