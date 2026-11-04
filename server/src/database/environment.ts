import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

let loaded = false;
export function loadClientEnvironment(): void {
  if (loaded) return;
  let directory = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === "toktickit-server") {
      // Preserve native client's server .env loading and process-env precedence.
      // This runs lazily and works in both src/ and dist/src/ layouts.
      config({ path: join(directory, ".env") }); loaded = true; return;
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error("Server environment root is unavailable.");
    directory = parent;
  }
}
