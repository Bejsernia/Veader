export type RemoteEntry = { name: string; path: string; size: number; directory: boolean; modifiedAt?: number };
export type RemoteCredentials = { endpoint: string; username?: string; password?: string };

export interface RemoteSourceAdapter {
  readonly scheme: 'ftp' | 'smb';
  connect(credentials: RemoteCredentials): Promise<void>;
  list(path: string): Promise<RemoteEntry[]>;
  download(remotePath: string, localUri: string): Promise<void>;
  disconnect(): Promise<void>;
}

export class NativeModuleRequiredError extends Error {
  constructor(public readonly protocol: 'FTP' | 'SMB') {
    super(`${protocol} 需要 Veader development build，Expo Go 不包含对应的原生协议模块。`);
  }
}

function remoteModule() {
  const module = (NativeModules as any).RemoteSource;
  if (Platform.OS !== 'android' || !module) throw new NativeModuleRequiredError('FTP');
  return module;
}

export async function saveRemoteCredentials(endpoint: string, username: string, password: string) {
  if (Platform.OS !== 'android' || !(NativeModules as any).RemoteSource?.saveCredentials) throw new NativeModuleRequiredError('FTP');
  await (NativeModules as any).RemoteSource.saveCredentials(endpoint, username, password);
}

export async function deleteRemoteCredentials(endpoint: string) {
  if (Platform.OS !== 'android' || !(NativeModules as any).RemoteSource?.deleteCredentials) return;
  await (NativeModules as any).RemoteSource.deleteCredentials(endpoint);
}

export class FtpAdapter implements RemoteSourceAdapter {
  readonly scheme = 'ftp' as const;
  private credentials?: RemoteCredentials;
  async connect(credentials: RemoteCredentials) { this.credentials = credentials; await remoteModule().scan('ftp', credentials.endpoint, credentials.username, credentials.password); }
  async list(path: string): Promise<RemoteEntry[]> { const c = this.credentials; if (!c) throw new Error('FTP 尚未连接'); return (await remoteModule().scan('ftp', c.endpoint, c.username, c.password) as any[]).filter(item => !path || item.path.startsWith(path)); }
  async download(remotePath: string, localUri: string) { const c = this.credentials; if (!c) throw new Error('FTP 尚未连接'); await remoteModule().download('ftp', c.endpoint, remotePath, c.username, c.password, localUri); }
  async disconnect() { this.credentials = undefined; }
}

export class SmbAdapter implements RemoteSourceAdapter {
  readonly scheme = 'smb' as const;
  private credentials?: RemoteCredentials;
  async connect(credentials: RemoteCredentials) { this.credentials = credentials; await remoteModule().scan('smb', credentials.endpoint, credentials.username, credentials.password); }
  async list(path: string): Promise<RemoteEntry[]> { const c = this.credentials; if (!c) throw new Error('SMB 尚未连接'); return (await remoteModule().scan('smb', c.endpoint, c.username, c.password) as any[]).filter(item => !path || item.path.startsWith(path)); }
  async download(remotePath: string, localUri: string) { const c = this.credentials; if (!c) throw new Error('SMB 尚未连接'); await remoteModule().download('smb', c.endpoint, remotePath, c.username, c.password, localUri); }
  async disconnect() { this.credentials = undefined; }
}
import { NativeModules, Platform } from 'react-native';
