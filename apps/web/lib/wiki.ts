import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const WIKI_DIR = path.resolve(process.cwd(), "..", "..", "docs", "wiki");
const WIKI_PAGE_ORDER = [
  { filename: "Home.md", section: "Start Here" },
  { filename: "Architecture.md", section: "Start Here" },
  { filename: "Contracts.md", section: "Start Here" },
  { filename: "Profiles-and-Identity.md", section: "Start Here" },
  { filename: "ENS-Integration.md", section: "Start Here" },
  { filename: "Finality.md", section: "Start Here" },
  { filename: "Operations-and-Governance.md", section: "Operations" },
  { filename: "Deployment-and-Launch.md", section: "Operations" },
  { filename: "Infrastructure-and-Operations.md", section: "Operations" },
  { filename: "UI-Lockdown-Plan.md", section: "Operations" },
  { filename: "Upgrade-Runbook.md", section: "Operations" },
  { filename: "Testing-and-Validation.md", section: "Operations" },
  { filename: "Security-and-Audit.md", section: "Reference" },
  { filename: "Contract-Dependencies.md", section: "Reference" },
  { filename: "Roadmap.md", section: "Reference" },
  { filename: "Archive.md", section: "Reference" }
] as const;
type WikiPageConfig = (typeof WIKI_PAGE_ORDER)[number];

function pageOrderIndex(filename: string): number {
  const index = WIKI_PAGE_ORDER.findIndex((page) => page.filename === filename);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function pageSection(filename: string): string {
  return WIKI_PAGE_ORDER.find((page) => page.filename === filename)?.section || "Reference";
}

export type WikiPage = {
  slug: string;
  title: string;
  filename: string;
  section: string;
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
    .sort((a, b) => {
      const orderDiff = pageOrderIndex(a) - pageOrderIndex(b);
      if (orderDiff !== 0) return orderDiff;
      return a.localeCompare(b);
    })
    .map((filename) => ({
      slug: toSlug(filename),
      title: toTitle(filename),
      filename,
      section: pageSection(filename)
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
