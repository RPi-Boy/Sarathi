// Trips (itineraries) and the flight / train / hotel bookings attached to them.
// All prices are computed here from catalog data; the client only says *what* to book.
const { transaction } = require('../db');
const { buildCityResolver, demandMultiplier, isoWeekday, rooms } = require('./recommend');
const { roadKm, cabMinutes, CAB_MAX_KM } = require('./geo');

class BookingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const intIn = (v, lo, hi, fallback) => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new BookingError(`Value must be a whole number from ${lo} to ${hi}.`);
  return n;
};
const validDate = (v) => {
  if (v === undefined || v === null || v === '') throw new BookingError('Pick a travel date.');
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new BookingError('Date must be YYYY-MM-DD.');
  if (d < new Date(new Date().toISOString().slice(0, 10))) throw new BookingError('That date is in the past.');
  return v;
};

// ── Details ────────────────────────────────────────────────────────
const flightDetails = (db, flightNumber, { date = null, travelers = 1 } = {}) => {
  const r = db.prepare(`
    SELECT f.*, oa.name AS origin_airport, oc.name AS origin_city, da.name AS dest_airport, dc.name AS dest_city
    FROM flights f
    JOIN airports oa ON oa.iata = f.origin_iata JOIN cities oc ON oc.id = oa.city_id
    JOIN airports da ON da.iata = f.dest_iata   JOIN cities dc ON dc.id = da.city_id
    WHERE f.flight_number = ?`).get(flightNumber);
  if (!r) return null;
  const perPerson = Math.round(r.base_price * demandMultiplier(date));
  return {
    type: 'flight',
    id: r.flight_number,
    title: `${r.airline_name} ${r.flight_number}`,
    airline: r.airline_name,
    flight_number: r.flight_number,
    from: { code: r.origin_iata, airport: r.origin_airport, city: r.origin_city },
    to: { code: r.dest_iata, airport: r.dest_airport, city: r.dest_city },
    departs: r.dep_time,
    arrives: r.arr_time,
    arrives_next_day: Boolean(r.arr_day_offset),
    duration_min: r.duration_min,
    stops: r.stops,
    cabin: r.cabin,
    operating_days: r.operating_days,
    seats_left: r.seats_left,
    price_per_person: perPerson,
    total_price: perPerson * travelers,
    destination: r.dest_city,
    listing_url: r.listing_url,
  };
};

const trainSegment = (db, number, fromCode, toCode) =>
  db.prepare(`
    SELECT so.station_code AS from_code, os.name AS from_station, oc.name AS from_city, so.dep_time,
           sd.station_code AS to_code, ds.name AS to_station, dc.name AS to_city, sd.arr_time,
           (sd.day_offset - so.day_offset) AS day_diff, (sd.distance_km - so.distance_km) AS km
    FROM train_stops so
    JOIN train_stops sd ON sd.train_number = so.train_number AND sd.seq > so.seq
    JOIN stations os ON os.code = so.station_code JOIN cities oc ON oc.id = os.city_id
    JOIN stations ds ON ds.code = sd.station_code JOIN cities dc ON dc.id = ds.city_id
    WHERE so.train_number = ? AND so.station_code = ? AND sd.station_code = ?`).get(number, fromCode, toCode);

const trainDetails = (db, number, { from = null, to = null, travelers = 1 } = {}) => {
  const t = db.prepare('SELECT * FROM trains WHERE number = ?').get(number);
  if (!t) return null;
  const stops = db.prepare(`
    SELECT ts.seq, ts.station_code AS code, s.name AS station, c.name AS city, ts.arr_time, ts.dep_time,
           ts.day_offset, ts.distance_km
    FROM train_stops ts JOIN stations s ON s.code = ts.station_code JOIN cities c ON c.id = s.city_id
    WHERE ts.train_number = ? ORDER BY ts.seq`).all(number);
  const fromCode = from || stops[0].code;
  const toCode = to || stops[stops.length - 1].code;
  const seg = trainSegment(db, number, fromCode, toCode);
  if (!seg) return null;
  const classes = db.prepare('SELECT class_code, per_km, base_fare FROM train_classes WHERE train_number = ?')
    .all(number)
    .map((c) => {
      const fare = Math.round(c.base_fare + c.per_km * seg.km);
      return { class: c.class_code, fare, total: fare * travelers };
    })
    .sort((a, b) => a.fare - b.fare);
  return {
    type: 'train',
    id: t.number,
    title: `${t.number} ${t.name}`,
    number: t.number,
    name: t.name,
    category: t.category,
    operating_days: t.operating_days,
    from: { code: seg.from_code, station: seg.from_station, city: seg.from_city },
    to: { code: seg.to_code, station: seg.to_station, city: seg.to_city },
    departs: seg.dep_time,
    arrives: seg.arr_time,
    arrives_day_offset: seg.day_diff,
    duration_min: seg.day_diff * 1440 + toMin(seg.arr_time) - toMin(seg.dep_time),
    distance_km: seg.km,
    classes,
    stops,
    price_per_person: classes[0].fare,
    total_price: classes[0].fare * travelers,
    destination: seg.to_city,
    listing_url: t.listing_url,
  };
};

const hotelDetails = (db, id, { nights = 1, travelers = 1 } = {}) => {
  const r = db.prepare('SELECT h.*, c.name AS city FROM hotels h JOIN cities c ON c.id = h.city_id WHERE h.id = ?').get(id);
  if (!r) return null;
  const amenities = db.prepare(`SELECT a.code, a.name FROM hotel_amenities ha JOIN amenities a ON a.id = ha.amenity_id
                                WHERE ha.hotel_id = ? ORDER BY a.id`).all(id);
  const needed = rooms(travelers);
  return {
    type: 'hotel',
    id: r.id,
    title: r.name,
    name: r.name,
    chain: r.chain,
    city: r.city,
    area: r.area,
    stars: r.stars,
    rating: r.rating,
    review_count: r.review_count,
    amenities,
    lat: r.lat,
    lng: r.lng,
    rooms_left: r.rooms_left,
    price_per_night: r.price_per_night,
    rooms_needed: needed,
    nights,
    total_price: r.price_per_night * nights * needed,
    destination: r.city,
    listing_url: r.listing_url,
  };
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// from / to are city rows ({id, name, lat, lng}).
const cabDetails = (db, cabTypeId, { from, to, travelers = 1, startTime = null } = {}) => {
  const c = db.prepare('SELECT * FROM cab_types WHERE id = ?').get(cabTypeId);
  if (!c || !from || !to || from.id === to.id) return null;
  const km = roadKm(from, to);
  if (km > CAB_MAX_KM) return null;
  const vehicles = Math.ceil(travelers / c.capacity);
  const perVehicle = Math.round(c.base_fare + c.per_km * km);
  return {
    type: 'cab',
    id: c.id,
    title: `${c.provider} ${c.vehicle_class} cab`,
    provider: c.provider,
    vehicle_class: c.vehicle_class,
    models: c.models,
    capacity: c.capacity,
    from: { city: from.name },
    to: { city: to.name },
    distance_km: km,
    duration_min: cabMinutes(km),
    start_time: startTime,
    vehicles,
    price_per_vehicle: perVehicle,
    price_per_person: Math.round((perVehicle * vehicles) / travelers),
    total_price: perVehicle * vehicles,
    destination: to.name,
    listing_url: c.listing_url,
  };
};

const cityById = (db, id) => db.prepare('SELECT id, name, lat, lng FROM cities WHERE id = ?').get(id);

const getDetails = (db, type, ref, q = {}) => {
  const travelers = intIn(q.travelers, 1, 20, 1);
  if (type === 'flight') return flightDetails(db, String(ref), { date: q.date || null, travelers });
  if (type === 'train') return trainDetails(db, String(ref), { from: q.from, to: q.to, travelers });
  if (type === 'hotel') return hotelDetails(db, Number(ref), { nights: intIn(q.nights, 1, 30, 1), travelers });
  if (type === 'cab') {
    const resolve = buildCityResolver(db);
    return cabDetails(db, Number(ref), { from: resolve(q.from), to: resolve(q.to), travelers, startTime: HHMM.test(q.start_time || '') ? q.start_time : null });
  }
  return null;
};

// ── Trips ──────────────────────────────────────────────────────────
const canonicalDestination = (db, text) => {
  const city = buildCityResolver(db)(text);
  return city ? city.name : String(text || '').trim().split(',')[0].slice(0, 80);
};

const cleanTripName = (v) => {
  const name = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new BookingError('Give your trip a name.');
  if (name.length > 80) throw new BookingError('Trip names can be at most 80 characters.');
  return name;
};

// `plan` is the AI itinerary text from the user's session; it is attached when the destination matches.
const createTrip = (db, userId, { name, destination, travelers = 1, plan = null }) => {
  const title = cleanTripName(name);
  const content = plan && canonicalDestination(db, plan.destination) === destination ? plan.text : '';
  try {
    const info = db.prepare('INSERT INTO itineraries (user_id, title, destination, travelers, content) VALUES (?,?,?,?,?)')
      .run(userId, title, destination, travelers, content);
    return Number(info.lastInsertRowid);
  } catch (err) {
    if (/UNIQUE/i.test(err.message)) throw new BookingError('You already have a trip with that name.', 409);
    throw err;
  }
};

const tripSummaries = (db, userId) =>
  db.prepare('SELECT id, title, destination, start_at FROM itineraries WHERE user_id = ? ORDER BY id DESC').all(userId);

// ── Timeline ───────────────────────────────────────────────────────
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const stamp = (iso, time, dayOffset = 0) => `${addDays(iso, dayOffset)}T${time}`;
const addMinutes = (isoLocal, minutes) => {
  const d = new Date(`${isoLocal}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
};
const HOTEL_CHECK_IN = '14:00';
const HOTEL_CHECK_OUT = '11:00';

// Departures / arrivals / check-ins / check-outs for one booking.
const eventsFor = (b) => {
  if (b.status !== 'booked' || !b.travel_date) return [];
  const d = b.detail;
  const base = { booking_id: b.id, type: b.type, title: d.title };
  if (b.type === 'flight') {
    return [
      { ...base, kind: 'departure', at: stamp(b.travel_date, d.departs), place: `${d.from.city} (${d.from.code}) · ${d.from.airport}` },
      { ...base, kind: 'arrival', at: stamp(b.travel_date, d.arrives, d.arrives_next_day ? 1 : 0), place: `${d.to.city} (${d.to.code}) · ${d.to.airport}` },
    ];
  }
  if (b.type === 'train') {
    return [
      { ...base, kind: 'departure', at: stamp(b.travel_date, d.departs), place: `${d.from.station} (${d.from.code})` },
      { ...base, kind: 'arrival', at: stamp(b.travel_date, d.arrives, d.arrives_day_offset), place: `${d.to.station} (${d.to.code})` },
    ];
  }
  if (b.type === 'cab') {
    const start = stamp(b.travel_date, b.start_time);
    return [
      { ...base, kind: 'departure', at: start, place: `${d.from.city} (pickup)` },
      { ...base, kind: 'arrival', at: addMinutes(start, d.duration_min), place: `${d.to.city} (drop)` },
    ];
  }
  return [
    { ...base, kind: 'check_in', at: stamp(b.travel_date, HOTEL_CHECK_IN), place: `${d.area}, ${d.city}` },
    { ...base, kind: 'check_out', at: stamp(b.travel_date, HOTEL_CHECK_OUT, b.nights), place: `${d.area}, ${d.city}` },
  ];
};
const KIND_ORDER = { arrival: 0, check_out: 0, departure: 1, check_in: 1 };
const buildTimeline = (bookings) =>
  bookings.flatMap(eventsFor).sort((a, b) => a.at.localeCompare(b.at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

// start_at = earliest departure / check-in among active bookings
const refreshTripStart = (db, tripId) => {
  const trip = db.prepare('SELECT user_id FROM itineraries WHERE id = ?').get(tripId);
  if (!trip) return;
  const first = buildTimeline(loadBookings(db, tripId)).find((e) => e.kind === 'departure' || e.kind === 'check_in');
  db.prepare('UPDATE itineraries SET start_at = ? WHERE id = ?').run(first ? first.at : null, tripId);
};

// ── Booking ────────────────────────────────────────────────────────
const placeBooking = (db, userId, input = {}, { plan = null } = {}) => {
  const { type } = input;
  const travelers = intIn(input.travelers, 1, 20, 1);
  const date = validDate(input.date);

  {
    const row = { flight_number: null, train_number: null, hotel_id: null, cab_type_id: null, from_code: null, to_code: null,
      from_city_id: null, to_city_id: null, start_time: null, class_code: null, travel_date: date, nights: null,
      quantity: travelers, total_price: 0 };
    let destination;
    let listing_url;

    if (type === 'flight') {
      const f = flightDetails(db, String(input.ref), { date, travelers });
      if (!f) throw new BookingError('Flight not found.', 404);
      if (date && !f.operating_days.includes(isoWeekday(date))) throw new BookingError('This flight does not operate on that day.');
      const upd = db.prepare('UPDATE flights SET seats_left = seats_left - ? WHERE flight_number = ? AND seats_left >= ?')
        .run(travelers, f.flight_number, travelers);
      if (!upd.changes) throw new BookingError('Not enough seats left on this flight.', 409);
      Object.assign(row, { flight_number: f.flight_number, total_price: f.total_price });
      destination = f.destination;
      listing_url = f.listing_url;
    } else if (type === 'train') {
      const t = trainDetails(db, String(input.ref), { from: input.from, to: input.to, travelers });
      if (!t) throw new BookingError('Train or route not found.', 404);
      if (date && !t.operating_days.includes(isoWeekday(date))) throw new BookingError('This train does not run on that day.');
      const cls = t.classes.find((c) => c.class === input.class);
      if (!cls) throw new BookingError('Choose a valid class for this train.');
      Object.assign(row, { train_number: t.number, from_code: t.from.code, to_code: t.to.code,
        class_code: cls.class, total_price: cls.total });
      destination = t.destination;
      listing_url = t.listing_url;
    } else if (type === 'hotel') {
      const nights = intIn(input.nights, 1, 30, 1);
      const h = hotelDetails(db, Number(input.ref), { nights, travelers });
      if (!h) throw new BookingError('Hotel not found.', 404);
      const upd = db.prepare('UPDATE hotels SET rooms_left = rooms_left - ? WHERE id = ? AND rooms_left >= ?')
        .run(h.rooms_needed, h.id, h.rooms_needed);
      if (!upd.changes) throw new BookingError('Not enough rooms left at this hotel.', 409);
      Object.assign(row, { hotel_id: h.id, nights, quantity: h.rooms_needed, total_price: h.total_price });
      destination = h.city;
      listing_url = h.listing_url;
    } else if (type === 'cab') {
      const resolve = buildCityResolver(db);
      const from = resolve(input.from);
      const to = resolve(input.to);
      if (!from || !to) throw new BookingError('Pick pickup and drop cities for the cab.');
      if (!HHMM.test(input.start_time || '')) throw new BookingError('Pick a pickup time (HH:MM).');
      const cab = cabDetails(db, Number(input.ref), { from, to, travelers, startTime: input.start_time });
      if (!cab) throw new BookingError('That cab is not available for this route.', 404);
      Object.assign(row, { cab_type_id: cab.id, from_city_id: from.id, to_city_id: to.id, start_time: input.start_time,
        quantity: cab.vehicles, total_price: cab.total_price });
      destination = cab.destination;
      listing_url = cab.listing_url;
    } else {
      throw new BookingError('type must be flight, train, hotel or cab.');
    }

    let tripId;
    if (input.itinerary_id !== undefined && input.itinerary_id !== null && input.itinerary_id !== '') {
      const trip = db.prepare('SELECT id, destination, content FROM itineraries WHERE id = ? AND user_id = ?')
        .get(Number(input.itinerary_id), userId);
      if (!trip) throw new BookingError('Trip not found.', 404);
      tripId = trip.id;
      if (!trip.content && plan && canonicalDestination(db, plan.destination) === trip.destination) {
        db.prepare('UPDATE itineraries SET content = ? WHERE id = ?').run(plan.text, trip.id);
      }
    } else if (input.new_trip_name !== undefined) {
      const tripDest = input.trip_destination ? canonicalDestination(db, input.trip_destination) : destination;
      tripId = createTrip(db, userId, { name: input.new_trip_name, destination: tripDest, travelers, plan });
    } else {
      throw new BookingError('Choose a trip, or name a new one.');
    }

    const info = db.prepare(`INSERT INTO itinerary_items
      (itinerary_id, flight_number, train_number, hotel_id, cab_type_id, from_code, to_code, from_city_id, to_city_id,
       start_time, class_code, travel_date, nights, quantity, total_price) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(tripId, row.flight_number, row.train_number, row.hotel_id, row.cab_type_id, row.from_code, row.to_code,
        row.from_city_id, row.to_city_id, row.start_time, row.class_code, row.travel_date, row.nights, row.quantity,
        row.total_price);
    refreshTripStart(db, tripId);
    return { booking_id: Number(info.lastInsertRowid), itinerary_id: tripId, total_price: row.total_price, listing_url };
  }
};

const createBooking = (db, userId, input = {}, opts = {}) =>
  transaction(db, () => placeBooking(db, userId, input, opts));

// Book several items into one trip, all-or-nothing. input: { items: [...], new_trip_name | itinerary_id, trip_destination }
const createBookings = (db, userId, input = {}, opts = {}) => {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length || items.length > 20) throw new BookingError('Send between 1 and 20 items to book.');
  return transaction(db, () => {
    let tripId = input.itinerary_id ?? null;
    const results = items.map((item) => {
      const trip = tripId !== null && tripId !== ''
        ? { itinerary_id: tripId }
        : { new_trip_name: input.new_trip_name, trip_destination: input.trip_destination };
      const r = placeBooking(db, userId, { ...item, ...trip }, opts);
      tripId = r.itinerary_id;
      return r;
    });
    return { itinerary_id: tripId, bookings: results, total_price: results.reduce((sum, r) => sum + r.total_price, 0) };
  });
};

const cancelBooking = (db, userId, bookingId) =>
  transaction(db, () => {
    const item = db.prepare(`SELECT ii.* FROM itinerary_items ii JOIN itineraries i ON i.id = ii.itinerary_id
                             WHERE ii.id = ? AND i.user_id = ?`).get(bookingId, userId);
    if (!item) throw new BookingError('Booking not found.', 404);
    if (item.status === 'cancelled') return false;
    db.prepare("UPDATE itinerary_items SET status = 'cancelled' WHERE id = ?").run(item.id);
    if (item.flight_number) db.prepare('UPDATE flights SET seats_left = seats_left + ? WHERE flight_number = ?').run(item.quantity, item.flight_number);
    if (item.hotel_id) db.prepare('UPDATE hotels SET rooms_left = rooms_left + ? WHERE id = ?').run(item.quantity, item.hotel_id);
    refreshTripStart(db, item.itinerary_id);
    return true;
  });

const loadBookings = (db, tripId) =>
  db.prepare('SELECT * FROM itinerary_items WHERE itinerary_id = ? ORDER BY id').all(tripId).map((it) => {
    const type = it.flight_number ? 'flight' : it.train_number ? 'train' : it.cab_type_id ? 'cab' : 'hotel';
    const detail =
      type === 'flight' ? flightDetails(db, it.flight_number, { date: it.travel_date, travelers: it.quantity })
      : type === 'train' ? trainDetails(db, it.train_number, { from: it.from_code, to: it.to_code, travelers: it.quantity })
      : type === 'cab' ? cabDetails(db, it.cab_type_id, { from: cityById(db, it.from_city_id), to: cityById(db, it.to_city_id), travelers: it.quantity, startTime: it.start_time })
      : hotelDetails(db, it.hotel_id, { nights: it.nights, travelers: it.quantity * 2 });
    return {
      id: it.id, type, status: it.status, travel_date: it.travel_date, nights: it.nights,
      quantity: it.quantity, class_code: it.class_code, total_price: it.total_price,
      booked_at: it.created_at, start_time: it.start_time, vehicles: it.cab_type_id ? it.quantity : undefined,
      ref: it.flight_number || it.train_number || it.cab_type_id || it.hotel_id, detail,
    };
  });

const listTrips = (db, userId) =>
  db.prepare('SELECT * FROM itineraries WHERE user_id = ? ORDER BY COALESCE(start_at, \'9999\'), id DESC').all(userId).map((trip) => {
    const bookings = loadBookings(db, trip.id);
    const total = bookings.filter((b) => b.status === 'booked').reduce((sum, b) => sum + b.total_price, 0);
    return {
      id: trip.id, title: trip.title, destination: trip.destination, start_at: trip.start_at,
      travelers: trip.travelers, content: trip.content, created_at: trip.created_at,
      total_price: total, bookings, timeline: buildTimeline(bookings),
    };
  });

module.exports = {
  BookingError, cabDetails, addMinutes, getDetails, createBooking, createBookings, cancelBooking, listTrips, tripSummaries,
};
