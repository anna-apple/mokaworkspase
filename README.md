# 📅 配信予定表 — Supabase対応版

Cloudflare Pagesで画面を公開し、Supabaseで予定を共有するWebアプリです。
配信者1人が管理パスワードで編集し、リスナーは同じ公開URLから閲覧します。
配信者・リスナー向けの会員登録、メール認証、Supabase Authのユーザー作成は不要です。
サービス管理用のCloudflare・GitHub・Supabaseアカウントは必要です。

## ✅ この版でできること

| 機能 | 内容 |
|---|---|
| 画面 | 元HTMLのカレンダー・配色・ランク計算を維持 |
| 配信時間 | 1日50枠まで、開始・終了とも10分刻みで選択 |
| 配信種類 | 通常・ご新規・お忍び |
| 表示 | `9:00～（通常）` / `9:00～10:00（通常）` |
| 編集 | 管理パスワードで解除。変更後「予定を保存・公開」 |
| 閲覧 | ログイン不要。編集中の情報は保存するまで非公開 |
| 更新 | ページを再読み込み、または表示中に60秒間隔で取得 |
| バックアップ | JSON出力・取込、旧localStorageの取込 |
| パスワード | 初期値をサーバーのSecretで設定。画面から変更可能 |
| 開発 | VS Code＋Node.jsでローカル実行可能 |

> 無料枠の利用を想定しますが、永久・無制限の無料運用を保証しません。
> Cloudflare Pages FunctionsとSupabase Database / Edge Functionsの上限、
> 無料プロジェクトの一時停止条件を開始時に確認してください。

## 🧩 構成

1. ブラウザはCloudflare Pagesの画面と同じURLの `/api/` に通信します。
2. Pages Functionsが、サーバー間の秘密値を付けてSupabase Edge Functionsへ中継します。
3. Edge Functionsが管理パスワード・編集用Cookieを確認します。
4. Supabase Databaseの予定を読み書きします。
5. ブラウザにデータベース管理キーや中継用の秘密値は渡しません。

中継を設ける理由は、ブラウザに秘密値を置かず、同じサイトのHttpOnly Cookieで
管理者セッションを扱うためです。Cloudflare D1は使いません。
公開読み込みもサーバー経由なので、anon / publishable keyもHTMLには不要です。

| 用途 | URL例 |
|---|---|
| リスナー用 | https://YOUR_SITE.pages.dev/ |
| 配信者用 | https://YOUR_SITE.pages.dev/?admin=1 |
| Supabase関数 | https://PROJECT_REF.supabase.co/functions/v1/schedule-api |

関数URLはリスナーに渡すURLではありません。直接呼び出しは中継用Secretで拒否します。

## 🚀 A. PC内で試す

必要：Node.js 22.13以降のLTS版（24 LTSも可）、VS Code。
Node.js公式：https://nodejs.org/

ZIPを解凍し、`package.json` があるフォルダをVS Codeで開きます。
「ターミナル → 新しいターミナル」で実行します。

```sh
npm run setup
npm run dev
```

ローカル実行に `npm install` は不要です。
生成された `.env` の `ADMIN_PASSWORD=` の右側が初回の管理パスワードです。
このファイルは他人に渡したりGitHubに登録したりしないでください。

| 用途 | PC内のURL |
|---|---|
| リスナー用 | http://localhost:3000/ |
| 管理用 | http://localhost:3000/?admin=1 |

管理画面で解除し、予定を登録して「予定を保存・公開」を押します。
別ブラウザでリスナー用URLを開くと保存内容が確認できます。
停止はターミナルで `Ctrl+C` です。

> ローカル動作は `data/local.json` への保存です。Supabaseには接続しません。
> `localhost` は他人に渡せるURLではありません。
> 以下の本番設定が完了するまで、インターネット経由の共有はできません。
> HTMLのダブルクリックやLive ServerだけではAPIは動作しません。

## 🐙 B. GitHubのプロジェクトを更新

以前のD1版を登録している場合、このZIPの内容へ置き換えます。

1. ローカルの旧プロジェクトをバックアップします。
2. 同じGitHubリポジトリのソースを、この版の内容に更新します。
3. リポジトリ直下に次のファイル・フォルダが並ぶ状態にします。

```text
package.json
wrangler.toml
public/
functions/
supabase/
src/
scripts/
tests/
```

ZIPの外側のフォルダをそのまま入れて、さらに1階層深くしないように注意してください。
古いルートの `migrations/`、`src/server/d1-store.js`、
`tests/d1-store.test.mjs` はこの版では不要です。

> GitHubに登録しないもの：
> `.env`、`.dev.vars`、`secrets.production.env`、`data/`、
> `node_modules/`、`.wrangler/`、`supabase/.temp/`。
> `.gitignore` を同梱していますが、すでに追跡済みの秘密ファイルは自動除外されません。
> 万一公開した場合は、ファイル削除だけでなく該当する秘密値を変更してください。

## ☁️ C. Cloudflare PagesをGitHub連携する

すでにGit連携済みなら、そのプロジェクトを利用できます。
手動アップロード型の既存サイトをGit連携型へ切り替えることはできないため、
その場合は新しいPagesプロジェクトを作ります。通常はURLが変わります。

Cloudflareの「Workers & Pages」からPagesの作成・Git接続を選び、
今回のリポジトリを指定します。Workersの作成画面ではなくPagesを選んでください。

| 設定 | 内容 |
|---|---|
| プロジェクト名 | 希望する名前 |
| 本番ブランチ | 通常はmain。実際のブランチに合わせる |
| フレームワーク | None／なし |
| ビルドコマンド | 空欄 |
| 出力ディレクトリ | public |
| ルートディレクトリ | package.jsonが直下なら空欄 |

`wrangler.toml` の `name` をPagesのプロジェクト名に合わせ、コミットします。
古い設定のD1バインディングはこのファイルでは不要です。
初回公開時は未設定のため予定読み込みエラーになりますが、この後の設定で解消します。

公開URL（例：`https://YOUR_SITE.pages.dev`）を控えます。
以降の `YOUR_SITE` は自分のURLに置き換え、文字どおり入力しないでください。

> Pagesのフォルダ手動アップロードではFunctionsが配備されません。
> Git連携で配備するか、Wranglerを利用してください。

## 🗃️ D. Supabaseにテーブルを作る

1. Supabaseの作成済みプロジェクトを開きます。
2. 左メニューの「SQL Editor」で新規クエリを開きます。
3. このプロジェクトの
   `supabase/migrations/202607010001_schedule.sql`
   を開き、内容をすべてコピーします。
4. SQL Editorに貼り付けて実行します。

以下の3つが作成されます。

| テーブル | 用途 |
|---|---|
| ss_schedules | 配信予定全体を1件にまとめて保存 |
| ss_admin_auth | 管理パスワードのsalt・ハッシュ |
| ss_login_attempts | IPのハッシュごとのログイン試行制限 |

`ss_schedules` にidが1の行があり、dataが空の予定データになっていれば初期化完了です。
RLSと権限をSQLで設定するため、ブラウザ用の公開権限は追加しないでください。
anon / authenticatedからテーブルや専用RPCを直接操作することはできません。
service_roleだけに許可し、Edge Functionsから使用します。

> 以前の案内で作成した `stream_schedule` テーブルやSupabase Authのユーザーは
> この版では使用しません。SQLはそれらを削除・移行しません。
> 旧テーブルに閲覧許可がある場合は、非公開情報を置かず、
> 必要なバックアップの後にそのアクセス権を見直してください。
> 新版の管理パスワードは旧Supabase Authユーザーとは別です。

## 🔐 E. 本番用の秘密値を作る

VS Codeのターミナルで実行します。

```sh
npm run secrets:generate
```

`secrets.production.env` が作成されます。内容は以下です。

| 名前 | 役割 |
|---|---|
| ADMIN_PASSWORD | 本番の初回管理パスワード |
| SESSION_SECRET | 管理セッションの署名用秘密値 |
| PROXY_SECRET | CloudflareからSupabaseへの中継確認用秘密値 |
| ALLOWED_ORIGINS | 接続を許可する公開サイトのURL |

`ALLOWED_ORIGINS` を、Cで確認したURLに変更してください。

例：`ALLOWED_ORIGINS=https://my-schedule.pages.dev`

- 最後に `/` を付けません。
- `/?admin=1` も付けません。
- 独自ドメインも許可する場合はカンマで並べます。
- 例：`https://my-schedule.pages.dev,https://schedule.example.com`
- プレビューURLは自動では許可しません。

**このファイルはGitHubに登録しません。** 手元の安全な場所に保管してください。
既存ファイルがあるとコマンドは上書きしません。
ローカル用 `.env` と本番用の値は別です。

## ⚙️ F. SupabaseのSecret・Edge Functionsを配置する

この手順はVS Codeのターミナルから行います。
初回はSupabase CLIのダウンロード許可などが表示される場合があります。

### 1. Supabase CLIでログイン

```sh
npx supabase@latest login
```

ブラウザ等の案内に従ってログインします。
CLI用アクセストークンを求められた場合はSupabaseの個人設定から発行し、
手元のターミナルにだけ入力してください。ソースやチャットには書きません。

### 2. Project Refを確認

SupabaseのProject SettingsのGeneralなどでProject Ref / Reference IDを確認します。
通常、Project URL `https://PROJECT_REF.supabase.co` の該当部分です。
Database Passwordや管理キーではありません。

### 3. Secretを登録

以下の `YOUR_PROJECT_REF` を自分のProject Refに置き換えて実行します。

```sh
npx supabase@latest secrets set --env-file secrets.production.env --project-ref YOUR_PROJECT_REF
```

これでEで作成した4つの設定値をSupabase側に登録します。
`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は、
ホスト型SupabaseのEdge Functionsに用意される環境変数を利用します。
管理キーを自分でHTMLに書く必要はありません。

### 4. 関数を公開

```sh
npx supabase@latest functions deploy schedule-api --project-ref YOUR_PROJECT_REF --no-verify-jwt --use-api
```

`supabase/functions/schedule-api/index.ts` と `_shared/` の処理が配備されます。
`--use-api` はサーバー側でバンドルする指定で、この公開手順ではDockerを不要にします。
公開した関数のURLは次の形式です。

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/schedule-api`

> `--no-verify-jwt` はSupabase Authのログインを要求しないための指定です。
> 認証処理がないわけではありません。関数自身が `PROXY_SECRET` を検証し、
> 更新時はさらに管理者セッションを確認します。
> Secret未設定や不一致の場合は処理を拒否します。
> `PROXY_SECRET` をフロントエンドへ埋め込まないでください。

## 🔗 G. Cloudflare側に接続情報を設定

Pagesプロジェクトの「Settings → Variables and Secrets」などを開き、
**本番環境**に以下を登録します。

| 名前 | 種類 | 設定値 |
|---|---|---|
| SUPABASE_EDGE_URL | 通常の変数でもSecretでも可 | Fの関数URL |
| PROXY_SECRET | Secret | Eの `PROXY_SECRET` と完全に同じ値 |

`ADMIN_PASSWORD` と `SESSION_SECRET` はSupabase側だけに設定します。
Cloudflare側へ設定し直す必要はありません。
旧D1版で設定した値が残っていても、この版のPages中継では使いません。

設定保存後、Pagesの最新デプロイを再実行してください。
GitHubに変更をコミットして新規デプロイしても構いません。
設定の追加だけでは既存デプロイに反映されない場合があります。

## ✅ H. 端末間の共有を確認

1. `https://YOUR_SITE.pages.dev/?admin=1` を開きます。
2. 「ロック解除」を押し、Eの `ADMIN_PASSWORD` の値を入力します。
3. 日付を選び、配信時間と種類を登録します。
4. **「予定を保存・公開」** を押し、「保存・公開しました。」を確認します。
5. 別のスマートフォンやシークレットウィンドウで
   `https://YOUR_SITE.pages.dev/` を開きます。
6. 同じ予定が表示され、編集操作ができないことを確認します。

リスナーには末尾の `?admin=1` がないURLを渡します。
管理URLが知られても、パスワードとサーバー側の権限確認で編集を制限します。
SupabaseのTable Editorで `ss_schedules` のdata / versionが変われば保存されています。

## 💾 既存予定の取り込み

### 旧HTMLと同じURLで公開できる場合

以前登録した端末・ブラウザから新版の管理ページを開き、
「このブラウザの旧データを取込」→内容確認→「予定を保存・公開」を実行します。

- 元のlocalStorageは削除しません。
- 旧パスワード `rank_pw` は取り込みません。
- 以前の1分刻みの時刻は保持します。新しく選ぶ時刻は10分刻みです。
- PC内のローカルデータを本番へ自動同期することはありません。

### URLやブラウザが変わる場合

バックアップJSONがある場合、管理画面の「JSON取込」で取り込みます。
このアプリでは「JSON出力」で書き出せます。
旧HTMLをダブルクリックした `file://` や別URLのlocalStorageは、
新しいURLから直接読めません。旧環境での別途データ出力が必要です。

> JSON取込は予定全体を置き換えます。先に現状をJSON出力してください。
> 保存・公開するまでは取込結果は画面内だけです。

## 🔑 管理パスワードの変更・復旧

通常の変更は管理画面の新パスワード欄と「変更」ボタンを使います。
12〜256文字で、現在のパスワード確認が必要です。
変更後は既存セッションが無効になり、新しいパスワードで解除します。

画面から変更後は、Eの `ADMIN_PASSWORD` は現在値ではなく初期化用の値になります。
Supabaseの保存済み認証ハッシュが優先されます。

忘れた場合は次の順に復旧します。

1. Supabaseの `ADMIN_PASSWORD` Secretを新しい強力な値に更新します。
2. Secretの反映後、Supabase SQL Editorで以下を実行します。

```sql
delete from public.ss_admin_auth where id = 1;
```

3. 次のログイン時に新しい初期パスワードがハッシュ化されて登録されます。

`ss_schedules` は削除しないでください。復旧中は同時に画面を操作しないでください。
ローカル環境の復旧は、サーバーを停止して `data/local.json` をバックアップし、
中の `auth` だけを `null` にします。

## 🧪 テストと確認範囲

```sh
npm test
```

15件の自動テストで以下を確認しています。

- 公開読み込み、未認証書き込みの拒否
- パスワード変更、既存セッション無効化、Cookie属性
- ログイン回数制限、CSRF対策、JSON形式・サイズの検証
- 同時編集時の競合検出、ローカル永続化
- 終了時間がなくても「～」を表示、10分刻みの選択肢と3種類
- Supabase REST RPCの呼び出し形式（モック）
- Pages中継とEdge関数の接続・Secret確認・許可URL検証（モック）

> 実際のSupabase PostgreSQLへのSQL適用、Edge Functionsの配備、
> Cloudflare本番配備、実ブラウザの画面操作はこの作成環境では未検証です。
> 各サービスの設定・仕様変更により調整が必要な場合があります。
> 設定後は必ずHの手順で確認してください。

## 🛠️ よくあるエラー

| 表示・症状 | 確認箇所 |
|---|---|
| Cloudflareの接続設定が未完了 | 本番のSUPABASE_EDGE_URL / PROXY_SECRETを登録し再デプロイ |
| このエンドポイントへの直接アクセスは許可されていない | CloudflareとSupabaseのPROXY_SECRETが一致しているか |
| 公開URLが許可リストに設定されていない | ALLOWED_ORIGINSが実際のoriginと完全一致するか。末尾スラッシュ不要 |
| Invalid JWT / Missing authorization header | 関数のJWT検証が無効か。Fのコマンドで再配備 |
| サーバー処理に失敗 | SQL実行、テーブルとRPC、Supabase関数のログを確認 |
| 関数が見つからない | schedule-apiという名前でデプロイ済みか、関数URLが正しいか |
| データがローカルにしかない | localhostと本番は別保存先。JSON出力・取込で移行 |
| 別画面で予定が更新された | 未保存分をJSON出力し、再読み込み後に変更を反映 |
| ログイン試行が多すぎる | 15分ほど待つ。IP単位・15分枠ごとに10回の制限 |
| Supabaseに接続できない | 無料プロジェクトの一時停止、関数の稼働状態・ログ、設定値を確認 |

ログやスクリーンショットを共有する場合は、パスワード・キー・Cookieを必ず隠してください。

## 📂 主なファイル

| パス | 内容 |
|---|---|
| public/ | カレンダー画面・スタイル・画面操作 |
| functions/api/[[path]].js | Cloudflare Pagesの安全なAPI中継 |
| supabase/functions/schedule-api/index.ts | Edge Functionsの入口 |
| supabase/functions/_shared/ | 認証・保存API・Supabase接続 |
| supabase/migrations/202607010001_schedule.sql | テーブル・RLS・サーバー用RPC |
| supabase/config.toml | 関数の設定 |
| scripts/ | ローカル起動・秘密値生成 |
| src/server/ | ローカル用保存と共通処理の再エクスポート |
| tests/ | 自動テスト |
| .vscode/ | VS Codeのタスク・起動設定 |

## ⚠️ 運用上の注意

- 全ての配信予定・スタンプ・ランク情報は公開対象です。秘密情報や個人情報は登録しません。
- Supabaseのservice_roleキーはRLSを迂回する強力な管理キーです。
  ブラウザ・GitHub・チャットに出さず、Edgeの環境変数内だけで使います。
- アプリに会員登録は不要ですが、サービス管理アカウントには多要素認証を推奨します。
- パスワードはPBKDF2でハッシュ化し、認証CookieはHttpOnly / SameSite=Strict、
  本番HTTPSではSecure属性を付けます。有効期間は8時間です。
- 公開ページは表示中60秒ごとに読み込みます。人数が増えるとAPI回数・通信量に影響します。
- 保存に失敗した場合は成功表示をせず、画面内の変更を残します。
- 大規模攻撃への防御やセキュリティ監査済みという保証ではありません。
  必要に応じて追加のアクセス制限・レート制限・監視を導入してください。
- ローカルJSON保存は開発用・単一プロセス用です。本番ではSupabaseを利用します。
- 元HTMLのランク計算は維持しています。月をまたぐ自動繰越機能は追加していません。
- 定期的に予定をJSON出力してバックアップしてください。

## 🔗 公式ドキュメント

画面名・提供条件・CLIの動作が異なる場合は最新情報を確認してください。

- Supabase Edge Functions：https://supabase.com/docs/guides/functions
- Supabase Secrets：https://supabase.com/docs/guides/functions/secrets
- Supabase RLS：https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase CLI：https://supabase.com/docs/reference/cli/introduction
- Supabase料金：https://supabase.com/pricing
- Cloudflare Pages Git連携：https://developers.cloudflare.com/pages/configuration/git-integration/
- Pages Functions：https://developers.cloudflare.com/pages/functions/
- Pages設定：https://developers.cloudflare.com/pages/functions/wrangler-configuration/
