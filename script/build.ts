import path from "path";
import { fileURLToPath } from "url";
import { build as viteBuild } from "vite";
import { build as esbuildBuild } from "esbuild";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

async function runBuild() {
  await viteBuild({
    configFile: path.resolve(rootDir, "vite.config.ts"),
    mode: "production",
  });

  await esbuildBuild({
    entryPoints: [path.resolve(rootDir, "server", "index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.resolve(rootDir, "dist", "index.cjs"),
    target: "node20",
    sourcemap: true,
    packages: "external",
    tsconfig: path.resolve(rootDir, "tsconfig.json"),
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });

  console.log("Build complete: generated dist/public and dist/index.cjs");
}

runBuild().catch((error) => {
  console.error("Build failed", error);
  process.exit(1);
});
