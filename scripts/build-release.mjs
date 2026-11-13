import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

for (const script of ["typecheck", "lint", "test:unit", "test:e2e", "build"]) {
  run(npmCommand, ["run", script]);
}

const standaloneDirectory = path.resolve(".next", "standalone");
const staticDirectory = path.resolve(".next", "static");
if (!existsSync(path.join(standaloneDirectory, "server.js"))) {
  throw new Error("Next.js standalone output was not generated.");
}
if (existsSync(staticDirectory)) {
  cpSync(
    staticDirectory,
    path.join(standaloneDirectory, ".next", "static"),
    { recursive: true },
  );
}
if (existsSync("public")) {
  cpSync("public", path.join(standaloneDirectory, "public"), { recursive: true });
}

const releaseDirectory = path.resolve("release");
const archivePath = path.join(releaseDirectory, "todoapp-standalone.tar.gz");
mkdirSync(releaseDirectory, { recursive: true });
rmSync(archivePath, { force: true });
run("tar", ["-czf", archivePath, "-C", standaloneDirectory, "."]);
process.stdout.write(`Created ${archivePath}\n`);
