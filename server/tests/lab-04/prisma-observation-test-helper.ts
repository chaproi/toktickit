import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";

type Parameters = { model?: string; action: string; runInTransaction: boolean };
type Observer = (parameters: Parameters, next: (parameters: Parameters) => Promise<unknown>) => Promise<unknown>;

// Public query extension plus public interactive callback context replaces
// removed $use observation. Results/arguments/queries are never fabricated.
// Existing observers use interactive transactions, not batch-only context.
export function observePrisma<T extends PrismaClient<any, any>>(client: T, observer: Observer): T {
  const context = new AsyncLocalStorage<boolean>();
  const extended = client.$extends({ query: {
    $allOperations({ model, operation, args, query }) {
      const parameters = { model, action: operation.replace(/^\$/, ""), runInTransaction: context.getStore() === true };
      return observer(parameters, () => query(args));
    },
  } });
  const transaction = extended.$transaction;
  Object.defineProperty(extended, "$transaction", { configurable: true, writable: true,
    value: function(this: typeof extended, input: unknown, options: unknown) {
      const callback = typeof input === "function"
        ? (tx: unknown) => context.run(true, () => input(tx)) : input;
      return Reflect.apply(transaction, this, [callback, options]);
    } });
  // Same generated models/options/engine; public observation only. $on is
  // intentionally registered on the original client before extending it.
  return extended as unknown as T;
}
