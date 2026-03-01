import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const WIKI_DIR = path.resolve(process.cwd(), "..", "..", "data", "wiki");

export type WikiPage = {
  slug: string;
  title: string;
  filename: string;
};

function toSlug(filename: string): string {
  return filename.replace(/\.md$/i, "").toLowerCase();
}

function toTitle(filename: string): string {
  return filename.replace(/\.md$/i, "");
}

export async function listWikiPages(): Promise<WikiPage[]> {
  const files = await readdir(WIKI_DIR);
  return files
    .filter((file) => file.toLowerCase().endsWith(".md"))
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
