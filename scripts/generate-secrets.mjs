import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('secrets.production.env');
const content = [
    `ADMIN_PASSWORD=${randomBytes(18).toString('base64url')}`,
    `SESSION_SECRET=${randomBytes(48).toString('base64url')}`,
    `PROXY_SECRET=${randomBytes(48).toString('base64url')}`,
    'ALLOWED_ORIGINS=https://YOUR_SITE.pages.dev',
    ''
].join('\n');
try {
    await writeFile(output, content, { flag: 'wx', mode: 0o600 });
    console.log('secrets.production.env を作成しました。ALLOWED_ORIGINSを実際の公開URLへ変更してください。');
    console.log('秘密情報を含むため、GitHubにはアップロードしないでください。');
} catch (error) {
    if (error.code === 'EEXIST') {
        console.log('secrets.production.env は作成済みです。上書きしていません。');
    } else {
        throw error;
    }
}
