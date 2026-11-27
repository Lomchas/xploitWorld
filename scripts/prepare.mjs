import { existsSync } from "node:fs";
if (existsSync(".git") && process.env.HUSKY !== "0") {
  const { default: install } = await import("husky");
  const message = install();
  if (message) console.info(message);
}
