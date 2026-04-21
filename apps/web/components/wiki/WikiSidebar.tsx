"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type WikiSidebarPage = {
  slug: string;
  title: string;
  description: string | null;
};

export default function WikiSidebar({
  pages,
  activeSlug,
  lead
}: {
  pages: WikiSidebarPage[];
  activeSlug: string;
  lead: string;
}) {
  const [query, setQuery] = useState("");

  const filteredPages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return pages;
    }
    return pages.filter((page) => {
      const haystack = `${page.title}\n${page.description || ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [pages, query]);

  return (
    <aside className="card wikiSidebar">
      <p className="eyebrow">Creator Guide</p>
      <h1>Wiki</h1>
      <p className="sectionLead">{lead}</p>
      <label className="wikiSearchLabel">
        <span>Filter pages</span>
        <input
          className="wikiSearchInput"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search creator guides"
        />
      </label>
      <div className="wikiLinkList">
        {filteredPages.map((page) => {
          const href = page.slug === "home" ? "/wiki" : `/wiki/${page.slug}`;
          const isActive = page.slug === activeSlug;
          return (
            <Link key={page.slug} href={href} className={`wikiNavLink${isActive ? " active" : ""}`}>
              <strong>{page.title}</strong>
              {page.description ? <span>{page.description}</span> : null}
            </Link>
          );
        })}
        {filteredPages.length === 0 ? <p className="wikiEmptyState">No wiki pages match that search.</p> : null}
      </div>
    </aside>
  );
}
