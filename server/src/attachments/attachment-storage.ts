import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type StoreAttachmentInput = {
  storageKey: string;
  content: Buffer;
  mimeType: string;
};

export interface AttachmentStorage {
  store(input: StoreAttachmentInput): Promise<void>;
  remove(storageKey: string): Promise<void>;
}

export class StorageUnavailableError extends Error {
  constructor() {
    super("Attachment storage is unavailable.");
    this.name = "StorageUnavailableError";
  }
}

class SeaweedFsS3Storage implements AttachmentStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketReady: Promise<void> | null = null;

  constructor() {
    this.bucket =
      process.env.SEAWEEDFS_BUCKET ??
      "toktickit-attachments";

    this.client = new S3Client({
      endpoint:
        process.env.SEAWEEDFS_S3_ENDPOINT ??
        "http://127.0.0.1:8333",
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId:
          process.env.SEAWEEDFS_ACCESS_KEY ??
          "seaweedfs",
        secretAccessKey:
          process.env.SEAWEEDFS_SECRET_KEY ??
          "seaweedfs",
      },
    });
  }

  private async prepareBucket(): Promise<void> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        }),
      );
    } catch {
      await this.client.send(
        new CreateBucketCommand({
          Bucket: this.bucket,
        }),
      );
    }
  }

  private async ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = this.prepareBucket().catch(
        () => {
          this.bucketReady = null;
          throw new StorageUnavailableError();
        },
      );
    }

    return this.bucketReady;
  }

  async store(
    input: StoreAttachmentInput,
  ): Promise<void> {
    try {
      await this.ensureBucket();

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.storageKey,
          Body: input.content,
          ContentType: input.mimeType,
        }),
      );
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        throw error;
      }

      throw new StorageUnavailableError();
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await this.ensureBucket();

      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );
    } catch {
      throw new StorageUnavailableError();
    }
  }
}

class InMemoryAttachmentStorage
  implements AttachmentStorage
{
  private readonly objectsVariable = new Map<
    string,
    StoreAttachmentInput
  >();

  async store(
    input: StoreAttachmentInput,
  ): Promise<void> {
    this.objectsVariable.set(input.storageKey, input);
  }

  async remove(storageKey: string): Promise<void> {
    this.objectsVariable.delete(storageKey);
  }
}

let storage: AttachmentStorage | null = null;

export function getAttachmentStorage(): AttachmentStorage {
  if (!storage) {
    storage =
      process.env.NODE_ENV === "test"
        ? new InMemoryAttachmentStorage()
        : new SeaweedFsS3Storage();
  }

  return storage;
}

export function setAttachmentStorageForTests(
  replacement: AttachmentStorage | null,
): void {
  storage = replacement;
}