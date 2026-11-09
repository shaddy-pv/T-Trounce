/**
 * Finds the client address in X-Forwarded-For. Each proxy appends the address it saw, so the
 * trustworthy entry is counted from the right. The left side is client-supplied and can be forged,
 * which is why it is never used.
 */
export function clientIpFromForwardedFor(
  header: string | undefined,
  trustedHops: number,
): string | undefined {
  if (!header || trustedHops <= 0) return undefined;
  const addresses = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return addresses[addresses.length - trustedHops];
}
