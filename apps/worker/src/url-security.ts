import dns from "node:dns/promises";
import net from "node:net";

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255,
    )
  ) {
    return true;
  }

  const [a, b] = parts;

  if (a === undefined || b === undefined) {
    return true;
  }

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isBlockedIp(address: string): boolean {
  const version = net.isIP(address);

  if (version === 4) {
    return isBlockedIpv4(address);
  }

  if (version === 6) {
    return isBlockedIpv6(address);
  }

  return true;
}

export async function assertSafeUrl(
  urlValue: string,
): Promise<void> {
  let parsed: URL;

  try {
    parsed = new URL(urlValue);
  } catch {
    throw new Error("Invalid job URL");
  }

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    throw new Error(
      "Only HTTP and HTTPS URLs are allowed",
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      "URLs containing credentials are not allowed",
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Local hostnames are not allowed");
  }

  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    throw new Error(
      "Private or reserved IP addresses are not allowed",
    );
  }

  const addresses = await dns.lookup(hostname, {
    all: true,
    verbatim: true,
  });

  if (addresses.length === 0) {
    throw new Error(
      "Unable to resolve job hostname",
    );
  }

  for (const address of addresses) {
    if (isBlockedIp(address.address)) {
      throw new Error(
        "Job URL resolves to a private or reserved IP address",
      );
    }
  }
}