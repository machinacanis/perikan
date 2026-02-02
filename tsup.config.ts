import { defineConfig } from "tsup"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
    name: string
    version: string
}

export default defineConfig({
    entry: {
        index: "src/index.ts"
    },
    outDir: "dist",
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    splitting: false,
    minify: true,

    esbuildOptions(options) {
        options.define = {
            ...(options.define ?? {}),
            __PKG_NAME__: JSON.stringify(pkg.name),
            __VERSION__: JSON.stringify(pkg.version)
        }
    }
})
