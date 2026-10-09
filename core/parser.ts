import path from "node:path";
import type { ParsedMedia } from "../shared/types";
export const VIDEO_EXTENSIONS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".m4v",
  ".webm",
  ".wmv",
]);
const release =
  /(?:^|[ ._\[(-])(?:2160p|1080p|720p|480p|WEB[- .]?DL|WEBRip|BluRay|BRRip|DVDRip|HDTV|x26[45]|h[ .]?26[45]|HEVC|10Bit|\d+CH|\d+MB|\d+GB|Season\s+\d+|Complete|NF|\[i_c\])(?=$|[ ._\])-])/i;
function clean(value: string) {
  return value
    .replace(/[._]/g, " ")
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*-\s*$/, "");
}
// Only source tags known to be non-title information are removed.
// Keep unknown bracketed words: [REC], for example, is a real film title.
const sourceGroups = new Set([
  "MFA",
  "YTS",
  "YTS.AM",
  "YTS.MX",
  "PAHE",
  "PAHE.IN",
  "I_C",
]);
export function stripSourcePrefixes(value: string): string {
  let result = value.trim();
  while (true) {
    const handle = /^@CC[_ ]Links[ ._-]+/i.exec(result);
    if (handle) {
      result = result.slice(handle[0].length);
      continue;
    }
    const bracket = /^\[([^\]]+)\][ ._-]*/.exec(result);
    if (bracket && sourceGroups.has(bracket[1].trim().toUpperCase())) {
      result = result.slice(bracket[0].length);
      continue;
    }
    return result;
  }
}
function titlePart(
  value: string,
  stripPrefixes = true,
): { title: string; year: number | null } {
  let raw = stripPrefixes ? stripSourcePrefixes(value) : value;
  const tag = release.exec(raw);
  if (tag) raw = raw.slice(0, tag.index);
  const years = [
    ...raw.matchAll(/(?:^|[ ._(\[])(19\d{2}|20\d{2})(?=$|[ ._)\]])/g),
  ];
  const yearMatch = years.at(-1);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  // A leading numeric title (e.g. 1917) is a title, not sufficient year evidence.
  if (yearMatch && yearMatch.index! > 0) raw = raw.slice(0, yearMatch.index);
  return { title: clean(raw), year: yearMatch?.index === 0 ? null : year };
}
export function parseMedia(
  filePath: string,
  options: { stripPrefixes?: boolean } = {},
): ParsedMedia {
  const p = filePath.includes("\\") ? path.win32 : path;
  const base = p.basename(filePath, p.extname(filePath));
  const folder = p.basename(p.dirname(filePath));
  const standard = /(?:^|[ ._-])S(\d{1,3})E(\d{1,4})(?=$|[ ._-]|E\d)/i.exec(
    base,
  );
  const short = /(?:^|[ ._-])EP(?:ISODE)?[ ._-]*(\d{1,4})(?=$|[ ._-])/i.exec(
    base,
  );
  const marker = standard ?? short;
  const fromFile = titlePart(
    marker ? base.slice(0, marker.index) : base,
    options.stripPrefixes,
  );
  const fromFolder = titlePart(folder, options.stripPrefixes);
  const title = fromFile.title || fromFolder.title || base;
  const folderSeason = /Season[ ._-]*(\d+)/i.exec(folder);
  const season = standard
    ? Number(standard[1])
    : short && folderSeason
      ? Number(folderSeason[1])
      : null;
  const episode = standard
    ? Number(standard[2])
    : short
      ? Number(short[1])
      : null;
  const tail = standard
    ? titlePart(
        base.slice(standard.index + standard[0].length),
        options.stripPrefixes,
      ).title.replace(/^[- ]+/, "")
    : null;
  const problems: string[] = [];
  if (short && season === null) problems.push("Season needs confirmation");
  if (standard && folderSeason && season !== Number(folderSeason[1]))
    problems.push("Season conflicts with folder");
  if (marker && /E\d|[-+]\d/i.test(base.slice(marker.index + marker[0].length)))
    problems.push("Possible multi-episode file");
  return {
    title,
    year: fromFile.year ?? fromFolder.year,
    kind: marker ? "episode" : "movie",
    season,
    episode,
    episodeTitle: tail || null,
    resolution: /\b(?:2160|1080|720|480)p\b/i.exec(base)?.[0] ?? null,
    source:
      /WEB[- .]?DL|WEBRip|BluRay|BRRip|DVDRip|HDTV/i.exec(base)?.[0] ?? null,
    review: problems.join("; ") || null,
  };
}
