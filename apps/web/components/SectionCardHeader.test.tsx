import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SectionCardHeader from "./SectionCardHeader";

describe("SectionCardHeader", () => {
  it("renders stacked title, description, and actions", () => {
    const html = renderToStaticMarkup(
      <SectionCardHeader
        title="Mint Feed"
        description="Continuous public feed of minted NFTs."
        actions={<button type="button">Refresh</button>}
      />
    );

    expect(html).toContain("<h3>Mint Feed</h3>");
    expect(html).toContain("<p class=\"hint\">Continuous public feed of minted NFTs.</p>");
    expect(html).toContain("<div class=\"row\"><button type=\"button\">Refresh</button></div>");
  });

  it("renders split layout with actions beside the title", () => {
    const html = renderToStaticMarkup(
      <SectionCardHeader
        title="My Active Listings"
        layout="split"
        actions={<button type="button">Refresh</button>}
      />
    );

    expect(html).toContain("justify-content:space-between");
    expect(html).toContain("<h3>My Active Listings</h3>");
    expect(html).toContain("<button type=\"button\">Refresh</button>");
  });
});
