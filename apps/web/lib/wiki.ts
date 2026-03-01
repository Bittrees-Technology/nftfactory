import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const WIKI_DIR = path.resolve(process.cwd(), "..", "..", "data", "wiki");

export type WikiPage = {
  slug: string;
  title: string;
  filename: string;
};

export type WikiHeading = {
  level: 2 | 3;
  text: string;
  id: string;
};

function toSlug(filename: string): string {
  return filename.replace(/\.md$/i, "").toLowerCase();
}

function toTitle(filename: string): string {
  return filename.replace(/\.md$/i, "");
}

export function toHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function extractWikiHeadings(content: string): WikiHeading[] {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .map((line) => /^(#{2,3})\s+(.+)$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({
      level: match[1].length as 2 | 3,
      text: match[2].trim(),
      id: toHeadingId(match[2].trim())
    }))
    .filter((item) => Boolean(item.id));
}

export async function listWikiPages(): Promise<WikiPage[]> {
  const files = await readdir(WIKI_DIR);
  return files
    .filter((file) => file.toLowerCase().endsWith(".md"))
    .filter((file) => file !== "Archive.md")
    .sort((a, b) => {
      if (a === "Home.md") return -1;
      if (b === "Home.md") return 1;
      return a.localeCompare(b);
    })
    .map((filename) => ({
      slug: toSlug(filename),
      title: toTitle(filename),
      filename
    }));
}

export async function getWikiPageBySlug(slug: string): Promise<(WikiPage & { content: string }) | null> {
  const pages = await listWikiPages();
  const match = pages.find((page) => page.slug === slug.toLowerCase());
  if (!match) return null;
  const content = await readFile(path.join(WIKI_DIR, match.filename), "utf8");
  return {
    ...match,
    content
  };
}
