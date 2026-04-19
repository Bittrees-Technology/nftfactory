import Link from "next/link";
import { notFound } from "next/navigation";
import { getWikiPageBySlug, getWikiPages } from "../../../lib/wiki";

export default async function WikiDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [page, pages] = await Promise.all([getWikiPageBySlug(slug), getWikiPages()]);

  if (!page) {
    notFound();
  }

  return (
    <section className="wikiLayout">
      <aside className="card wikiSidebar">
        <p className="eyebrow">Documentation</p>
        <h1>Wiki</h1>
        <p className="sectionLead">Repo-backed pages from <code>docs/wiki</code>.</p>
        <div className="wikiLinkList">
          {pages.map((entry) => {
            const href = entry.slug === "home" ? "/wiki" : `/wiki/${entry.slug}`;
            const isActive = entry.slug === page.slug;
            return (
              <Link key={entry.slug} href={href} className={`wikiNavLink${isActive ? " active" : ""}`}>
                <strong>{entry.title}</strong>
                {entry.description ? <span>{entry.description}</span> : null}
              </Link>
            );
          })}
        </div>
      </aside>
      <article className="card wikiArticle">
        <div className="wikiArticleHeader">
          <p className="eyebrow">Wiki Page</p>
          <Link href="/wiki" className="wikiBackLink">
            Back to wiki home
          </Link>
        </div>
        <h2>{page.title}</h2>
        <pre className="wikiPre">{page.content}</pre>
      </article>
    </section>
  );
}
