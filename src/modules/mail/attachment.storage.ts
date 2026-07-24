import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";

export interface AttachmentStorage {
  save(data: Buffer): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

export class LocalAttachmentStorage implements AttachmentStorage {
  private readonly root = resolve(
    isAbsolute(env.ATTACHMENT_STORAGE_PATH)
      ? env.ATTACHMENT_STORAGE_PATH
      : resolve(process.cwd(), env.ATTACHMENT_STORAGE_PATH)
  );

  private path(storageKey: string) {
    const filePath = resolve(this.root, storageKey);
    if (!filePath.startsWith(`${this.root}${sep}`)) {
      throw new Error("Invalid attachment storage key");
    }
    return filePath;
  }

  async save(data: Buffer) {
    await mkdir(this.root, { recursive: true });
    const storageKey = randomUUID();
    await writeFile(this.path(storageKey), data, { flag: "wx" });
    return storageKey;
  }

  read(storageKey: string) {
    return readFile(this.path(storageKey));
  }

  async delete(storageKey: string) {
    await rm(this.path(storageKey), { force: true });
  }
}

export const attachmentStorage: AttachmentStorage = new LocalAttachmentStorage();
