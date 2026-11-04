import { getPrisma } from "../../src/prisma.js";
import { runAdmittedSerializableMutation } from "../../src/auth/eligibility-transaction.js";
let release!: () => void;
const held = new Promise<void>(resolve => { release = resolve; });
let pending: Promise<unknown> | undefined;
process.on("message", async (message: { kind: string; resource?: number }) => {
  if (message.kind === "release") { release(); return; }
  if (message.kind === "stop") { release(); await pending?.catch(() => {}); await getPrisma().$disconnect(); process.exit(0); }
  if (message.kind !== "start") return;
  const id = message.resource!;
  pending = runAdmittedSerializableMutation(async tx => {
    const [row] = await tx.$queryRaw<Array<{ backend: number; isolation: string }>>`
      SELECT pg_backend_pid()::int AS backend,current_setting('transaction_isolation') AS isolation`;
    process.send?.({ kind: "entered", ...row }); await held;
    await tx.$executeRaw`UPDATE "CommandProbe" SET value=value+1 WHERE id=${id}`;
  }, undefined, [{ scope: 1, id }, { scope: 2, id }]).then(() => process.send?.({ kind: "complete" }), error =>
    process.send?.({ kind: "failed", code: /^[A-Z0-9]{5}$/.test(error?.code) ? error.code : "unknown" }));
});
process.send?.({ kind: "ready" });
