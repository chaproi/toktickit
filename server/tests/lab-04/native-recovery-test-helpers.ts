import { execFile, execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);

export function nativeTools() {
  const candidates = ["", ...(() => {
    const root = join(process.env.ProgramFiles || "C:/Program Files", "PostgreSQL");
    if (!existsSync(root)) return [];
    return readdirSync(root).filter((name) => /^\d+$/u.test(name)).sort((a, b) => Number(b) - Number(a))
      .map((name) => join(root, name, "bin"));
  })()];
  for (const directory of candidates) {
    const extension = process.platform === "win32" ? ".exe" : "";
    const dump = directory ? join(directory, `pg_dump${extension}`) : "pg_dump";
    const restore = directory ? join(directory, `pg_restore${extension}`) : "pg_restore";
    try {
      const dumpVersion = execFileSync(dump, ["--version"], { encoding: "utf8", windowsHide: true });
      const restoreVersion = execFileSync(restore, ["--version"], { encoding: "utf8", windowsHide: true });
      console.info(`Native tools available: pg_dump ${dumpVersion.match(/\d+(?:\.\d+)*/u)?.[0]}; pg_restore ${restoreVersion.match(/\d+(?:\.\d+)*/u)?.[0]}.`);
      return { dump, restore };
    } catch { /* Try installed locations without logging arguments or stderr. */ }
  }
  throw new Error("BLOCKED: native pg_dump/pg_restore unavailable; backup evidence remains incomplete.");
}
export async function native(program: string, args: string[], environment: NodeJS.ProcessEnv) {
  try { await runFile(program, args, { env: environment, windowsHide: true }); }
  catch { throw new Error("Native PostgreSQL backup/restore failed; connection arguments and stderr redacted."); }
}
