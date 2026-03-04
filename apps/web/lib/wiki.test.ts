import { beforeEach, describe, expect, it, vi } from "vitest";

const { readdir, readFile } = vi.hoisted(() => ({
  readdir: vi.fn(),
  readFile: vi.fn()
}));

vi.mock("node:fs/promises", () => ({
  readdir,
  readFile
}));

import { getWikiPageBySlug, listWikiPages, toHeadingId } from "./wiki";

describe("listWikiPages", () => {
  beforeEach(() => {
    readdir.mockReset();
    readFile.mockReset();
  });

  it("uses the intended wiki navigation order and includes all markdown pages", async () => {
    readdir.mockResolvedValue([
      "Roadmap.md",
      "Archive.md",
      "Home.md",
      "Contracts.md",
      "Security-and-Audit.md",
      "notes.txt"
    ]);

    const pages = await listWikiPages();

    expect(pages.map((page) => page.filename)).toEqual([
      "Home.md",
      "Contracts.md",
      "Security-and-Audit.md",
      "Roadmap.md",
      "Archive.md"
    ]);
    expect(pages.map((page) => page.section)).toEqual([
      "Start Here",
      "Start Here",
      "Reference",
      "Reference",
      "Reference"
    ]);
  });
});

describe("getWikiPageBySlug", () => {
  beforeEach(() => {
    readdir.mockReset();
    readFile.mockReset();
  });

  it("returns pages that were previously hidden from the wiki list", async () => {
    readdir.mockResolvedValue(["Home.md", "Roadmap.md"]);
    readFile.mockResolvedValue("# Roadmap");

    const page = await getWikiPageBySlug("roadmap");

    expect(page?.slug).toBe("roadmap");
    expect(page?.title).toBe("Roadmap");
    expect(page?.content).toBe("# Roadmap");
  });
});

describe("toHeadingId", () => {
  it("normalizes markdown headings into stable anchor ids", () => {
    expect(toHeadingId("Current app-wired `Sepolia` [addresses](./Contracts.md)")).toBe(
      "current-app-wired-sepolia-addresses"
    );
  });
});
