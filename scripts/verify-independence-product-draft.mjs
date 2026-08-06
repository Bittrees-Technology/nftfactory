import { readFile } from "node:fs/promises";

const draft = await readFile("docs/independence/nftfactory-product-draft.md", "utf8");
const home = await readFile("apps/web/app/page.tsx", "utf8");

const requiredSections = [
  "## 1. User and value",
  "## 2. Scope and out of scope",
  "## 3. Onboarding and first value",
  "## 4. Release status",
  "## 5. Product-owned trust and support",
  "## 6. Standalone entry and runtime",
  "## 7. No sibling or Bittrees dependency",
  "## 8. Optional-only integration boundaries"
];
for (const section of requiredSections) {
  if (!draft.includes(section)) throw new Error(`Missing required independence section: ${section}`);
}

for (const route of ["/mint?view=mint", "/mint?view=mint&collection=custom", "/profile/setup"]) {
  if (!home.includes(`href=\"${route}\"`)) throw new Error(`Missing first-value UI route evidence: ${route}`);
}

if (!draft.includes("draft / not released") || !draft.includes("Authentication remains enabled")) {
  throw new Error("Release/auth boundary evidence is missing");
}

console.log(`independence product draft verified: ${requiredSections.length} sections and 3 onboarding routes`);
