const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = value => Uint8Array.from(
    atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
function equal(a, b) {
    if (a.length !== b.length) return false;
    let different = 0;
    for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
    return different === 0;
}
export async function hashPassword(password, salt = b64(crypto.getRandomValues(new Uint8Array(16)))) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password),
        'PBKDF2', false, ['deriveBits']);
    const result = await crypto.subtle.deriveBits({
        name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: 100000
    }, key, 256);
    return { salt, hash: b64(new Uint8Array(result)) };
}
export async function verifyPassword(password, auth) {
    if (typeof password !== 'string' || password.length > 256) return false;
    const candidate = await hashPassword(password, auth.salt);
    return equal(encoder.encode(candidate.hash), encoder.encode(auth.hash));
}
async function signature(value, secret) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}
export async function createSession(auth, secret) {
    const payload = b64(encoder.encode(JSON.stringify({
        generation: auth.salt, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
    })));
    return `${payload}.${await signature(payload, secret)}`;
}
export async function verifySession(token, auth, secret) {
    try {
        if (!token || token.length > 2048) return false;
        const [payload, sig, extra] = token.split('.');
        if (!payload || !sig || extra) return false;
        if (!equal(encoder.encode(sig), encoder.encode(await signature(payload, secret)))) return false;
        const decoded = JSON.parse(new TextDecoder().decode(unb64(payload)));
        return decoded.generation === auth.salt && decoded.exp > Date.now() / 1000;
    } catch {
        return false;
    }
}
export function cookie(request, value, remove = false) {
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    return `stream_admin=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${remove ? 0 : 28800}${secure}`;
}
export function tokenFrom(request) {
    return request.headers.get('Cookie')?.split(';').map(v => v.trim())
        .find(v => v.startsWith('stream_admin='))?.slice('stream_admin='.length);
}
