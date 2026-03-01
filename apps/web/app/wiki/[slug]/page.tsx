import Link from "next/link";
import { notFound } from "next/navigation";
import { getWikiPageBySlug, listWikiPages } from "../../../lib/wiki";

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

  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">Knowledge Base</p>
        <h1>{page.title}</h1>
        <div className="row">
          <Link href="/wiki" className="ctaLink secondaryLink">Wiki Home</Link>
          {pages
            .filter((item) => item.slug !== page.slug)
            .slice(0, 5)
            .map((item) => (
              <Link key={item.slug} href={`/wiki/${item.slug}`} className="ctaLink secondaryLink">
                {item.title}
              </Link>
            ))}
        </div>
      </div>

      <div className="card formCard">
        <pre className="codeBlock">{page.content}</pre>
      </div>
    </section>
  );
}
