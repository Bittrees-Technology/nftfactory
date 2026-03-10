import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SummaryStatCard from "./SummaryStatCard";

describe("SummaryStatCard", () => {
  it("renders a simple title and string value", () => {
    const html = renderToStaticMarkup(<SummaryStatCard title="Active Listings" value="12" />);

    expect(html).toContain("<article class=\"card\">");
    expect(html).toContain("<h3>Active Listings</h3>");
    expect(html).toContain("<p class=\"\">12</p>");
  });

  it("renders non-string values in a wrapper div", () => {
    const html = renderToStaticMarkup(
      <SummaryStatCard
        title="Backend Auth"
        value={<span>Verified</span>}
      />
    );

    expect(html).toContain("<h3>Backend Auth</h3>");
    expect(html).toContain("<div class=\"\"><span>Verified</span></div>");
  });
});
