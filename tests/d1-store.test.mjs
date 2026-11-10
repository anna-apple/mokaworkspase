import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { D1Store } from '../src/server/d1-store.js';
import { emptySchedule } from '../src/server/model.js';

// Exercise the D1 queries against SQLite; this is not a live Cloudflare integration test.
test('D1 SQL: migration, schedule CAS, credentials, throttling', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(await readFile(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
    const db = {
        prepare(sql) {
            let args = [];
            return {
                bind(...values) { args = values; return this; },
                async first() { return sqlite.prepare(sql).get(...args) || null; },
                async run() {
                    const result = sqlite.prepare(sql).run(...args);
                    return { meta: { changes: Number(result.changes) } };
                }
            };
        }
    };
    const store = new D1Store(db);
    assert.deepEqual(await store.getSchedule(), { data: emptySchedule(), version: 0 });
    assert.equal((await store.putSchedule(emptySchedule(), 0)).version, 1);
    assert.equal(await store.putSchedule(emptySchedule(), 0), null);
    assert.equal(await store.getAuth(), null);
    assert.deepEqual({ ...await store.createAuth({ salt: 'first', hash: 'one' }) },
        { salt: 'first', hash: 'one' });
    await store.createAuth({ salt: 'second', hash: 'two' });
    assert.equal((await store.getAuth()).salt, 'first');
    assert.equal(await store.changeAuth('wrong', { salt: 'new', hash: 'new' }), false);
    assert.equal(await store.changeAuth('one', { salt: 'new', hash: 'new' }), true);
    for (let i = 0; i < 10; i++) assert.equal(await store.allowLogin('ip-test'), true);
    assert.equal(await store.allowLogin('ip-test'), false);
    sqlite.close();
});
