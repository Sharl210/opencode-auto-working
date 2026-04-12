#!/usr/bin/env bun

import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

await Bun.$`rm -rf dist`

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  format: "esm",
  target: "bun",
  splitting: false,
  plugins: [createSolidTransformPlugin()],
  external: ["@opencode-ai/plugin", "@opencode-ai/sdk", "@opentui/core", "@opentui/solid", "solid-js"],
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

const typecheck = Bun.spawn([
  "bun",
  "x",
  "tsc",
  "-p",
  "tsconfig.json",
  "--emitDeclarationOnly",
  "--declaration",
  "--declarationMap",
  "--outDir",
  "dist",
])

const exit = await typecheck.exited
if (exit !== 0) {
  process.exit(exit)
}
