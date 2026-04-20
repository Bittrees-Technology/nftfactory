export type WikiHeading = {
  id: string;
  level: number;
  text: string;
};

export function slugifyWikiHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_#[\]()]/gu, "")
    .replace(/[^a-z0-9\s-]/gu, "")
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-");
}

export function extractWikiHeadings(content: string): WikiHeading[] {
  const headings: WikiHeading[] = [];
  const seen = new Map<string, number>();

  for (const line of content.replace(/\r\n/gu, "\n").split("\n")) {
    const match = line.trim().match(/^(#{2,4})\s+(.+)$/u);
    if (!match) {
      continue;
    }

    const [, hashes, rawText] = match;
    const text = rawText.trim();
    const baseId = slugifyWikiHeading(text) || "section";
    const seenCount = seen.get(baseId) ?? 0;
    seen.set(baseId, seenCount + 1);

    headings.push({
      id: seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`,
      level: hashes.length,
      text
    });
  }

  return headings;
}
