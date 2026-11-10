import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const password = randomBytes(18).toString('base64url');
const secret = randomBytes(48).toString('base64url');
try {
    await writeFile('.env',
        `HOST=127.0.0.1\nPORT=3000\nADMIN_PASSWORD=${password}\nSESSION_SECRET=${secret}\n`,
        { flag: 'wx', mode: 0o600 });
    console.log('初期設定を作成しました。管理パスワードは .env の ADMIN_PASSWORD を確認してください。');
    console.log('次に npm run dev を実行してください。');
} catch (error) {
    if (error.code === 'EEXIST') {
        console.log('.env は作成済みです。上書きしていません。');
    } else {
        throw error;
    }
}
