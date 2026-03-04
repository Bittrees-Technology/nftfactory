import Link from "next/link";
import { extractWikiHeadings, getWikiPageBySlug, listWikiPages } from "../../lib/wiki";
import WikiMarkdown from "./WikiMarkdown";
import WikiSidebar from "./WikiSidebar";

export default async function WikiHomePage() {
  const [pages, home] = await Promise.all([listWikiPages(), getWikiPageBySlug("home")]);
  const headings = home ? extractWikiHeadings(home.content) : [];

  return (
    <section className="wizard">
      <div className="wikiLayout">
        <WikiSidebar pages={pages} currentSlug="home" />
        {home ? (
          <div className="card formCard wikiPageCard">
            <div className="wikiPageHeader">
              <p className="eyebrow">Knowledge Base</p>
              <h1>{home.title}</h1>
              <p className="wikiPageLead">
                Product, architecture, operations, and launch guidance mirrored from the maintainer wiki in <code>docs/wiki</code> and rendered from the in-app copy under <code>data/wiki</code>.
              </p>
            </div>
            {headings.length > 0 ? (
              <nav className="wikiTocInline" aria-label="On this page">
                <span className="wikiTocTitle">On This Page</span>
                <div className="wikiTocList">
                  {headings.map((heading) => (
                    <a
                      key={heading.id}
                      href={`#${heading.id}`}
                      className={`wikiTocLink${heading.level === 3 ? " wikiTocLinkNested" : ""}`}
                    >
                      {heading.text}
                    </a>
                  ))}
                </div>
              </nav>
            ) : null}
            <WikiMarkdown content={home.content} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
