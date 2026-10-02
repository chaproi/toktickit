export type OriginTuple = {
  scheme: "http" | "https";
  hostname: string;
  effectivePort: number;
};

export type OriginValidationResult =
  | { success: true }
  | {
      success: false;
      code: "ORIGIN_REQUIRED" | "ORIGIN_FORBIDDEN";
    };

function parseOrigin(value: string): OriginTuple | null {
  if (value === "null" || value.includes(",")) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    const scheme = url.protocol.slice(0, -1) as "http" | "https";
    return {
      scheme,
      hostname: url.hostname.toLowerCase(),
      effectivePort: url.port
        ? Number(url.port)
        : scheme === "https"
          ? 443
          : 80,
    };
  } catch {
    return null;
  }
}

export function parseAllowedOrigins(value: string | undefined): OriginTuple[] {
  if (!value?.trim()) {
    return [];
  }

  const tuples = value.split(",").map((entry) => parseOrigin(entry.trim()));
  if (tuples.some((tuple) => tuple === null)) {
    throw new Error("AUTH_ALLOWED_ORIGINS contains an invalid exact origin.");
  }

  return tuples as OriginTuple[];
}

export function validateOriginHeader(
  headerValues: string[],
  allowed: OriginTuple[],
): OriginValidationResult {
  if (headerValues.length === 0) {
    return { success: false, code: "ORIGIN_REQUIRED" };
  }
  if (headerValues.length !== 1) {
    return { success: false, code: "ORIGIN_FORBIDDEN" };
  }

  const parsed = parseOrigin(headerValues[0] ?? "");
  if (!parsed) {
    return { success: false, code: "ORIGIN_FORBIDDEN" };
  }

  const matched = allowed.some(
    (candidate) =>
      candidate.scheme === parsed.scheme &&
      candidate.hostname === parsed.hostname &&
      candidate.effectivePort === parsed.effectivePort,
  );
  return matched
    ? { success: true }
    : { success: false, code: "ORIGIN_FORBIDDEN" };
}

export function rawOriginHeaders(rawHeaders: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === "origin") {
      values.push(rawHeaders[index + 1] ?? "");
    }
  }
  return values;
}
