import fs from "node:fs";
import path from "node:path";

// Node >= 20.12 can load .env natively — no dotenv dependency needed.
export function loadEnv(): void {
  try {
    process.loadEnvFile(path.resolve(".env"));
  } catch {
    // .env missing is fine if vars are set in the shell
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Models sometimes wrap JSON in prose or ```json fences — extract the outermost object.
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object found in model output");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export function readJsonIfExists<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f));
}

// --only 3,17,42  /  --force  /  --limit 10
export function parseArgs(argv: string[]) {
  const only = new Set<number>();
  let force = false;
  let limit = Infinity;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only" && argv[i + 1]) {
      argv[++i].split(",").forEach((n) => only.add(Number(n.trim())));
    } else if (argv[i] === "--force") {
      force = true;
    } else if (argv[i] === "--limit" && argv[i + 1]) {
      limit = Number(argv[++i]);
    }
  }
  return { only, force, limit };
}
