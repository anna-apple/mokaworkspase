import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleApi } from '../src/server/app.js';
import { LocalStore } from '../src/server/local-store.js';
import { emptySchedule, validateSchedule } from '../src/server/model.js';

const origin = 'http://localhost:3000';
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'schedule-test-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const env = {
        STORE: new LocalStore(join(dir, 'state.json')), LOCAL: true,
        ADMIN_PASSWORD: 'Test-password-12345678',
        SESSION_SECRET: 'test-session-secret-of-at-least-32-characters'
    };
    async function call(path, { method = 'GET', body, cookie, foreign = false, headers = {} } = {}) {
        const request = new Request(origin + '/api/' + path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(method !== 'GET' ? { Origin: foreign ? 'https://evil.example' : origin } : {}),
                ...(cookie ? { Cookie: cookie } : {}),
                ...headers
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
        return handleApi(request, env);
    }
    async function login() {
        const response = await call('session', {
            method: 'POST', body: { password: env.ADMIN_PASSWORD }
        });
        assert.equal(response.status, 200);
        return response.headers.get('Set-Cookie').split(';')[0];
    }
    return { call, login, env, dir };
}

test('public reads, protected writes, optional end time and type roundtrip', async t => {
    const { call, login } = await fixture(t);
    let response = await call('schedule');
    assert.deepEqual(await response.json(), { data: emptySchedule(), version: 0 });
    const data = emptySchedule();
    data.streamTimes['2026-11-01'] = [
        { start: '09:00', end: '', type: 'ご新規' },
        { start: '20:10', end: '21:30', type: 'お忍び' }
    ];
    response = await call('schedule', { method: 'PUT', body: { data, version: 0 } });
    assert.equal(response.status, 401);
    const cookie = await login();
    response = await call('schedule', { method: 'PUT', cookie, body: { data, version: 0 } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).version, 1);
    assert.deepEqual((await (await call('schedule')).json()).data, data);
    assert.equal((await call('schedule', {
        method: 'PUT', cookie, body: { data, version: 0 }
    })).status, 409);
});

test('cross origin writes are rejected, cookie flags and no credential disclosure', async t => {
    const { call, login, env, dir } = await fixture(t);
    assert.equal((await call('session', {
        method: 'POST', foreign: true, body: { password: env.ADMIN_PASSWORD }
    })).status, 403);
    const response = await call('session', {
        method: 'POST', body: { password: env.ADMIN_PASSWORD }
    });
    const setCookie = response.headers.get('Set-Cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.equal((await call('session', { cookie: 'stream_admin=fake' }).then(r => r.json())).authenticated, false);
    const cookie = await login();
    assert.equal((await call('session', { cookie }).then(r => r.json())).authenticated, true);
    assert(!await readFile(join(dir, 'state.json'), 'utf8').then(s => s.includes(env.ADMIN_PASSWORD)));
    const publicResponse = await call('schedule');
    assert.equal(publicResponse.headers.get('Cache-Control'), 'no-store');
    const text = await publicResponse.text();
    assert(!text.includes('hash'));
    assert(!text.includes(env.ADMIN_PASSWORD));
});

test('password change invalidates old sessions and passwords', async t => {
    const { call, login, env } = await fixture(t);
    const cookie = await login();
    const newPassword = 'New-password-12345678';
    assert.equal((await call('password', { method: 'PUT', cookie, body: {
        currentPassword: 'wrong', newPassword
    } })).status, 401);
    assert.equal((await call('password', { method: 'PUT', cookie, body: {
        currentPassword: env.ADMIN_PASSWORD, newPassword
    } })).status, 200);
    assert.equal((await call('session', { cookie }).then(r => r.json())).authenticated, false);
    assert.equal((await call('session', { method: 'POST', body: {
        password: env.ADMIN_PASSWORD
    } })).status, 401);
    assert.equal((await call('session', { method: 'POST', body: {
        password: newPassword
    } })).status, 200);
});

test('login throttling and invalid request size / content type', async t => {
    const { call } = await fixture(t);
    for (let i = 0; i < 10; i++) {
        assert.equal((await call('session', { method: 'POST', body: { password: 'wrong' } })).status, 401);
    }
    assert.equal((await call('session', { method: 'POST', body: { password: 'wrong' } })).status, 429);
    assert.equal((await call('session', { method: 'POST', body: {}, headers: {
        'Content-Type': 'text/plain'
    } })).status, 415);
    assert.equal((await call('session', { method: 'POST', body: {
        password: 'x'.repeat(513 * 1024)
    } })).status, 413);
});

test('data validation, old minute values retained, no private fields published', () => {
    const data = emptySchedule();
    data.streamTimes['2026-11-01'] = [{ start: '09:01', end: '', type: '通常' }];
    data.password = 'must-not-be-published';
    assert.equal(validateSchedule(data).password, undefined);
    assert.equal(validateSchedule(data).streamTimes['2026-11-01'][0].start, '09:01');
    data.streamTimes['2026-11-01'][0].end = '25:00';
    assert.throws(() => validateSchedule(data));
    delete data.streamTimes['2026-11-01'];
    data.streamTimes['2026-02-30'] = [];
    assert.throws(() => validateSchedule(data));
});

test('concurrent writes do not silently overwrite', async t => {
    const { call, login } = await fixture(t);
    const cookie = await login();
    const results = await Promise.all([1, 2].map(() => call('schedule', {
        method: 'PUT', cookie, body: { data: emptySchedule(), version: 0 }
    })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});

test('GET reads need no password initialization, and secrets must be configured for auth', async t => {
    const { call, env } = await fixture(t);
    env.SESSION_SECRET = '';
    assert.equal((await call('schedule')).status, 200);
    assert.equal((await call('session')).status, 503);
});

test('local persistence survives store instance replacement', async t => {
    const { call, login, env, dir } = await fixture(t);
    const cookie = await login();
    const data = emptySchedule();
    data.stamps['2026-11-02'] = '🔥';
    await call('schedule', { method: 'PUT', cookie, body: { data, version: 0 } });
    env.STORE = new LocalStore(join(dir, 'state.json'));
    assert.deepEqual((await (await call('schedule')).json()).data, data);
    assert.equal((await call('session', { cookie }).then(r => r.json())).authenticated, true);
});
