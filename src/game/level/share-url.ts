import type { Level } from "./level-types";
import { parseLevel } from "./level-serialize";
import { isDifficulty, type Difficulty } from "./random/difficulty";

/** Query-string key holding a shareable level reference. */
export const LEVEL_PARAM = "level";

/**
 * Browsers and GitHub Pages handle much longer URLs, but links get unwieldy (and some chat apps
 * truncate) past ~2000 chars — callers warn when an encoded custom level would exceed this.
 */
export const MAX_URL_LENGTH = 2000;

/**
 * A shareable reference to a level, encoded into `?level=`:
 * - `b.<id>` — a bundled level, by id.
 * - `r.<difficulty>.<seed36>` — a random level (generation is deterministic from seed+difficulty,
 *   and `<seed36>` is the same base-36 code shown as `#XXXXX` in the level name).
 * - `z.<base64url>` — a custom level: deflate-raw compressed JSON.
 * - `j.<base64url>` — a custom level: plain JSON (fallback when CompressionStream is missing).
 */
export type LevelShareRef =
  | { kind: "bundled"; id: string }
  | { kind: "random"; difficulty: Difficulty; seed: number }
  | { kind: "custom"; level: Level };

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null; // not base64
  }
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, transform: GenericTransformStream): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  // Reading below surfaces any stream error; the writer-side rejection is the same error, so
  // swallow it to avoid an unhandled rejection racing the read.
  void writer
    .write(bytes)
    .then(() => writer.close())
    .catch(() => {});
  const chunks: Uint8Array[] = [];
  const reader = transform.readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Whether the runtime can deflate/inflate (all evergreen browsers; not jsdom). */
function hasCompression(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

/** Encodes a share reference into the `?level=` parameter value. */
export async function encodeLevelRef(
  ref: LevelShareRef,
  support: { compression: boolean } = { compression: hasCompression() },
): Promise<string> {
  switch (ref.kind) {
    case "bundled":
      return `b.${encodeURIComponent(ref.id)}`;
    case "random":
      return `r.${ref.difficulty}.${(ref.seed >>> 0).toString(36)}`;
    case "custom": {
      const json = new TextEncoder().encode(JSON.stringify(ref.level));
      if (!support.compression) return `j.${toBase64Url(json)}`;
      return `z.${toBase64Url(await pipe(json, new CompressionStream("deflate-raw")))}`;
    }
  }
}

function parseCustomJson(bytes: Uint8Array): LevelShareRef | null {
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return { kind: "custom", level: parseLevel(data) };
  } catch {
    return null; // corrupt JSON or structurally invalid level
  }
}

/** Parses a `?level=` parameter value; null when malformed or unsupported. */
export async function parseLevelRef(value: string): Promise<LevelShareRef | null> {
  const dot = value.indexOf(".");
  if (dot === -1) return null;
  const prefix = value.slice(0, dot);
  const rest = value.slice(dot + 1);

  if (prefix === "b") {
    const id = decodeURIComponent(rest);
    return id ? { kind: "bundled", id } : null;
  }
  if (prefix === "r") {
    const [difficulty, seed36, ...extra] = rest.split(".");
    if (extra.length > 0 || !difficulty || !seed36 || !isDifficulty(difficulty)) return null;
    if (!/^[0-9a-z]+$/i.test(seed36)) return null;
    const seed = parseInt(seed36, 36);
    if (!Number.isFinite(seed)) return null;
    return { kind: "random", difficulty, seed: seed >>> 0 };
  }
  if (prefix === "j" || prefix === "z") {
    const bytes = fromBase64Url(rest);
    if (!bytes || bytes.length === 0) return null;
    if (prefix === "j") return parseCustomJson(bytes);
    if (!hasCompression()) return null;
    try {
      return parseCustomJson(await pipe(bytes, new DecompressionStream("deflate-raw")));
    } catch {
      return null; // not valid deflate data
    }
  }
  return null;
}
