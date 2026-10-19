const { sanitizeFilters } = require('./filters');
const { roadKm, cabMinutes, CAB_MAX_KM } = require('./geo');

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const placeholders = (n) => Array(n).fill('?').join(',');
const rooms = (travelers) => Math.ceil(travelers / 2);

// ── City resolution ────────────────────────────────────────────────
const buildCityResolver = (db) => {
  const index = new Map();
  const add = (key, city) => key && index.set(key.trim().toLowerCase(), city);
  db.prepare('SELECT id, name, aliases, lat, lng FROM cities').all().forEach((c) => {
    add(c.name, c);
    c.aliases.split(',').forEach((a) => add(a, c));
  });
  db.prepare('SELECT a.iata AS code, c.id, c.name, c.aliases, c.lat, c.lng FROM airports a JOIN cities c ON c.id = a.city_id')
    .all().forEach((r) => add(r.code, r));
  db.prepare('SELECT s.code, c.id, c.name, c.aliases, c.lat, c.lng FROM stations s JOIN cities c ON c.id = s.city_id')
    .all().forEach((r) => add(r.code, r));

  // Accepts "Goa", "goa, india", "BLR", "Bangalore". Returns the city row or null.
  return (text) => {
    const raw = String(text || '').trim().toLowerCase();
    if (!raw) return null;
    const first = raw.split(',')[0].trim();
    return index.get(raw) || index.get(first) || null;
  };
};

// ── Dynamic pricing (sample): fares rise as the departure date nears ──
const demandMultiplier = (date, today = new Date()) => {
  if (!date) return 1;
  const days = (new Date(`${date}T00:00:00Z`) - today) / 86400000;
  if (days < 7) return 1.3;
  if (days < 21) return 1.1;
  if (days > 60) return 0.92;
  return 1;
};
const isoWeekday = (date) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return String(d === 0 ? 7 : d);
};

// Derive per-category caps from a whole-trip budget when the AI gave no explicit cap.
const effectiveCaps = (f) => {
  const caps = {
    transport: f.transport.max_price_inr,
    hotel: f.hotel.max_price_per_night_inr,
  };
  if (f.budget_total_inr) {
    // ~20% of budget per one-way leg (round trip = 40%), ~40% on rooms.
    caps.transport ??= Math.floor((f.budget_total_inr * 0.2) / f.travelers);
    caps.hotel ??= Math.floor((f.budget_total_inr * 0.4) / f.nights / rooms(f.travelers));
  }
  return caps;
};

// ── Ranking ────────────────────────────────────────────────────────
// Min-max normalise to 0..1 where higher is better.
const normaliser = (values, higherIsBetter) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return (v) => (hi === lo ? 1 : (higherIsBetter ? v - lo : hi - v) / (hi - lo));
};

const rank = (items, sort, { price, duration, rating, stars, stops }) => {
  if (!items.length) return items;
  const nPrice = normaliser(items.map(price), false);
  const nDur = duration ? normaliser(items.map(duration), false) : () => 0;
  const nRating = rating ? normaliser(items.map(rating), true) : () => 0;
  const nStars = stars ? normaliser(items.map(stars), true) : () => 0;
  const score = (i) => {
    if (rating) return 0.4 * nRating(rating(i)) + 0.35 * nPrice(price(i)) + 0.25 * nStars(stars(i));
    return 0.5 * nPrice(price(i)) + 0.4 * nDur(duration(i)) + 0.1 * (stops && stops(i) === 0 ? 1 : 0);
  };
  const key = {
    price: (a, b) => price(a) - price(b),
    duration: (a, b) => (duration ? duration(a) - duration(b) : 0) || price(a) - price(b),
    rating: (a, b) => (rating ? rating(b) - rating(a) : 0) || price(a) - price(b),
    best: (a, b) => score(b) - score(a),
  }[sort] || ((a, b) => score(b) - score(a));
  return [...items].sort(key).map((it) => ({ ...it, score: Math.round(score(it) * 100) / 100 }));
};

// ── Queries (every user-influenced value is a bound parameter) ─────
const queryFlights = (db, f, o, d, caps, relaxPrice) => {
  const where = ['oa.city_id = ?', 'da.city_id = ?'];
  const params = [o.id, d.id];
  const mult = demandMultiplier(f.date);
  if (f.date) { where.push('instr(fl.operating_days, ?) > 0'); params.push(isoWeekday(f.date)); }
  if (caps.transport && !relaxPrice) { where.push('fl.base_price <= ?'); params.push(caps.transport / mult); }
  if (f.transport.max_stops !== null) { where.push('fl.stops <= ?'); params.push(f.transport.max_stops); }
  if (f.transport.max_duration_min) { where.push('fl.duration_min <= ?'); params.push(f.transport.max_duration_min); }
  if (f.transport.depart_after) { where.push('fl.dep_time >= ?'); params.push(f.transport.depart_after); }
  if (f.transport.depart_before) { where.push('fl.dep_time <= ?'); params.push(f.transport.depart_before); }
  if (f.transport.cabin) { where.push('fl.cabin = ?'); params.push(f.transport.cabin); }

  return db.prepare(`
    SELECT fl.*, oa.name AS origin_airport, da.name AS dest_airport
    FROM flights fl
    JOIN airports oa ON oa.iata = fl.origin_iata
    JOIN airports da ON da.iata = fl.dest_iata
    WHERE ${where.join(' AND ')}`).all(...params).map((r) => {
    const perPerson = Math.round(r.base_price * mult);
    return {
      id: r.flight_number,
      type: 'flight',
      airline: r.airline_name,
      flight_number: r.flight_number,
      from: { code: r.origin_iata, airport: r.origin_airport, city: o.name },
      to: { code: r.dest_iata, airport: r.dest_airport, city: d.name },
      departs: r.dep_time,
      arrives: r.arr_time,
      arrives_next_day: Boolean(r.arr_day_offset),
      duration_min: r.duration_min,
      stops: r.stops,
      cabin: r.cabin,
      seats_left: r.seats_left,
      price_per_person: perPerson,
      total_price: perPerson * f.travelers,
    };
  });
};

const queryTrains = (db, f, o, d, caps, relaxPrice) => {
  const fare = '(tc.base_fare + tc.per_km * (sd.distance_km - so.distance_km))';
  const where = ['os.city_id = ?', 'ds.city_id = ?'];
  const params = [o.id, d.id];
  if (f.date) { where.push('instr(t.operating_days, ?) > 0'); params.push(isoWeekday(f.date)); }
  if (caps.transport && !relaxPrice) { where.push(`${fare} <= ?`); params.push(caps.transport); }
  if (f.transport.train_classes.length) {
    where.push(`tc.class_code IN (${placeholders(f.transport.train_classes.length)})`);
    params.push(...f.transport.train_classes);
  }
  if (f.transport.depart_after) { where.push('so.dep_time >= ?'); params.push(f.transport.depart_after); }
  if (f.transport.depart_before) { where.push('so.dep_time <= ?'); params.push(f.transport.depart_before); }

  const rows = db.prepare(`
    SELECT t.number, t.name, t.category, so.station_code AS from_code, os.name AS from_station,
           sd.station_code AS to_code, ds.name AS to_station, so.dep_time, so.day_offset AS o_day,
           sd.arr_time, sd.day_offset AS d_day, (sd.distance_km - so.distance_km) AS km,
           tc.class_code, ROUND(${fare}) AS fare
    FROM train_stops so
    JOIN train_stops sd ON sd.train_number = so.train_number AND sd.seq > so.seq
    JOIN trains t ON t.number = so.train_number
    JOIN train_classes tc ON tc.train_number = t.number
    JOIN stations os ON os.code = so.station_code
    JOIN stations ds ON ds.code = sd.station_code
    WHERE ${where.join(' AND ')}
    ORDER BY t.number, fare`).all(...params);

  const byTrain = new Map();
  rows.forEach((r) => {
    const key = `${r.number}|${r.from_code}|${r.to_code}`;
    if (!byTrain.has(key)) {
      const duration = (r.d_day - r.o_day) * 1440 + toMin(r.arr_time) - toMin(r.dep_time);
      byTrain.set(key, {
        id: r.number,
        type: 'train',
        number: r.number,
        name: r.name,
        category: r.category,
        from: { code: r.from_code, station: r.from_station, city: o.name },
        to: { code: r.to_code, station: r.to_station, city: d.name },
        departs: r.dep_time,
        arrives: r.arr_time,
        arrives_day_offset: r.d_day - r.o_day,
        duration_min: duration,
        distance_km: r.km,
        classes: [],
      });
    }
    byTrain.get(key).classes.push({ class: r.class_code, fare: r.fare });
  });

  return [...byTrain.values()]
    .filter((t) => !f.transport.max_duration_min || t.duration_min <= f.transport.max_duration_min)
    .map((t) => {
      const perPerson = Math.min(...t.classes.map((c) => c.fare));
      return { ...t, price_per_person: perPerson, total_price: perPerson * f.travelers };
    });
};

const queryHotels = (db, f, d, caps, relaxPrice) => {
  const where = ['h.city_id = ?', 'h.rooms_left >= ?'];
  const params = [d.id, rooms(f.travelers)];
  if (f.hotel.min_stars) { where.push('h.stars >= ?'); params.push(f.hotel.min_stars); }
  if (f.hotel.max_stars) { where.push('h.stars <= ?'); params.push(f.hotel.max_stars); }
  if (f.hotel.min_rating) { where.push('h.rating >= ?'); params.push(f.hotel.min_rating); }
  if (caps.hotel && !relaxPrice) { where.push('h.price_per_night <= ?'); params.push(caps.hotel); }
  if (f.hotel.amenities.length) {
    // relational division: the hotel must have ALL requested amenities
    where.push(`(SELECT COUNT(DISTINCT a.code) FROM hotel_amenities ha JOIN amenities a ON a.id = ha.amenity_id
                 WHERE ha.hotel_id = h.id AND a.code IN (${placeholders(f.hotel.amenities.length)})) = ?`);
    params.push(...f.hotel.amenities, f.hotel.amenities.length);
  }

  return db.prepare(`
    SELECT h.*, (SELECT group_concat(a.code) FROM hotel_amenities ha
                 JOIN amenities a ON a.id = ha.amenity_id WHERE ha.hotel_id = h.id) AS amenity_codes
    FROM hotels h WHERE ${where.join(' AND ')}`).all(...params).map((r) => ({
    id: r.id,
    type: 'hotel',
    name: r.name,
    chain: r.chain,
    city: d.name,
    area: r.area,
    stars: r.stars,
    rating: r.rating,
    review_count: r.review_count,
    amenities: (r.amenity_codes || '').split(',').filter(Boolean),
    lat: r.lat,
    lng: r.lng,
    rooms_left: r.rooms_left,
    price_per_night: r.price_per_night,
    rooms_needed: rooms(f.travelers),
    total_price: r.price_per_night * f.nights * rooms(f.travelers),
  }));
};

const queryCabs = (db, f, o, d) => {
  const km = roadKm(o, d);
  if (km > CAB_MAX_KM) return [];
  return db.prepare('SELECT * FROM cab_types').all().map((c) => {
    const vehicles = Math.ceil(f.travelers / c.capacity);
    const perVehicle = Math.round(c.base_fare + c.per_km * km);
    return {
      id: c.id, type: 'cab', title: `${c.provider} ${c.vehicle_class} cab`, provider: c.provider,
      vehicle_class: c.vehicle_class, models: c.models, capacity: c.capacity,
      from: { city: o.name }, to: { city: d.name }, distance_km: km, duration_min: cabMinutes(km),
      vehicles, price_per_vehicle: perVehicle, total_price: perVehicle * vehicles,
      price_per_person: Math.round((perVehicle * vehicles) / f.travelers),
    };
  });
};

// Run a category query; if a price cap emptied it, retry without the cap and say so.
const withRelaxation = (name, notes, run) => {
  const strict = run(false);
  if (strict.length) return strict;
  const relaxed = run(true);
  if (relaxed.length) notes.push(`No ${name} within the price limit; showing the closest available options.`);
  return relaxed;
};

/**
 * @param {DatabaseSync} db
 * @param {object} rawFilters  untrusted filter JSON (from the LLM or the client)
 * @returns {{filters, flights, trains, hotels, notes}}
 */
const recommend = (db, rawFilters) => {
  const resolve = buildCityResolver(db);
  const f = sanitizeFilters(rawFilters, (t) => resolve(t)?.name || null);
  const o = f.origin && resolve(f.origin);
  const d = f.destination && resolve(f.destination);
  const notes = [];
  const result = { filters: f, flights: [], trains: [], cabs: [], hotels: [], notes };

  if (!d) { notes.push('Destination not recognised, so nothing could be matched.'); return result; }
  const caps = effectiveCaps(f);
  const wants = (m) => f.modes.includes(m);

  if ((wants('flight') || wants('train')) && !o) {
    notes.push('Add a departure city to see flights and trains.');
  } else if (o && o.id === d.id) {
    notes.push('Origin and destination are the same city; skipping transport.');
  } else if (o) {
    if (wants('flight')) {
      const flights = withRelaxation('flights', notes, (relax) => queryFlights(db, f, o, d, caps, relax));
      result.flights = rank(flights, f.sort, {
        price: (x) => x.price_per_person, duration: (x) => x.duration_min, stops: (x) => x.stops,
      }).slice(0, f.limit);
      if (!flights.length) notes.push(`No direct flight data for ${o.name} → ${d.name}.`);
    }
    if (wants('cab')) {
      result.cabs = rank(queryCabs(db, f, o, d), f.sort, {
        price: (x) => x.total_price, duration: (x) => x.duration_min,
      }).slice(0, f.limit);
    }
    if (wants('train')) {
      const trains = withRelaxation('trains', notes, (relax) => queryTrains(db, f, o, d, caps, relax));
      result.trains = rank(trains, f.sort, {
        price: (x) => x.price_per_person, duration: (x) => x.duration_min,
      }).slice(0, f.limit);
      if (!trains.length) notes.push(`No train data for ${o.name} → ${d.name}.`);
    }
  }

  if (wants('hotel')) {
    const hotels = withRelaxation('hotels', notes, (relax) => queryHotels(db, f, d, caps, relax));
    result.hotels = rank(hotels, f.sort, {
      price: (x) => x.price_per_night, rating: (x) => x.rating, stars: (x) => x.stars,
    }).slice(0, f.limit);
  }
  return result;
};

const cityNames = (db) => db.prepare('SELECT name FROM cities ORDER BY name').all().map((c) => c.name);

module.exports = { recommend, queryFlights, queryTrains, queryHotels, queryCabs, effectiveCaps, rank, buildCityResolver, cityNames, demandMultiplier, isoWeekday, rooms };
