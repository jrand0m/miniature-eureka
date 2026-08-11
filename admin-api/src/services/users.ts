// T008: User data-access service — see specs/001-auth-user-management/data-model.md

import type { Role } from "./tokens";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: Role;
  registeredAt: string;
  lastLoginAt: string | null;
  enabled: boolean;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  role: string;
  registered_at: string;
  last_login_at: string | null;
  enabled: number;
}

function mapRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    role: row.role as Role,
    registeredAt: row.registered_at,
    lastLoginAt: row.last_login_at,
    enabled: row.enabled === 1,
  };
}

export async function createUser(
  db: D1Database,
  params: { email: string; passwordHash: string; passwordSalt: string },
): Promise<UserRecord> {
  const id = crypto.randomUUID();
  const registeredAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, role, registered_at, last_login_at, enabled)
       VALUES (?, ?, ?, ?, 'user', ?, NULL, 1)`,
    )
    .bind(id, params.email, params.passwordHash, params.passwordSalt, registeredAt)
    .run();
  return {
    id,
    email: params.email,
    passwordHash: params.passwordHash,
    passwordSalt: params.passwordSalt,
    role: "user",
    registeredAt,
    lastLoginAt: null,
    enabled: true,
  };
}

export async function findByEmail(db: D1Database, email: string): Promise<UserRecord | null> {
  const row = await db
    .prepare("SELECT * FROM users WHERE email = ?1 COLLATE NOCASE")
    .bind(email)
    .first<UserRow>();
  return row ? mapRow(row) : null;
}

export async function findById(db: D1Database, id: string): Promise<UserRecord | null> {
  const row = await db.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<UserRow>();
  return row ? mapRow(row) : null;
}

export async function listUsers(db: D1Database): Promise<UserRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM users ORDER BY registered_at ASC")
    .all<UserRow>();
  return results.map(mapRow);
}

export async function updateLastLogin(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE users SET last_login_at = ?1 WHERE id = ?2")
    .bind(new Date().toISOString(), id)
    .run();
}

export async function setEnabled(db: D1Database, id: string, enabled: boolean): Promise<void> {
  await db
    .prepare("UPDATE users SET enabled = ?1 WHERE id = ?2")
    .bind(enabled ? 1 : 0, id)
    .run();
}
