import { request as httpRequest, Agent } from "node:http";
import { availableParallelism, cpus, freemem, totalmem, platform, release, arch } from "node:os";
import type { UserRole } from "@prisma/client";

// T-47 only. No business mocks, retries, latency exclusions or pool overrides.
export const plan = {
  users: 50, roles: { REQUESTER: 20, IT_STAFF: 20, ADMINISTRATOR: 10 },
  warmupPerUser: 100, measuredPerUser: 10, virtualUsers: 50,
  caseBudgetMs: 1_200_000, requestDeadlineMs: 15_000,
  fixture: { tickets: 2050, actions: 8000, actionHistory: 24000, ticketHistory: 3800 },
  expectedMeasuredMix: {
    "requester.ticket.detail": 40, "requester.dashboard": 40, "requester.tickets.list": 20,
    "requester.tickets.filtered-list": 20, "comments.list": 40, "ticket.actions.list": 20,
    "comments.create": 20, "staff.ticket.detail": 30, "staff.dashboard": 30,
    "staff.tickets.list": 30, "staff.actions.list": 30, "action.create": 30,
    "action.detail": 30, "action.edit": 30, "action.start": 30,
    "action.complete": 15, "action.cancel": 15, "action.history": 30,
  },
  percentile: "nearest rank: sorted[ceil(p*n)-1]; every response/error retained",
  target: "overall and operation p95 strictly below 500 ms; zero unexpected errors",
  connectionPolicy: "one keep-alive HTTP Agent per VU; maxSockets=1, maxFreeSockets=1; no client retries; inherited Prisma/PostgreSQL pool settings unchanged",
} as const;

export type Phase = "validation" | "warmup" | "measured";
export type Actor = {
  ordinal: number; id: number; role: UserRole; cookie: string; csrf: string; agent: Agent;
  readTicketId: number; writeTicketId: number; ticketToken: string;
  actionId: number | null; actionVersion: number; lastActionStatus: string | null;
};
export type Command = { operation: string; method: "GET" | "POST" | "PATCH"; path: string;
  template: string; expectedStatus: 200 | 201; body?: unknown };
export type Sample = {
  phase: Phase; user: number; role: UserRole; sequence: number; operation: string;
  method: string; endpoint: string; expectedStatus: number; status: number | null;
  startMs: number; durationMs: number; bytes: number; errorCode: string | null;
  transportError: string | null; semanticError: string | null; replayed: boolean;
};
export const object = (value: unknown): Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

export async function jsonHttp(port: number, agent: Agent, method: string, path: string,
  headers: Record<string, string>, body?: unknown) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<{ status: number | null; body: unknown; bytes: number; transportError: string | null }>((resolve) => {
    let settled = false;
    const finish = (value: Parameters<typeof resolve>[0]) => {
      if (settled) return;
      settled = true; clearTimeout(timer); resolve(value);
    };
    let deadline = false;
    const call = httpRequest({ hostname: "127.0.0.1", port, path, method, agent,
      headers: { ...headers, ...(payload === undefined ? {} : { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(payload)) }) } }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("error", () => finish({ status: response.statusCode ?? null, body: null, bytes: 0, transportError: "response-stream" }));
      response.on("aborted", () => finish({ status: response.statusCode ?? null, body: null, bytes: 0, transportError: "response-aborted" }));
      response.on("end", () => {
        const bytes = Buffer.concat(chunks);
        try { finish({ status: response.statusCode ?? null, body: JSON.parse(bytes.toString("utf8")), bytes: bytes.length, transportError: null }); }
        catch { finish({ status: response.statusCode ?? null, body: null, bytes: bytes.length, transportError: "invalid-json" }); }
      });
    });
    const timer = setTimeout(() => { deadline = true; call.destroy(); }, plan.requestDeadlineMs);
    call.on("error", () => finish({ status: null, body: null, bytes: 0, transportError: deadline ? "deadline" : "request-transport" }));
    call.end(payload);
  });
}

type Concurrency = { start: number; end: number; previous: number; active: number; peak: number; area: number };
export class Traffic {
  readonly samples: Sample[] = [];
  readonly phases = new Map<Phase, Concurrency>();
  constructor(readonly port: number, readonly origin: string) {}
  begin(phase: Phase) {
    const now = performance.now();
    this.phases.set(phase, { start: now, end: now, previous: now, active: 0, peak: 0, area: 0 });
  }
  async send(phase: Phase, actor: Actor, sequence: number, command: Command) {
    const state = this.phases.get(phase)!;
    const start = performance.now();
    state.area += state.active * (start - state.previous); state.previous = start;
    state.active++; state.peak = Math.max(state.peak, state.active);
    const response = await jsonHttp(this.port, actor.agent, command.method, command.path,
      { Cookie: actor.cookie, Origin: this.origin, "X-CSRF-Token": actor.csrf }, command.body);
    const end = performance.now();
    state.area += state.active * (end - state.previous); state.previous = end;
    state.active--; state.end = end;
    const error = object(object(response.body).error).code;
    const sample: Sample = { phase, user: actor.ordinal, role: actor.role, sequence,
      operation: command.operation, method: command.method, endpoint: command.template,
      expectedStatus: command.expectedStatus, status: response.status,
      startMs: start - state.start, durationMs: end - start, bytes: response.bytes,
      errorCode: typeof error === "string" && /^[A-Z_]{1,64}$/.test(error) ? error : null,
      transportError: response.transportError, semanticError: null, replayed: object(response.body).replayed === true };
    this.samples.push(sample);
    return { sample, body: object(response.body) };
  }
  summary(phase: Phase) {
    const samples = this.samples.filter(sample => sample.phase === phase);
    const stats = summarize(samples);
    const concurrency = this.phases.get(phase);
    const elapsedMs = concurrency ? concurrency.end - concurrency.start : 0;
    return { ...stats, elapsedMs, throughputPerSecond: elapsedMs ? samples.length * 1000 / elapsedMs : 0,
      peakHttpInFlight: concurrency?.peak ?? 0, finalHttpInFlight: concurrency?.active ?? 0,
      timeWeightedHttpInFlight: elapsedMs ? concurrency!.area / elapsedMs : 0,
      operations: Object.fromEntries([...new Set(samples.map(sample => sample.operation))].sort()
        .map(operation => [operation, summarize(samples.filter(sample => sample.operation === operation))])) };
  }
}
export function summarize(samples: Sample[]) {
  const durations = samples.map(sample => sample.durationMs).sort((a, b) => a - b);
  const percentile = (p: number) => durations.length ? durations[Math.ceil(p * durations.length) - 1]! : null;
  const errors = samples.filter(sample => sample.status !== sample.expectedStatus || sample.transportError || sample.semanticError).length;
  const statuses: Record<string, number> = {};
  for (const sample of samples) {
    const label = sample.status === null ? "transport" : String(sample.status);
    statuses[label] = (statuses[label] ?? 0) + 1;
  }
  return { count: samples.length, errors, errorRate: samples.length ? errors / samples.length : 0,
    p50Ms: percentile(0.50), p95Ms: percentile(0.95), maxMs: durations.at(-1) ?? null,
    p95Below500: durations.length > 0 && percentile(0.95)! < 500, statuses };
}

export function host() {
  return { os: platform(), osRelease: release(), architecture: arch(), node: process.version,
    cpuModels: [...new Set(cpus().map(cpu => cpu.model))], logicalCpus: cpus().length,
    availableParallelism: availableParallelism(), totalRamBytes: totalmem(), availableRamBytes: freemem(),
    processRssBytes: process.memoryUsage().rss, runtime: "Vitest/Vite-transformed TypeScript source Express, NODE_ENV=test; not a production build; loopback HTTP without TLS" };
}

type RawPlan = { "Node Type": string; "Index Name"?: string; "Actual Rows"?: number; "Actual Loops"?: number;
  "Actual Total Time"?: number; "Shared Hit Blocks"?: number; "Shared Read Blocks"?: number; Plans?: RawPlan[] };
// Deliberately exclude SQL, parameters, filters, schema names and all row data.
export function safePlan(node: RawPlan): unknown {
  return { node: node["Node Type"], index: node["Index Name"] ?? null, rows: node["Actual Rows"], loops: node["Actual Loops"],
    totalMs: node["Actual Total Time"], sharedHits: node["Shared Hit Blocks"], sharedReads: node["Shared Read Blocks"],
    children: (node.Plans ?? []).map(safePlan) };
}
