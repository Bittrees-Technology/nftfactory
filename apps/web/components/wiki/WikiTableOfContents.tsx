"use client";

import { useEffect, useState } from "react";
import type { WikiHeading } from "../../lib/wikiFormat";

export default function WikiTableOfContents({ headings }: { headings: WikiHeading[] }) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? "");

  useEffect(() => {
    if (headings.length === 0) {
      return;
    }

    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (elements.length === 0) {
      return;
    }

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) {
            visible.add(id);
          } else {
            visible.delete(id);
          }
        }

        const nextActive = headings.find((heading) => visible.has(heading.id))?.id;
        if (nextActive) {
          setActiveId(nextActive);
          return;
        }

        const fallback = headings
          .filter((heading) => {
            const element = document.getElementById(heading.id);
            if (!element) {
              return false;
            }
            return element.getBoundingClientRect().top <= 140;
          })
          .at(-1)?.id;

        if (fallback) {
          setActiveId(fallback);
        }
      },
      {
        rootMargin: "-96px 0px -65% 0px",
        threshold: [0, 1]
      }
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
    };
  }, [headings]);

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
            className={`wikiTocLink wikiTocLevel${Math.min(heading.level, 4)}${activeId === heading.id ? " active" : ""}`}
          >
            {heading.text}
          </a>
        ))}
      </div>
    </nav>
  );
}
