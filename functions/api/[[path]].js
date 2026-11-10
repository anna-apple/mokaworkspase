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
async function limitedBody(request) {
    const reader = request.body?.getReader();
    if (!reader) return undefined;
    let size = 0;
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 512 * 1024) {
            await reader.cancel();
            const error = new Error('データは512KB以内にしてください。');
            error.status = 413;
            throw error;
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    if (!['/api/schedule', '/api/session', '/api/password'].includes(url.pathname)) {
        return json('見つかりません。', 404);
    }
    if (!['GET', 'PUT', 'POST', 'DELETE'].includes(request.method)) {
        return json('未対応の操作です。', 405);
    }
    if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
        return json('別サイトからの更新は許可されていません。', 403);
    }
    if (!env.SUPABASE_EDGE_URL || !env.PROXY_SECRET || env.PROXY_SECRET.length < 32) {
        return json('Cloudflareの接続設定が未完了です。手順書を確認してください。', 503);
    }
    try {
        const target = new URL(env.SUPABASE_EDGE_URL);
        if (target.protocol !== 'https:' ||
            target.pathname.replace(/\/$/, '') !== '/functions/v1/schedule-api') {
            return json('SUPABASE_EDGE_URLの設定が正しくありません。', 503);
        }
        target.pathname = '/functions/v1/schedule-api/' + url.pathname.split('/').at(-1);
        target.search = '';
        const headers = new Headers({
            'X-Proxy-Secret': env.PROXY_SECRET,
            'X-Public-Origin': url.origin,
            'X-Client-IP': request.headers.get('CF-Connecting-IP') || 'unknown'
        });
        for (const name of ['Content-Type', 'Cookie', 'Origin']) {
            const value = request.headers.get(name);
            if (value) headers.set(name, value);
        }
        const bytes = !['GET', 'HEAD'].includes(request.method) ? await limitedBody(request) : undefined;
        const response = await fetch(target, {
            method: request.method,
            headers,
            ...(bytes ? { body: bytes } : {}),
            redirect: 'error',
            signal: AbortSignal.timeout(30000)
        });
        // Only pass application JSON and session cookie. Never forward arbitrary upstream headers.
        if (!response.headers.get('Content-Type')?.includes('application/json')) {
            return json('Supabaseの応答が不正です。関数の公開状態を確認してください。', 502);
        }
        const out = new Headers({
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        const cookie = response.headers.get('Set-Cookie');
        if (cookie) out.set('Set-Cookie', cookie);
        return new Response(response.body, { status: response.status, headers: out });
    } catch (error) {
        return json(error.status === 413 ? error.message :
            'Supabaseに接続できません。設定と稼働状態を確認してください。', error.status || 502);
    }
}
