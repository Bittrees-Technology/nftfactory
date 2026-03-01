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
                Product, architecture, operations, and launch guidance sourced from the in-repo wiki files under <code>data/wiki</code>.
              </p>
            </div>
            {headings.length > 0 ? (
              <div className="wikiToc">
                <p className="wikiTocTitle">On This Page</p>
                <nav className="wikiTocList">
                  {headings.map((heading) => (
                    <a
                      key={heading.id}
                      href={`#${heading.id}`}
                      className={`wikiTocLink${heading.level === 3 ? " wikiTocLinkNested" : ""}`}
                    >
                      {heading.text}
                    </a>
                  ))}
                </nav>
              </div>
            ) : null}
            <WikiMarkdown content={home.content} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
