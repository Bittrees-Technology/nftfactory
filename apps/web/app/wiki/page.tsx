import { notFound } from "next/navigation";
import WikiMarkdown from "../../components/wiki/WikiMarkdown";
import WikiSidebar from "../../components/wiki/WikiSidebar";
import { getWikiPageBySlug, getWikiPages } from "../../lib/wiki";

export default async function WikiHomePage() {
  const [homePage, pages] = await Promise.all([getWikiPageBySlug("home"), getWikiPages()]);

  if (!homePage) {
    notFound();
  }

  return (
    <section className="wikiLayout">
      <WikiSidebar
        pages={pages}
        activeSlug="home"
        lead="Operational notes, route documentation, and project runbooks sourced from the repo wiki."
      />
      <article className="card wikiArticle">
        <p className="eyebrow">Home</p>
        <h2>{homePage.title}</h2>
        <WikiMarkdown content={homePage.content} />
      </article>
    </section>
  );
}
