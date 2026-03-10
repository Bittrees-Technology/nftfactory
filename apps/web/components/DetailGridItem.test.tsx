import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DetailGridItem from "./DetailGridItem";

describe("DetailGridItem", () => {
  it("renders a standard detail label and string value", () => {
    const html = renderToStaticMarkup(<DetailGridItem label="Collection" value="Shared Mint" />);

    expect(html).toContain("<div class=\"detailItem\">");
    expect(html).toContain("<span class=\"detailLabel\">Collection</span>");
    expect(html).toContain("<p class=\"detailValue\">Shared Mint</p>");
  });

  it("renders rich values without forcing a paragraph wrapper", () => {
    const html = renderToStaticMarkup(
      <DetailGridItem
        label="Contract"
        value={<a className="mono" href="https://example.com">0xabc</a>}
      />
    );

    expect(html).toContain("<span class=\"detailLabel\">Contract</span>");
    expect(html).toContain("<div class=\"detailValue\"><a class=\"mono\" href=\"https://example.com\">0xabc</a></div>");
  });

  it("supports feed-fact class overrides", () => {
    const html = renderToStaticMarkup(
      <DetailGridItem
        className="feedFact"
        labelClassName="feedFactLabel"
        valueClassName="detailValue mono"
        label="Owner"
        value="0xabc"
      />
    );

    expect(html).toContain("<div class=\"feedFact\">");
    expect(html).toContain("<span class=\"feedFactLabel\">Owner</span>");
    expect(html).toContain("<p class=\"detailValue mono\">0xabc</p>");
  });
});
