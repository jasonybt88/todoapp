import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Priority } from "@/lib/priority";

export {
  PRIORITY_ORDER,
  PRIORITY_VALUES,
} from "@/lib/priority";
export type { Priority } from "@/lib/priority";

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: Buffer;
  counter: number | undefined;
  transports: AuthenticatorTransport[];
  created_at: string;
}

export type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly";

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string | null;
  subtasks: Subtask[];
  tags: Tag[];
}

export interface CreateTodoInput {
  title: string;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  tag_ids?: number[];
}

export interface UpdateTodoInput extends Partial<CreateTodoInput> {
  completed?: boolean;
  last_notification_sent?: string;
}

export interface CreateSubtaskInput {
  title: string;
}

export type ChallengePurpose = "registration" | "authentication";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
let database: Database.Database | undefined;

function createDatabase(): Database.Database {
  const filePath = process.env.DATABASE_PATH ?? resolve(process.cwd(), "data", "auth.sqlite");
  if (filePath !== ":memory:") {
    mkdirSync(dirname(resolve(/* turbopackIgnore: true */ filePath)), {
      recursive: true,
    });
  }

  const db = new Database(filePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS authenticators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT UNIQUE NOT NULL,
      credential_public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern TEXT,
      reminder_minutes INTEGER,
      last_notification_sent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
    CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3B82F6',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);

    CREATE TABLE IF NOT EXISTS todo_tags (
      todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (todo_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id ON todo_tags(tag_id);

    CREATE TABLE IF NOT EXISTS auth_challenges (
      username TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
      challenge TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (username, purpose)
    );
  `);

  return db;
}

function getDatabase(): Database.Database {
  database ??= createDatabase();
  return database;
}

export function findUserByUsername(username: string): User | null {
  const user = getDatabase()
    .prepare("SELECT id, username, created_at FROM users WHERE username = ?")
    .get(username) as User | undefined;

  return user ?? null;
}

export function findUserById(id: number): User | null {
  const user = getDatabase()
    .prepare("SELECT id, username, created_at FROM users WHERE id = ?")
    .get(id) as User | undefined;

  return user ?? null;
}

interface AuthenticatorRow extends Omit<Authenticator, "transports"> {
  transports: string | null;
}

function mapAuthenticator(row: AuthenticatorRow): Authenticator {
  return {
    ...row,
    transports: row.transports
      ? (JSON.parse(row.transports) as AuthenticatorTransport[])
      : [],
  };
}

export function findAuthenticatorsByUserId(userId: number): Authenticator[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, user_id, credential_id, credential_public_key, counter, transports, created_at
       FROM authenticators WHERE user_id = ? ORDER BY id`,
    )
    .all(userId) as AuthenticatorRow[];

  return rows.map(mapAuthenticator);
}

export function findAuthenticatorByCredentialId(
  credentialId: string,
): Authenticator | null {
  const row = getDatabase()
    .prepare(
      `SELECT id, user_id, credential_id, credential_public_key, counter, transports, created_at
       FROM authenticators WHERE credential_id = ?`,
    )
    .get(credentialId) as AuthenticatorRow | undefined;

  return row ? mapAuthenticator(row) : null;
}

function insertAuthenticator(
  userId: number,
  credentialId: string,
  publicKey: Uint8Array,
  counter: number,
  transports: AuthenticatorTransport[],
): void {
  getDatabase()
    .prepare(
      `INSERT INTO authenticators
        (user_id, credential_id, credential_public_key, counter, transports)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(userId, credentialId, Buffer.from(publicKey), counter, JSON.stringify(transports));
}

export function createUserWithAuthenticator(
  username: string,
  credentialId: string,
  publicKey: Uint8Array,
  counter: number,
  transports: AuthenticatorTransport[],
): User {
  const db = getDatabase();
  const create = db.transaction(() => {
    const result = db
      .prepare("INSERT INTO users (username) VALUES (?)")
      .run(username);
    const userId = Number(result.lastInsertRowid);
    insertAuthenticator(userId, credentialId, publicKey, counter, transports);

    const user = findUserById(userId);
    if (!user) {
      throw new Error("Newly created user could not be loaded");
    }
    return user;
  });

  return create();
}

export function addAuthenticator(
  userId: number,
  credentialId: string,
  publicKey: Uint8Array,
  counter: number,
  transports: AuthenticatorTransport[],
): void {
  insertAuthenticator(userId, credentialId, publicKey, counter, transports);
}

export function updateAuthenticatorCounter(
  authenticatorId: number,
  counter: number,
): void {
  const result = getDatabase()
    .prepare("UPDATE authenticators SET counter = ? WHERE id = ?")
    .run(counter, authenticatorId);

  if (result.changes !== 1) {
    throw new Error("Authenticator counter could not be updated");
  }
}

interface TodoRow extends Omit<Todo, "completed" | "is_recurring" | "subtasks" | "tags"> {
  completed: number;
  is_recurring: number;
}

function mapTodo(row: TodoRow): Omit<Todo, "subtasks" | "tags"> {
  return {
    ...row,
    completed: Boolean(row.completed),
    is_recurring: Boolean(row.is_recurring),
  };
}

function findTagsByTodoId(todoId: number): Tag[] {
  return getDatabase()
    .prepare(
      `SELECT tags.id, tags.user_id, tags.name, tags.color, tags.created_at
       FROM tags
       INNER JOIN todo_tags ON todo_tags.tag_id = tags.id
       WHERE todo_tags.todo_id = ?
       ORDER BY tags.name COLLATE NOCASE`,
    )
    .all(todoId) as Tag[];
}

function findTodoWithRelations(id: number): Todo | null {
  const row = getDatabase()
    .prepare(
      `SELECT id, user_id, title, completed, due_date, priority, is_recurring,
              recurrence_pattern, reminder_minutes, last_notification_sent,
              created_at, updated_at
       FROM todos WHERE id = ?`,
    )
    .get(id) as TodoRow | undefined;

  if (!row) {
    return null;
  }

  return {
    ...mapTodo(row),
    subtasks: subtaskDB.findByTodoId(id),
    tags: findTagsByTodoId(id),
  };
}

function attachTodoTags(
  db: Database.Database,
  todoId: number,
  userId: number,
  tagIds: number[],
): void {
  const attach = db.prepare(
    `INSERT INTO todo_tags (todo_id, tag_id)
     SELECT ?, id FROM tags WHERE id = ? AND user_id = ?`,
  );

  for (const tagId of new Set(tagIds)) {
    const result = attach.run(todoId, tagId, userId);
    if (result.changes !== 1) {
      throw new Error("Tag not found");
    }
  }
}

export const tagDB = {
  findAllByUser(userId: number): Tag[] {
    return getDatabase()
      .prepare(
        `SELECT id, user_id, name, color, created_at
         FROM tags WHERE user_id = ? ORDER BY name COLLATE NOCASE, name, id`,
      )
      .all(userId) as Tag[];
  },

  findById(id: number, userId: number): Tag | null {
    const tag = getDatabase()
      .prepare(
        `SELECT id, user_id, name, color, created_at
         FROM tags WHERE id = ? AND user_id = ?`,
      )
      .get(id, userId) as Tag | undefined;

    return tag ?? null;
  },

  create(userId: number, input: CreateTagInput): Tag {
    const result = getDatabase()
      .prepare("INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)")
      .run(userId, input.name, input.color ?? "#3B82F6");
    const tag = this.findById(Number(result.lastInsertRowid), userId);
    if (!tag) {
      throw new Error("Newly created tag could not be loaded");
    }
    return tag;
  },

  update(id: number, userId: number, input: UpdateTagInput): Tag | null {
    const db = getDatabase();
    return db.transaction(() => {
      const fields: Array<{ column: "name" | "color"; value: string }> = [];
      if (input.name !== undefined) fields.push({ column: "name", value: input.name });
      if (input.color !== undefined) fields.push({ column: "color", value: input.color });

      if (fields.length > 0) {
        const assignments = fields.map(({ column }) => `${column} = ?`);
        db.prepare(
          `UPDATE tags SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`,
        ).run(...fields.map(({ value }) => value), id, userId);
      }

      return this.findById(id, userId);
    })();
  },

  delete(id: number, userId: number): boolean {
    const result = getDatabase()
      .prepare("DELETE FROM tags WHERE id = ? AND user_id = ?")
      .run(id, userId);
    return result.changes === 1;
  },

  attachToTodo(todoId: number, tagId: number, userId: number): boolean {
    const db = getDatabase();
    return db.transaction(() => {
      const ownedTag = db
        .prepare("SELECT 1 FROM tags WHERE id = ? AND user_id = ?")
        .get(tagId, userId);
      const ownedTodo = db
        .prepare("SELECT 1 FROM todos WHERE id = ? AND user_id = ?")
        .get(todoId, userId);
      if (!ownedTag || !ownedTodo) {
        return false;
      }

      db.prepare(
        "INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)",
      ).run(todoId, tagId);
      return true;
    })();
  },

  detachFromTodo(todoId: number, tagId: number, userId: number): boolean {
    const db = getDatabase();
    return db.transaction(() => {
      const ownedTag = db
        .prepare("SELECT 1 FROM tags WHERE id = ? AND user_id = ?")
        .get(tagId, userId);
      const ownedTodo = db
        .prepare("SELECT 1 FROM todos WHERE id = ? AND user_id = ?")
        .get(todoId, userId);
      if (!ownedTag || !ownedTodo) {
        return false;
      }

      db.prepare("DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?")
        .run(todoId, tagId);
      return true;
    })();
  },

  findByTodoId(todoId: number): Tag[] {
    return findTagsByTodoId(todoId);
  },
};

export const todoDB = {
  create(userId: number, input: CreateTodoInput): Todo {
    const db = getDatabase();
    const create = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO todos
            (user_id, title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          input.title.trim(),
          input.due_date ?? null,
          input.priority ?? "medium",
          input.is_recurring ? 1 : 0,
          input.recurrence_pattern ?? null,
          input.reminder_minutes ?? null,
        );
      const id = Number(result.lastInsertRowid);
      if (input.tag_ids?.length) {
        attachTodoTags(db, id, userId, input.tag_ids);
      }

      const todo = findTodoWithRelations(id);
      if (!todo) {
        throw new Error("Newly created todo could not be loaded");
      }
      return todo;
    });

    return create();
  },

  findAllByUser(userId: number): Todo[] {
    const rows = getDatabase()
      .prepare("SELECT id FROM todos WHERE user_id = ?")
      .all(userId) as Array<{ id: number }>;

    return rows
      .map(({ id }) => findTodoWithRelations(id))
      .filter((todo): todo is Todo => todo !== null);
  },

  findById(id: number): Todo | null {
    return findTodoWithRelations(id);
  },

  findDueReminders(userId: number, now: Date): Todo[] {
    const rows = getDatabase()
      .prepare(
        `SELECT id FROM todos
         WHERE user_id = ? AND completed = 0 AND due_date IS NOT NULL
           AND reminder_minutes IS NOT NULL AND last_notification_sent IS NULL
           AND unixepoch(due_date, 'subsec') * 1000 <= ? + reminder_minutes * 60000
         ORDER BY due_date, id`,
      )
      .all(userId, now.getTime()) as Array<{ id: number }>;

    return rows
      .map(({ id }) => findTodoWithRelations(id))
      .filter((todo): todo is Todo => todo !== null);
  },

  markReminderSent(
    id: number,
    userId: number,
    dueDate: string,
    reminderMinutes: number,
    sentAt: string,
  ): Todo | null {
    const db = getDatabase();
    return db.transaction(() => {
      const result = db.prepare(
        `UPDATE todos SET last_notification_sent = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ? AND due_date = ? AND reminder_minutes = ?
           AND completed = 0 AND last_notification_sent IS NULL`,
      ).run(sentAt, id, userId, dueDate, reminderMinutes);
      return result.changes ? findTodoWithRelations(id) : null;
    })();
  },

  update(id: number, input: UpdateTodoInput): Todo | null {
    const db = getDatabase();
    const update = db.transaction(() => {
      const fields: Array<{ column: string; value: string | number | null }> = [];
      if (input.title !== undefined) fields.push({ column: "title", value: input.title });
      if (input.due_date !== undefined) fields.push({ column: "due_date", value: input.due_date });
      if (input.priority !== undefined) fields.push({ column: "priority", value: input.priority });
      if (input.is_recurring !== undefined) {
        fields.push({ column: "is_recurring", value: input.is_recurring ? 1 : 0 });
      }
      if (input.recurrence_pattern !== undefined) {
        fields.push({ column: "recurrence_pattern", value: input.recurrence_pattern });
      }
      if (input.reminder_minutes !== undefined) {
        fields.push({ column: "reminder_minutes", value: input.reminder_minutes });
      }
      if (input.completed !== undefined) {
        fields.push({ column: "completed", value: input.completed ? 1 : 0 });
      }
      if (input.last_notification_sent !== undefined) {
        fields.push({ column: "last_notification_sent", value: input.last_notification_sent });
      } else if (input.due_date !== undefined || input.reminder_minutes !== undefined) {
        const existing = findTodoWithRelations(id);
        if (
          existing &&
          ((input.due_date !== undefined && input.due_date !== existing.due_date) ||
            (input.reminder_minutes !== undefined &&
              input.reminder_minutes !== existing.reminder_minutes))
        ) {
          fields.push({ column: "last_notification_sent", value: null });
        }
      }

      if (fields.length > 0) {
        const assignments = fields.map(({ column }) => `${column} = ?`);
        assignments.push("updated_at = datetime('now')");
        db.prepare(`UPDATE todos SET ${assignments.join(", ")} WHERE id = ?`)
          .run(...fields.map(({ value }) => value), id);
      } else {
        db.prepare("UPDATE todos SET updated_at = datetime('now') WHERE id = ?").run(id);
      }

      if (input.tag_ids !== undefined) {
        db.prepare("DELETE FROM todo_tags WHERE todo_id = ?").run(id);
        const owner = db
          .prepare("SELECT user_id FROM todos WHERE id = ?")
          .get(id) as { user_id: number } | undefined;
        if (owner && input.tag_ids.length > 0) {
          attachTodoTags(db, id, owner.user_id, input.tag_ids);
        }
      }

      return findTodoWithRelations(id);
    });

    return update();
  },

  delete(id: number): void {
    getDatabase().prepare("DELETE FROM todos WHERE id = ?").run(id);
  },
};

interface SubtaskRow extends Omit<Subtask, "completed"> {
  completed: number;
}

function mapSubtask(row: SubtaskRow): Subtask {
  return { ...row, completed: Boolean(row.completed) };
}

export const subtaskDB = {
  findByTodoId(todoId: number): Subtask[] {
    const rows = getDatabase()
      .prepare(
        `SELECT id, todo_id, title, completed, position, created_at
         FROM subtasks WHERE todo_id = ? ORDER BY position ASC, id ASC`,
      )
      .all(todoId) as SubtaskRow[];

    return rows.map(mapSubtask);
  },

  create(todoId: number, input: CreateSubtaskInput): Subtask {
    const db = getDatabase();
    const create = db.transaction(() => {
      const current = db
        .prepare("SELECT COALESCE(MAX(position), -1) AS position FROM subtasks WHERE todo_id = ?")
        .get(todoId) as { position: number };
      const result = db
        .prepare("INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?)")
        .run(todoId, input.title.trim(), current.position + 1);
      const row = db
        .prepare(
          `SELECT id, todo_id, title, completed, position, created_at
           FROM subtasks WHERE id = ?`,
        )
        .get(Number(result.lastInsertRowid)) as SubtaskRow | undefined;
      if (!row) {
        throw new Error("Newly created subtask could not be loaded");
      }
      return mapSubtask(row);
    });

    return create();
  },
};

export function saveChallenge(
  username: string,
  purpose: ChallengePurpose,
  challenge: string,
): void {
  getDatabase()
    .prepare(
      `INSERT INTO auth_challenges (username, purpose, challenge, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(username, purpose) DO UPDATE SET
         challenge = excluded.challenge,
         expires_at = excluded.expires_at`,
    )
    .run(username, purpose, challenge, Date.now() + CHALLENGE_TTL_MS);
}

export function consumeChallenge(
  username: string,
  purpose: ChallengePurpose,
): string | null {
  const db = getDatabase();
  const consume = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT challenge, expires_at FROM auth_challenges
         WHERE username = ? AND purpose = ?`,
      )
      .get(username, purpose) as { challenge: string; expires_at: number } | undefined;

    if (!row) {
      return null;
    }

    db.prepare(
      "DELETE FROM auth_challenges WHERE username = ? AND purpose = ?",
    ).run(username, purpose);

    return row.expires_at > Date.now() ? row.challenge : null;
  });

  return consume();
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      error.code === "SQLITE_CONSTRAINT_PRIMARYKEY")
  );
}
