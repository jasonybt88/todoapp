# Todo App

Passwordless WebAuthn sign-in with a SQLite-backed todo list. Todos are isolated
by authenticated user and shown in Overdue, Pending, and Completed sections.
The web UI and CLI share the [Todo API contract](docs/todo-api.md).

## Requirements and setup

- Node.js 22 or newer
- npm
- A browser with WebAuthn support

Copy `.env.example` to `.env.local` and set `AUTH_SECRET` to a unique value with
at least 32 bytes. `RP_ID` and `RP_ORIGIN` must match; use `localhost` and
`http://localhost:3000` for local development. Production origins must use
HTTPS. `DATABASE_PATH` defaults to `data/auth.sqlite`.

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000/login` and register or log in with a passkey. There
is no password fallback.

## Todo API

Routes are `GET/POST /api/todos` and `GET/PUT/DELETE /api/todos/:id`. All
requests use the `auth_session` HTTP-only cookie; todo reads and writes are
scoped to the current session. Due dates are validated server-side and displayed
in Singapore time. Priorities are `high`, `medium`, or `low`; the web list can
filter by priority, and API consumers can use `GET /api/todos?priority=high`.
See [docs/todo-api.md](docs/todo-api.md) for request fields, response shapes,
and error behavior.

## CLI

The CLI calls the same API as the web UI. Set `TODOAPP_URL` when the app is not
running at `http://localhost:3000`, and set `TODOAPP_SESSION_TOKEN` to the value
of your current `auth_session` cookie. Treat that session value as a secret and
never commit or share it.

```powershell
npm run todo -- list
npm run todo -- create "Prepare report" --priority high
npm run todo -- get 12
npm run todo -- update 12 --priority low
npm run todo -- update 12 --completed true
npm run todo -- delete 12
```

## Checks and release

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e
npm run build
npm run build:release
```

Playwright uses Chromium's virtual WebAuthn authenticator. The release script
builds the standalone Next.js app and creates `release/todoapp-standalone.tar.gz`.
`Dockerfile` runs the production standalone server; mount `/app/data` to persist
SQLite and provide `AUTH_SECRET`, `RP_ID`, `RP_ORIGIN`, and `RP_NAME` at runtime.
CI builds the Docker image on feature branches and pull requests without
publishing it. Only pushes to `main` or version tags publish images.

Losing every registered passkey currently has no account recovery path.
