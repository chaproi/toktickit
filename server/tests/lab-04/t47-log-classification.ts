// Diagnostic parser only. A server-supplied ERROR SQLSTATE is required; a
// message mentioning 40001 or Prisma P2034 is never positive classification.
// A time-only prefix cannot establish exact owned-backend attribution.
export function classifyDiagnosticLog(text: string, backends: Map<number, string>) {
  const records: any[] = []; let current: any = null;
  for (const line of text.split(/\r?\n/)) {
    const pid = line.match(/\[(\d+)\]/)?.[1];
    if (pid && !backends.has(Number(pid))) { current = null; continue; }
    const state = line.match(/ERROR:\s+([0-9A-Z]{5}):/);
    if (state) {
      current = { backend: pid ? backends.get(Number(pid)) : null,
        correlation: pid ? "owned-backend-pid" : "bounded-log-window-no-pid",
        sqlState: state[1], category: /read\/write dependencies/.test(line) ? "read-write-dependencies"
          : /concurrent update/.test(line) ? "concurrent-update" : "other-server-error" };
      records.push(current);
    } else if (current && (!pid || current.backend === backends.get(Number(pid)))) {
      if (/Reason code:/.test(line)) current.reason = /during write/.test(line) ? "pivot-during-write"
        : /during commit/.test(line) ? "pivot-during-commit" : "other-serialization-reason";
      const location = line.match(/LOCATION:\s+([A-Za-z0-9_]+),/);
      if (location) current.location = location[1];
      const statement = line.match(/STATEMENT:\s+(COMMIT|INSERT|UPDATE|SELECT|ROLLBACK)\b/);
      if (statement) current.statementKind = statement[1];
    }
  }
  return records;
}
