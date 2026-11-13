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
  "tags": [
    {
      "id": 5,
      "user_id": 3,
      "name": "Work",
      "color": "#3B82F6",
      "created_at": "2026-11-13 07:00:00"
    }
  ]
}
```

`due_date` is an ISO 8601 timestamp. A timestamp without an offset is interpreted
as Singapore local time (`Asia/Singapore`); responses use UTC ISO timestamps.
`priority` is `high`, `medium`, or `low`. Creation also accepts optional
`is_recurring`, `recurrence_pattern`, `reminder_minutes`, and `tag_ids` fields.
`tags` contains the live tag records attached to the todo. Todo creation accepts
`tag_ids`; todo updates replace all tag associations when `tag_ids` is supplied
and preserve them when it is omitted. Updates also accept `completed` and
`last_notification_sent`.
Reminder minutes must be one of `15`, `30`, `60`, `120`, `1440`, `2880`, or
`10080`, and require a due date. Changing the due date or reminder resets the
notification timestamp. Mark a displayed notification separately using an
ISO timestamp with a timezone offset.
For race-safe delivery marking, send only `last_notification_sent` and
`notification_snapshot: { due_date, reminder_minutes }`, using the values
returned by the check endpoint. The update returns `409` if the reminder was
changed, completed, or already marked since the check.
Subtask creation and tag management have separate feature contracts.

## Routes

| Method | Path | Success | Request |
|---|---|---|---|
| `GET` | `/api/todos` | `200 Todo[]` | Optional `?priority=high|medium|low` |
| `POST` | `/api/todos` | `201 Todo` | `{ title, due_date?, priority?, is_recurring?, recurrence_pattern?, reminder_minutes?, tag_ids? }` |
| `GET` | `/api/todos/:id` | `200 Todo` | — |
| `PUT` | `/api/todos/:id` | `200 Todo` | Any supported fields to update |
| `DELETE` | `/api/todos/:id` | `200 { "success": true }` | — |
| `GET` | `/api/tags` | `200 Tag[]` | Current user's tags |
| `POST` | `/api/tags` | `201 Tag` | `{ name, color? }` |
| `PUT` | `/api/tags/:id` | `200 Tag` | `{ name?, color? }` |
| `DELETE` | `/api/tags/:id` | `200 { "success": true }` | Deletes tag links by cascade |
| `POST` | `/api/todos/:id/tags` | `200 Todo` | `{ tag_id }`; idempotent attach |
| `DELETE` | `/api/todos/:id/tags` | `200 Todo` | `{ tag_id }`; idempotent detach |
| `GET` | `/api/notifications/check` | `200 { "success": true, "data": Todo[] }` | — |

Tag names are trimmed and must not be empty. Names are unique per user; a
duplicate returns `409`. Colors default to `#3B82F6` on creation and otherwise
must be six-digit `#RRGGBB` hex values. Tag routes require authentication,
scope tags and todo links to the current user, return `404` for inaccessible
records, and return `400` for invalid fields. Tag deletion cascades to its
`todo_tags` rows. Tag names/colors are loaded live into `Todo.tags`, so edits
are reflected without rewriting todo records. Tag pills choose black or white
text based on the selected background color to keep the foreground contrast at
WCAG AA; a fixed white label cannot meet that threshold on every valid color.

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

The notification check includes incomplete, unsent reminders whose window has
opened, including overdue reminders. Times are compared as UTC instants; naive
input is first interpreted as Singapore time. Notifications require browser
permission and an open app tab, and are polled every 30 seconds. Multiple tabs
can race before delivery is recorded; notification tags reduce duplicates but
do not guarantee exactly-once delivery.
