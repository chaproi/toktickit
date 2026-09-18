import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";

export const ARGON2ID_OPTIONS = Object.freeze({
  type: "argon2id" as const,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
});

export type PasswordValidationResult =
  | { success: true }
  | { success: false; message: string };

function characterCount(value: string): number {
  return Array.from(value).length;
}

export function validateNewPassword(
  password: string,
  currentPassword?: string,
  confirmation?: string,
): PasswordValidationResult {
  const length = characterCount(password);
  if (length < 12 || length > 128 || password.trim().length === 0) {
    return {
      success: false,
      message: "Password must contain between 12 and 128 characters.",
    };
  }

  const categories = [
    /\p{Ll}/u.test(password),
    /\p{Lu}/u.test(password),
    /\p{Nd}/u.test(password),
    /[^\p{L}\p{N}\s]/u.test(password),
  ].filter(Boolean).length;
  if (categories < 3) {
    return {
      success: false,
      message:
        "Password must use at least three of lowercase, uppercase, number, and symbol.",
    };
  }

  if (confirmation !== undefined && password !== confirmation) {
    return {
      success: false,
      message: "Password confirmation must match.",
    };
  }

  if (currentPassword !== undefined && password === currentPassword) {
    return {
      success: false,
      message: "New password must differ from the current password.",
    };
  }

  return { success: true };
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: ARGON2ID_OPTIONS.memoryCost,
    timeCost: ARGON2ID_OPTIONS.timeCost,
    parallelism: ARGON2ID_OPTIONS.parallelism,
    hashLength: ARGON2ID_OPTIONS.hashLength,
    salt: randomBytes(ARGON2ID_OPTIONS.saltLength),
  });
}

export async function verifyPassword(
  encodedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(encodedHash, password);
  } catch {
    return false;
  }
}

const dummyHashPromise = hashPassword(randomBytes(32).toString("base64url"));

export function getDummyPasswordHash(): Promise<string> {
  return dummyHashPromise;
}
