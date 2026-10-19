// Populates the catalog tables. Deterministic (seeded PRNG) so reruns give identical data.
// SAMPLE DATA: real airports/stations/trains/hotel names, generated schedules and prices.
// Usage: node db/seed.js [--reset]   (npm run seed)
const D = require('./seed-data');

// Bump whenever seed data changes; init() reseeds the catalog when the stored value differs.
const CATALOG_VERSION = '2';

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const haversineKm = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const toHHMM = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const roundTo = (n, step) => Math.round(n / step) * step;

const CATALOG_TABLES = [
  'hotel_amenities', 'hotels', 'amenities', 'cab_types', 'train_classes', 'train_stops', 'trains',
  'flights', 'stations', 'airports', 'cities',
];

const seed = (db) => {
  const rand = mulberry32(20260101);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (lo, hi) => lo + rand() * (hi - lo);

  // Reload catalog rows without tripping FKs from existing bookings; keys are deterministic,
  // so bookings keep pointing at the same flights/trains/hotels. Re-checked after commit.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    CATALOG_TABLES.forEach((t) => db.exec(`DELETE FROM ${t}`));

    // cities / airports / stations
    const city = {};
    D.CITIES.forEach(([name, state, lat, lng, aliases], i) => {
      db.prepare('INSERT INTO cities (id, name, state, lat, lng, aliases) VALUES (?,?,?,?,?,?)')
        .run(i + 1, name, state, lat, lng, aliases);
      city[name] = { id: i + 1, name, lat, lng };
    });
    const airportCity = {};
    D.AIRPORTS.forEach(([iata, name, c]) => {
      db.prepare('INSERT INTO airports (iata, name, city_id) VALUES (?,?,?)').run(iata, name, city[c].id);
      airportCity[iata] = city[c];
    });
    const stationCity = {};
    D.STATIONS.forEach(([code, name, c]) => {
      db.prepare('INSERT INTO stations (code, name, city_id) VALUES (?,?,?)').run(code, name, city[c].id);
      stationCity[code] = city[c];
    });

    // flights
    const insFlight = db.prepare(`INSERT INTO flights
      (flight_number, airline_code, airline_name, origin_iata, dest_iata, dep_time, arr_time,
       arr_day_offset, duration_min, stops, cabin, base_price, operating_days, seats_left, listing_url)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const flightDays = ['1234567', '1234567', '1234567', '1234567', '124567', '1357'];
    const used = new Set();
    const iatas = D.AIRPORTS.map((a) => a[0]);
    for (const a of iatas) {
      for (const b of iatas) {
        if (a === b || airportCity[a] === airportCity[b]) continue;
        const bothHubs = D.HUB_AIRPORTS.includes(a) && D.HUB_AIRPORTS.includes(b);
        const viaTrunk = D.TRUNK_AIRPORTS.includes(a) || D.TRUNK_AIRPORTS.includes(b);
        if (!bothHubs && !viaTrunk) continue;
        const km = haversineKm(airportCity[a], airportCity[b]);
        if (km < 250) continue;
        const count = bothHubs ? 5 + Math.floor(rand() * 3) : 2 + Math.floor(rand() * 2);
        for (let i = 0; i < count; i++) {
          const [code, airline, mult, hasBiz, url] = pick(D.AIRLINES);
          const depMin = roundTo(between(5 * 60, 23 * 60), 5);
          const stops = !bothHubs && km > 900 && rand() < 0.3 ? 1 : 0;
          const duration = Math.round(km / 760 * 60 + 40 + stops * 95);
          const dep = toHHMM(depMin);
          const flightNumber = `${code} ${Math.floor(between(100, 999))}`;
          if (used.has(flightNumber)) continue;   // flight_number is the primary key
          used.add(flightNumber);
          const timeFactor = depMin < 8 * 60 || depMin > 21 * 60 ? 0.88 : depMin >= 17 * 60 && depMin <= 20 * 60 ? 1.12 : 1;
          let price = (1700 + km * 3.4) * mult * timeFactor * between(0.9, 1.15) * (stops ? 0.9 : 1);
          let cabin = 'economy';
          if (hasBiz && km > 600 && rand() < 0.35) { cabin = 'business'; price *= 2.8; }
          else if (hasBiz && rand() < 0.2) { cabin = 'premium_economy'; price *= 1.6; }
          insFlight.run(
            flightNumber, code, airline, a, b, dep, toHHMM(depMin + duration),
            depMin + duration >= 1440 ? 1 : 0, duration, stops, cabin, roundTo(price, 10),
            pick(flightDays), Math.floor(between(3, 60)), url,
          );
        }
      }
    }

    // trains
    const insTrain = db.prepare('INSERT INTO trains (number, name, category, operating_days, listing_url) VALUES (?,?,?,?,?)');
    const insStop = db.prepare(`INSERT INTO train_stops
      (train_number, seq, station_code, arr_time, dep_time, day_offset, distance_km) VALUES (?,?,?,?,?,?,?)`);
    const insClass = db.prepare('INSERT INTO train_classes (train_number, class_code, per_km, base_fare) VALUES (?,?,?,?)');
    D.TRAINS.forEach(([number, name, category, classes, stops, days = '1234567']) => {
      insTrain.run(number, name, category, days, D.TRAIN_BOOKING_URL);
      let dist = 0;
      stops.forEach(([station, arr, dep, day], i) => {
        if (i > 0) dist += haversineKm(stationCity[stops[i - 1][0]], stationCity[station]) * 1.2;
        insStop.run(number, i + 1, station, arr, dep, day, Math.round(dist));
      });
      classes.forEach((c) => insClass.run(number, c, D.FARE_RATES[category][c], c === 'SL' ? 20 : 40));
    });

    // cabs
    const insCab = db.prepare(`INSERT INTO cab_types
      (id, provider, vehicle_class, models, capacity, per_km, base_fare, listing_url) VALUES (?,?,?,?,?,?,?,?)`);
    D.CAB_TYPES.forEach((c, i) => insCab.run(i + 1, ...c));

    // hotels
    const insAmenity = db.prepare('INSERT INTO amenities (id, code, name) VALUES (?,?,?)');
    const amenityId = {};
    D.AMENITIES.forEach(([code, name], i) => { insAmenity.run(i + 1, code, name); amenityId[code] = i + 1; });
    const insHotel = db.prepare(`INSERT INTO hotels
      (id, city_id, name, chain, area, stars, rating, review_count, price_per_night, lat, lng, rooms_left, listing_url)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insHA = db.prepare('INSERT OR IGNORE INTO hotel_amenities (hotel_id, amenity_id) VALUES (?,?)');
    const starBase = { 1: 900, 2: 1800, 3: 3200, 4: 5800, 5: 12500 };
    const ratingRange = { 1: [3.8, 4.4], 2: [3.4, 4.0], 3: [3.6, 4.2], 4: [4.0, 4.5], 5: [4.3, 4.8] };
    let hotelId = 0;
    D.CITIES.forEach(([cname]) => {
      const c = city[cname];
      const cityFactor = D.CITY_PRICE_FACTOR[cname] || 0.85;
      const listings = [
        ...(D.HOTELS[cname] || []),
        ...D.BUDGET_CHAINS.map(([n, chain, area, stars, m, ex]) => [`${n} ${cname} ${area}`, chain, area, stars, m, ex]),
      ];
      listings.forEach(([name, chain, area, stars, mult = 1, extras = []]) => {
        hotelId += 1;
        const [rlo, rhi] = ratingRange[stars];
        insHotel.run(
          hotelId, c.id, name, chain, area, stars, Math.round(between(rlo, rhi) * 10) / 10,
          Math.floor(between(120, stars >= 4 ? 6500 : 2500)),
          roundTo(starBase[stars] * mult * cityFactor * between(0.92, 1.1), 50),
          +(c.lat + between(-0.06, 0.06)).toFixed(4), +(c.lng + between(-0.06, 0.06)).toFixed(4),
          Math.floor(between(1, 25)),
          D.CHAIN_URLS[chain] || `https://www.google.com/search?q=${encodeURIComponent(`${name} ${cname} hotel`)}`,
        );
        const codes = new Set(['wifi', ...extras]);
        if (stars >= 2) codes.add('ac');
        if (stars >= 4) ['restaurant', 'gym', 'parking', 'breakfast'].forEach((x) => codes.add(x));
        if (stars === 3 && rand() < 0.6) codes.add('breakfast');
        if (stars <= 3 && rand() < 0.4) codes.add('parking');
        if (stars >= 3 && rand() < 0.2) codes.add('pet_friendly');
        codes.forEach((code) => insHA.run(hotelId, amenityId[code]));
      });
    });

    db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('catalog_version', ?)").run(CATALOG_VERSION);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  const dangling = db.prepare('PRAGMA foreign_key_check').all();
  if (dangling.length) console.warn(`Warning: ${dangling.length} dangling reference(s) after reseed`);
  return counts(db);
};

const counts = (db) =>
  Object.fromEntries(
    ['cities', 'airports', 'stations', 'flights', 'trains', 'train_stops', 'train_classes', 'cab_types', 'hotels', 'amenities', 'hotel_amenities']
      .map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]),
  );

module.exports = { seed, counts, CATALOG_VERSION };

if (require.main === module) {
  const { open } = require('./index');
  const db = open();
  console.table(seed(db));
}
