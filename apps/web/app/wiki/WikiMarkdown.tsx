import Link from "next/link";
import type { ReactNode } from "react";
import { toHeadingId } from "../../lib/wiki";

type Props = {
  content: string;
};

function resolveWikiHref(href: string): { href: string; external: boolean } {
  const trimmed = href.trim();
  if (!trimmed) {
    return { href: "#", external: false };
  }

  if (/^(https?:)?\/\//i.test(trimmed) || /^ipfs:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return { href: trimmed, external: true };
  }

  const normalized = trimmed
    .replace(/^\.?\//, "")
    .replace(/^docs\/wiki\//i, "")
    .replace(/^data\/wiki\//i, "")
    .replace(/\.md$/i, "");

  if (!normalized) {
    return { href: "/wiki", external: false };
  }

  const slug = normalized.toLowerCase();
  return {
    href: slug === "home" ? "/wiki" : `/wiki/${slug}`,
    external: false
  };
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let part = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      nodes.push(
        <code key={`${keyPrefix}-code-${part}`} className="wikiInlineCode">
          {match[1].slice(1, -1)}
        </code>
      );
    } else if (match[2]) {
      const target = resolveWikiHref(match[4]);
      nodes.push(
        target.external ? (
          <a
            key={`${keyPrefix}-link-${part}`}
            href={target.href}
            target="_blank"
            rel="noreferrer"
            className="wikiInlineLink"
          >
            {match[3]}
          </a>
        ) : (
          <Link
            key={`${keyPrefix}-link-${part}`}
            href={target.href}
            className="wikiInlineLink"
          >
            {match[3]}
          </Link>
        )
      );
    }

    lastIndex = pattern.lastIndex;
    part += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export default function WikiMarkdown({ content }: Props) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let blockquote: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ").trim();
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="wikiParagraph">
          {renderInline(text, `p-${blocks.length}`)}
        </p>
      );
    }
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0 || !listType) return;
    const items = listItems.map((item, index) => (
      <li key={`li-${blocks.length}-${index}`}>{renderInline(item, `li-${blocks.length}-${index}`)}</li>
    ));
    blocks.push(
      listType === "ol" ? (
        <ol key={`ol-${blocks.length}`} className="wikiList wikiOrderedList">
          {items}
        </ol>
      ) : (
        <ul key={`ul-${blocks.length}`} className="wikiList">
          {items}
        </ul>
      )
    );
    listItems = [];
    listType = null;
  };

  const flushBlockquote = () => {
    if (blockquote.length === 0) return;
    const text = blockquote.join(" ").trim();
    if (text) {
      blocks.push(
        <blockquote key={`blockquote-${blocks.length}`} className="wikiBlockquote">
          {renderInline(text, `blockquote-${blocks.length}`)}
        </blockquote>
      );
    }
    blockquote = [];
  };

  const flushCode = () => {
    if (codeLines.length === 0) return;
    blocks.push(
      <pre key={`pre-${blocks.length}`} className="wikiCodeBlock">
        <code>{codeLines.join("\n")}</code>
      </pre>
    );
    codeLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      flushBlockquote();
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushBlockquote();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushBlockquote();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      if (level === 1) {
        blocks.push(
          <h1 key={`h1-${blocks.length}`} className="wikiH1">
            {renderInline(text, `h1-${blocks.length}`)}
          </h1>
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={`h2-${blocks.length}`} id={toHeadingId(text)} className="wikiH2">
            {renderInline(text, `h2-${blocks.length}`)}
          </h2>
        );
      } else {
        blocks.push(
          <h3 key={`h3-${blocks.length}`} id={toHeadingId(text)} className="wikiH3">
            {renderInline(text, `h3-${blocks.length}`)}
          </h3>
        );
      }
      continue;
    }

    const unorderedListMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (unorderedListMatch) {
      flushParagraph();
      flushBlockquote();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(unorderedListMatch[1]);
      continue;
    }

    const orderedListMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (orderedListMatch) {
      flushParagraph();
      flushBlockquote();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(orderedListMatch[1]);
      continue;
    }

    const blockquoteMatch = /^>\s+(.+)$/.exec(trimmed);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      blockquote.push(blockquoteMatch[1]);
      continue;
    }

    flushBlockquote();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushBlockquote();
  if (inCode) {
    flushCode();
  }

  return <div className="wikiContent">{blocks}</div>;
}
