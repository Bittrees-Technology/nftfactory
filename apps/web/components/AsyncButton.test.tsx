import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AsyncButton from "./AsyncButton";

describe("AsyncButton", () => {
  it("renders the idle label when not loading", () => {
    const html = renderToStaticMarkup(
      <AsyncButton idleLabel="Refresh" loadingLabel="Refreshing..." loading={false} />
    );

    expect(html).toContain(">Refresh</button>");
    expect(html).not.toContain("disabled");
  });

  it("renders the loading label and disables the button while loading", () => {
    const html = renderToStaticMarkup(
      <AsyncButton idleLabel="Load More" loadingLabel="Loading more..." loading />
    );

    expect(html).toContain(">Loading more...</button>");
    expect(html).toContain("disabled");
  });
});
