import { copyFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 24 || (major === 24 && minor < 14))
  throw new Error("Install Node >=24.14.0 first.");
if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log(
    "Created ignored .env from the example; existing configuration is never overwritten.",
  );
}
const hooks = spawnSync(process.execPath, ["scripts/install-hooks.mjs"], {
  stdio: "inherit",
});
if (hooks.status !== 0) process.exit(hooks.status || 1);
console.log(
  "Next: npx playwright install chromium, then npm run dev. On Linux CI use --with-deps.",
);
