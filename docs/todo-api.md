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

Set `is_recurring` to `true` with a valid `recurrence_pattern` (`daily`,
`weekly`, `monthly`, or `yearly`) and a non-null `due_date` to enable recurrence.
Recurrence dates advance in Singapore local time; monthly and yearly dates clamp
to the last valid day of the target month. Disabling recurrence clears the
pattern for that todo and does not change any already-created occurrence.

## Routes

| Method | Path | Success | Request |
|---|---|---|---|
| `GET` | `/api/todos` | `200 Todo[]` | — |
| `POST` | `/api/todos` | `201 Todo` | `{ title, due_date?, priority?, is_recurring?, recurrence_pattern?, reminder_minutes?, tag_ids? }` |
| `GET` | `/api/todos/:id` | `200 Todo` | — |
| `PUT`  | `/api/todos/:id` | `200 { "todo": Todo, "nextInstance"?: Todo }` | Any supported fields to update |
| `DELETE` | `/api/todos/:id` | `200 { "success": true }` | — |

Creation trims and requires a non-empty title. A creation due date must be valid
and at least one minute in the future when checked by the server. Updates may
move a due date into the past so the item is displayed as overdue. Invalid input
returns `400 { "error": "..." }`. A missing todo or one owned by another user
returns the same `404 { "error": "Todo not found" }`.

When `completed` changes from `false` to `true` on a recurring todo, the same
PUT transaction creates exactly one next instance and returns it as
`nextInstance`. The new todo inherits the title, priority, recurrence pattern,
reminder offset, and tags. Other updates return `{ "todo": Todo }`.

SQLite stores booleans as integers and enables foreign keys at connection
initialization. Deleting a todo therefore cascades to its subtasks and tag links.
