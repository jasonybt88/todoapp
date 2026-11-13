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
Notification delivery-marking updates return the marked `Todo` directly;
ordinary updates return the `{ "todo": Todo, "nextInstance"?: Todo }` envelope.
Subtask completion is independent of its parent. Tag management has a separate
feature contract.

Set `is_recurring` to `true` with a valid `recurrence_pattern` (`daily`,
`weekly`, `monthly`, or `yearly`) and a non-null `due_date` to enable recurrence.
Recurrence dates advance in Singapore local time; monthly and yearly dates clamp
to the last valid day of the target month. Disabling recurrence clears the
pattern for that todo and does not change any already-created occurrence.

## Routes

| Method | Path | Success | Request |
|---|---|---|---|
| `GET` | `/api/todos` | `200 Todo[]` | Optional `?priority=high|medium|low` |
| `POST` | `/api/todos` | `201 Todo` | `{ title, due_date?, priority?, is_recurring?, recurrence_pattern?, reminder_minutes?, tag_ids? }` |
| `GET` | `/api/todos/:id` | `200 Todo` | — |
| `PUT`  | `/api/todos/:id` | `200 { "todo": Todo, "nextInstance"?: Todo }` | Any supported fields to update |
| `DELETE` | `/api/todos/:id` | `200 { "success": true }` | — |
| `GET` | `/api/tags` | `200 Tag[]` | Current user's tags |
| `POST` | `/api/tags` | `201 Tag` | `{ name, color? }` |
| `PUT` | `/api/tags/:id` | `200 Tag` | `{ name?, color? }` |
| `DELETE` | `/api/tags/:id` | `200 { "success": true }` | Deletes tag links by cascade |
| `POST` | `/api/todos/:id/tags` | `200 Todo` | `{ tag_id }`; idempotent attach |
| `DELETE` | `/api/todos/:id/tags` | `200 Todo` | `{ tag_id }`; idempotent detach |
| `GET` | `/api/holidays` | `200 { "holidays": Holiday[] }` | — |
| `GET` | `/api/holidays?year=2026&month=12` | `200 { "holidays": Holiday[] }` | Optional `YYYY` and `MM` pair; results include visible adjacent calendar dates |
| `GET` | `/api/notifications/check` | `200 { "success": true, "data": Todo[] }` | — |
| `POST` | `/api/todos/:id/subtasks` | `201 Subtask` | `{ title }` |
| `PUT` | `/api/subtasks/:id` | `200 Subtask` | `{ title?, completed? }` |
| `DELETE` | `/api/subtasks/:id` | `200 { "success": true }` | — |
| `GET` | `/api/todos/export?format=json` | `200 TodoExport` download | Optional `format=json` (default) or `format=csv` |
| `GET` | `/api/todos/export?format=csv` | `200 text/csv` download | RFC 4180 CSV; spreadsheet formulas in titles are neutralized |
| `POST` | `/api/todos/import` | `200 { "success": true, "imported": number, "tagsCreated": number, "tagsReused": number }` | Version 1 JSON export envelope |

JSON export has `version: 1`, `exported_at`, and a `todos` array containing
todo fields plus nested subtasks (`title`, `completed`, `position`) and tags
(`name`, `color`). Import validates the complete envelope before writing and
adds all records in one transaction. Imported todos and subtasks receive new
IDs; existing tag names are matched case-insensitively and keep their original
color. Re-importing the same file creates duplicate todos by design. CSV uses
the columns `ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder`
and is not accepted by the import route.

Holiday records are global and read-only through the API. The calendar database
seeds Singapore public holidays for 2025–2027 when initialized; the seed command
can be rerun safely.

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

When `completed` changes from `false` to `true` on a recurring todo, the same
PUT transaction creates exactly one next instance and returns it as
`nextInstance`. The new todo inherits the title, priority, recurrence pattern,
reminder offset, and tags. Other updates return `{ "todo": Todo }`.

SQLite stores booleans as integers and enables foreign keys at connection
initialization. Deleting a todo therefore cascades to its subtasks and tag links.
Subtask titles are trimmed and required, completion is boolean, and ownership
is inherited from the parent todo. Missing or another user's subtasks return
404. New positions are one greater than the current maximum; deletion leaves
other positions unchanged. The dashboard searches todo and subtask titles
locally among the current user's loaded todos.

The notification check includes incomplete, unsent reminders whose window has
opened, including overdue reminders. Times are compared as UTC instants; naive
input is first interpreted as Singapore time. Notifications require browser
permission and an open app tab, and are polled every 30 seconds. Multiple tabs
can race before delivery is recorded; notification tags reduce duplicates but
do not guarantee exactly-once delivery.
