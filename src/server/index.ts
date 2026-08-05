import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { createApiApp } from "./routes.js";
import { startJobs } from "./jobs.js";

// Ensure DB is ready at boot
getDb();

const app = new Hono();

app.route("/api", createApiApp());

const webRootCandidates = [
  join(process.cwd(), "dist", "web"),
  join(process.cwd(), "src", "web", "dist"),
];
const webRoot = webRootCandidates.find((p) => existsSync(p));

if (webRoot) {
  const relative = webRoot.startsWith(process.cwd())
    ? webRoot.slice(process.cwd().length).replace(/^[\\/]/, "").replace(/\\/g, "/") || "."
    : webRoot;

  app.use(
    "/*",
    serveStatic({
      root: relative,
    }),
  );

  app.get("*", async (c) => {
    const indexPath = join(webRoot, "index.html");
    if (!existsSync(indexPath)) {
      return c.text("Frontend non buildé. Lance npm run build.", 503);
    }
    const { readFileSync } = await import("node:fs");
    return c.html(readFileSync(indexPath, "utf8"));
  });
} else {
  app.get("/", (c) =>
    c.text(
      "API dog-feed OK. Frontend absent (dist/web). En dev: npm run dev:web ou npm run build.",
      200,
    ),
  );
}

startJobs();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[dog-feed] listening on http://localhost:${info.port}`);
  console.log(`[dog-feed] data dir: ${config.dataDir}`);
});
