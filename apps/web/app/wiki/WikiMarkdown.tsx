import type { ReactNode } from "react";

type Props = {
  content: string;
};

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
      nodes.push(
        <a
          key={`${keyPrefix}-link-${part}`}
          href={match[4]}
          target="_blank"
          rel="noreferrer"
          className="wikiInlineLink"
        >
          {match[3]}
        </a>
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
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="wikiList">
        {listItems.map((item, index) => (
          <li key={`li-${blocks.length}-${index}`}>{renderInline(item, `li-${blocks.length}-${index}`)}</li>
        ))}
      </ul>
    );
    listItems = [];
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
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
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
          <h2 key={`h2-${blocks.length}`} className="wikiH2">
            {renderInline(text, `h2-${blocks.length}`)}
          </h2>
        );
      } else {
        blocks.push(
          <h3 key={`h3-${blocks.length}`} className="wikiH3">
            {renderInline(text, `h3-${blocks.length}`)}
          </h3>
        );
      }
      continue;
    }

    const listMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  if (inCode) {
    flushCode();
  }

  return <div className="wikiContent">{blocks}</div>;
}
