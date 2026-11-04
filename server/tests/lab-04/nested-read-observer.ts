import { Client, Pool } from "pg";
import { vi } from "vitest";
import { CreatePhaseObserver, safeCreateError } from "./create-phase-observer.js";

// The proof factory owns an instance connect override. Observe the public pg
// pool/socket boundaries directly; prototype adapter observation misses it.
export function observeNestedStartup(trace: CreatePhaseObserver) {
  const restores: Array<() => void> = [];
  for (const [prototype, method, label] of [[Pool.prototype, "connect", "pool-checkout"],
    [Client.prototype, "connect", "physical-connect"]] as const) {
    const original = prototype[method];
    const spy = vi.spyOn(prototype as any, method).mockImplementation(function(this: Pool | Client, ...args: any[]) {
      const frame = trace.context.getStore();
      const occupancy = () => this instanceof Pool ? { total: this.totalCount, idle: this.idleCount, waiting: this.waitingCount } : {};
      trace.record(`${label}-start`, occupancy(), frame);
      const done = (error?: unknown) => trace.record(`${label}-result`, { ...occupancy(), error: error ? safeCreateError(error) : null }, frame);
      if (typeof args[0] === "function") {
        const callback = args[0]; args[0] = (...result: any[]) => { done(result[0]); callback(...result); };
        return Reflect.apply(original, this, args);
      }
      try {
        const result = Reflect.apply(original, this, args);
        return result?.then ? result.then((value: unknown) => { done(); return value; }, (error: unknown) => { done(error); throw error; }) : result;
      } catch (error) { done(error); throw error; }
    });
    restores.push(() => spy.mockRestore());
  }
  return () => { for (const restore of restores.reverse()) restore(); };
}
