import Link from "next/link";
import { notFound } from "next/navigation";
import { extractWikiHeadings, getWikiPageBySlug, listWikiPages } from "../../../lib/wiki";
import WikiMarkdown from "../WikiMarkdown";
import WikiSidebar from "../WikiSidebar";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function WikiPage(props: Props) {
  const { slug } = await props.params;
  const [pages, page] = await Promise.all([listWikiPages(), getWikiPageBySlug(slug)]);

  if (!page) {
    notFound();
  }
  const headings = extractWikiHeadings(page.content);

  return (
    <section className="wizard">
      <div className="wikiLayout">
        <WikiSidebar pages={pages} currentSlug={page.slug} />
        <div className="card formCard wikiPageCard">
          <div className="wikiPageHeader">
            <p className="eyebrow">Knowledge Base</p>
            <h1>{page.title}</h1>
            <div className="row">
              <Link href="/wiki" className="ctaLink secondaryLink">Wiki Home</Link>
            </div>
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
          <WikiMarkdown content={page.content} />
        </div>
      </div>
    </section>
  );
}
