'use strict';

function columns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
}

function addColumn(db, table, name, def) {
  const cols = columns(db, table);
  if (!cols.has(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}

function migrate(db) {
  addColumn(db, 'projects', 'folder_id', 'TEXT');
  addColumn(db, 'projects', 'tags', "TEXT NOT NULL DEFAULT '[]'");
  addColumn(db, 'projects', 'favorite', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'projects', 'archived', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'projects', 'trashed', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'projects', 'last_opened_at', 'INTEGER');
  addColumn(db, 'projects', 'subject', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'projects', 'preheader', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'projects', 'from_name', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'projects', 'reply_to', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'projects', 'visual_json', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'projects', 'crash_draft', 'TEXT');
  addColumn(db, 'projects', 'to_addr', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'projects', 'cc_addr', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'projects', 'bcc_addr', "TEXT NOT NULL DEFAULT ''");

  addColumn(db, 'assets', 'width', 'INTEGER');
  addColumn(db, 'assets', 'height', 'INTEGER');

  addColumn(db, 'history', 'account_id', 'TEXT');
  addColumn(db, 'history', 'account_name', 'TEXT');
  addColumn(db, 'history', 'version_id', 'TEXT');
  addColumn(db, 'history', 'reply_to', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      html TEXT NOT NULL DEFAULT '',
      css TEXT NOT NULL DEFAULT '',
      visual_json TEXT NOT NULL DEFAULT '',
      label TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'custom',
      html TEXT NOT NULL DEFAULT '',
      css TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      custom_fields TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_sends (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      project_name TEXT,
      version_id TEXT,
      account_id TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      cc_addr TEXT,
      bcc_addr TEXT,
      subject TEXT NOT NULL,
      from_addr TEXT,
      reply_to TEXT,
      html TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      scheduled_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      secret_enc TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracking_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      project_id TEXT,
      send_id TEXT,
      recipient TEXT,
      meta TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at);
    CREATE INDEX IF NOT EXISTS idx_projects_folder ON projects(folder_id);
    CREATE INDEX IF NOT EXISTS idx_versions_project ON versions(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_history_project ON history(project_id, sent_at);
    CREATE INDEX IF NOT EXISTS idx_history_status ON history(status, sent_at);
    CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
    CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_sends(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_blocks_updated ON blocks(updated_at);
  `);
}

module.exports = { migrate };
