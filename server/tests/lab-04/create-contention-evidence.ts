// Diagnostic projection only. This NEVER decides whether production retries.
// In particular a structured 40001 is not proof of a naturally occurring SSI
// failure: the cooperating gate also explicitly raises that SQLSTATE.
export function rejectionEvidence(error: unknown, gateRestartExecuted: boolean, callbackReturned: boolean) {
  const seen = new Set<object>(), states = new Set<string>(), prismaCodes = new Set<string>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const row = value as { code?: unknown; meta?: unknown; cause?: unknown };
    if (typeof row.code === "string") {
      // P0001 is PostgreSQL's PL/pgSQL raise_exception, despite sharing
      // the lexical shape of a Prisma P-code. Do not label it as Prisma.
      if (row.code === "P0001") states.add(row.code);
      else if (/^P\d{4}$/u.test(row.code)) prismaCodes.add(row.code);
      else if (/^[0-9A-Z]{5}$/u.test(row.code)) states.add(row.code);
    }
    visit(row.meta); visit(row.cause);
  };
  visit(error);
  return { sqlStates: [...states].sort(), prismaCodes: [...prismaCodes].sort(),
    boundary: gateRestartExecuted ? "explicit-gate-restart" : callbackReturned ? "transaction-completion" : "callback-query",
    // Boundary and SQLSTATE are observations, not an identified dependency.
  };
}
