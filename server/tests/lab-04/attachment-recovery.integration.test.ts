import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import request from "supertest";
import { expect, it } from "vitest";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getPrisma } from "../../src/prisma.js";
import { applyLab3Baseline, applyLaterMigrations, identifier, oldTables, query, snapshot,
  verifiedTestTarget, withDisposableSchema } from "./migration-test-fixtures.js";
import { native, nativeTools } from "./native-recovery-test-helpers.js";
import { ownedSeaweed, productionStorage, RecoveryPrerequisiteError } from "./persistent-recovery-test-helpers.js";

const tables = { ...oldTables, Action: "id", ActionHistory: "id", MutationReceipt: "id", SeedFixture: "id" };
const domainTables = Object.fromEntries(Object.entries(tables).filter(([name]) => !["AuthSession", "LoginThrottle"].includes(name)));
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function same(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; private comparison redacted`).toBe(true);
}
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=", "base64");
const pdf = Buffer.from("%PDF-1.7\n% Synthetic removed recovery fixture\n%%EOF\n");

// T-31 / AC-31: actual production S3 adapter, owned on-disk SeaweedFS, native
// PostgreSQL archive and actual binary export. No in-memory/storage mocks.
it("restores a quiesced PostgreSQL/S3 recovery pair and enforces active/removed attachment access on restored targets", async () => {
  const target = verifiedTestTarget();
  const tools = nativeTools();
  const root = mkdtempSync(join(tmpdir(), "toktickit-t31-"));
  const token = randomUUID().replaceAll("-", "");
  const sourceBucket = `toktickit-t31-source-${token}`, restoredBucket = `toktickit-t31-restored-${token}`;
  const keys = ["DATABASE_URL", "TEST_DATABASE_URL", "TOKTICKIT_DEVELOPMENT_DATABASE_URL", "NODE_ENV",
    "SEAWEEDFS_S3_ENDPOINT", "SEAWEEDFS_BUCKET", "SEAWEEDFS_ACCESS_KEY", "SEAWEEDFS_SECRET_KEY"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let weed: Awaited<ReturnType<typeof ownedSeaweed>> | undefined;
  let adapter: ReturnType<typeof productionStorage> | undefined;
  let stage = "persistent-service-start";
  try {
    expect(png.length).toBe(68); expect(digest(png)).toBe("15671d6715a3bb032b954ab94af9aedad9a7e0148253891238ff983a56641b12");
    expect(pdf.length).toBe(52); expect(digest(pdf)).toBe("d9324fdc1155ac356fb0f705f0b56b24183d7e4d26922adf8a95ec384cc3c8ea");
    weed = await ownedSeaweed(join(root, "seaweed"), [sourceBucket, restoredBucket]);
    const s3 = weed.client;
    process.env.SEAWEEDFS_S3_ENDPOINT = weed.endpoint;
    process.env.SEAWEEDFS_ACCESS_KEY = weed.credentials.accessKeyId;
    process.env.SEAWEEDFS_SECRET_KEY = weed.credentials.secretAccessKey;
    await withDisposableSchema("backup", async (client, sourceSchema) => {
      stage = "migrated-source-and-application-target";
      await applyLab3Baseline(client); await applyLaterMigrations(client);
      const sourceUrl = new URL(target.databaseUrl); sourceUrl.searchParams.set("schema", sourceSchema);
      process.env.TEST_DATABASE_URL = sourceUrl.toString(); process.env.DATABASE_URL = sourceUrl.toString();
      process.env.NODE_ENV = "test"; process.env.SEAWEEDFS_BUCKET = sourceBucket;
      adapter = productionStorage(sourceBucket);
      const prisma = getPrisma();
      const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string; oid: number }>>`
        SELECT current_database() AS database,current_schema() AS schema,to_regnamespace(current_schema())::oid::int AS oid`;
      expect(live.database === target.identity.databaseName && live.schema === sourceSchema,
        "Actual app connection uses exact owned dedicated source, distinct from operational").toBe(true);
      const { app } = await import("../../src/app.js");
      const { cookieHeader, cookieValue, createAuthUser, loginRequest, APPROVED_ORIGIN } = await import("../lab-03/auth-test-helpers.js");
      const actors = [];
      for (const role of ["REQUESTER", "IT_STAFF", "ADMINISTRATOR", "REQUESTER"] as const) {
        const actor = await createAuthUser({ email: `t31-${actors.length}-${token}@example.test`, role });
        const login = await loginRequest(actor.user.email, actor.password);
        expect(login.status, "Real authentication; response/credentials withheld").toBe(200);
        actors.push({ id: actor.user.id, cookie: cookieHeader(login.headers["set-cookie"]), csrf: cookieValue(login.headers["set-cookie"], "toktickit_csrf") });
      }
      const [owner, staff, admin, foreign] = actors;
      const category = await prisma.category.create({ data: { name: `T31 ${token}` } });
      const system = await prisma.relatedSystem.create({ data: { name: `T31 ${token}` } });
      const ticket = await prisma.ticket.create({ data: { ticketNumber: `T31-${token.slice(0, 12)}`,
        clientSubmissionId: randomUUID(), requesterId: owner!.id, categoryId: category.id, relatedSystemId: system.id,
        summary: "Synthetic consistent recovery Ticket", description: "Private synthetic recovery context", requestedPriority: "LOW", itPriority: "LOW" } });
      const base = `/api/tickets/${ticket.id}/attachments`;
      const unsafe = (call: request.Test) => call.set("Cookie", owner!.cookie).set("Origin", APPROVED_ORIGIN).set("X-CSRF-Token", owner!.csrf);
      stage = "real-upload-and-soft-removal";
      const active = await unsafe(request(app).post(base)).attach("file", png, { filename: "active.png", contentType: "image/png" });
      expect(active.status).toBe(201);
      const removed = await unsafe(request(app).post(base)).attach("file", pdf, { filename: "removed.pdf", contentType: "application/pdf" });
      expect(removed.status).toBe(201);
      const reason = "Remove the synthetic outdated recovery evidence.";
      const removal = await unsafe(request(app).delete(`${base}/${removed.body.id}`)).send({ removalReason: reason });
      expect(removal.status).toBe(200);
      const metadata = await prisma.attachment.findMany({ where: { ticketId: ticket.id }, orderBy: { id: "asc" } });
      expect(metadata).toHaveLength(2);
      const activeRow = metadata[0]!, removedRow = metadata[1]!;
      expect(activeRow.id).toBe(active.body.id); expect(activeRow.sizeBytes).toBe(68); expect(activeRow.isRemoved).toBe(false);
      expect(removedRow.id).toBe(removed.body.id); expect(removedRow.sizeBytes).toBe(52); expect(removedRow.isRemoved).toBe(true);
      expect(removedRow.removedByUserId).toBe(owner!.id); expect(removedRow.removalReason).toBe(reason); expect(removedRow.removedAt).not.toBeNull();
      const absent = async (bucket: string, key: string) => {
        let missing = false;
        try { await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); }
        catch (error) { missing = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404; }
        expect(missing, "Removed/source content unavailable in this explicit namespace").toBe(true);
      };
      await absent(sourceBucket, removedRow.storageKey);
      expect(weed!.persistentFiles(), "Real nonempty SeaweedFS files exist on disk, not a Map").toBeGreaterThan(0);

      stage = "quiesced-paired-backup";
      // All owned HTTP writers have completed. No background browser/server writer
      // exists. Keep them quiesced until both archives and the manifest are sealed.
      await query(client, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const exported = await query<{ snapshot: string }>(client, "SELECT pg_export_snapshot() AS snapshot");
      const before = await snapshot(client, sourceSchema, undefined, tables);
      const url = new URL(target.databaseUrl);
      const environment = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432",
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: url.searchParams.get("sslmode") || "prefer", PGOPTIONS: "-c timezone=UTC" };
      const archive = join(root, "database.backup"), binary = join(root, "active.bin"), manifestPath = join(root, "pair.json");
      await native(tools.dump, ["--format=custom", `--schema=${sourceSchema}`, `--snapshot=${exported.rows[0]!.snapshot}`,
        `--file=${archive}`, "--no-owner", "--no-privileges"], environment);
      expect(statSync(archive).size).toBeGreaterThan(0);
      const objects = await s3.send(new ListObjectsV2Command({ Bucket: sourceBucket }));
      expect(objects.IsTruncated).not.toBe(true);
      same((objects.Contents ?? []).map(object => object.Key), [activeRow.storageKey], "Exactly the live active binary; removed object excluded");
      const object = await s3.send(new GetObjectCommand({ Bucket: sourceBucket, Key: activeRow.storageKey }));
      const bytes = Buffer.from(await object.Body!.transformToByteArray());
      expect(bytes.length).toBe(68); expect(digest(bytes)).toBe(digest(png)); writeFileSync(binary, bytes);
      const manifest = { boundary: "owned writers quiesced; exported DB snapshot held through binary export",
        databaseSha256: digest(readFileSync(archive)), tables: before, active: { key: activeRow.storageKey, bytes: 68, sha256: digest(png), mimeType: "image/png" },
        removed: { key: removedRow.storageKey, exported: false, isRemoved: true } };
      writeFileSync(manifestPath, JSON.stringify(manifest));
      await query(client, "COMMIT");
      same(await snapshot(client, sourceSchema, before, tables), before, "Fresh source observation agrees after the quiesced pair is sealed");
      expect(digest(readFileSync(archive))).toBe(manifest.databaseSha256);
      expect(digest(readFileSync(binary))).toBe(manifest.active.sha256);

      // Invalidate only the owned SOURCE object after sealing the pair. Successful
      // later HTTP reads cannot be accidentally served from retained source data.
      await s3.send(new DeleteObjectCommand({ Bucket: sourceBucket, Key: activeRow.storageKey }));
      await absent(sourceBucket, activeRow.storageKey);
      adapter.close(); adapter = undefined; await prisma.$disconnect();
      await withDisposableSchema("restore", async (restoreClient, retainedSchema) => {
        stage = "native-restore-to-separate-owned-targets";
        await query(restoreClient, `DROP SCHEMA ${identifier(retainedSchema)} CASCADE`);
        await query(client, `ALTER SCHEMA ${identifier(sourceSchema)} RENAME TO ${identifier(retainedSchema)}`);
        const vacant = await query<{ absent: boolean }>(restoreClient, "SELECT to_regnamespace($1) IS NULL AS absent", [sourceSchema]);
        expect(vacant.rows[0]!.absent).toBe(true);
        // Standard pg_restore retains schema names: source is retained under the
        // other owned name; the archive creates a new schema/OID at the old name.
        await native(tools.restore, ["--dbname", environment.PGDATABASE!, "--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", archive], environment);
        same(await snapshot(restoreClient, sourceSchema, before, tables), before, "All 15 restored table checksums/counts match the sealed database archive");
        same(await snapshot(restoreClient, retainedSchema, before, tables), before, "Retained source DB remains independently unchanged");
        const empty = await s3.send(new ListObjectsV2Command({ Bucket: restoredBucket })); expect(empty.Contents ?? []).toEqual([]);
        // Restore only the sealed export, never read live source objects here.
        const sealed = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof manifest;
        expect(digest(readFileSync(archive))).toBe(sealed.databaseSha256);
        expect(digest(readFileSync(binary))).toBe(sealed.active.sha256);
        await s3.send(new PutObjectCommand({ Bucket: restoredBucket, Key: sealed.active.key, Body: readFileSync(binary), ContentType: sealed.active.mimeType }));
        await absent(restoredBucket, removedRow.storageKey);
        process.env.SEAWEEDFS_BUCKET = restoredBucket; adapter = productionStorage(restoredBucket);
        const [restored] = await prisma.$queryRaw<Array<{ schema: string; oid: number }>>`
          SELECT current_schema() AS schema,to_regnamespace(current_schema())::oid::int AS oid`;
        expect(restored.schema === sourceSchema && restored.oid !== live.oid,
          "Actual application client reconnected to newly restored schema/OID, not retained source").toBe(true);
        const domain = await snapshot(restoreClient, sourceSchema, undefined, domainTables);
        const safeMetadata = (row: typeof activeRow) => ({ id: row.id, ticketId: row.ticketId, originalFilename: row.originalFilename,
          mimeType: row.mimeType, sizeBytes: row.sizeBytes, uploadedByRequesterId: row.uploadedByUserId, isRemoved: row.isRemoved,
          createdAt: row.createdAt.toISOString(), removedAt: row.removedAt?.toISOString() ?? null,
          removedByRequesterId: row.removedByUserId, removalReason: row.removalReason });
        stage = "restored-authenticated-reads-and-removal-denial";
        for (const actor of [owner!, staff!, admin!]) {
          const list = await request(app).get(base).set("Cookie", actor.cookie);
          expect(list.status).toBe(200); same(list.body, { items: metadata.map(safeMetadata) }, "Exact inherited safe metadata; no storage identifiers/private relations");
          for (const row of metadata) {
            const detail = await request(app).get(`${base}/${row.id}`).set("Cookie", actor.cookie);
            expect(detail.status).toBe(200); same(detail.body, safeMetadata(row), "Exact authorized active/removed metadata");
          }
          const content = await request(app).get(`${base}/${activeRow.id}/content`).set("Cookie", actor.cookie).buffer(true)
            .parse((res, callback) => { const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(Buffer.from(chunk)));
              res.on("end", () => callback(null, Buffer.concat(chunks))); res.on("error", callback); });
          expect(content.status).toBe(200); expect(Buffer.isBuffer(content.body)).toBe(true);
          expect(content.body.length).toBe(68); expect(digest(content.body)).toBe("15671d6715a3bb032b954ab94af9aedad9a7e0148253891238ff983a56641b12");
          expect(content.headers["content-type"]).toMatch(/^image\/png/); expect(content.headers["x-content-type-options"]).toBe("nosniff");
          const gone = await request(app).get(`${base}/${removedRow.id}/content`).set("Cookie", actor.cookie);
          expect(gone.status).toBe(410); expect(gone.body.error.code).toBe("ATTACHMENT_REMOVED");
          expect(/storageKey|seaweed|bucket|passwordHash|tokenHash/i.test(JSON.stringify(gone.body))).toBe(false);
          same(await snapshot(restoreClient, sourceSchema, domain, domainTables), domain, "Authorized recovery reads alter no domain rows; only live-session bookkeeping excluded");
        }
        for (const suffix of ["", `/${activeRow.id}`, `/${activeRow.id}/content`, `/${removedRow.id}/content`]) {
          const denied = await request(app).get(`${base}${suffix}`).set("Cookie", foreign!.cookie);
          expect(denied.status).toBe(404); expect(denied.body.error.code).toBe(suffix ? "ATTACHMENT_NOT_FOUND" : "TICKET_NOT_FOUND");
          expect(Object.keys(denied.body)).toEqual(["error"]);
          expect(/storageKey|seaweed|bucket|active\.png|removed\.pdf|passwordHash|tokenHash/i.test(JSON.stringify(denied.body))).toBe(false);
        }
        same(await snapshot(restoreClient, sourceSchema, domain, domainTables), domain, "Denials and binary recovery checks preserve exact restored domain");
        await absent(sourceBucket, activeRow.storageKey); await absent(restoredBucket, removedRow.storageKey);
        adapter.close(); adapter = undefined; await prisma.$disconnect();
        console.info("T31 recovery pair verified: native archive/all 15 table checksums; real persistent SeaweedFS S3 binary export; fresh restored DB OID/bucket; active 68-byte digest; removed absent/410; 3 authorized roles and foreign denial; no domain writes.");
      });
    });
  } catch (error) {
    if (error instanceof RecoveryPrerequisiteError) throw error;
    const code = (error as { code?: unknown })?.code;
    throw new Error(`T31 ${stage} failed; class=${error instanceof Error ? error.name : "unknown"}; code=${typeof code === "string" && /^(P\d{4}|[A-Z0-9]{5})$/.test(code) ? code : "unclassified"}; details withheld.`);
  } finally {
    adapter?.close(); await getPrisma().$disconnect();
    try { await weed?.close(); }
    finally {
      for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
      expect(keys.every(key => process.env[key] === previous[key]), "All scoped environment values restored").toBe(true);
      // Verify the absolute owned target before recursive removal; no shared path.
      expect(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith("toktickit-t31-")).toBe(true);
      rmSync(root, { recursive: true, force: true }); expect(existsSync(root)).toBe(false);
      console.info("T31 cleanup verified: owned buckets/objects, process, binary export/DB archive and directory removed; schema helpers check remaining=0; clients/settings restored.");
    }
  }
}, 30_000); // Initial finite budget matches the existing native multi-step recovery case.
