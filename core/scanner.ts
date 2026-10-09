import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { VIDEO_EXTENSIONS, parseMedia } from "./parser";
import type { ParsedMedia } from "../shared/types";
export interface Found {
  relativePath: string;
  size: number;
  mtime: number;
  parsed: ParsedMedia;
}
export async function discover(
  root: string,
  progress: (count: number) => void = () => {},
): Promise<Found[]> {
  if (!(await stat(root)).isDirectory())
    throw new Error("The library root is not a directory.");
  const found: Found[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      // Windows drive roots have protected OS directories. Never descend into them.
      if (
        entry.isDirectory() &&
        ["system volume information", "$recycle.bin"].includes(
          entry.name.toLowerCase(),
        )
      )
        continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (
        entry.isFile() &&
        VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) &&
        !/(?:^|[ ._-])sample(?:[ ._-]|$)/i.test(entry.name)
      ) {
        const info = await stat(full);
        if (info.size === 0) continue;
        found.push({
          relativePath: path.relative(root, full),
          size: info.size,
          mtime: info.mtimeMs,
          parsed: parseMedia(full),
        });
        if (found.length % 100 === 0) progress(found.length);
      }
    }
  }
  await walk(root);
  await stat(root);
  progress(found.length);
  return found;
}
