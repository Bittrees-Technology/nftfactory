import Link from "next/link";
import { notFound } from "next/navigation";
import { getWikiPageBySlug, getWikiPages } from "../../lib/wiki";

export default async function WikiHomePage() {
  const [homePage, pages] = await Promise.all([getWikiPageBySlug("home"), getWikiPages()]);

  if (!homePage) {
    notFound();
  }

  return (
    <section className="wikiLayout">
      <aside className="card wikiSidebar">
        <p className="eyebrow">Documentation</p>
        <h1>Wiki</h1>
        <p className="sectionLead">Operational notes, route documentation, and project runbooks sourced from the repo wiki.</p>
        <div className="wikiLinkList">
          {pages.map((page) => (
            <Link key={page.slug} href={page.slug === "home" ? "/wiki" : `/wiki/${page.slug}`} className={`wikiNavLink${page.slug === "home" ? " active" : ""}`}>
              <strong>{page.title}</strong>
              {page.description ? <span>{page.description}</span> : null}
            </Link>
          ))}
        </div>
      </aside>
      <article className="card wikiArticle">
        <p className="eyebrow">Home</p>
        <h2>{homePage.title}</h2>
        <pre className="wikiPre">{homePage.content}</pre>
      </article>
    </section>
  );
}
