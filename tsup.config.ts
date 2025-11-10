import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  sourcemap: false,
  clean: true,
  splitting: false,
  minify: true,
  target: "es2022",
  outDir: "dist",
});
