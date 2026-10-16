/**
 * VizSpec ⇄ URL hash and localStorage.
 *
 * Hash format: `#v=<base64url(deflate-raw(JSON))>` when CompressionStream is
 * available, else `#j=<base64url(JSON)>`. Older spec versions are migrated in
 * `migrateSpec` before validation. Framework-free; the only globals touched
 * are `CompressionStream`/`DecompressionStream`, `TextEncoder`, `atob`/`btoa`.
 */
import type { VizSpec } from './types';
import { SPEC_VERSION } from './constants';
import { validateSpec } from './validate-spec';
import { defaultAxis, defaultStyle, defaultTrendLine } from './spec-defaults';

const HASH_COMPRESSED = 'v';
const HASH_PLAIN = 'j';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: { readable: ReadableStream; writable: WritableStream }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as unknown as BufferSource);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function hasCompression(): boolean {
  return typeof (globalThis as { CompressionStream?: unknown }).CompressionStream === 'function';
}

/** Encode a spec to a hash string (without the leading `#`). */
export async function encodeSpec(spec: VizSpec): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(spec));
  if (hasCompression()) {
    const packed = await pipe(json, new CompressionStream('deflate-raw'));
    return `${HASH_COMPRESSED}=${toBase64Url(packed)}`;
  }
  return `${HASH_PLAIN}=${toBase64Url(json)}`;
}

/** Decode a hash (with or without `#`). Returns null when absent, malformed or invalid. */
export async function decodeSpec(hash: string): Promise<VizSpec | null> {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  const eq = h.indexOf('=');
  if (eq < 0) return null;
  const mode = h.slice(0, eq);
  const payload = h.slice(eq + 1);
  try {
    let bytes = fromBase64Url(payload);
    if (mode === HASH_COMPRESSED) {
      if (!hasCompression()) return null;
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } else if (mode !== HASH_PLAIN) {
      return null;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const migrated = migrateSpec(parsed);
    return validateSpec(migrated).length === 0 ? (migrated as VizSpec) : null;
  } catch {
    return null;
  }
}

/**
 * Upgrade older spec shapes to SPEC_VERSION.
 * v1 → v2: adds `axes.y2`, `axes.synchronized`, `style`, `referenceLines`,
 * `trendLine`, `annotations` with their defaults; everything else is unchanged.
 */
export function migrateSpec(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const s = raw as Record<string, unknown>;
  const v = s.version;
  if (v === SPEC_VERSION) return raw;
  if (v === 1) {
    const axes = (s.axes && typeof s.axes === 'object' ? s.axes : {}) as Record<string, unknown>;
    return {
      ...s,
      version: 2,
      axes: { x: axes.x ?? defaultAxis(), y: axes.y ?? defaultAxis(), y2: defaultAxis(), synchronized: false },
      style: defaultStyle(),
      referenceLines: [],
      trendLine: defaultTrendLine(),
      annotations: [],
    };
  }
  return raw;
}

/** Minimal storage interface so the codec is testable without a browser. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Save the current spec for a dataset (one slot per dataset). */
export function saveRecent(store: KeyValueStore, prefix: string, spec: VizSpec): void {
  try { store.setItem(prefix + spec.datasetId, JSON.stringify(spec)); } catch { /* quota or private mode */ }
}

/** Load the recent spec for a dataset; null when absent or invalid. */
export function loadRecent(store: KeyValueStore, prefix: string, datasetId: string): VizSpec | null {
  try {
    const raw = store.getItem(prefix + datasetId);
    if (!raw) return null;
    const migrated = migrateSpec(JSON.parse(raw));
    return validateSpec(migrated).length === 0 ? (migrated as VizSpec) : null;
  } catch {
    return null;
  }
}
