import { makeAdmissionProofClient } from "./write-admission-proof-client.js";
import { withWriteAdmission } from "./write-admission-proof-support.js";

const candidate = makeAdmissionProofClient(process.env.TEST_DATABASE_URL!);
let release!: () => void;
const held = new Promise<void>(resolve => { release = resolve; });
let pending: Promise<unknown> | undefined;
process.on("message", async message => {
  const command = message as { kind: string };
  if (command.kind === "release") { release(); return; }
  if (command.kind === "stop") {
    release(); await pending?.catch(() => {}); await candidate.client.$disconnect(); process.exit(0);
  }
  if (command.kind !== "start") return;
  pending = withWriteAdmission(() => candidate.client.$transaction(async tx => {
    const [row] = await tx.$queryRaw<Array<{ backend: number; value: number; isolation: string }>>`
      SELECT pg_backend_pid()::int AS backend,value,current_setting('transaction_isolation') AS isolation FROM "AdmissionProbe" WHERE id=1`;
    process.send?.({ kind: "entered", ...row });
    await held;
    await tx.$executeRaw`UPDATE "AdmissionProbe" SET value=value+1 WHERE id=1`;
    return "committed";
  }, { isolationLevel: "Serializable" })).then(result => process.send?.({ kind: "complete", result }), error =>
    process.send?.({ kind: "failed", code: error && typeof error.code === "string" ? error.code : "unknown" }));
  await pending;
});
process.send?.({ kind: "ready" });
