import { render } from "@testing-library/react";
import App from "../../src/App.js";

export type SafeUser = {
  id: number;
  name: string;
  email: string;
  role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
  mustChangePassword: boolean;
};
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? undefined : { "Content-Type": "application/json" },
  });
}

export function authResponse(user: SafeUser) {
  return {
    user,
    session: { expiresAt: "2099-09-18T12:00:00.000Z" },
  };
}

export function requestUrl(input: RequestInfo | URL): URL {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}

export function renderAt(path: string) {
  window.history.replaceState({}, "", path);
  return render(<App />);
}

export const requesterUser: SafeUser = {
  id: 41,
  name: "Authenticated Requester",
  email: "requester@example.test",
  role: "REQUESTER",
  mustChangePassword: false,
};
