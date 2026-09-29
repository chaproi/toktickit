import type { UserRole } from "@prisma/client";
import { validateNewPassword } from "../auth/password.js";

const USER_ROLES = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type Fields = Record<string, string>;
type Validation<T> = { success: true; data: T } | { success: false; fields: Fields };

export type AdminUserQuery = { search?: string; role?: UserRole };
export type CreateAdminUserInput = {
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  initialPassword: string;
};
export type EditAdminUserInput = {
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  expectedUpdatedAt: Date;
};
export type InitialPasswordInput = { initialPassword: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(body: Record<string, unknown>, allowed: readonly string[], fields: Fields): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) fields[key] = "This field is not supported.";
  }
  for (const key of allowed) {
    if (!(key in body)) fields[key] = "This field is required.";
  }
}

function normalizedName(value: unknown, fields: Fields): string {
  if (typeof value !== "string") {
    fields.name = "Name is required.";
    return "";
  }
  const name = value.trim();
  const length = Array.from(name).length;
  if (length < 2 || length > 120) fields.name = "Name must contain between 2 and 120 characters.";
  return name;
}

function normalizedEmail(value: unknown, fields: Fields): string {
  if (typeof value !== "string") {
    fields.email = "Email is required.";
    return "";
  }
  const email = value.trim().toLowerCase();
  if (Array.from(email).length > 254 || !EMAIL_PATTERN.test(email)) fields.email = "Enter a valid email address.";
  return email;
}

function role(value: unknown, fields: Fields): UserRole {
  if (typeof value !== "string" || !USER_ROLES.includes(value as UserRole)) {
    fields.role = "Choose one valid role.";
    return "REQUESTER";
  }
  return value as UserRole;
}

function active(value: unknown, fields: Fields): boolean {
  if (typeof value !== "boolean") {
    fields.isActive = "Choose whether the User is active.";
    return false;
  }
  return value;
}

function password(
  value: unknown,
  confirmation: unknown,
  fields: Fields,
): string {
  if (typeof value !== "string") {
    fields.initialPassword = "Initial Password is required.";
    return "";
  }
  if (typeof confirmation !== "string") {
    fields.confirmPassword = "Password confirmation is required.";
    return value;
  }
  const result = validateNewPassword(value, undefined, confirmation);
  if (!result.success) {
    const field = value !== confirmation ? "confirmPassword" : "initialPassword";
    fields[field] = result.message;
  }
  return value;
}

export function parseAdminUserQuery(query: Record<string, unknown>): Validation<AdminUserQuery> {
  const fields: Fields = {};
  for (const key of Object.keys(query)) {
    if (!(["search", "role"] as const).includes(key as "search" | "role")) {
      fields[key] = "This query parameter is not supported.";
    }
  }
  let search: string | undefined;
  if (query.search !== undefined) {
    if (typeof query.search !== "string") fields.search = "Search must be supplied once.";
    else {
      search = query.search.trim();
      if (Array.from(search).length > 100) fields.search = "Search must contain at most 100 characters.";
    }
  }
  let selectedRole: UserRole | undefined;
  if (query.role !== undefined) {
    if (typeof query.role !== "string" || !USER_ROLES.includes(query.role as UserRole)) {
      fields.role = "Choose one valid role.";
    } else selectedRole = query.role as UserRole;
  }
  if (Object.keys(fields).length > 0) return { success: false, fields };
  return {
    success: true,
    data: {
      ...(search ? { search } : {}),
      ...(selectedRole ? { role: selectedRole } : {}),
    },
  };
}

export function validateCreateAdminUser(body: unknown): Validation<CreateAdminUserInput> {
  if (!isRecord(body)) return { success: false, fields: { body: "A JSON object is required." } };
  const fields: Fields = {};
  exactKeys(body, ["name", "email", "role", "isActive", "initialPassword", "confirmPassword"], fields);
  const data = {
    name: normalizedName(body.name, fields),
    email: normalizedEmail(body.email, fields),
    role: role(body.role, fields),
    isActive: active(body.isActive, fields),
    initialPassword: password(body.initialPassword, body.confirmPassword, fields),
  };
  return Object.keys(fields).length > 0 ? { success: false, fields } : { success: true, data };
}

export function validateEditAdminUser(body: unknown): Validation<EditAdminUserInput> {
  if (!isRecord(body)) return { success: false, fields: { body: "A JSON object is required." } };
  const fields: Fields = {};
  exactKeys(body, ["name", "email", "role", "isActive", "expectedUpdatedAt"], fields);
  const timestamp = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : new Date(Number.NaN);
  if (typeof body.expectedUpdatedAt !== "string" || Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== body.expectedUpdatedAt) {
    fields.expectedUpdatedAt = "A valid ISO 8601 UTC timestamp is required.";
  }
  const data = {
    name: normalizedName(body.name, fields),
    email: normalizedEmail(body.email, fields),
    role: role(body.role, fields),
    isActive: active(body.isActive, fields),
    expectedUpdatedAt: timestamp,
  };
  return Object.keys(fields).length > 0 ? { success: false, fields } : { success: true, data };
}

export function validateInitialPassword(body: unknown): Validation<InitialPasswordInput> {
  if (!isRecord(body)) return { success: false, fields: { body: "A JSON object is required." } };
  const fields: Fields = {};
  exactKeys(body, ["initialPassword", "confirmPassword"], fields);
  const initialPassword = password(body.initialPassword, body.confirmPassword, fields);
  return Object.keys(fields).length > 0
    ? { success: false, fields }
    : { success: true, data: { initialPassword } };
}

export function wouldRemoveLastActiveAdministrator(
  activeAdministratorCount: number,
  currentIsActive: boolean,
  proposedRole: UserRole,
  proposedIsActive: boolean,
): boolean {
  return currentIsActive && activeAdministratorCount === 1 &&
    (proposedRole !== "ADMINISTRATOR" || !proposedIsActive);
}
