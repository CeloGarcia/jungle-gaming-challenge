import { defineConfig, type Plugin } from "vite";
import { brotliCompressSync, constants } from "node:zlib";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
function compressedAssets(): Plugin {
  return {
    name: "compressed-production-assets",
    writeBundle(options, bundle) {
      const dir = resolve(options.dir || "dist");
      for (const asset of Object.values(bundle)) {
        if (!/\.(?:js|css)$/.test(asset.fileName)) continue;
        const file = resolve(dir, asset.fileName);
        writeFileSync(
          file + ".br",
          brotliCompressSync(readFileSync(file), {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
          }),
        );
      }
    },
    configurePreviewServer(server) {
      const dir = resolve(
        server.config.root,
        server.config.build.outDir,
        "assets",
      );
      const compressed = new Map<string, { data: Buffer; type: string }>();
      for (const name of readdirSync(dir))
        if (/\.(?:js|css)\.br$/.test(name))
          compressed.set("/assets/" + name.slice(0, -3), {
            data: readFileSync(resolve(dir, name)),
            type: name.endsWith(".css.br") ? "text/css" : "text/javascript",
          });
      server.middlewares.use((request, response, next) => {
        const encoding = request.headers["accept-encoding"] || "";
        const supportsBrotli = encoding.split(",").some((part) => {
          const [name, quality] = part.trim().split(";");
          return (
            name === "br" && (!quality || Number(quality.split("=")[1]) > 0)
          );
        });
        if (!supportsBrotli) return next();
        const asset = compressed.get((request.url || "").split("?")[0]);
        if (!asset) return next();
        response.setHeader("Content-Type", asset.type);
        response.setHeader("Content-Encoding", "br");
        response.setHeader("Vary", "Accept-Encoding");
        response.setHeader("Content-Length", asset.data.length);
        response.end(asset.data);
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), compressedAssets()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/.local/**",
        "**/.playwright-cli/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/docs/**",
        "**/reports/**",
      ],
    },
  },
  preview: { port: 4173, strictPort: true },
});
