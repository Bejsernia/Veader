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

export class FtpAdapter implements RemoteSourceAdapter {
  readonly scheme = 'ftp' as const;
  async connect(_: RemoteCredentials) { throw new NativeModuleRequiredError('FTP'); }
  async list(_: string): Promise<RemoteEntry[]> { throw new NativeModuleRequiredError('FTP'); }
  async download(_: string, __: string) { throw new NativeModuleRequiredError('FTP'); }
  async disconnect() {}
}

export class SmbAdapter implements RemoteSourceAdapter {
  readonly scheme = 'smb' as const;
  async connect(_: RemoteCredentials) { throw new NativeModuleRequiredError('SMB'); }
  async list(_: string): Promise<RemoteEntry[]> { throw new NativeModuleRequiredError('SMB'); }
  async download(_: string, __: string) { throw new NativeModuleRequiredError('SMB'); }
  async disconnect() {}
}
