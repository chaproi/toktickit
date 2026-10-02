import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { getPrisma } from "../../src/prisma.js";
import { app } from "../../src/app.js";

describe("Lab 2 reference-data APIs", () => {
  it("preserves the existing Lab 1 Category response and ordering", async () => {
    const response = await request(app).get("/api/categories");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 3, name: "Software" },
      { id: 4, name: "Network" },
    ]);
  });

  it("returns only active Related Systems ordered by name", async () => {
    const response = await request(app).get("/api/related-systems");

    expect(response.status).toBe(200);
    expect(response.body.map((system: { name: string }) => system.name)).toEqual([
      "Campus Wi-Fi",
      "Corporate Laptop",
      "Email",
      "Grade Submission App",
      "LEB2 App",
      "Printer",
      "VPN",
    ]);

    expect(
      response.body.every(
        (system: Record<string, unknown>) =>
          Object.keys(system).sort().join(",") === "id,name",
      ),
    ).toBe(true);
  });

  it("removes the temporary Development Requester reference endpoint", async () => {
    const response = await request(app).get("/api/development-requesters");

    expect(response.status).toBe(404);
  });
    afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a safe 500 response for an unexpected database failure", async () => {
    const prisma = getPrisma();

    vi.spyOn(prisma.relatedSystem, "findMany").mockRejectedValueOnce(
      new Error("DATABASE_URL=postgresql://secret-database"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(app).get("/api/related-systems");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("secret-database");
  });

  it("does not query User records through the removed development endpoint", async () => {
    const prisma = getPrisma();
    const findMany = vi.spyOn(prisma.user, "findMany");

    const response = await request(app).get(
      "/api/development-requesters",
    );

    expect(response.status).toBe(404);
    expect(findMany).not.toHaveBeenCalled();
  });
});
