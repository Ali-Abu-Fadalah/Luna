import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";

// Accept a Sharp module path for hosts with a bundled image runtime.
const modulePath = process.argv[2] || "sharp";
const { default: sharp } = await import(
  path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath
);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "assets", "icons");
await mkdir(output, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(path.join(root, "assets", "luna-icon.svg"), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(output, `luna-${size}.png`));
}
console.log("Luna icons generated: 16, 32, 48 and 128 pixels.");
