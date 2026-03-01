import Link from "next/link";
import { getWikiPageBySlug, listWikiPages } from "../../lib/wiki";
import WikiMarkdown from "./WikiMarkdown";
import WikiSidebar from "./WikiSidebar";

export default async function WikiHomePage() {
  const [pages, home] = await Promise.all([listWikiPages(), getWikiPageBySlug("home")]);

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
            <WikiMarkdown content={home.content} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
