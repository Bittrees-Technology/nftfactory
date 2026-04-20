import type { WikiHeading } from "../../lib/wikiFormat";

export default function WikiTableOfContents({ headings }: { headings: WikiHeading[] }) {
  if (headings.length === 0) {
    return null;
  }

  return (
    <nav className="card wikiToc" aria-label="Table of contents">
      <p className="eyebrow">On This Page</p>
      <div className="wikiTocList">
        {headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            className={`wikiTocLink wikiTocLevel${Math.min(heading.level, 4)}`}
          >
            {heading.text}
          </a>
        ))}
      </div>
    </nav>
  );
}
