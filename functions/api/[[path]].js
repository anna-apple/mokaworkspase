import { handleApi } from '../../src/server/app.js';
import { D1Store } from '../../src/server/d1-store.js';

export async function onRequest(context) {
    if (!context.env.DB) {
        return new Response(JSON.stringify({ error: 'D1のDBバインディングが未設定です。' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
        });
    }
    return handleApi(context.request, { ...context.env, STORE: new D1Store(context.env.DB) });
}
