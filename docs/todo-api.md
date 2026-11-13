# Todo API contract

The browser and CLI use the same JSON API. Every route requires the existing
`auth_session` HTTP-only cookie created by passkey authentication. Unauthenticated
requests receive `401 { "error": "Not authenticated" }`.

## Todo shape

```json
{
  "id": 12,
  "user_id": 3,
  "title": "Prepare report",
  "completed": false,
  "due_date": "2026-11-14T02:00:00.000Z",
  "priority": "medium",
  "is_recurring": false,
  "recurrence_pattern": null,
  "reminder_minutes": null,
  "last_notification_sent": null,
  "created_at": "2026-11-13 07:00:00",
  "updated_at": null,
  "subtasks": [],
  "tags": []
}
```

`due_date` is an ISO 8601 timestamp. A timestamp without an offset is interpreted
as Singapore local time (`Asia/Singapore`); responses use UTC ISO timestamps.
`priority` is `high`, `medium`, or `low`. Creation also accepts optional
`is_recurring`, `recurrence_pattern`, `reminder_minutes`, and `tag_ids` fields for
the dependent features. Updates accept any of those fields plus `completed`.
Subtask creation and tag management have separate feature contracts.

## Routes

| Method | Path | Success | Request |
|---|---|---|---|
| `GET` | `/api/todos` | `200 Todo[]` | Optional `?priority=high|medium|low` |
| `POST` | `/api/todos` | `201 Todo` | `{ title, due_date?, priority?, is_recurring?, recurrence_pattern?, reminder_minutes?, tag_ids? }` |
| `GET` | `/api/todos/:id` | `200 Todo` | — |
| `PUT` | `/api/todos/:id` | `200 Todo` | Any supported fields to update |
| `DELETE` | `/api/todos/:id` | `200 { "success": true }` | — |

Creation trims and requires a non-empty title. A missing or `null` priority on
creation defaults to `medium`; otherwise it must be `high`, `medium`, or `low`.
Updates preserve priority when the field is omitted and reject `null` or any
other value. The list endpoint filters by a supplied priority and rejects an
unknown priority with `400`.

A creation due date must be valid and at least one minute in the future when
checked by the server. Updates may move a due date into the past so the item is
displayed as overdue. Invalid input returns `400 { "error": "..." }`. A missing
todo or one owned by another user returns the same
`404 { "error": "Todo not found" }`.

SQLite stores booleans as integers and enables foreign keys at connection
initialization. Deleting a todo therefore cascades to its subtasks and tag links.
