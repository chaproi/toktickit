import { validateNewPassword } from "./password.js";

export class CredentialMappingError extends Error {
  constructor(
    message: string,
    public readonly safeKeys: string[] = [],
  ) {
    super(message);
    this.name = "CredentialMappingError";
  }
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) =>
    left.localeCompare(right, "en", { numeric: true }),
  );
}

export function parseCredentialMapping(
  raw: string | undefined,
  expectedKeys: string[],
  variableName: string,
): Map<string, string> {
  if (!raw?.trim()) {
    throw new CredentialMappingError(`${variableName} is required.`, sorted(expectedKeys));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CredentialMappingError(`${variableName} must be a JSON object.`);
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new CredentialMappingError(`${variableName} must be a JSON object.`);
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const expected = new Set(expectedKeys);
  const actual = new Set(entries.map(([key]) => key));
  const missing = sorted([...expected].filter((key) => !actual.has(key)));
  if (missing.length > 0) {
    throw new CredentialMappingError(
      `${variableName} is missing required keys.`,
      missing,
    );
  }

  const unexpected = sorted([...actual].filter((key) => !expected.has(key)));
  if (unexpected.length > 0) {
    throw new CredentialMappingError(
      `${variableName} contains unexpected keys.`,
      unexpected,
    );
  }

  const invalidType = sorted(
    entries.filter(([, value]) => typeof value !== "string").map(([key]) => key),
  );
  if (invalidType.length > 0) {
    throw new CredentialMappingError(
      `${variableName} values must be strings.`,
      invalidType,
    );
  }

  const invalidPolicy = sorted(
    entries
      .filter(([, value]) => !validateNewPassword(value as string).success)
      .map(([key]) => key),
  );
  if (invalidPolicy.length > 0) {
    throw new CredentialMappingError(
      `${variableName} contains policy-invalid values.`,
      invalidPolicy,
    );
  }

  const keysByValue = new Map<string, string[]>();
  for (const [key, value] of entries as Array<[string, string]>) {
    const keys = keysByValue.get(value) ?? [];
    keys.push(key);
    keysByValue.set(value, keys);
  }
  const duplicateKeys = sorted(
    [...keysByValue.values()].filter((keys) => keys.length > 1).flat(),
  );
  if (duplicateKeys.length > 0) {
    throw new CredentialMappingError(
      `${variableName} must contain unique per-User values.`,
      duplicateKeys,
    );
  }

  return new Map(
    sorted(expectedKeys).map((key) => [
      key,
      (parsed as Record<string, string>)[key]!,
    ]),
  );
}
