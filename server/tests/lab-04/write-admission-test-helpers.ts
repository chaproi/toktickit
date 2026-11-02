import type { Client } from "pg";
import { ADMISSION_NAMESPACE } from "../../src/database/write-admission.js";

// Observe actual cross-connection waiting, not a callback barrier that would
// require cooperating writers to establish concurrent business snapshots.
export async function waitForWriteAdmission(client: Client, schema: string, count = 1) {
  const deadline = performance.now() + 1500;
  while (performance.now() < deadline) {
    const result = await client.query<{ pid: number }>(`SELECT DISTINCT l.pid FROM pg_locks l
      JOIN pg_namespace n ON l.objid=n.oid
      WHERE l.locktype='advisory' AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
        AND l.classid=$1::oid AND n.nspname=$2 AND NOT l.granted`, [ADMISSION_NAMESPACE, schema]);
    if (result.rows.length >= count) return result.rows.map(row => row.pid);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Owned HTTP commands did not reach pre-snapshot admission waiting.");
}
