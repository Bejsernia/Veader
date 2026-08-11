import { getRemoteSource } from './platform/nativeContracts';
import type { RemoteSourceModule } from './platform/nativeContracts';

export type RemoteEntry = { name: string; path: string; size: number; directory: boolean; modifiedAt?: number };
export type RemoteCredentials = { endpoint: string; username?: string; password?: string };
export type DownloadInput = { remotePath: string; localUri: string };
export type DownloadResult = { localUri: string };

export interface RemoteSourceAdapter {
  readonly id: string;
  readonly scheme: 'ftp' | 'smb';
  readonly capabilities: { list: boolean; download: boolean; modifiedTime: boolean };
  connect(credentials: RemoteCredentials): Promise<void>;
  list(path: string): Promise<RemoteEntry[]>;
  download(input: DownloadInput): Promise<DownloadResult>;
  disconnect(): Promise<void>;
}

export class NativeModuleRequiredError extends Error {
  constructor(public readonly protocol: 'FTP' | 'SMB') {
    super(`${protocol} 需要 Veader development build，Expo Go 不包含对应的原生协议模块。`);
  }
}

function remoteModule(protocol: 'FTP' | 'SMB' = 'FTP'): RemoteSourceModule & { scan: NonNullable<RemoteSourceModule['scan']>; download: NonNullable<RemoteSourceModule['download']> } {
  const module = getRemoteSource();
  if (!module?.scan || !module.download) throw new NativeModuleRequiredError(protocol);
  return module as RemoteSourceModule & { scan: NonNullable<RemoteSourceModule['scan']>; download: NonNullable<RemoteSourceModule['download']> };
}

export async function saveRemoteCredentials(endpoint: string, username: string, password: string) {
  const module = getRemoteSource();
  if (!module?.saveCredentials) throw new NativeModuleRequiredError('FTP');
  await module.saveCredentials(endpoint, username, password);
}

export async function deleteRemoteCredentials(endpoint: string) {
  await getRemoteSource()?.deleteCredentials?.(endpoint);
}

export class FtpAdapter implements RemoteSourceAdapter {
  readonly id = 'ftp';
  readonly scheme = 'ftp' as const;
  readonly capabilities = { list: true, download: true, modifiedTime: true };
  private credentials?: RemoteCredentials;
  async connect(credentials: RemoteCredentials) { this.credentials = credentials; }
  async list(path: string): Promise<RemoteEntry[]> { const c = this.credentials; if (!c) throw new Error('FTP 尚未连接'); return (await remoteModule('FTP').scan('ftp', c.endpoint, c.username, c.password)).filter(item => !path || item.path.startsWith(path)).map(item => ({ name: item.name, path: item.path, size: Number(item.size ?? 0), directory: Boolean(item.directory), modifiedAt: item.modifiedAt })); }
  async download(input: DownloadInput) { const c = this.credentials; if (!c) throw new Error('FTP 尚未连接'); await remoteModule('FTP').download('ftp', c.endpoint, input.remotePath, c.username, c.password, input.localUri); return { localUri: input.localUri }; }
  async disconnect() { this.credentials = undefined; }
}

export class SmbAdapter implements RemoteSourceAdapter {
  readonly id = 'smb';
  readonly scheme = 'smb' as const;
  readonly capabilities = { list: true, download: true, modifiedTime: true };
  private credentials?: RemoteCredentials;
  async connect(credentials: RemoteCredentials) { this.credentials = credentials; }
  async list(path: string): Promise<RemoteEntry[]> { const c = this.credentials; if (!c) throw new Error('SMB 尚未连接'); return (await remoteModule('SMB').scan('smb', c.endpoint, c.username, c.password)).filter(item => !path || item.path.startsWith(path)).map(item => ({ name: item.name, path: item.path, size: Number(item.size ?? 0), directory: Boolean(item.directory), modifiedAt: item.modifiedAt })); }
  async download(input: DownloadInput) { const c = this.credentials; if (!c) throw new Error('SMB 尚未连接'); await remoteModule('SMB').download('smb', c.endpoint, input.remotePath, c.username, c.password, input.localUri); return { localUri: input.localUri }; }
  async disconnect() { this.credentials = undefined; }
}

export function createRemoteSourceAdapter(scheme: 'ftp' | 'smb'): RemoteSourceAdapter {
  return scheme === 'ftp' ? new FtpAdapter() : new SmbAdapter();
}
