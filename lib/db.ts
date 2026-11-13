import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
