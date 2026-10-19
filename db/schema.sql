-- Sarathi relational schema (SQLite; kept portable to PostgreSQL/MySQL).
-- Times are 'HH:MM' strings; money is whole INR.

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── Reference data ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cities (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  state   TEXT NOT NULL,
  lat     REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng     REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  aliases TEXT NOT NULL DEFAULT ''          -- comma-separated alternate names
);

CREATE TABLE IF NOT EXISTS airports (
  iata    TEXT PRIMARY KEY CHECK (length(iata) = 3),
  name    TEXT NOT NULL,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_airports_city ON airports(city_id);

CREATE TABLE IF NOT EXISTS stations (
  code    TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stations_city ON stations(city_id);

-- ── Users & activity ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  home_city_id  INTEGER REFERENCES cities(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One row per recommendation request (raw prefs + the structured filters the AI produced).
CREATE TABLE IF NOT EXISTS searches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,   -- NULL = anonymous
  preferences   TEXT NOT NULL,        -- JSON
  filters       TEXT NOT NULL,        -- JSON (validated)
  filter_source TEXT NOT NULL CHECK (filter_source IN ('llm','heuristic')),
  result_counts TEXT NOT NULL,        -- JSON {flights,trains,hotels}
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id, created_at);

-- A trip. Holds the AI-written plan text and (via itinerary_items) the bookings that belong to it.
CREATE TABLE IF NOT EXISTS itineraries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,                -- user-chosen, unique per user
  destination TEXT NOT NULL,
  start_at    TEXT,                         -- 'YYYY-MM-DDTHH:MM', earliest departure/check-in among bookings
  travelers   INTEGER NOT NULL DEFAULT 1 CHECK (travelers >= 1),
  content     TEXT NOT NULL DEFAULT '',     -- AI-generated day-by-day plan
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_itineraries_user_title ON itineraries(user_id, title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_itineraries_user ON itineraries(user_id, start_at);

-- ── Flights ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flights (
  flight_number  TEXT PRIMARY KEY,
  airline_code   TEXT NOT NULL,
  airline_name   TEXT NOT NULL,
  origin_iata    TEXT NOT NULL REFERENCES airports(iata),
  dest_iata      TEXT NOT NULL REFERENCES airports(iata),
  dep_time       TEXT NOT NULL,
  arr_time       TEXT NOT NULL,
  arr_day_offset INTEGER NOT NULL DEFAULT 0 CHECK (arr_day_offset IN (0,1)),
  duration_min   INTEGER NOT NULL CHECK (duration_min > 0),
  stops          INTEGER NOT NULL DEFAULT 0 CHECK (stops >= 0),
  cabin          TEXT NOT NULL DEFAULT 'economy' CHECK (cabin IN ('economy','premium_economy','business')),
  base_price     INTEGER NOT NULL CHECK (base_price > 0),
  operating_days TEXT NOT NULL DEFAULT '1234567',   -- ISO weekdays 1=Mon..7=Sun
  seats_left     INTEGER NOT NULL DEFAULT 0 CHECK (seats_left >= 0),
  listing_url    TEXT NOT NULL DEFAULT '',   -- provider booking page
  CHECK (origin_iata <> dest_iata)
);
CREATE INDEX IF NOT EXISTS idx_flights_route ON flights(origin_iata, dest_iata, base_price);

-- ── Trains ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trains (
  number         TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL CHECK (category IN ('Rajdhani','Shatabdi','Vande Bharat','Superfast','Mail/Express')),
  operating_days TEXT NOT NULL DEFAULT '1234567',
  listing_url    TEXT NOT NULL DEFAULT ''    -- provider booking page
);

CREATE TABLE IF NOT EXISTS train_stops (
  train_number TEXT NOT NULL REFERENCES trains(number) ON DELETE CASCADE,
  seq          INTEGER NOT NULL CHECK (seq >= 1),
  station_code TEXT NOT NULL REFERENCES stations(code),
  arr_time     TEXT,                       -- NULL at origin
  dep_time     TEXT,                       -- NULL at terminus
  day_offset   INTEGER NOT NULL DEFAULT 0 CHECK (day_offset >= 0),
  distance_km  INTEGER NOT NULL CHECK (distance_km >= 0),
  PRIMARY KEY (train_number, seq),
  UNIQUE (train_number, station_code)
);
CREATE INDEX IF NOT EXISTS idx_stops_station ON train_stops(station_code, train_number);

-- One fare row per class; the fare for a journey is per_km * (distance between two stops).
CREATE TABLE IF NOT EXISTS train_classes (
  train_number TEXT NOT NULL REFERENCES trains(number) ON DELETE CASCADE,
  class_code   TEXT NOT NULL CHECK (class_code IN ('SL','3A','2A','1A','CC','EC')),
  per_km       REAL NOT NULL CHECK (per_km > 0),
  base_fare    INTEGER NOT NULL DEFAULT 0 CHECK (base_fare >= 0),
  PRIMARY KEY (train_number, class_code)
);

-- ── Hotels ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotels (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id         INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  chain           TEXT,
  area            TEXT NOT NULL,
  stars           INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  rating          REAL NOT NULL CHECK (rating BETWEEN 0 AND 5),
  review_count    INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  price_per_night INTEGER NOT NULL CHECK (price_per_night > 0),
  lat             REAL,
  lng             REAL,
  rooms_left      INTEGER NOT NULL DEFAULT 0 CHECK (rooms_left >= 0),
  listing_url     TEXT NOT NULL DEFAULT '',   -- provider booking page
  UNIQUE (city_id, name)
);
CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels(city_id, price_per_night);
CREATE INDEX IF NOT EXISTS idx_hotels_city_stars ON hotels(city_id, stars);

CREATE TABLE IF NOT EXISTS amenities (
  id   INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hotel_amenities (
  hotel_id   INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  amenity_id INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (hotel_id, amenity_id)
);

-- ── Cabs ───────────────────────────────────────────────────────────
-- Intercity taxi products. The fare for a ride is base_fare + per_km * road distance between two cities.
CREATE TABLE IF NOT EXISTS cab_types (
  id            INTEGER PRIMARY KEY,
  provider      TEXT NOT NULL,
  vehicle_class TEXT NOT NULL,
  models        TEXT NOT NULL,
  capacity      INTEGER NOT NULL CHECK (capacity >= 1),
  per_km        REAL NOT NULL CHECK (per_km > 0),
  base_fare     INTEGER NOT NULL DEFAULT 0 CHECK (base_fare >= 0),
  listing_url   TEXT NOT NULL DEFAULT '',
  UNIQUE (provider, vehicle_class)
);

-- ── Bookings: link a trip to exactly one flight, train, hotel or cab ──
-- Prices are snapshotted at booking time so later fare changes don't rewrite history.
CREATE TABLE IF NOT EXISTS itinerary_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  itinerary_id  INTEGER NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  flight_number TEXT REFERENCES flights(flight_number),
  train_number  TEXT REFERENCES trains(number),
  hotel_id      INTEGER REFERENCES hotels(id),
  cab_type_id   INTEGER REFERENCES cab_types(id),
  from_code     TEXT,                       -- train boarding station
  to_code       TEXT,                       -- train alighting station
  from_city_id  INTEGER REFERENCES cities(id),   -- cab pickup city
  to_city_id    INTEGER REFERENCES cities(id),   -- cab drop city
  class_code    TEXT,                       -- train class
  travel_date   TEXT,                       -- departure date, or hotel check-in
  start_time    TEXT,                       -- cab pickup time 'HH:MM'
  nights        INTEGER CHECK (nights IS NULL OR nights >= 1),
  quantity      INTEGER NOT NULL CHECK (quantity >= 1),   -- passengers, rooms (hotel) or vehicles (cab)
  total_price   INTEGER NOT NULL CHECK (total_price >= 0),
  status        TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((flight_number IS NOT NULL) + (train_number IS NOT NULL) + (hotel_id IS NOT NULL) + (cab_type_id IS NOT NULL) = 1)
);
CREATE INDEX IF NOT EXISTS idx_items_itinerary ON itinerary_items(itinerary_id);
