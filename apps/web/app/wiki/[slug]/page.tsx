import Link from "next/link";
import { notFound } from "next/navigation";
import WikiMarkdown from "../../../components/wiki/WikiMarkdown";
import WikiSidebar from "../../../components/wiki/WikiSidebar";
import WikiTableOfContents from "../../../components/wiki/WikiTableOfContents";
import { getWikiPageBySlug, getWikiPages } from "../../../lib/wiki";

export default async function WikiDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [page, pages] = await Promise.all([getWikiPageBySlug(slug), getWikiPages()]);

  if (!page) {
    notFound();
  }

  return (
    <section className="wikiLayout">
      <WikiSidebar pages={pages} activeSlug={page.slug} lead="Repo-backed pages from docs/wiki." />
      <article className="card wikiArticle">
        <div className="wikiArticleHeader">
          <p className="eyebrow">Wiki Page</p>
          <Link href="/wiki" className="wikiBackLink">
            Back to wiki home
          </Link>
        </div>
        <h2>{page.title}</h2>
        <WikiTableOfContents headings={page.headings} />
        <WikiMarkdown content={page.content} />
      </article>
    </section>
  );
}
