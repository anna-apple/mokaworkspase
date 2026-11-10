import { emptySchedule } from './model.js';

export class D1Store {
    constructor(db) {
        this.db = db;
    }
    async getSchedule() {
        const row = await this.db.prepare('SELECT data, version FROM schedules WHERE id = 1').first();
        return row ? { data: JSON.parse(row.data), version: row.version } :
            { data: emptySchedule(), version: 0 };
    }
    async putSchedule(data, version) {
        const result = await this.db.prepare(
            'UPDATE schedules SET data = ?, version = version + 1 WHERE id = 1 AND version = ?'
        ).bind(JSON.stringify(data), version).run();
        return result.meta.changes === 1 ? { data, version: version + 1 } : null;
    }
    async getAuth() {
        const row = await this.db.prepare('SELECT salt, hash FROM admin_auth WHERE id = 1').first();
        return row || null;
    }
    async createAuth(auth) {
        await this.db.prepare('INSERT OR IGNORE INTO admin_auth (id, salt, hash) VALUES (1, ?, ?)')
            .bind(auth.salt, auth.hash).run();
        return this.getAuth();
    }
    async changeAuth(oldHash, auth) {
        const result = await this.db.prepare(
            'UPDATE admin_auth SET salt = ?, hash = ? WHERE id = 1 AND hash = ?'
        ).bind(auth.salt, auth.hash, oldHash).run();
        return result.meta.changes === 1;
    }
    async allowLogin(ipKey) {
        const window = Math.floor(Date.now() / 900000);
        // An atomic upsert limits even concurrent attempts to 10 per IP per 15-minute window.
        const row = await this.db.prepare(`
            INSERT INTO login_attempts (ip_key, window, attempts) VALUES (?, ?, 1)
            ON CONFLICT(ip_key) DO UPDATE SET
                attempts = CASE WHEN window = excluded.window THEN attempts + 1 ELSE 1 END,
                window = excluded.window
            RETURNING attempts
        `).bind(ipKey, window).first();
        await this.db.prepare('DELETE FROM login_attempts WHERE window < ?').bind(window - 1).run();
        return row.attempts <= 10;
    }
}
