import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { expect, vi } from "vitest";

type Observer = InstanceType<typeof import("./create-phase-observer.js").CreatePhaseObserver>;
type Case = { id: number; name: string; start: number; active: string[]; timer?: ReturnType<typeof setTimeout>; observer?: Observer; restores: Array<() => void>; observerOffset?: number };
const directory = process.env.TOKTICKIT_LEGACY_DIAGNOSTIC_DIRECTORY;
if (directory && !resolve(directory).startsWith(resolve(tmpdir()) + "\\toktickit50-legacy-phases-")) throw new Error("Diagnostic ownership path rejected.");
const context = new AsyncLocalStorage<Case>(), epoch = performance.now();
let ordinal = 0, writes = 0, writeMs = 0;
function event(stage: string, extra: Record<string, unknown> = {}) {
  if (!directory) return;
  const current = context.getStore(), started = performance.now();
  appendFileSync(join(directory, "legacy-phases.jsonl"), JSON.stringify({ at: new Date().toISOString(), atMs: started - epoch,
    caseId: current?.id ?? null, stage, active: current ? [...current.active] : [], ...extra }) + "\n");
  writeMs += performance.now() - started; writes++;
}
function safeError(value: unknown) {
  const error = value as { name?: unknown; code?: unknown; stack?: unknown; meta?: { phase?: unknown } };
  const identifier = (v: unknown) => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(v) ? v : null;
  // Retain only structured source frames. No error message, SQL, parameters or first stack line.
  const frames = typeof error?.stack === "string" ? error.stack.split("\n").slice(1).flatMap(line => {
    const match = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!match) return [];
    const source = match[2].replaceAll("\\", "/");
    const location = /(?:^|\/)(src\/.*|tests\/.*|node_modules\/.*)$/.exec(source)?.[1];
    if (!location) return [];
    return [{ function: identifier(match[1]), source: location, line: Number(match[3]), column: Number(match[4]) }];
  }).slice(0, 12) : [];
  return { name: identifier(error?.name), code: typeof error?.code === "string" && /^(P\d{4}|[A-Z0-9]{5})$/.test(error.code) ? error.code : null,
    phase: typeof error?.meta?.phase === "string" && /^[a-z-]{1,50}$/.test(error.meta.phase) ? error.meta.phase : null, frames };
}
async function phase<T>(name: string, work: () => PromiseLike<T> | T): Promise<T> {
  if (!directory) return await work();
  const current = context.getStore(), start = performance.now(); current?.active.push(name); event("phase-start", { phase: name });
  try { return await work(); }
  catch (error) { event("phase-error", { phase: name, error: safeError(error) }); throw error; }
  finally { event("phase-end", { phase: name, elapsedMs: performance.now() - start }); current?.active.pop(); }
}
async function runCase<T>(work: () => Promise<T>): Promise<T> {
  if (!directory) return work();
  const current: Case = { id: ++ordinal, name: expect.getState().currentTestName ?? "legacy", start: performance.now(), active: [], restores: [] };
  return context.run(current, async () => {
    event("case-start", { name: current.name, unchangedCaseBudgetMs: 5000 });
    // Observation only: never aborts, rejects, extends or replaces Vitest's timer.
    current.timer = setTimeout(() => event("budget-boundary-observation", { elapsedMs: performance.now() - current.start,
      lastObserverEvent: current.observer?.events.at(-1) ?? null }), 5000); current.timer.unref();
    try { return await work(); }
    catch (error) { event("case-error", { error: safeError(error) }); throw error; }
    finally { clearTimeout(current.timer); event("case-end", { elapsedMs: performance.now() - current.start }); }
  });
}
async function attach(prisma: PrismaClient) {
  if (!directory) return;
  const current = context.getStore(); if (!current) throw new Error("Diagnostic case context missing.");
  const module = await import("./create-phase-observer.js");
  const observer = new module.CreatePhaseObserver(); current.observer = observer; current.observerOffset = observer.epoch - epoch;
  observer.install(); observer.enabled = true;
  const admission = await import("../../src/database/write-admission.js"), coordinate = admission.withCommandCoordination;
  const coordination = vi.spyOn(admission, "withCommandCoordination").mockImplementation(((...args: Parameters<typeof coordinate>) => {
    const start = performance.now(); event("coordination-call-start", { keyCount: args[0].keys.length });
    try { return Reflect.apply(coordinate, undefined, args); }
    catch (error) { event("coordination-call-error", { error: safeError(error) }); throw error; }
    finally { event("coordination-call-return", { elapsedMs: performance.now() - start }); }
  }) as typeof coordinate);
  current.restores.push(() => coordination.mockRestore());
  const original = prisma.$transaction.bind(prisma), attempts = new Map<string, number>();
  const transaction = vi.spyOn(prisma, "$transaction").mockImplementation((...args: unknown[]) => {
    const frame = observer.context.getStore(); if (!frame || typeof args[0] !== "function") return Reflect.apply(original, prisma, args);
    const attempt = (attempts.get(frame.request) ?? 0) + 1; attempts.set(frame.request, attempt); const selected = { ...frame, attempt };
    return observer.context.run(selected, async () => {
      observer.record("transaction-start"); event("transaction-start", { attempt });
      try {
        const result = await Reflect.apply(original, prisma, [async (tx: unknown) => observer.context.run(selected, async () => {
          event("transaction-body-start", { attempt }); observer.record("callback-entry");
          try { return await (args[0] as (tx: unknown) => unknown)(tx); }
          catch (error) { event("transaction-body-error", { attempt, error: safeError(error) }); throw error; }
          finally { observer.record("callback-exit"); event("transaction-body-end", { attempt }); }
        }), ...args.slice(1)]);
        observer.record("transaction-result"); event("transaction-complete", { attempt }); return result;
      } catch (error) { event("transaction-error-before-cleanup", { attempt, error: safeError(error), observed: observer.snapshot(selected) }); throw error; }
    });
  });
  current.restores.push(() => transaction.mockRestore());
}
function http(app: Express) {
  const current = context.getStore(), observer = current?.observer;
  if (!observer || !current) return app;
  const frame = { request: `legacy-${current.id}-${current.active.at(-1) ?? "http"}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 70), attempt: 0 };
  return (req: IncomingMessage, res: ServerResponse) => observer.context.run(frame, () => {
    event("http-entry"); res.once("finish", () => event("http-finish", { status: res.statusCode })); app(req as Request, res as Response);
  });
}
async function detach() {
  const current = context.getStore(); if (!current?.observer || !directory) return;
  const observer = current.observer; await observer.stop(); observer.enabled = false;
  event("observer-cleanup", { checkedOut: observer.pools.reduce((sum, p) => sum + p.totalCount - p.idleCount, 0) });
  for (const restore of current.restores.reverse()) restore(); observer.restore();
  writeFileSync(join(directory, `legacy-case-${current.id}-observer.json`), JSON.stringify({ caseId: current.id, name: current.name,
    observerOffsetMs: current.observerOffset, events: observer.events, journalWriteCount: writes, journalWriteMs: writeMs }, null, 2) + "\n");
  current.observer = undefined;
}
export const legacyDiagnostic = { phase, runCase, attach, http, detach, event };
