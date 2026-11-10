import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { emptySchedule } from './model.js';

export class LocalStore {
    constructor(file) {
        this.file = file;
        this.queue = Promise.resolve();
    }
    async transaction(callback) {
        const pending = this.queue.then(async () => {
            let state;
            try {
                state = JSON.parse(await readFile(this.file, 'utf8'));
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
                state = {
                    schedule: { data: emptySchedule(), version: 0 },
                    auth: null, attempts: {}
                };
            }
            const result = await callback(state);
            await mkdir(dirname(this.file), { recursive: true });
            await writeFile(this.file + '.tmp', JSON.stringify(state), { mode: 0o600 });
            await rename(this.file + '.tmp', this.file);
            return structuredClone(result);
        });
        this.queue = pending.catch(() => {});
        return pending;
    }
    getSchedule() {
        return this.transaction(state => state.schedule);
    }
    putSchedule(data, version) {
        return this.transaction(state => {
            if (state.schedule.version !== version) return null;
            state.schedule = { data, version: version + 1 };
            return state.schedule;
        });
    }
    getAuth() {
        return this.transaction(state => state.auth);
    }
    createAuth(auth) {
        return this.transaction(state => state.auth ||= auth);
    }
    changeAuth(oldHash, auth) {
        return this.transaction(state => {
            if (state.auth?.hash !== oldHash) return false;
            state.auth = auth;
            return true;
        });
    }
    allowLogin(ipKey) {
        return this.transaction(state => {
            const window = Math.floor(Date.now() / 900000);
            for (const [key, value] of Object.entries(state.attempts)) {
                if (value.window < window - 1) delete state.attempts[key];
            }
            const entry = state.attempts[ipKey];
            state.attempts[ipKey] = entry?.window === window ?
                { window, count: entry.count + 1 } : { window, count: 1 };
            return state.attempts[ipKey].count <= 10;
        });
    }
}
