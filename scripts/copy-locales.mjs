// Build helper: copies the locale JSON bundles next to the compiled output.
// The package's "./locales/*" exports subpath serves ./locales from the
// package root, and dist/locales keeps the dist tree self-contained for
// bundlers that resolve the compiled module graph. Only the JSON bundles are
// copied (tsc already emits the compiled locales module). Cross-platform.
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "src", "locales");
const targets = [path.join(root, "dist", "locales"), path.join(root, "locales")];

const jsonFiles = (await readdir(src)).filter((name) => name.endsWith(".json"));
if (jsonFiles.length === 0) {
  throw new Error(`no locale JSON bundles found in ${src}`);
}
for (const target of targets) {
  await mkdir(target, { recursive: true });
  for (const name of jsonFiles) {
    await copyFile(path.join(src, name), path.join(target, name));
  }
}
