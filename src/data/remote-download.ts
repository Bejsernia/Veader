import * as FileSystem from 'expo-file-system';
import type { RemoteSourceAdapter } from '../protocols';

export type DownloadFileSystem = {
  makeDirectoryAsync(uri: string, options: { intermediates: boolean }): Promise<void>;
  getInfoAsync(uri: string, options?: { size?: boolean }): Promise<{ exists: boolean; size?: number }>;
  deleteAsync(uri: string, options: { idempotent: boolean }): Promise<void>;
  moveAsync(input: { from: string; to: string }): Promise<void>;
};

export type AtomicRemoteDownloadInput = {
  adapter: RemoteSourceAdapter;
  endpoint: string;
  remotePath: string;
  targetUri: string;
  temporaryUri?: string;
  expectedSize?: number;
  fileSystem?: DownloadFileSystem;
};

const defaultFileSystem = FileSystem as unknown as DownloadFileSystem;
const downloads = new WeakMap<DownloadFileSystem, Map<string, { identity: string; promise: Promise<string> }>>();

/** Coalesce readers and prefetchers before either can touch the shared .part file. */
export function downloadRemoteFile(input: AtomicRemoteDownloadInput): Promise<string> {
  const fs = input.fileSystem ?? defaultFileSystem;
  const pending = downloads.get(fs) ?? new Map<string, { identity: string; promise: Promise<string> }>();
  downloads.set(fs, pending);
  const identity = JSON.stringify([input.endpoint, input.remotePath, input.expectedSize]);
  const existing = pending.get(input.targetUri);
  if (existing) {
    return existing.identity === identity ? existing.promise : Promise.reject(new Error('缓存目标已有不同的下载任务'));
  }
  const promise = publishDownload(input, fs).finally(() => {
    if (pending.get(input.targetUri)?.promise === promise) pending.delete(input.targetUri);
  });
  pending.set(input.targetUri, { identity, promise });
  return promise;
}

/** Publish only a complete file; connection, transfer and move failures all clean up. */
async function publishDownload(input: AtomicRemoteDownloadInput, fs: DownloadFileSystem) {
  const temporaryUri = input.temporaryUri ?? `${input.targetUri}.part`;
  if (temporaryUri === input.targetUri) throw new Error('下载临时文件不能覆盖目标文件');
  await fs.makeDirectoryAsync(input.targetUri.slice(0, input.targetUri.lastIndexOf('/') + 1), { intermediates: true });
  try {
    await fs.deleteAsync(temporaryUri, { idempotent: true });
    try {
      await input.adapter.connect({ endpoint: input.endpoint });
      await input.adapter.download({ remotePath: input.remotePath, localUri: temporaryUri });
    } finally {
      await input.adapter.disconnect().catch(() => undefined);
    }

    const downloaded = await fs.getInfoAsync(temporaryUri, { size: true });
    const size = Number(downloaded.size ?? 0);
    if (!downloaded.exists || size <= 0 || (input.expectedSize !== undefined && size !== input.expectedSize)) {
      throw new Error('远程文件下载不完整');
    }

    const existing = await fs.getInfoAsync(input.targetUri, { size: true });
    if (existing.exists && Number(existing.size ?? 0) > 0 && (input.expectedSize === undefined || Number(existing.size) === input.expectedSize)) {
      await fs.deleteAsync(temporaryUri, { idempotent: true });
      return input.targetUri;
    }
    if (existing.exists) await fs.deleteAsync(input.targetUri, { idempotent: true });
    await fs.moveAsync({ from: temporaryUri, to: input.targetUri });
    return input.targetUri;
  } catch (error) {
    await fs.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}
