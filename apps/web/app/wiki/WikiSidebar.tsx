import Link from "next/link";
import type { WikiPage } from "../../lib/wiki";

type Props = {
  pages: WikiPage[];
  currentSlug?: string;
};

export default function WikiSidebar({ pages, currentSlug }: Props) {
  const groupedPages = pages.reduce<Array<{ section: string; pages: WikiPage[] }>>((groups, page) => {
    const existing = groups.find((group) => group.section === page.section);
    if (existing) {
      existing.pages.push(page);
    } else {
      groups.push({ section: page.section, pages: [page] });
    }
    return groups;
  }, []);

  return (
    <aside className="card wikiSidebar">
      <p className="eyebrow">Knowledge Base</p>
      <h3>Pages</h3>
      {groupedPages.map((group) => (
        <nav key={group.section} className="wikiSidebarNav" aria-label={group.section}>
          <h4>{group.section}</h4>
          {group.pages.map((page) => {
            const href = page.slug === "home" ? "/wiki" : `/wiki/${page.slug}`;
            const isActive = currentSlug
              ? currentSlug === page.slug || (currentSlug === "home" && page.slug === "home")
              : page.slug === "home";
            return (
              <Link
                key={page.slug}
                href={href}
                className={`wikiSidebarLink${isActive ? " wikiSidebarLinkActive" : ""}`}
              >
                {page.title}
              </Link>
            );
          })}
        </nav>
      ))}
    </aside>
  );
}
