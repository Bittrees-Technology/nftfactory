import Link from "next/link";
import type { WikiPage } from "../../lib/wiki";

type Props = {
  pages: WikiPage[];
  currentSlug?: string;
};

export default function WikiSidebar({ pages, currentSlug }: Props) {
  return (
    <aside className="card wikiSidebar">
      <p className="eyebrow">Knowledge Base</p>
      <h3>Pages</h3>
      <nav className="wikiSidebarNav">
        {pages.map((page) => {
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
    </aside>
  );
}
