import { ValidationError } from '@core/errors';

const SEGMENT_TARGET = 1_500_000;
const HEADERS_MAX = 64 * 1024;

export interface MultipartFile {
  name: string;
  filename: string;
  mimeType: string;
  segments: Uint8Array[];
  size: number;
}

export interface ParsedMultipart {
  files: MultipartFile[];
  fields: Map<string, string>;
}

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = new TextDecoder();
const EMPTY = new Uint8Array(0);

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  if (needle.length === 0) return from;
  outer: for (let i = Math.max(0, from); i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function headerParam(line: string, param: string): string {
  const star = new RegExp(`${param}\\*=([^;]+)`, 'i').exec(line);
  if (star) {
    const parts = star[1].split("''");
    const value = parts.length >= 2 ? parts[1] : parts[0];
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  const m =
    new RegExp(`${param}="((?:[^"\\\\]|\\\\.)*)"`, 'i').exec(line) ??
    new RegExp(`${param}=([^;\\r\\n]+)`, 'i').exec(line);
  if (!m) return '';
  return m[1].replace(/\\/g, '').trim();
}

export async function parseMultipartStream(
  body: ReadableStream<Uint8Array>,
  contentType: string
): Promise<ParsedMultipart> {
  const bm = /boundary=(?:"([^"]+)"|([^;,]+))/i.exec(contentType);
  if (!bm) throw new ValidationError('بدنهٔ multipart بدون boundary است');
  const boundary = (bm[1] ?? bm[2] ?? '').trim().replace(/^"|"$/g, '');
  if (!boundary) throw new ValidationError('boundary نامعتبر است');

  const firstDelim = enc(`--${boundary}`);
  const delim = enc(`\r\n--${boundary}`);
  const HEAD_END = enc('\r\n\r\n');

  const files: MultipartFile[] = [];
  const fields = new Map<string, string>();

  const reader = body.getReader();
  let win: Uint8Array = EMPTY; // پنجرهٔ جستجو — کوچک
  let pending: Uint8Array = EMPTY; // دنبالهٔ کوچکِ در‌انتظار قطعه‌شدن

  type Mode = 'preamble' | 'headers' | 'content' | 'done';
  let mode: Mode = 'preamble';
  let cur: MultipartFile | null = null;
  let curField: { name: string; chunks: Uint8Array[] } | null = null;
  let finished = false;

  const flushPending = () => {
    if (pending.length === 0) return;
    if (cur) {
      cur.segments.push(pending);
      cur.size += pending.length;
    } else if (curField) {
      curField.chunks.push(pending);
    }
    pending = EMPTY;
  };

  const finishPart = () => {
    flushPending();
    if (cur) {
      files.push(cur);
      cur = null;
    } else if (curField) {
      let value = '';
      if (curField.chunks.length > 0) {
        let acc: Uint8Array = EMPTY;
        for (const c of curField.chunks) acc = concatBytes(acc, c);
        value = dec.decode(acc);
      }
      fields.set(curField.name, value);
      curField = null;
    }
  };

  const startPart = (headerBlock: Uint8Array) => {
    const text = dec.decode(headerBlock);
    const disposition = /content-disposition:[^\r\n]*/i.exec(text)?.[0] ?? '';
    const name = headerParam(disposition, 'name');
    const filename = headerParam(disposition, 'filename');
    const type = /content-type:[^\r\n]*/i.exec(text)?.[0]?.split(':')[1]?.trim() ?? '';
    if (filename) {
      cur = { name, filename, mimeType: type || 'application/octet-stream', segments: [], size: 0 };
      curField = null;
    } else {
      cur = null;
      curField = { name, chunks: [] };
    }
  };

  const finish = () => {
    if (!finished) {
      if (mode === 'content') finishPart();
      finished = true;
    }
    mode = 'done';
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.length === 0) continue;
    win = concatBytes(win, value);

    for (;;) {
      if (finished) break;
      if (mode === 'preamble') {
        const p = indexOfBytes(win, firstDelim, 0);
        if (p < 0) {
          if (win.length > firstDelim.length) win = win.slice(win.length - firstDelim.length);
          break;
        }
        const after = p + firstDelim.length;
        if (win[after] === 0x2d && win[after + 1] === 0x2d) {
          finish();
          break;
        }
        const lineEnd = indexOfBytes(win, enc('\r\n'), after);
        if (lineEnd < 0) break;
        win = win.slice(lineEnd + 2);
        mode = 'headers';
        continue;
      }

      if (mode === 'headers') {
        const p = indexOfBytes(win, HEAD_END, 0);
        if (p < 0) {
          if (win.length > HEADERS_MAX) throw new ValidationError('هدر part بیش از حد بزرگ است');
          break;
        }
        startPart(win.slice(0, p));
        win = win.slice(p + HEAD_END.length);
        mode = 'content';
        continue;
      }

      if (mode === 'content') {
        const p = indexOfBytes(win, delim, 0);
        if (p >= 0) {
          pending = concatBytes(pending, win.slice(0, p));
          finishPart();
          const after = p + delim.length;
          if (win[after] === 0x2d && win[after + 1] === 0x2d) {
            finish();
            break;
          }
          win = win.slice(after + 2);
          mode = 'headers';
          continue;
        }
        const safe = win.length - HOLD_MARGIN(delim.length);
        if (safe > 0) {
          pending = concatBytes(pending, win.slice(0, safe));
          if (pending.length >= SEGMENT_TARGET) {
            flushPending();
          }
          win = win.slice(safe);
        }
        break;
      }
    }
    if (finished) break;
  }

  finish();
  return { files, fields };
}

function HOLD_MARGIN(delimLen: number): number {
  return delimLen + 8;
}
