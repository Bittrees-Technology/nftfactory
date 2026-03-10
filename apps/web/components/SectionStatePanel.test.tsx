import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SectionStatePanel from "./SectionStatePanel";

describe("SectionStatePanel", () => {
  it("renders title, message, and actions consistently", () => {
    const html = renderToStaticMarkup(
      <SectionStatePanel
        className="card formCard"
        title="Admin Feed Is Clear"
        message="There are no open reports."
        actions={<button type="button">Refresh</button>}
      />
    );

    expect(html).toContain("class=\"card formCard\"");
    expect(html).toContain("<h3>Admin Feed Is Clear</h3>");
    expect(html).toContain("<p class=\"hint\">There are no open reports.</p>");
    expect(html).toContain("<div class=\"row\"><button type=\"button\">Refresh</button></div>");
  });

  it("supports sectionLead copy without forcing hint styling", () => {
    const html = renderToStaticMarkup(
      <SectionStatePanel
        title="Identity Setup"
        message="Finish setup before publishing."
        messageClassName="sectionLead"
      />
    );

    expect(html).toContain("<p class=\"sectionLead\">Finish setup before publishing.</p>");
  });
});
