# Email Studio
A self-hosted developer email IDE. Write HTML/CSS in a CodeMirror editor, preview responsive layouts, convert to email-safe HTML, and send via Gmail OAuth or any SMTP provider — all from the browser.

> **A note on AI use:** Vibe-coded, but with full human intervention. AI was used
> throughout the development of this project as a tool to speed up programming,
> debugging, and development. However, the project was not created from a single
> prompt or generated entirely by AI. Every major feature, implementation, design
> decision, and modification was reviewed, tested, and directed by a human. AI was
> utilized as a development assistant—not as a replacement for the developer.

- Node.js + Express + SQLite (better-sqlite3)
- Vanilla JS frontend (no React), CodeMirror 6 editor
- Email conversion pipeline (sanitize -> inline CSS -> flex-to-table -> hardening)
- Compatibility analysis with guidance for Gmail / Outlook / Apple Mail / Yahoo
- Gmail OAuth 2.0 (never Gmail passwords) or SMTP credentials, both encrypted at rest
- Docker-ready, data persisted under `./data`


## Features

- Code editor with autocomplete, linting and Prettier formatting
- Visual editor with a property inspector and undo/redo
- Responsive preview (desktop 600px / mobile 375px) in a sandboxed iframe
- Convert HTML/CSS to email-safe HTML, then download or send it
- Export any project as a ZIP bundle (standalone `index.html`, `project.json` and referenced images) or as a single HTML file
- Asset library (images only) for campaigns
- 6 starter templates: Blank, Welcome, Newsletter, Product Announcement, Transactional, Notification
- Send history, accounts, general / security / storage settings
- Multi-project workspace with duplicate support

## Quick start with Docker

1. Copy the environment file and set at least `SESSION_SECRET`:

   ```bash
   cp .env.example .env
   ```

   Generate secrets:

   ```bash
   node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
   node -e "console.log('APP_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
   ```

   Put the generated values in `.env`. `APP_ENCRYPTION_KEY` is optional; if empty, a key is auto-generated under `data/keys/`.

2. Build and start:

   ```bash
   docker compose up -d --build
   ```

3. Open `http://localhost:3000` and complete the first-run setup (create the admin account).

The `./data` directory is mounted into the container and holds the SQLite database, uploaded assets and keys. Back it up to preserve everything.

### Run without Docker

```bash
npm install
cp .env.example .env   # edit secrets
npm start              # or: node server.js
```

Requires Node.js 20+.

## First run

1. Visit the app in a browser.
2. The setup screen creates the first (admin) account: username + password.
3. Add an email account under **Settings > Accounts** (Gmail or SMTP) before sending.
4. Open a project, edit HTML/CSS, use **Convert** to generate email-safe HTML, then **Send**.

## Gmail OAuth setup (recommended)

Email Studio uses Google OAuth 2.0 and requests only `gmail.send` plus profile email scopes. Your Gmail password is never requested or stored.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create/select a project.
2. Enable the **Gmail API**.
3. Under **APIs & Services > Credentials**, create an OAuth client ID of type **Web application**.
4. Add an **Authorized redirect URI** that exactly matches `GOOGLE_REDIRECT_URI` (default `http://localhost:3000/oauth/callback`; use your public HTTPS URL when behind a reverse proxy).
5. Fill in the environment variables:

   ```env
   PUBLIC_BASE_URL=https://mail.example.com
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxx
   GOOGLE_REDIRECT_URI=https://mail.example.com/oauth/callback
   ```

6. Restart, then in **Settings > Accounts** click **Connect Gmail** and authorize.

Tokens (refresh + access) are stored encrypted. Access tokens auto-refresh; if a refresh token becomes invalid, sends return `GMAIL_AUTH_EXPIRED` and the UI prompts you to reconnect.

## SMTP accounts

You can send through any SMTP provider (SendGrid, Mailgun, Postmark, Amazon SES SMTP, self-hosted, ...):

- **Host / Port** — the SMTP server and port (e.g. `smtp.postmarkapp.com:587`).
- **Encryption** — `none` (plain), `tls` (STARTTLS, opportunistic), or `ssl` (implicit TLS, e.g. 465).
- **Username / password** — optional; leave blank for open relays.

Connections are verified with `Verify` before saving. Credentials are stored AES-256-GCM encrypted.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `DATA_DIR` | `./data` | Persistent data directory |
| `SESSION_SECRET` | dev placeholder | Session signing secret; **must** be changed in production |
| `APP_ENCRYPTION_KEY` | auto-generated | 32-byte hex key for encrypting stored credentials |
| `PUBLIC_BASE_URL` | `` | Base URL of this instance (OAuth redirects, asset links) |
| `COOKIE_SECURE` | `false` | Set `true` when serving over HTTPS |
| `TRUST_PROXY` | `true` | Trust `X-Forwarded-*` headers (needed behind a reverse proxy) |
| `SESSION_TTL_MS` | 7 days | Session lifetime |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | empty | Gmail OAuth credentials |
| `CONVERT_INLINE_ASSETS` | `false` | Inline small images as base64 during conversion |
| `MAX_UPLOAD_BYTES` | `5242880` | Max upload size for images (5 MiB) |
| `ASSET_MIME_TYPES` | image/* allowlist | Comma-separated allowed upload MIME types |
| `APP_NAME` | `Email Studio` | Display name |
| `SMTP_TEST_PORT` | `2525` | Port used by the dev SMTP sink in tests |

## Backups

Everything lives under `DATA_DIR` (`./data`):

- `app.db` — SQLite database (users, projects, accounts, history, settings, sessions)
- `assets/` — uploaded images
- `keys/` — auto-generated encryption key (back this up too, or encrypted credentials cannot be decrypted)

Back up the whole directory. Example:

```bash
tar czf email-studio-backup.tar.gz data
```

Restore by placing the archive contents back at `./data` and restarting.

## Security notes

- Passwords hashed with bcrypt (12 rounds); login rate-limited.
- Sessions are server-side (SQLite store), HTTP-only cookies, SameSite=Lax; CSRF tokens required for state-changing requests.
- OAuth/SMTP credentials encrypted at rest (AES-256-GCM); raw values are never returned by the API.
- Only image MIME types can be uploaded, with size limits; assets are served as `Content-Disposition: inline` with a strict content type.
- Preview iframes are sandboxed (no scripts, no same-origin), and the conversion pipeline strips `<script>`, event handlers and `javascript:` URLs. Dangerous SVG is rejected.
- HTTP security headers set by Helmet. Never expose this app to the public internet without HTTPS and a strong `SESSION_SECRET`.

## Troubleshooting

**I get "Gmail OAuth is not configured".**
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are not set. Fill them in and restart.

**OAuth callback says "redirect_uri_mismatch".**
The authorized redirect URI in Google Cloud must exactly equal `GOOGLE_REDIRECT_URI`, including protocol and trailing path.

**Sends fail with `GMAIL_AUTH_EXPIRED`.**
The stored refresh token is invalid/expired. Delete the account and reconnect Gmail.

**SMTP verification fails with "self signed certificate" / "SSL" errors.**
Try `tls` (STARTTLS) instead of `ssl`, or `none` only if the server supports plain connections.

**`better-sqlite3` fails to build on install.**
Ensure a C++ toolchain is available (`python3 make g++`), or use the Docker image which handles this.

**Nothing persists after a restart.**
Make sure `DATA_DIR` is stable (Docker: mount `./data:/app/data`).

**Rate limit reached.**
The API limiter allows 300 requests/min and 30 sends/hour. Wait or restart to clear counters (counters are in-memory).

## Development

```bash
npm run build      # bundle the client (esbuild) into public/app.js + app.css
npm test           # unit tests (validators, conversion, rate limiting)
npm start          # run the server
```

The unit test suite covers the SSRF guard on SMTP hosts, email validation, conversion
sanitization/inlining and the login rate limiter (self-booted on an ephemeral port).

For the end-to-end test, start the server first, then run it separately:

```bash
npm start &
node test/e2e.mjs   # exercises setup, auth, CSRF, projects, assets, conversion, SMTP send, history, templates, settings
```

The e2e test sends against a local in-process SMTP sink on port 2525.

## Project layout

```
server.js               entry point, security headers, session, routing
src/config.js           env-driven configuration + data directory bootstrap
src/db.js               SQLite schema + connection (WAL)
src/crypto.js           AES-256-GCM helpers, key management
src/middleware.js       auth, CSRF, rate limiters, error handling
src/session-store.js    SQLite-backed express-session store
src/validators.js       input validation helpers
src/routes/             HTTP endpoints (auth, projects, convert, send, accounts, assets, templates, history, settings, oauth, health)
src/services/           business logic (Project, Template, Asset, History, Conversion, Compatibility, Account, OAuth, Email, Settings, Storage)
client/                 vanilla JS frontend, esbuild build script, styles
public/                 built assets + SPA shell
test/                   e2e test suite
```

## License

MIT.
