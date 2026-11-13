# Todo App Authentication

This app implements passwordless registration and login with WebAuthn passkeys. SQLite stores users, authenticators, and short-lived single-use challenges; signed JWTs are held only in HTTP-only cookies.

## Requirements

- Node.js 22 or newer
- npm
- A browser with WebAuthn support

## Configuration

Copy `.env.example` to `.env.local` and set a unique session secret:

```powershell
Copy-Item .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Set `AUTH_SECRET` to the generated value. `RP_ID` must match the host in `RP_ORIGIN`; use `localhost` and `http://localhost:3000` for local development. Production origins must use HTTPS. `DATABASE_PATH` defaults to `data/auth.sqlite`.

## Run

```powershell
npm install
npm run dev
```

Open `http://localhost:3000/login` to register or log in. A passkey is required; there is no password fallback.

## Checks

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

The Playwright suite uses Chromium's virtual WebAuthn authenticator. The authentication endpoints are `POST /api/auth/register-options`, `POST /api/auth/register-verify`, `POST /api/auth/login-options`, `POST /api/auth/login-verify`, `POST /api/auth/logout`, and `GET /api/auth/me`.

Losing every registered passkey currently has no account recovery path.
