export class SupabaseStore {
    constructor(url, serviceKey, fetcher = fetch) {
        if (!url || !serviceKey) throw new Error('Supabase server configuration missing');
        const base = new URL(url);
        if (base.protocol !== 'https:' || base.pathname !== '/') {
            throw new Error('Supabase URL must be the HTTPS project URL');
        }
        this.base = base.origin;
        this.key = serviceKey;
        this.fetcher = fetcher;
    }
    async rpc(name, args = {}) {
        const response = await this.fetcher(`${this.base}/rest/v1/rpc/${name}`, {
            method: 'POST',
            headers: {
                apikey: this.key,
                Authorization: `Bearer ${this.key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(args),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
            // Do not leak database errors, credentials, or auth hashes to clients.
            throw new Error(`Supabase RPC failed (${response.status})`);
        }
        return response.json();
    }
    getSchedule() {
        return this.rpc('ss_get_schedule');
    }
    putSchedule(data, version) {
        return this.rpc('ss_put_schedule', { p_data: data, p_version: version });
    }
    getAuth() {
        return this.rpc('ss_get_auth');
    }
    createAuth(auth) {
        return this.rpc('ss_create_auth', { p_salt: auth.salt, p_hash: auth.hash });
    }
    changeAuth(oldHash, auth) {
        return this.rpc('ss_change_auth', {
            p_old_hash: oldHash, p_salt: auth.salt, p_hash: auth.hash
        });
    }
    allowLogin(ipKey) {
        return this.rpc('ss_allow_login', { p_ip_key: ipKey });
    }
}
