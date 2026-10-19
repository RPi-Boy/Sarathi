const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.SARATHI_DB_PATH || path.join(__dirname, '..', 'data', 'sarathi.db');
const LEGACY_USERS_JSON = path.join(__dirname, '..', 'data', 'users.json');
const SCHEMA_VERSION = '4';

const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

// v1 -> v2: flights keyed by flight_number, saved_items replaced by itinerary_items,
// itineraries become trips. Flights are catalog data and get re-seeded by init().
// Returns true when itinerary_items must be rebuilt (v4: cab support widens its CHECK constraint).
const migrate = (db) => {
  if (columns(db, 'flights').includes('id')) {
    db.exec('DROP TABLE IF EXISTS saved_items; DROP TABLE flights;');
  }
  const trip = columns(db, 'itineraries');
  if (trip.length) {
    if (!trip.includes('title')) db.exec('ALTER TABLE itineraries ADD COLUMN title TEXT');
    if (!trip.includes('travelers')) db.exec('ALTER TABLE itineraries ADD COLUMN travelers INTEGER NOT NULL DEFAULT 1');
    if (!trip.includes('start_at')) db.exec('ALTER TABLE itineraries ADD COLUMN start_at TEXT');
    // v3 requires a unique name per user: backfill blanks, then suffix later duplicates with their id
    db.exec(`UPDATE itineraries SET title = 'Trip to ' || destination WHERE title IS NULL OR trim(title) = '';
             UPDATE itineraries SET title = title || ' #' || id
               WHERE id NOT IN (SELECT MIN(id) FROM itineraries GROUP BY user_id, lower(title));`);
  }
  ['flights', 'trains', 'hotels'].forEach((table) => {
    const cols = columns(db, table);
    if (cols.length && !cols.includes('listing_url')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN listing_url TEXT NOT NULL DEFAULT ''`);
    }
  });
  const items = columns(db, 'itinerary_items');
  if (items.length && !items.includes('cab_type_id')) {
    db.exec('DROP INDEX IF EXISTS idx_items_itinerary; ALTER TABLE itinerary_items RENAME TO itinerary_items_old;');
    return true;
  }
  return false;
};

const OLD_ITEM_COLUMNS =
  'id, itinerary_id, flight_number, train_number, hotel_id, from_code, to_code, class_code, travel_date, nights, quantity, total_price, status, created_at';

const open = (dbPath = DB_PATH) => {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const rebuildItems = migrate(db);
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8'));
  if (rebuildItems) {
    transaction(db, () => {
      db.exec(`INSERT INTO itinerary_items (${OLD_ITEM_COLUMNS}) SELECT ${OLD_ITEM_COLUMNS} FROM itinerary_items_old; DROP TABLE itinerary_items_old;`);
    });
  }
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION);
  return db;
};

// Runs fn inside BEGIN/COMMIT, rolling back on error.
const transaction = (db, fn) => {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

// One-time import of the old flat-file user store.
const migrateLegacyUsers = (db) => {
  if (!fs.existsSync(LEGACY_USERS_JSON)) return 0;
  const done = db.prepare("SELECT 1 FROM schema_meta WHERE key = 'legacy_users_migrated'").get();
  if (done) return 0;
  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(LEGACY_USERS_JSON, 'utf-8') || '{}').users || [];
  } catch (err) {
    console.warn('Skipping legacy users.json migration:', err.message);
    return 0;
  }
  const insert = db.prepare(
    'INSERT OR IGNORE INTO users (email, first_name, last_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  transaction(db, () => {
    legacy.forEach((u) =>
      insert.run(u.email, u.firstName, u.lastName, u.password, u.createdAt || new Date().toISOString()),
    );
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('legacy_users_migrated', '1')").run();
  });
  return legacy.length;
};

const init = (dbPath = DB_PATH) => {
  const db = open(dbPath);
  const { CATALOG_VERSION } = require('./seed');
  const stored = db.prepare("SELECT value FROM schema_meta WHERE key = 'catalog_version'").get();
  const hasData =
    stored?.value === CATALOG_VERSION &&
    db.prepare('SELECT COUNT(*) AS n FROM cities').get().n > 0 &&
    db.prepare("SELECT COUNT(*) AS n FROM flights WHERE listing_url <> ''").get().n > 0;
  if (!hasData) require('./seed').seed(db);
  const migrated = migrateLegacyUsers(db);
  if (migrated) console.log(`Migrated ${migrated} user(s) from data/users.json`);
  return db;
};

const toUser = (row) =>
  row && {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    passwordHash: row.password_hash,
  };

const userRepo = (db) => ({
  findByEmail: (email) => toUser(db.prepare('SELECT * FROM users WHERE email = ?').get(email)),
  create: ({ email, firstName, lastName, passwordHash }) => {
    const info = db
      .prepare('INSERT INTO users (email, first_name, last_name, password_hash) VALUES (?, ?, ?, ?)')
      .run(email, firstName, lastName, passwordHash);
    return Number(info.lastInsertRowid);
  },
});

module.exports = { DB_PATH, open, init, transaction, userRepo };
