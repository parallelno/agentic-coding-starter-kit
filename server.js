/* Minimal zero-dependency static file server (dev helper).
 * Usage: node server.js [port]  →  http://localhost:8123
 * Serves ./ with correct MIME types so ES modules + HDR load over HTTP.
 */
import http from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(".");
const PORT = Number(process.argv[2] || 8123);

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".hdr": "application/octet-stream",
	".png": "image/png",
	".jpg": "image/jpeg",
	".svg": "image/svg+xml",
	".md": "text/markdown; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
	try {
		const u = new URL(req.url, "http://localhost");
		if (req.method === "POST" && u.pathname === "/save") {
			// Dev helper: persist screenshot captures into results/screenshots/.
			const chunks = [];
			for await (const c of req) chunks.push(c);
			const body = String(chunks.join(""));
			const buf = u.searchParams.get("enc") === "b64"
				? Buffer.from(body, "base64")
				: Buffer.from(body);
			const name = (u.searchParams.get("name") ?? "capture.png")
				.replace(/[\\/:*?"<>|]/g, "_");
			await writeFile(join(ROOT, "results", "screenshots", name), buf);
			res.writeHead(200, { "Content-Type": "text/plain" });
			res.end(`saved ${name} (${buf.length} bytes)`);
			return;
		}
		let urlPath = decodeURIComponent(u.pathname);
		if (urlPath === "/") urlPath = "/index.html";
		const file = normalize(join(ROOT, urlPath));
		if (!file.startsWith(ROOT)) {
			res.writeHead(403).end("forbidden");
			return;
		}
		const s = await stat(file);
		if (s.isDirectory()) {
			res.writeHead(302, { Location: (req.url ?? "/").replace(/[^/]$/, "") + "/" }).end();
			return;
		}
		const buf = await readFile(file);
		res.writeHead(200, {
			"Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
			"Content-Length": buf.length,
			"Cache-Control": "no-cache",
		});
		res.end(buf);
	} catch {
		res.writeHead(404).end("not found");
	}
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`SNAKE serving ${ROOT} → http://localhost:${PORT}`);
});