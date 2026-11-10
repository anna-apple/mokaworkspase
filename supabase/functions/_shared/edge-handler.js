import { handleApi } from './app.js';
import { SupabaseStore } from './supabase-store.js';

function json(error, status) {
    return new Response(JSON.stringify({ error }), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}
async function sameSecret(a, b) {
    const hash = async value => new Uint8Array(await crypto.subtle.digest(
        'SHA-256', new TextEncoder().encode(value)));
    const [left, right] = await Promise.all([hash(a), hash(b)]);
    let mismatch = 0;
    for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
    return mismatch === 0;
}
export async function handleEdgeRequest(request, env, testStore) {
    try {
        if (!env.PROXY_SECRET || env.PROXY_SECRET.length < 32) {
            return json('サーバーの共有Secretが未設定です。', 503);
        }
        const supplied = request.headers.get('X-Proxy-Secret') || '';
        if (supplied.length > 512 || !await sameSecret(supplied, env.PROXY_SECRET)) {
            return json('このエンドポイントへの直接アクセスは許可されていません。', 403);
        }
        const originalOrigin = request.headers.get('X-Public-Origin') || '';
        const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!allowed.includes(originalOrigin) ||
            new URL(originalOrigin).origin !== originalOrigin ||
            !originalOrigin.startsWith('https://')) {
            return json('公開URLが許可リストに設定されていません。', 403);
        }
        const action = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
        if (!['schedule', 'session', 'password'].includes(action)) {
            return json('見つかりません。', 404);
        }
        const headers = new Headers();
        for (const name of ['Content-Type', 'Cookie', 'Origin']) {
            const value = request.headers.get(name);
            if (value) headers.set(name, value);
        }
        headers.set('CF-Connecting-IP', request.headers.get('X-Client-IP') || 'unknown');
        const internal = new Request(`${originalOrigin}/api/${action}`, {
            method: request.method,
            headers,
            ...(!['GET', 'HEAD'].includes(request.method) ?
                { body: request.body, duplex: 'half' } : {})
        });
        const store = testStore || new SupabaseStore(
            env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        return await handleApi(internal, {
            STORE: store,
            SESSION_SECRET: env.SESSION_SECRET,
            ADMIN_PASSWORD: env.ADMIN_PASSWORD
        });
    } catch (error) {
        console.error('Edge operation failed:', error.name);
        return json('サーバー設定または通信を確認してください。', 500);
    }
}
