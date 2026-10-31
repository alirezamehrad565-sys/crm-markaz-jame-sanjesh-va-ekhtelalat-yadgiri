export interface StoredObject {
  bytes: Uint8Array;
  mime: string;
  size: number;
}

export interface ObjectStore {
  readonly name: 'd1' | 'r2';
  readonly maxObjectBytes: number;
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  putSegments?(key: string, segments: Uint8Array[]): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export interface R2LikeBucket {
  put(key: string, value: Uint8Array): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<unknown>;
}
