import { emptySchedule, validateSchedule } from './model.js';
import { hashPassword, verifyPassword, createSession, verifySession, cookie, tokenFrom } from './security.js';

function json(value, status = 200, headers = {}) {
    return new Response(JSON.stringify(value), { status, headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...headers
    } });
}
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
async function body(request) {
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
        throw new HttpError(415, 'JSON形式で送信してください。');
    }
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, '送信内容が空です。');
    const chunks = [];
    let length = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 512 * 1024) {
            await reader.cancel();
            throw new HttpError(413, 'データは512KB以内にしてください。');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    try {
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        return parsed;
    } catch {
        throw new HttpError(400, 'JSONの形式が正しくありません。');
    }
}
async function getAuth(env) {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
        throw new HttpError(503, '管理用Secretが未設定です。設定手順を確認してください。');
    }
    let auth = await env.STORE.getAuth();
    if (!auth) {
        if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12 || env.ADMIN_PASSWORD.length > 256) {
            throw new HttpError(503, '初期管理パスワードを12〜256文字で設定してください。');
        }
        const initial = await hashPassword(env.ADMIN_PASSWORD);
        auth = await env.STORE.createAuth(initial);
    }
    return auth;
}
async function requireAdmin(request, env) {
    const auth = await getAuth(env);
    if (!await verifySession(tokenFrom(request), auth, env.SESSION_SECRET)) {
        throw new HttpError(401, '編集するには管理パスワードで解除してください。');
    }
    return auth;
}
export async function handleApi(request, env) {
    try {
        const path = new URL(request.url).pathname;
        const method = request.method;
        const known = ['/api/schedule', '/api/session', '/api/password'];
        if (!known.includes(path)) return json({ error: '見つかりません。' }, 404);
        if (!['GET', 'PUT', 'POST', 'DELETE'].includes(method)) {
            return json({ error: '未対応の操作です。' }, 405);
        }
        if (method !== 'GET') {
            // Browser writes must come from this exact origin; no CORS permission is granted.
            if (request.headers.get('Origin') !== new URL(request.url).origin) {
                throw new HttpError(403, '別サイトからの更新は許可されていません。');
            }
        }
        if (path === '/api/schedule' && method === 'GET') {
            return json(await env.STORE.getSchedule() ||
                { data: emptySchedule(), version: 0 });
        }
        if (path === '/api/session' && method === 'GET') {
            const auth = await getAuth(env);
            return json({ authenticated: await verifySession(
                tokenFrom(request), auth, env.SESSION_SECRET) });
        }
        if (path === '/api/session' && method === 'POST') {
            const input = await body(request);
            const auth = await getAuth(env);
            // Local mode ignores forwarded headers; Cloudflare supplies this header in production.
            const ip = env.LOCAL ? 'local' : request.headers.get('CF-Connecting-IP') || 'unknown';
            const ipKey = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
                new TextEncoder().encode(env.SESSION_SECRET + ip))))
                .map(n => n.toString(16).padStart(2, '0')).join('');
            if (!await env.STORE.allowLogin(ipKey)) {
                throw new HttpError(429, 'ログイン試行が多すぎます。15分ほど待ってください。');
            }
            if (!await verifyPassword(input.password, auth)) {
                throw new HttpError(401, 'パスワードが違います。');
            }
            const token = await createSession(auth, env.SESSION_SECRET);
            return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(request, token) });
        }
        if (path === '/api/session' && method === 'DELETE') {
            return json({ authenticated: false }, 200,
                { 'Set-Cookie': cookie(request, '', true) });
        }
        if (path === '/api/password' && method === 'PUT') {
            const auth = await requireAdmin(request, env);
            const input = await body(request);
            if (!await verifyPassword(input.currentPassword, auth)) {
                throw new HttpError(401, '現在のパスワードが違います。');
            }
            if (typeof input.newPassword !== 'string' ||
                input.newPassword.length < 12 || input.newPassword.length > 256) {
                throw new HttpError(400, '新しいパスワードは12〜256文字にしてください。');
            }
            if (!await env.STORE.changeAuth(auth.hash, await hashPassword(input.newPassword))) {
                throw new HttpError(409, '設定が変更されました。もう一度ログインしてください。');
            }
            return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', true) });
        }
        if (path === '/api/schedule' && method === 'PUT') {
            await requireAdmin(request, env);
            const input = await body(request);
            if (!Number.isSafeInteger(input.version) || input.version < 0) {
                throw new HttpError(400, '保存バージョンが不正です。');
            }
            let data;
            try {
                data = validateSchedule(input.data);
            } catch (error) {
                throw new HttpError(400, error.message);
            }
            const next = await env.STORE.putSchedule(data, input.version);
            if (!next) {
                throw new HttpError(409, '別の画面で予定が更新されました。未保存分をJSON出力してから再読み込みしてください。');
            }
            return json(next);
        }
        return json({ error: '未対応の操作です。' }, 405);
    } catch (error) {
        if (!error.status) console.error('API operation failed:', error.name);
        return json({ error: error.status ? error.message : 'サーバー処理に失敗しました。' },
            error.status || 500);
    }
}
