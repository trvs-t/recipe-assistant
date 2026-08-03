import { PipelineError } from "./errors.ts";

export interface UrlPolicy {
  readonly max_redirects: number;
  readonly max_response_bytes: number;
  readonly timeout_ms: number;
  readonly allowed_ports: readonly number[];
}

export const DEFAULT_URL_POLICY: UrlPolicy = {
  max_redirects: 3,
  max_response_bytes: 1_000_000,
  timeout_ms: 15_000,
  allowed_ports: [80, 443],
};

export interface HostResolver {
  resolve(hostname: string): Promise<readonly string[]>;
}

export const systemHostResolver: HostResolver = {
  async resolve(hostname: string): Promise<readonly string[]> {
    const recordTypes: ReadonlyArray<"A" | "AAAA"> = ["A", "AAAA"];
    const results: PromiseSettledResult<string[]>[] = await Promise.allSettled(
      recordTypes.map((recordType: "A" | "AAAA") =>
        Deno.resolveDns(hostname, recordType)
      ),
    );

    const addresses: string[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        addresses.push(...result.value);
      }
    }

    if (addresses.length === 0) {
      throw new Error(`DNS lookup returned no addresses for ${hostname}`);
    }

    return addresses;
  },
};

export function isPrivateIpAddress(address: string): boolean {
  const normalized: string = address.trim().toLowerCase();
  const ipv4: readonly number[] | null = parseIpv4(normalized);
  if (ipv4 !== null) {
    return isPrivateIpv4(ipv4);
  }

  const ipv6: readonly number[] | null = parseIpv6(normalized);
  if (ipv6 === null) {
    return false;
  }

  if (isIpv4MappedIpv6(ipv6)) {
    const mappedIpv4: readonly number[] = [
      ((ipv6[6] ?? 0) >> 8) & 0xff,
      (ipv6[6] ?? 0) & 0xff,
      ((ipv6[7] ?? 0) >> 8) & 0xff,
      (ipv6[7] ?? 0) & 0xff,
    ];
    return isPrivateIpv4(mappedIpv4);
  }

  const first: number = ipv6[0] ?? 0;
  if ((first & 0xfe00) === 0xfc00) {
    return true;
  }
  if ((first & 0xffc0) === 0xfe80) {
    return true;
  }
  if ((first & 0xff00) === 0xff00) {
    return true;
  }
  if (ipv6.every((part: number): boolean => part === 0)) {
    return true;
  }
  if (
    ipv6.slice(0, 7).every((part: number): boolean => part === 0) &&
    (ipv6[7] === 1 || ipv6[7] === 0)
  ) {
    return true;
  }
  if (ipv6[0] === 0x2001 && ipv6[1] === 0x0db8) {
    return true;
  }

  return false;
}

export async function validateSourceUrl(
  source_url: string,
  policy: UrlPolicy = DEFAULT_URL_POLICY,
  resolver: HostResolver = systemHostResolver,
): Promise<URL> {
  if (typeof source_url !== "string" || source_url.trim().length === 0) {
    throw new PipelineError({
      code: "INVALID_URL",
      message: "A non-empty source URL is required",
      stage: "fetch",
      retryable: false,
    });
  }

  const trimmed: string = source_url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new PipelineError({
      code: "INVALID_URL",
      message: "The source URL is not valid",
      stage: "fetch",
      retryable: false,
      details: {
        reason: error instanceof Error ? error.message : "URL parsing failed",
      },
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PipelineError({
      code: "UNSUPPORTED_PROTOCOL",
      message: "Only http and https source URLs are allowed",
      stage: "fetch",
      retryable: false,
      details: { protocol: parsed.protocol },
    });
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new PipelineError({
      code: "URL_CREDENTIALS_NOT_ALLOWED",
      message: "Source URLs must not contain embedded credentials",
      stage: "fetch",
      retryable: false,
    });
  }

  if (parsed.hostname.length === 0 || parsed.hostname.length > 253) {
    throw new PipelineError({
      code: "INVALID_URL",
      message: "The source URL must contain a valid hostname",
      stage: "fetch",
      retryable: false,
    });
  }

  if (parsed.port.length > 0) {
    const port: number = Number(parsed.port);
    if (!policy.allowed_ports.includes(port)) {
      throw new PipelineError({
        code: "URL_PORT_NOT_ALLOWED",
        message: "The source URL uses a port that is not allowed",
        stage: "fetch",
        retryable: false,
        details: { port },
      });
    }
  }

  const hostname: string = normalizeHostname(parsed.hostname);
  if (isBlockedHostname(hostname) || isPrivateIpAddress(hostname)) {
    throw new PipelineError({
      code: "SSRF_BLOCKED",
      message: "The source URL resolves to a blocked or private host",
      stage: "fetch",
      retryable: false,
      details: { hostname },
    });
  }

  const literalAddress: boolean = isIpLiteral(hostname);
  const addresses: readonly string[] = literalAddress
    ? [hostname]
    : await resolveHostname(hostname, resolver, policy.timeout_ms);

  for (const address of addresses) {
    if (!isIpLiteral(normalizeHostname(address))) {
      throw new PipelineError({
        code: "DNS_RESOLUTION_FAILED",
        message: "The resolver returned a non-IP address",
        stage: "fetch",
        retryable: true,
        details: { hostname, address },
      });
    }
    if (isPrivateIpAddress(address)) {
      throw new PipelineError({
        code: "SSRF_BLOCKED",
        message: "The source URL resolves to a blocked or private address",
        stage: "fetch",
        retryable: false,
        details: { hostname, address },
      });
    }
  }

  return parsed;
}

function normalizeHostname(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1).toLowerCase();
  }
  return hostname.toLowerCase().replace(/\.$/, "");
}

function isBlockedHostname(hostname: string): boolean {
  return hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local");
}

async function resolveHostname(
  hostname: string,
  resolver: HostResolver,
  timeout_ms: number,
): Promise<readonly string[]> {
  try {
    const addresses: readonly string[] = await resolveWithTimeout(
      resolver,
      hostname,
      timeout_ms,
    );
    if (addresses.length === 0) {
      throw new Error("Resolver returned no addresses");
    }
    return addresses;
  } catch (error) {
    if (error instanceof PipelineError) {
      throw error;
    }

    throw new PipelineError({
      code: "DNS_RESOLUTION_FAILED",
      message: "The source hostname could not be resolved safely",
      stage: "fetch",
      retryable: true,
      details: {
        hostname,
        reason: error instanceof Error ? error.message : "DNS lookup failed",
      },
    });
  }
}

function resolveWithTimeout(
  resolver: HostResolver,
  hostname: string,
  timeout_ms: number,
): Promise<readonly string[]> {
  return new Promise<readonly string[]>((resolve, reject): void => {
    const timeout_id: ReturnType<typeof setTimeout> = setTimeout((): void => {
      reject(new Error(`DNS lookup timed out for ${hostname}`));
    }, timeout_ms);

    resolver.resolve(hostname).then(
      (addresses: readonly string[]): void => {
        clearTimeout(timeout_id);
        resolve(addresses);
      },
      (error: unknown): void => {
        clearTimeout(timeout_id);
        reject(error);
      },
    );
  });
}

function isIpLiteral(hostname: string): boolean {
  return parseIpv4(hostname) !== null || parseIpv6(hostname) !== null;
}

function parseIpv4(address: string): readonly number[] | null {
  const parts: string[] = address.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part: string): boolean => !/^\d+$/.test(part))
  ) {
    return null;
  }

  const numbers: number[] = parts.map((part: string): number => Number(part));
  if (
    numbers.some((part: number): boolean =>
      !Number.isInteger(part) || part < 0 || part > 255
    )
  ) {
    return null;
  }

  return numbers;
}

function parseIpv6(address: string): readonly number[] | null {
  if (!address.includes(":")) {
    return null;
  }

  const doubleColonParts: string[] = address.split("::");
  if (doubleColonParts.length > 2) {
    return null;
  }

  const left: string[] = doubleColonParts[0] === ""
    ? []
    : doubleColonParts[0].split(":");
  const right: string[] =
    doubleColonParts.length === 2 && doubleColonParts[1] !== ""
      ? doubleColonParts[1].split(":")
      : [];
  const leftParts: number[] | null = expandIpv6Parts(left);
  const rightParts: number[] | null = expandIpv6Parts(right);
  if (leftParts === null || rightParts === null) {
    return null;
  }

  if (doubleColonParts.length === 1) {
    if (leftParts.length !== 8) {
      return null;
    }
    return leftParts;
  }

  const zeroCount: number = 8 - leftParts.length - rightParts.length;
  if (zeroCount < 1) {
    return null;
  }

  return [
    ...leftParts,
    ...new Array<number>(zeroCount).fill(0),
    ...rightParts,
  ];
}

function expandIpv6Parts(parts: readonly string[]): number[] | null {
  const values: number[] = [];
  for (const part of parts) {
    if (part.includes(".")) {
      const ipv4: readonly number[] | null = parseIpv4(part);
      if (ipv4 === null) {
        return null;
      }
      values.push(
        ((ipv4[0] ?? 0) << 8) | (ipv4[1] ?? 0),
        ((ipv4[2] ?? 0) << 8) | (ipv4[3] ?? 0),
      );
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/i.test(part)) {
      return null;
    }
    values.push(Number.parseInt(part, 16));
  }
  return values;
}

function isPrivateIpv4(address: readonly number[]): boolean {
  const first: number = address[0] ?? 0;
  const second: number = address[1] ?? 0;

  return first === 0 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0 && address[2] === 113) ||
    first >= 224;
}

function isIpv4MappedIpv6(address: readonly number[]): boolean {
  return address.slice(0, 5).every((part: number): boolean => part === 0) &&
    address[5] === 0xffff;
}
