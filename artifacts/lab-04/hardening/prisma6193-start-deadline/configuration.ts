import { execFileSync } from "node:child_process";
import pg from "pg";

let physicalCores: number | undefined;
// Candidate support is deliberately limited to the evaluated Windows host.
// No logical-core or pg-default fallback silently changes native pool sizing.
export function physicalCoreCount(): number {
  if (physicalCores !== undefined) return physicalCores;
  if (process.platform !== "win32") throw new Error("Candidate default pool sizing requires an explicit supported physical-core mapping.");
  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum"],
    { encoding: "utf8", windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (!/^\d+$/.test(output) || Number(output) < 1) throw new Error("Physical-core pool sizing could not be established.");
  return physicalCores = Number(output);
}
export function connectionConfiguration(input: string) {
  const url = new URL(input);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Unsupported database protocol.");
  const allowed = new Set(["schema", "connection_limit", "connect_timeout", "pool_timeout", "application_name", "sslmode"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) throw new Error("Unsupported or repeated candidate connection option.");
  }
  const numeric = (key: string, fallback: () => number, minimum: number) => {
    const value = url.searchParams.get(key);
    if (value === null) return fallback();
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) throw new Error("Invalid candidate connection budget.");
    return Number(value);
  };
  const schema = url.searchParams.get("schema") || "public";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error("Unsupported candidate schema identifier.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const sslmode = url.searchParams.get("sslmode");
  // Native's implicit prefer/invalid-certificate settings are NOT replaced by
  // weak pg TLS. Only the repository's verified local plaintext setup is mapped.
  // Remote/TLS deployment needs an explicit reviewed CA/verification mapping.
  if (!["127.0.0.1", "localhost", "::1"].includes(host) || (sslmode !== null && sslmode !== "disable")) {
    throw new Error("Candidate supports only the verified loopback plaintext configuration; TLS options are unsupported.");
  }
  const max = numeric("connection_limit", () => physicalCoreCount() * 2 + 1, 1);
  const connectTimeoutMs = numeric("connect_timeout", () => 5, 0) * 1000;
  const poolTimeoutMs = numeric("pool_timeout", () => 10, 0) * 1000;
  class ConnectBudgetClient extends pg.Client {
    constructor(config: pg.ClientConfig = {}) { super({ ...config, password: config.password, connectionTimeoutMillis: connectTimeoutMs }); }
  }
  // Pass decoded fields explicitly, so pg cannot reinterpret Prisma URL options
  // or silently replace SSL policy via its connection-string parser.
  const pool: pg.PoolConfig = { host, port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)), ssl: false,
    options: `-c search_path=${schema}`, application_name: url.searchParams.get("application_name") ?? "toktickit",
    max, connectionTimeoutMillis: poolTimeoutMs, idleTimeoutMillis: 300000, maxLifetimeSeconds: 0,
    Client: ConnectBudgetClient };
  return { pool, schema, budgets: { max, connectTimeoutMs, poolTimeoutMs, idleTimeoutMs: 300000, maxLifetimeSeconds: 0 } };
}
