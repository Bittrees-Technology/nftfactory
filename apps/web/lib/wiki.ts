import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

const wikiDirCandidates = [
  path.resolve(process.cwd(), "../../docs/wiki"),
  path.resolve(process.cwd(), "docs/wiki"),
  path.resolve(process.cwd(), "../docs/wiki")
];

const wikiDir = wikiDirCandidates.find((candidate) => existsSync(candidate)) || wikiDirCandidates[0];

export type WikiPageSummary = {
  slug: string;
  fileName: string;
  title: string;
  description: string | null;
};

export type WikiPage = WikiPageSummary & {
  content: string;
};

function slugFromFileName(fileName: string): string {
  return fileName.replace(/\.md$/i, "").toLowerCase();
}

function titleFromContent(fileName: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fileName.replace(/\.md$/i, "").replace(/-/g, " ");
}

function descriptionFromContent(content: string): string | null {
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#") && !line.startsWith("|") && !line.startsWith("```"));

  const firstLine = lines[0];
  return firstLine ? firstLine.slice(0, 220) : null;
}

async function readWikiFiles(): Promise<string[]> {
  const entries = await fs.readdir(wikiDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((left, right) => {
      if (left === "Home.md") {
        return -1;
      }
      if (right === "Home.md") {
        return 1;
      }
      return left.localeCompare(right);
    });
}

export async function getWikiPages(): Promise<WikiPageSummary[]> {
  const files = await readWikiFiles();
  const pages = await Promise.all(
    files.map(async (fileName) => {
      const content = await fs.readFile(path.join(wikiDir, fileName), "utf8");
      return {
        slug: slugFromFileName(fileName),
        fileName,
        title: titleFromContent(fileName, content),
        description: descriptionFromContent(content)
      };
    })
  );
  return pages;
}

export async function getWikiPageBySlug(slug: string): Promise<WikiPage | null> {
  const pages = await getWikiPages();
  const page = pages.find((entry) => entry.slug === slug);
  if (!page) {
    return null;
  }

  const content = await fs.readFile(path.join(wikiDir, page.fileName), "utf8");
  return {
    ...page,
    content
  };
}
