import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { once } from "node:events";
import { expect } from "vitest";
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, HeadBucketCommand,
  ListBucketsCommand, ListObjectsV2Command, PutObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getAttachmentStorage, setAttachmentStorageForTests } from "../../src/attachments/attachment-storage.js";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Owned loopback allocation failed.");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

export class RecoveryPrerequisiteError extends Error {
  constructor() { super("BLOCKED: explicit standalone SeaweedFS executable unavailable; persistent recovery unverified."); this.name = "RecoveryPrerequisiteError"; }
}

export async function ownedSeaweed(directory: string, buckets: string[]) {
  const executable = process.env.TOKTICKIT_RECOVERY_WEED_EXE;
  if (!executable || !existsSync(executable)) throw new RecoveryPrerequisiteError();
  expect(buckets.every(bucket => /^toktickit-t31-(source|restored)-[a-f0-9]{32}$/.test(bucket))).toBe(true);
  mkdirSync(directory);
  const [master, masterGrpc, volume, volumeGrpc, filer, filerGrpc, s3, s3Grpc] = await Promise.all(Array.from({ length: 8 }, freePort));
  expect(new Set([master, masterGrpc, volume, volumeGrpc, filer, filerGrpc, s3, s3Grpc]).size).toBe(8);
  const endpoint = `http://127.0.0.1:${s3}`;
  // The host's DEBUG=release belongs to another tool; weed treats it as a
  // boolean flag and exits before listening. Scope removal to this child only.
  const childEnvironment = { ...process.env };
  for (const key of Object.keys(childEnvironment)) if (key.toLowerCase() === "debug") delete childEnvironment[key];
  const child = spawn(executable, ["server", `-dir=${directory}`, "-ip=127.0.0.1", "-ip.bind=127.0.0.1",
    `-master.port=${master}`, `-master.port.grpc=${masterGrpc}`, `-volume.port=${volume}`, `-volume.port.grpc=${volumeGrpc}`,
    // S3 buckets have separate collections; allow both small owned collections
    // their default growth allocation instead of exhausting a one-volume cap.
    "-volume.max=16", "-master.volumeSizeLimitMB=10", "-filer", `-filer.port=${filer}`, `-filer.port.grpc=${filerGrpc}`,
    "-s3", `-s3.port=${s3}`, `-s3.port.grpc=${s3Grpc}`, "-s3.port.iceberg=0", "-s3.port.lance=0", "-s3.iam=false"],
  { cwd: directory, env: childEnvironment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  // Drain service output without publishing paths, credentials or arbitrary errors.
  child.stdout.resume(); child.stderr.resume();
  let exited = false;
  child.once("exit", () => { exited = true; });
  const credentials = { accessKeyId: "seaweedfs", secretAccessKey: "seaweedfs" };
  const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials, maxAttempts: 1 });
  const created = new Set<string>();
  async function close() {
    try {
      for (const bucket of created) {
        const objects = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
        expect(objects.IsTruncated).not.toBe(true);
        for (const object of objects.Contents ?? []) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key! }));
        await client.send(new DeleteBucketCommand({ Bucket: bucket }));
        let absent = false;
        try { await client.send(new HeadBucketCommand({ Bucket: bucket })); }
        catch (error) { absent = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404; }
        expect(absent, "Only owned bucket deleted; no objects remain").toBe(true);
      }
    } finally {
      client.destroy();
      if (!exited) { const ended = once(child, "exit"); child.kill(); await ended; }
      expect(exited, "Owned Seaweed process ended").toBe(true);
    }
  }
  try {
    // Bounded readiness observation, not a sleep used to order business writes.
    await expect.poll(async () => {
      if (exited) return false;
      try { await client.send(new ListBucketsCommand({})); return true; } catch { return false; }
    }, { timeout: 10_000, interval: 100 }).toBe(true);
    const initial = await client.send(new ListBucketsCommand({}));
    expect(initial.Buckets ?? [], "Fresh service identity has no pre-existing buckets before writes").toEqual([]);
    for (const bucket of buckets) { await client.send(new CreateBucketCommand({ Bucket: bucket })); created.add(bucket); }
    // A listening S3 gateway is not yet evidence of an allocated, write-ready
    // volume. Complete one owned PUT/HEAD/DELETE before opening app mutations.
    // This isolates recovery from cold bootstrap; it does NOT fix slow S3 I/O
    // inside the application's five-second interactive transaction.
    const readyKey = "owned-write-readiness";
    const readyBytes = Buffer.from("T31 persistent storage readiness");
    const started = Date.now();
    await client.send(new PutObjectCommand({ Bucket: buckets[0]!, Key: readyKey, Body: readyBytes }));
    const ready = await client.send(new HeadObjectCommand({ Bucket: buckets[0]!, Key: readyKey }));
    expect(ready.ContentLength).toBe(readyBytes.length);
    await client.send(new DeleteObjectCommand({ Bucket: buckets[0]!, Key: readyKey }));
    expect((await client.send(new ListObjectsV2Command({ Bucket: buckets[0]! }))).Contents ?? []).toEqual([]);
    console.info("T31 owned persistent write-readiness completed before application transaction", { elapsedMs: Date.now() - started });
    return { client, endpoint, credentials, close, persistentFiles() {
      const visit = (path: string): number => readdirSync(path, { withFileTypes: true }).reduce((n, entry) => {
        const name = join(path, entry.name);
        return n + (entry.isDirectory() ? visit(name) : statSync(name).size > 0 ? 1 : 0);
      }, 0);
      return visit(directory);
    } };
  } catch (error) { await close(); throw error; }
}

export function productionStorage(bucket: string) {
  const previous = process.env.NODE_ENV;
  try {
    // Only select the existing production class synchronously; auth/HTTP stay NODE_ENV=test.
    process.env.NODE_ENV = "production";
    setAttachmentStorageForTests(null);
    const storage = getAttachmentStorage();
    expect(storage.constructor.name).toBe("SeaweedFsS3Storage");
    expect(Reflect.get(storage, "bucket") === bucket, "Actual application adapter uses the owned target bucket").toBe(true);
    return { storage, close() { (Reflect.get(storage, "client") as S3Client).destroy(); setAttachmentStorageForTests(null); } };
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
}
