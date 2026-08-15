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

/** Downloads into a .part file and publishes only a complete target file. */
export async function downloadRemoteFile(input: AtomicRemoteDownloadInput) {
  const fs = input.fileSystem ?? defaultFileSystem;
  const temporaryUri = input.temporaryUri ?? `${input.targetUri}.part`;
  await fs.makeDirectoryAsync(input.targetUri.slice(0, input.targetUri.lastIndexOf('/') + 1), { intermediates: true });
  await fs.deleteAsync(temporaryUri, { idempotent: true });
  await input.adapter.connect({ endpoint: input.endpoint });
  try {
    await input.adapter.download({ remotePath: input.remotePath, localUri: temporaryUri });
  } finally {
    await input.adapter.disconnect().catch(() => undefined);
  }

  const downloaded = await fs.getInfoAsync(temporaryUri, { size: true });
  const size = Number(downloaded.size ?? 0);
  if (!downloaded.exists || size <= 0 || (input.expectedSize !== undefined && size !== input.expectedSize)) {
    await fs.deleteAsync(temporaryUri, { idempotent: true });
    throw new Error('远程文件下载不完整');
  }

  const existing = await fs.getInfoAsync(input.targetUri, { size: true });
  if (existing.exists && (input.expectedSize === undefined || Number(existing.size ?? -1) === input.expectedSize)) {
    await fs.deleteAsync(temporaryUri, { idempotent: true });
    return input.targetUri;
  }
  if (existing.exists) await fs.deleteAsync(input.targetUri, { idempotent: true });
  await fs.moveAsync({ from: temporaryUri, to: input.targetUri });
  return input.targetUri;
}
