/**
 * Local dev server (no dependencies).
 * - serves the project folder on all interfaces, so an iPhone in the same Wi-Fi can open it;
 * - sends `Cache-Control: no-store`, so Safari/Chrome always load the latest files after an edit;
 * - prints the URLs to open on the Mac and on the phone.
 *
 * Usage: npm start            (PORT=9000 npm start to change the port)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { hostname, networkInterfaces } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (path.endsWith('/')) path += 'index.html';

  // Never serve hidden files (.git, .claude) or anything outside the project.
  const file = resolve(ROOT, `.${path}`);
  if (path.split('/').some((part) => part.startsWith('.')) || !file.startsWith(ROOT + sep)) {
    return send(res, 404, 'Not found');
  }

  try {
    const body = await readFile(file);
    send(res, 200, body, CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — the server is probably already running in another terminal.`);
    console.error(`Stop it there with Ctrl+C, or use another port: PORT=8001 npm start`);
    process.exit(1);
  }
  throw err;
});

// '::' accepts both IPv6 and IPv4. Needed for the Mac's "name.local" address,
// which iPhones often reach over IPv6.
server.listen(PORT, '::', () => {
  const lanAddresses = Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net.address);
  const name = hostname();

  console.log(`Mac:    http://localhost:${PORT}`);
  if (name.endsWith('.local')) {
    console.log(`iPhone: http://${name}:${PORT}  (same Wi-Fi; stays the same when the IP changes)`);
  }
  for (const address of lanAddresses) console.log(`        http://${address}:${PORT}  (by IP)`);
  console.log('Stop with Ctrl+C');
});
