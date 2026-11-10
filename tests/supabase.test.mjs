import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SupabaseStore } from '../supabase/functions/_shared/supabase-store.js';
import { handleEdgeRequest } from '../supabase/functions/_shared/edge-handler.js';
import { onRequest } from '../functions/api/[[path]].js';
import { LocalStore } from '../src/server/local-store.js';
import { emptySchedule } from '../src/server/model.js';

test('Supabase REST RPC mapping, server-only auth headers and failure handling', async () => {
    const calls = [];
    const store = new SupabaseStore('https://project.supabase.co', 'server-only-key',
        async (url, options) => {
            calls.push({ url, options });
            return Response.json({ ok: true });
        });
    await store.getSchedule();
    await store.putSchedule(emptySchedule(), 4);
    await store.getAuth();
    await store.createAuth({ salt: 's', hash: 'h' });
    await store.changeAuth('old', { salt: 's2', hash: 'h2' });
    await store.allowLogin('ip-hash');
    assert.deepEqual(calls.map(c => c.url.split('/').at(-1)), [
        'ss_get_schedule', 'ss_put_schedule', 'ss_get_auth',
        'ss_create_auth', 'ss_change_auth', 'ss_allow_login'
    ]);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer server-only-key');
    assert.deepEqual(JSON.parse(calls[1].options.body), { p_data: emptySchedule(), p_version: 4 });
    const failing = new SupabaseStore('https://project.supabase.co', 'key',
        async () => new Response('private db error', { status: 500 }));
    await assert.rejects(failing.getSchedule(), /Supabase RPC failed/);
    assert.throws(() => new SupabaseStore('http://project.supabase.co', 'key'));
});

async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'schedule-edge-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const store = new LocalStore(join(dir, 'state.json'));
    const env = {
        ADMIN_PASSWORD: 'Test-edge-password-1234',
        SESSION_SECRET: 'secret-session-for-edge-at-least-32-characters',
        PROXY_SECRET: 'secret-gateway-for-edge-at-least-32-characters',
        ALLOWED_ORIGINS: 'https://schedule.pages.dev'
    };
    return { env, store };
}
function edgeRequest(action, env, options = {}) {
    const method = options.method || 'GET';
    return new Request(`https://project.supabase.co/functions/v1/schedule-api/${action}`, {
        method,
        headers: {
            'X-Proxy-Secret': env.PROXY_SECRET,
            'X-Public-Origin': env.ALLOWED_ORIGINS,
            'X-Client-IP': '192.0.2.1',
            'Content-Type': 'application/json',
            ...(method !== 'GET' ? { Origin: env.ALLOWED_ORIGINS } : {}),
            ...options.headers
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
}
test('Edge gateway authentication and origin allowlist', async t => {
    const { env, store } = await fixture(t);
    assert.equal((await handleEdgeRequest(edgeRequest('schedule', env, {
        headers: { 'X-Proxy-Secret': 'wrong' }
    }), env, store)).status, 403);
    assert.equal((await handleEdgeRequest(edgeRequest('schedule', env, {
        headers: { 'X-Public-Origin': 'https://other.pages.dev' }
    }), env, store)).status, 403);
    assert.equal((await handleEdgeRequest(edgeRequest('session', env, {
        method: 'POST', body: { password: env.ADMIN_PASSWORD },
        headers: { Origin: 'https://evil.example' }
    }), env, store)).status, 403);
    assert.equal((await handleEdgeRequest(edgeRequest('schedule', env), env, store)).status, 200);
});
test('Edge password session: Secure cookie, protected saves, public reads and change', async t => {
    const { env, store } = await fixture(t);
    let response = await handleEdgeRequest(edgeRequest('session', env, {
        method: 'POST', body: { password: env.ADMIN_PASSWORD }
    }), env, store);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Set-Cookie'), /; Secure/);
    const cookie = response.headers.get('Set-Cookie').split(';')[0];
    const data = emptySchedule();
    data.streamTimes['2026-11-01'] = [{ start: '09:00', end: '', type: 'ご新規' }];
    response = await handleEdgeRequest(edgeRequest('schedule', env, {
        method: 'PUT', body: { data, version: 0 }
    }), env, store);
    assert.equal(response.status, 401);
    response = await handleEdgeRequest(edgeRequest('schedule', env, {
        method: 'PUT', body: { data, version: 0 }, headers: { Cookie: cookie }
    }), env, store);
    assert.equal(response.status, 200);
    response = await handleEdgeRequest(edgeRequest('schedule', env), env, store);
    assert.deepEqual((await response.json()).data, data);
    response = await handleEdgeRequest(edgeRequest('password', env, {
        method: 'PUT', headers: { Cookie: cookie },
        body: { currentPassword: env.ADMIN_PASSWORD, newPassword: 'Updated-password-123456' }
    }), env, store);
    assert.equal(response.status, 200);
    response = await handleEdgeRequest(edgeRequest('session', env, {
        headers: { Cookie: cookie }
    }), env, store);
    assert.equal((await response.json()).authenticated, false);
});
test('Pages gateway rejects wrong origins and overwrites injected gateway headers', async t => {
    const { env, store } = await fixture(t);
    const cfEnv = {
        SUPABASE_EDGE_URL: 'https://project.supabase.co/functions/v1/schedule-api',
        PROXY_SECRET: env.PROXY_SECRET
    };
    const seen = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        seen.push({ url: String(url), options });
        return handleEdgeRequest(new Request(url, options), env, store);
    });
    const call = (path, options = {}) => onRequest({
        env: cfEnv,
        request: new Request('https://schedule.pages.dev/api/' + path, options)
    });
    assert.equal((await call('session', {
        method: 'POST', headers: { Origin: 'https://evil.example' }
    })).status, 403);
    let response = await call('schedule', {
        headers: { 'X-Public-Origin': 'https://evil.example', 'X-Proxy-Secret': 'wrong' }
    });
    assert.equal(response.status, 200);
    assert.equal(seen[0].options.headers.get('X-Public-Origin'), env.ALLOWED_ORIGINS);
    assert.equal(seen[0].options.headers.get('X-Proxy-Secret'), env.PROXY_SECRET);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    response = await call('session', {
        method: 'POST',
        headers: { Origin: env.ALLOWED_ORIGINS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: env.ADMIN_PASSWORD })
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Set-Cookie'), /HttpOnly/);
    assert(!await response.text().then(text => text.includes(env.PROXY_SECRET)));
});
test('Pages gateway rejects missing configuration and excessive bodies', async t => {
    const { env } = await fixture(t);
    const request = new Request('https://schedule.pages.dev/api/schedule');
    assert.equal((await onRequest({ request, env: {} })).status, 503);
    let forwarded = false;
    t.mock.method(globalThis, 'fetch', async () => { forwarded = true; return Response.json({}); });
    const response = await onRequest({
        env: { SUPABASE_EDGE_URL: 'https://project.supabase.co/functions/v1/schedule-api',
            PROXY_SECRET: env.PROXY_SECRET },
        request: new Request('https://schedule.pages.dev/api/session', {
            method: 'POST',
            headers: { Origin: 'https://schedule.pages.dev', 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'x'.repeat(513 * 1024) })
        })
    });
    assert.equal(response.status, 413);
    assert.equal(forwarded, false);
});
