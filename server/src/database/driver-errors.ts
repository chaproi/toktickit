import { Prisma } from "@prisma/client";
import { DriverAdapterError } from "@prisma/driver-adapter-utils";

// Trust the installed public adapter's typed native cause, not arbitrary error
// shapes/messages, P2034, another request, server logs or a cleanup failure.
function nativeSerialization(error: unknown): boolean {
  return error instanceof DriverAdapterError &&
    error.cause.originalCode === "40001" && error.cause.kind === "TransactionWriteConflict";
}

export function transactionError(error: unknown): unknown {
  if (nativeSerialization(error) || (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034" && nativeSerialization(error.meta?.driverAdapterError))) {
    return Object.assign(new Error("A confirmed PostgreSQL serialization failure occurred."), { code: "40001" });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" &&
      error.meta?.driverAdapterError instanceof DriverAdapterError &&
      ["40001", "23505", "40P01"].includes(error.meta.driverAdapterError.cause.originalCode ?? "")) {
    // Preserve the inherited raw-query error class/code and safe SQLSTATE seam.
    // Never retain SQL, binds or the upstream originalMessage in the bridge.
    return new Prisma.PrismaClientKnownRequestError("A database operation could not complete.", {
      clientVersion: error.clientVersion, code: "P2010", meta: { code: error.meta.driverAdapterError.cause.originalCode },
    });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" &&
      error.meta?.driverAdapterError instanceof DriverAdapterError) {
    const native = error.meta.driverAdapterError.cause;
    if (native.kind === "UniqueConstraintViolation" && native.originalCode === "23505" &&
        native.constraint && "fields" in native.constraint) {
      return new Prisma.PrismaClientKnownRequestError("A unique database constraint prevented this operation.", {
        clientVersion: error.clientVersion, code: "P2002", meta: {
          modelName: error.meta.modelName, target: native.constraint.fields.map(field =>
            /^"[A-Za-z_][A-Za-z0-9_]*"$/.test(field) ? field.slice(1, -1) : field),
        },
      });
    }
  }
  return error;
}
