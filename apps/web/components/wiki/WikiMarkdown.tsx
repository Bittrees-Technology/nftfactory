import Link from "next/link";
import type { ElementType, ReactNode } from "react";

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

function wikiHref(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("mailto:")) {
    return trimmed;
  }
  const normalized = trimmed.replace(/^\.\//u, "").replace(/\.md$/iu, "").toLowerCase();
  return normalized === "home" ? "/wiki" : `/wiki/${normalized}`;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/gu;
  let cursor = 0;
  let key = 0;

  const pushText = (value: string) => {
    if (!value) {
      return;
    }
    nodes.push(<span key={`text-${key++}`}>{value}</span>);
  };

  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    pushText(text.slice(cursor, index));

    if (token.startsWith("`")) {
      nodes.push(
        <code key={`code-${key++}`} className="wikiInlineCode">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={`strong-${key++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[")) {
      const parts = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
      if (parts) {
        const [, label, hrefValue] = parts;
        const href = wikiHref(hrefValue);
        if (href?.startsWith("/wiki")) {
          nodes.push(
            <Link key={`link-${key++}`} href={href} className="wikiInlineLink">
              {label}
            </Link>
          );
        } else if (href) {
          nodes.push(
            <a key={`link-${key++}`} href={href} target="_blank" rel="noreferrer" className="wikiInlineLink">
              {label}
            </a>
          );
        } else {
          pushText(token);
        }
      } else {
        pushText(token);
      }
    }

    cursor = index + token.length;
  }

  pushText(text.slice(cursor));
  return nodes;
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s:-|]+\|?$/u.test(line.trim());
}

function isListLine(line: string): boolean {
  return /^(- |\* |\d+\. )/u.test(line.trim());
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/u.test(line);
}

function isSpecialLine(line: string): boolean {
  const trimmed = line.trim();
  return !trimmed || trimmed.startsWith("```") || isHeadingLine(trimmed) || isListLine(trimmed) || trimmed.startsWith("|");
}

export default function WikiMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/gu, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      blocks.push(
        <pre key={`code-${key++}`} className="wikiCodeBlock">
          {language ? <span className="wikiCodeLanguage">{language}</span> : null}
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    if (isHeadingLine(trimmed)) {
      const level = trimmed.match(/^#+/u)?.[0].length as HeadingLevel;
      const text = trimmed.replace(/^#{1,6}\s+/u, "");
      const Tag = `h${Math.min(level + 1, 6)}` as ElementType;
      blocks.push(
        <Tag key={`heading-${key++}`} className={`wikiHeading wikiHeading${level}`}>
          {renderInline(text)}
        </Tag>
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = parseTableRow(lines[i]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={`table-${key++}`} className="wikiTableWrap">
          <table className="wikiTable">
            <thead>
              <tr>
                {header.map((cell, index) => (
                  <th key={`head-${index}`}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (isListLine(trimmed)) {
      const ordered = /^\d+\.\s/u.test(trimmed);
      const items: ReactNode[] = [];
      while (i < lines.length && isListLine(lines[i].trim())) {
        const rawItem = lines[i].trim().replace(/^(- |\* |\d+\. )/u, "");
        items.push(<li key={`item-${key++}`}>{renderInline(rawItem)}</li>);
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={`list-${key++}`} className="wikiList">
          {items}
        </ListTag>
      );
      continue;
    }

    const paragraphLines = [trimmed];
    i += 1;
    while (i < lines.length && !isSpecialLine(lines[i])) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push(
      <p key={`paragraph-${key++}`} className="wikiParagraph">
        {renderInline(paragraphLines.join(" "))}
      </p>
    );
  }

  return <div className="wikiContent">{blocks}</div>;
}
