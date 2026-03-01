import Link from "next/link";
import { getWikiPageBySlug, listWikiPages } from "../../lib/wiki";
import WikiMarkdown from "./WikiMarkdown";
import WikiSidebar from "./WikiSidebar";

export default async function WikiHomePage() {
  const [pages, home] = await Promise.all([listWikiPages(), getWikiPageBySlug("home")]);

  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">Knowledge Base</p>
        <h1>Wiki</h1>
        <p className="heroText">
          Product, architecture, operations, and launch guidance sourced from the in-repo wiki files under <code>data/wiki</code>.
        </p>
      </div>

      <div className="wikiLayout">
        <WikiSidebar pages={pages} currentSlug="home" />
        {home ? (
          <div className="card formCard">
            <h3>{home.title}</h3>
            <WikiMarkdown content={home.content} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
