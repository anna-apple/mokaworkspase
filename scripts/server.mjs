import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { handleApi } from '../src/server/app.js';
import { LocalStore } from '../src/server/local-store.js';

const base = fileURLToPath(new URL('../', import.meta.url));
const publicDir = resolve(base, 'public');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const store = new LocalStore(resolve(base, 'data/local.json'));
if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    console.error('先に npm run setup を実行してください。');
    process.exit(1);
}
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
    try {
        const origin = `http://localhost:${port}`;
        const url = new URL(req.url, origin);
        if (url.pathname.startsWith('/api/')) {
            // Host is used to match browser Origin; this development server is loopback-only by default.
            const apiUrl = new URL(req.url, `http://${req.headers.host}`);
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) {
                if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
            }
            const request = new Request(apiUrl, {
                method: req.method, headers,
                ...(!['GET', 'HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {})
            });
            const response = await handleApi(request, {
                STORE: store, LOCAL: true,
                ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
                SESSION_SECRET: process.env.SESSION_SECRET
            });
            res.writeHead(response.status, Object.fromEntries(response.headers));
            res.end(Buffer.from(await response.arrayBuffer()));
            return;
        }
        if (!['GET', 'HEAD'].includes(req.method)) {
            res.writeHead(405);
            res.end();
            return;
        }
        const pathname = decodeURIComponent(url.pathname);
        const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
        if (!['index.html', 'app.js', 'styles.css'].includes(relative)) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const bytes = await readFile(resolve(publicDir, relative));
        res.writeHead(200, {
            'Content-Type': types[extname(relative)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'no-referrer'
        });
        res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
        if (!res.headersSent) res.writeHead(500);
        res.end('Server error');
    }
});
server.listen(port, host, () => {
    console.log(`閲覧画面: http://localhost:${port}/`);
    console.log(`管理画面: http://localhost:${port}/?admin=1`);
});
