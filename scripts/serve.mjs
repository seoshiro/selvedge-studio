import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};
http
  .createServer(async (req, res) => {
    if (!["127.0.0.1:5279", "localhost:5279"].includes(req.headers.host)) {
      res.writeHead(403).end();
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    try {
      const relative =
        decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        ).replace(/^\/+/, "") || "index.html";
      if (
        relative.includes("\\") ||
        relative.includes("\0") ||
        relative.split("/").includes("..")
      )
        throw Error();
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep)) throw Error();
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error();
      const body = await fs.readFile(target);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(5279, "127.0.0.1", () =>
    console.log("SELVEDGE preview on http://127.0.0.1:5279"),
  );
