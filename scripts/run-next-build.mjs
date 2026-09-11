import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);
const nextCli = requireFromHere.resolve("next/dist/bin/next");
const nextMajor = Number.parseInt(requireFromHere("next/package.json").version.split(".")[0] || "0", 10);
const existingNodeOptions = String(process.env.NODE_OPTIONS || "").trim();
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);
const hasWebStorageOption = /--localstorage-file=|--(?:no-)?(?:experimental-)?webstorage\b/.test(existingNodeOptions);
const nodeOptions = nodeMajor >= 25 && !hasWebStorageOption
  ? `${existingNodeOptions} --no-webstorage`.trim()
  : existingNodeOptions;
const nextArguments = process.argv.slice(2);
const hasBundlerFlag = nextArguments.some((argument) => ["--webpack", "--turbopack", "--turbo"].includes(argument));
if (nextMajor >= 16 && !hasBundlerFlag) {
  nextArguments.unshift("--webpack");
}

const result = spawnSync(process.execPath, [nextCli, "build", ...nextArguments], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {})
  },
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

if (result.signal) {
  console.error(`Next.js build stopped by signal ${result.signal}.`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
