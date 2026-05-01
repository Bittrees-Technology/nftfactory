#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const runtimeDir = path.join(rootDir, ".runtime-host");
const logDir = path.join(runtimeDir, "logs");
const pidDir = path.join(runtimeDir, "pids");
const stateFile = path.join(runtimeDir, "supervisor-state.json");
const envFile = path.join(rootDir, ".env");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function ensureRuntimeDirs() {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(pidDir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, { timeoutMs = 15_000, validate } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2000),
        cache: "no-store",
      });
      if (!validate || validate(response)) {
        return true;
      }
    } catch {
      // Retry until timeout.
    }

    await sleep(500);
  }

  return false;
}

class IndexerSupervisor {
  constructor({ env }) {
    this.env = env;
    this.indexerPort = String(env.INDEXER_PORT || "8787").trim() || "8787";
    this.startedAt = new Date().toISOString();
    this.stopping = false;
    this.restartRequested = false;
    this.currentApiProcess = null;
    this.apiState = null;
  }

  log(message) {
    process.stdout.write(`[indexer-supervisor] ${message}\n`);
  }

  updateState() {
    const state = {
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
      stopping: this.stopping,
      restartRequested: this.restartRequested,
      services: this.apiState && this.currentApiProcess
        ? {
            "indexer-api": {
              pid: this.currentApiProcess.pid,
              restarts: this.apiState.restarts,
              startedAt: this.apiState.startedAt,
              readyAt: this.apiState.readyAt,
            },
          }
        : {},
    };
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }

  pidFile(name) {
    return path.join(pidDir, `${name}.pid`);
  }

  writePidFile(name, pid) {
    fs.writeFileSync(this.pidFile(name), `${pid}\n`);
  }

  removePidFile(name) {
    fs.rmSync(this.pidFile(name), { force: true });
  }

  pipeLogs(name, stream, target = process.stdout) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u)) {
        if (!line) {
          continue;
        }
        target.write(`[${name}] ${line}\n`);
      }
    });
  }

  async runCommand(command, args, label) {
    this.log(`running ${label}`);
    const child = spawn(command, args, {
      cwd: rootDir,
      env: this.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.pipeLogs(label, child.stdout, process.stdout);
    this.pipeLogs(label, child.stderr, process.stderr);

    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode, signal) => {
        if (signal) {
          reject(new Error(`${label} exited via signal ${signal}`));
          return;
        }
        resolve(exitCode ?? 0);
      });
    });

    if (code !== 0) {
      throw new Error(`${label} exited with code ${code}`);
    }
  }

  async preflight() {
    const databaseUrl = String(this.env.DATABASE_URL || "").trim();
    if (!databaseUrl || databaseUrl.includes("@127.0.0.1:") || databaseUrl.includes("@localhost:")) {
      await this.runCommand("bash", [path.join(rootDir, "scripts/ensure-postgres.sh")], "ensure-postgres");
      if (!databaseUrl) {
        const dbName = String(this.env.INDEXER_DB_NAME || "nftfactory").trim() || "nftfactory";
        const dbUser = String(this.env.INDEXER_DB_USER || "postgres").trim() || "postgres";
        const dbPassword = String(this.env.INDEXER_DB_PASSWORD || "postgres").trim() || "postgres";
        const dbPort = String(this.env.INDEXER_DB_PORT || "5432").trim() || "5432";
        this.env.DATABASE_URL = `postgresql://${dbUser}:${dbPassword}@127.0.0.1:${dbPort}/${dbName}`;
      }
    }

    await this.runCommand("npm", ["run", "db:generate"], "db-generate");
    await this.runCommand("npm", ["run", "db:deploy"], "db-deploy");
  }

  async waitForReady() {
    return waitForHttp(`http://127.0.0.1:${this.indexerPort}/health`, {
      validate: (response) => response.ok,
    });
  }

  async startApi() {
    if (this.stopping) {
      return;
    }

    await this.preflight();
    this.log("starting indexer-api");
    const child = spawn("npm", ["run", "dev"], {
      cwd: rootDir,
      env: this.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.currentApiProcess = child;
    this.apiState = {
      restarts: this.apiState?.restarts ?? 0,
      startedAt: new Date().toISOString(),
      readyAt: null,
    };
    this.writePidFile("indexer-api", child.pid);
    this.updateState();

    this.pipeLogs("indexer-api", child.stdout, process.stdout);
    this.pipeLogs("indexer-api", child.stderr, process.stderr);

    child.on("exit", async (code, signal) => {
      if (this.currentApiProcess !== child) {
        return;
      }

      this.removePidFile("indexer-api");
      this.currentApiProcess = null;
      this.updateState();

      if (this.stopping) {
        this.log("indexer-api stopped");
        return;
      }

      const restartReason = this.restartRequested
        ? "restart requested"
        : `indexer-api exited code=${code ?? "null"} signal=${signal ?? "null"}`;
      this.restartRequested = false;
      this.log(`${restartReason}; restarting`);
      if (this.apiState) {
        this.apiState.restarts += 1;
      }
      this.updateState();
      await sleep(3000);
      await this.ensureApiRunning();
    });

    const ready = await this.waitForReady();
    if (!ready) {
      this.log("indexer-api failed readiness check");
      child.kill("SIGTERM");
      return;
    }

    if (this.apiState) {
      this.apiState.readyAt = new Date().toISOString();
    }
    this.updateState();
    this.log("indexer-api ready");
  }

  async requestRestart() {
    if (!this.currentApiProcess) {
      this.log("restart requested while indexer-api is down; starting fresh");
      await this.ensureApiRunning();
      return;
    }

    this.restartRequested = true;
    this.updateState();
    this.currentApiProcess.kill("SIGTERM");
  }

  async start() {
    ensureRuntimeDirs();
    this.updateState();
    await this.ensureApiRunning();
  }

  async ensureApiRunning() {
    while (!this.stopping) {
      try {
        await this.startApi();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`preflight failed: ${message}; retrying in 5s`);
        await sleep(5000);
      }
    }
  }

  async stop() {
    this.stopping = true;
    this.updateState();

    const child = this.currentApiProcess;
    if (child) {
      child.kill("SIGTERM");
      await sleep(1000);
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }

    this.removePidFile("indexer-api");
  }
}

const env = {
  ...process.env,
  ...parseEnvFile(envFile),
};

const supervisor = new IndexerSupervisor({ env });

process.on("SIGHUP", async () => {
  try {
    await supervisor.requestRestart();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[indexer-supervisor] restart failed: ${message}\n`);
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await supervisor.stop();
    process.exit(0);
  });
}

await supervisor.start();
await new Promise(() => {});
