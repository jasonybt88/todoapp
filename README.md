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

## Calendar

The authenticated `/calendar` page shows due-dated todos by Singapore-local
date, with priority colors, a day-detail dialog, and public holidays for 2025
through 2027. The holiday list is seeded automatically when the SQLite database is
initialized; it can also be refreshed with `npm run seed:holidays`. The dates
are based on Singapore's [Ministry of Manpower public holiday calendar](https://www.mom.gov.sg/employment-practices/public-holidays)
and should be reviewed when new years are announced.

## Reminders

Set a due date to choose a reminder, then use **Enable Notifications** to grant
browser permission. Reminders are checked every 30 seconds while an app tab is
open, including overdue reminders. They do not work with the browser closed;
multiple tabs can occasionally produce duplicate notifications.

Expand **Subtasks** on any todo to add and check off individual steps. The
progress bar remains visible when collapsed. Parent and subtask completion are
independent. The search field matches both todo and subtask titles.

## Backups

Use **Export JSON** for a versioned backup that can be imported later, or
**Export CSV** for spreadsheet analysis. JSON backups include todos, subtasks,
and tag associations; imports assign new IDs, reuse tags by case-insensitive
name, and create new todos rather than merging with existing ones. CSV files are
one-way exports and cannot be imported.

Search and quick priority and tag filters combine with the Advanced completion
and Singapore-local due-date filters. Save a named filter in Advanced to reuse
it in the same browser; saved filters are not synced across devices. The tag
picker currently lists tags attached to loaded todos; tag management is not yet
available. If a saved tag is unavailable, applying its preset uses all tags.

## Todo API

Routes are `GET/POST /api/todos`, `GET/PUT/DELETE /api/todos/:id`, and
`GET /api/holidays`. All
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
npm run todo -- create "Pay rent" --due-date 2026-12-01T01:00:00.000Z --repeat monthly
npm run todo -- get 12
npm run todo -- update 12 --priority low
npm run todo -- update 12 --completed true
npm run todo -- update 12 --no-repeat
npm run todo -- delete 12
npm run todo -- tags list
npm run todo -- tags create "Work" --color "#3B82F6"
npm run todo -- tags update 5 --name "Projects" --color "#123456"
npm run todo -- tags attach 12 5
npm run todo -- tags detach 12 5
npm run todo -- tags delete 5
```

Recurring todos require a due date and one of `daily`, `weekly`, `monthly`, or
`yearly`. Completing one creates its next occurrence.

Tags are user-scoped, can be assigned in multiples to a todo, and can be
managed from **Manage Tags** in the web dashboard. Deleting a tag removes its
todo associations; the CLI and web UI use the same tag API.

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
