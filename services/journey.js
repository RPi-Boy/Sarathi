// Multi-leg journey planner. The LLM proposes *which* legs (cab -> train -> cab -> hotel -> ...);
// this module checks each leg against the database, chains the timings and picks concrete options.
const {
  queryFlights, queryTrains, queryHotels, queryCabs, rank, buildCityResolver, rooms,
} = require('./recommend');
const { roadKm, cabMinutes } = require('./geo');
const { demandMultiplier, isoWeekday } = require('./recommend');

const BUFFER_MIN = { train: 75, flight: 120, cab: 15 }; // minimum gap after the previous leg arrives
const STATION_BUFFER_MIN = { train: 75, flight: 120 };  // arrive at the station/airport this early
const HOTEL_CHECK_OUT = '11:00';

// ── local date-time helpers ('YYYY-MM-DDTHH:MM' wall-clock strings) ──
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const stamp = (date, time, dayOffset = 0) => `${addDays(date, dayOffset)}T${time}`;
const addMinutes = (at, minutes) => {
  const d = new Date(`${at}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
};
const diffDays = (a, b) => Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);

// ── option shaping ─────────────────────────────────────────────────
const asOption = (leg, date, opt) => {
  const base = { ...opt };
  if (opt.type === 'flight') {
    return { ...base, depart_at: stamp(date, opt.departs), arrive_at: stamp(date, opt.arrives, opt.arrives_next_day ? 1 : 0),
      book: { type: 'flight', ref: opt.id, date } };
  }
  const cls = opt.classes.find((c) => c.class === leg.train_class) || opt.classes[0];
  return { ...base, chosen_class: cls.class, total_price: cls.fare * (opt.total_price / opt.price_per_person),
    depart_at: stamp(date, opt.departs), arrive_at: stamp(date, opt.arrives, opt.arrives_day_offset),
    book: { type: 'train', ref: opt.id, date, from: opt.from.code, to: opt.to.code, class: cls.class } };
};

// Whatever the budget has left after transport goes to the room, with a 10% safety margin.
const hotelCap = (f, nights, transportEstimate = 0) => {
  if (f.hotel.max_price_per_night_inr) return f.hotel.max_price_per_night_inr;
  if (f.budget_total_inr) {
    const left = Math.max(f.budget_total_inr - transportEstimate, f.budget_total_inr * 0.2);
    return Math.floor((left * 0.9) / nights / rooms(f.travelers));
  }
  return null;
};

const planJourney = (db, filters, journey) => {
  const f = filters;
  const j = journey;
  if (!j) return null;
  const resolve = buildCityResolver(db);
  const legs = [];
  const notes = [];
  let cursor = j.earliest_start; // when the traveller is next free, at the next leg's origin
  let where = null;              // city where the traveller currently is

  j.legs.forEach((leg, i) => {
    const issues = [];
    const o = leg.from && resolve(leg.from);
    const d = leg.to && resolve(leg.to);
    const res = { index: i, mode: leg.mode, from: o?.name || leg.from_text, to: d?.name || leg.to_text, date: leg.date,
      note: leg.note, issues, options: [], selected: 0, depart_at: null, arrive_at: null };
    legs.push(res);

    if (!o || !d) { issues.push(`Could not match "${!o ? leg.from_text : leg.to_text}" to a city in our data.`); return; }
    if (where && leg.mode !== 'hotel' && where !== o.name) issues.push(`This leg starts in ${o.name} but the previous leg ended in ${where}.`);
    if (leg.mode !== 'hotel' && o.id === d.id) { issues.push('Origin and destination are the same city.'); return; }

    const lf = { ...f, origin: o.name, destination: d.name, transport: { ...f.transport, max_price_inr: null, max_duration_min: null,
      depart_after: leg.depart_after, depart_before: leg.depart_before, train_classes: [], cabin: null }, sort: f.sort };
    const noCaps = { transport: null, hotel: null };

    if (leg.mode === 'flight' || leg.mode === 'train') {
      const minDep = cursor ? addMinutes(cursor, BUFFER_MIN[leg.mode]) : null;
      const dates = leg.date ? [leg.date] : cursor ? [0, 1, 2].map((n) => addDays(cursor.slice(0, 10), n)) : [];
      if (!dates.length) { issues.push('No date for this leg.'); return; }

      const gather = (windows) => {
        for (const date of dates) {
          const q = { ...lf, date, transport: windows ? lf.transport : { ...lf.transport, depart_after: null, depart_before: null } };
          let raw = leg.mode === 'flight' ? queryFlights(db, q, o, d, noCaps, true) : queryTrains(db, q, o, d, noCaps, true);
          if (leg.mode === 'train') {
            if (leg.from_station) raw = raw.filter((t) => t.from.code === leg.from_station);
            if (leg.to_station) raw = raw.filter((t) => t.to.code === leg.to_station);
          }
          const opts = raw.map((x) => asOption(leg, date, x)).filter((x) => !minDep || x.depart_at >= minDep);
          if (opts.length) return opts;
        }
        return [];
      };
      let opts = gather(true);
      if (!opts.length && (leg.depart_after || leg.depart_before)) {
        opts = gather(false);
        if (opts.length) issues.push('Nothing in the preferred time window; showing other departures.');
      }
      if (!opts.length) {
        issues.push(`No ${leg.mode} from ${o.name} to ${d.name}${leg.date ? ` on ${leg.date}` : ''} that connects with the previous leg.`);
        return;
      }
      let ranked = rank(opts, f.sort, { price: (x) => x.total_price, duration: (x) => x.duration_min, stops: (x) => x.stops });
      const pin = leg.train_number || leg.flight_number;
      const wanted = pin && ranked.findIndex((x) => x.number === pin || x.flight_number === pin);
      if (wanted > 0) ranked = [ranked[wanted], ...ranked.filter((_, k) => k !== wanted)];
      res.options = ranked.slice(0, 5);
    } else if (leg.mode === 'cab') {
      const ready = cursor ? addMinutes(cursor, BUFFER_MIN.cab)
        : leg.date ? stamp(leg.date, leg.depart_after || '08:00') : null;
      if (!ready) { issues.push('No start time for this cab.'); return; }
      const start = leg.date && leg.date > ready.slice(0, 10) ? stamp(leg.date, leg.depart_after || '08:00') : ready;
      const cabs = queryCabs(db, lf, o, d);
      if (!cabs.length) { issues.push(`${o.name} to ${d.name} is too far for a cab.`); return; }
      res.options = rank(cabs, 'price', { price: (x) => x.total_price, duration: (x) => x.duration_min })
        .slice(0, 5).map((c) => ({ ...c, depart_at: start, arrive_at: addMinutes(start, c.duration_min),
          book: { type: 'cab', ref: c.id, date: start.slice(0, 10), start_time: start.slice(11), from: o.name, to: d.name } }));
    } else {
      const checkIn = leg.date || (cursor && cursor.slice(0, 10));
      if (!checkIn) { issues.push('No check-in date for this stay.'); return; }
      // nights = gap to the next dated leg's departure (the model's count is only a fallback)
      const next = j.legs.slice(i + 1).find((l) => l.mode !== 'hotel' && l.date);
      const gap = next ? diffDays(next.date, checkIn) : 0;
      const nights = gap >= 1 ? gap : leg.nights || 1;
      if (leg.nights && gap >= 1 && gap !== leg.nights) issues.push(`Stay set to ${gap} night(s) to match the next departure on ${next.date}.`);
      const hf = { ...lf, nights, destination: d.name };
      let hotels = queryHotels(db, hf, d, { hotel: hotelCap(f, nights, j.transport_estimate) }, false);
      if (!hotels.length && hotelCap(f, nights, j.transport_estimate)) {
        hotels = queryHotels(db, hf, d, noCaps, true);
        if (hotels.length) issues.push('No hotel within the budget share; showing the closest options.');
      }
      if (!hotels.length) { issues.push(`No hotel available in ${d.name} for ${f.travelers} traveller(s).`); return; }
      const rankHotels = (list) => rank(list, f.sort === 'duration' ? 'best' : f.sort, {
        price: (x) => x.price_per_night, rating: (x) => x.rating, stars: (x) => x.stars,
      });
      let ordered = rankHotels(hotels);
      if (ordered.length < 3 && f.hotel.amenities.length) {
        // too few hotels offer every requested amenity: add the next best ones after them
        const cap = hotelCap(f, nights, j.transport_estimate);
        const loose = queryHotels(db, { ...hf, hotel: { ...f.hotel, amenities: [] } }, d, { hotel: cap }, !cap);
        const have = new Set(ordered.map((h) => h.id));
        ordered = [...ordered, ...rankHotels(loose.filter((h) => !have.has(h.id)))];
        issues.push(`Only ${hotels.length} hotel(s) within budget have ${f.hotel.amenities.join(' + ').replace(/_/g, ' ')}; others are listed after.`);
      }
      res.options = ordered.slice(0, 5).map((h) => ({ ...h, depart_at: stamp(checkIn, '14:00'), arrive_at: stamp(checkIn, HOTEL_CHECK_OUT, nights),
        nights, book: { type: 'hotel', ref: h.id, date: checkIn, nights } }));
    }

    const chosen = res.options[0];
    res.depart_at = chosen.depart_at;
    res.arrive_at = chosen.arrive_at;
    cursor = chosen.arrive_at;
    where = d.name;
  });

  // A cab before a train/flight: leave as late as possible while still reaching the station in time.
  legs.forEach((leg, i) => {
    const next = legs[i + 1];
    if (leg.mode !== 'cab' || !leg.options.length || !next || !next.options.length || !STATION_BUFFER_MIN[next.mode]) return;
    const cab = leg.options[0];
    const latest = addMinutes(next.depart_at, -(STATION_BUFFER_MIN[next.mode] + cab.duration_min));
    if (latest > cab.depart_at) {
      leg.options.forEach((c) => {
        c.depart_at = latest;
        c.arrive_at = addMinutes(latest, c.duration_min);
        c.book = { ...c.book, date: latest.slice(0, 10), start_time: latest.slice(11) };
      });
      leg.depart_at = latest;
      leg.arrive_at = addMinutes(latest, cab.duration_min);
    }
  });

  const done = legs.filter((l) => l.options.length);
  const total = done.reduce((sum, l) => sum + l.options[0].total_price, 0);
  const last = done[done.length - 1];
  if (j.arrive_by && last && last.arrive_at > j.arrive_by) notes.push(`This plan arrives at ${last.arrive_at.replace('T', ' ')}, after your ${j.arrive_by.replace('T', ' ')} deadline.`);
  legs.filter((l) => l.issues.length && !l.options.length).forEach((l) => notes.push(`Leg ${l.index + 1} (${l.mode} ${l.from} → ${l.to}): ${l.issues.join(' ')}`));
  const complete = legs.every((l) => l.options.length);
  return {
    legs, total_price: total, notes, complete,
    start_at: done[0]?.depart_at || null, end_at: last?.arrive_at || null,
    destination: (legs.find((l) => l.mode === 'hotel') || legs[0]).to,
  };
};


// ── Route search ───────────────────────────────────────────────────
// Time-expanded search over trains, flights and cabs. Labels are (city, arrival time, cost); a label is dropped
// when another label in the same city is no later and no dearer. Waits between legs are capped, so overnight
// stays in transit cities never appear.
const MAX_LEGS = 4;
const MAX_WAIT_MIN = 14 * 60;      // before the first leg (e.g. hotel check-out to an evening train)
const MAX_LAYOVER_MIN = 8 * 60;    // between legs, and never across midnight (no overnight stops in transit cities)
const CAB_EDGE_KM = 450;
const OUTBOUND_SLACK_MIN = 24 * 60; // accept routes arriving within a day of the fastest, then take the cheapest

const edgeSource = (db, travelers) => {
  const cities = new Map(db.prepare('SELECT id, name, lat, lng FROM cities').all().map((c) => [c.id, c]));
  const trainStmt = db.prepare(`
    SELECT t.number, t.name, so.station_code AS from_code, sd.station_code AS to_code, ds.city_id AS to_city,
           so.dep_time, sd.arr_time, (sd.day_offset - so.day_offset) AS day_diff,
           MIN(tc.base_fare + tc.per_km * (sd.distance_km - so.distance_km)) AS fare
    FROM train_stops so
    JOIN train_stops sd ON sd.train_number = so.train_number AND sd.seq > so.seq
    JOIN trains t ON t.number = so.train_number
    JOIN stations os ON os.code = so.station_code
    JOIN stations ds ON ds.code = sd.station_code
    JOIN train_classes tc ON tc.train_number = t.number
    WHERE os.city_id = ? AND instr(t.operating_days, ?) > 0 AND so.dep_time IS NOT NULL
    GROUP BY t.number, so.station_code, sd.station_code`);
  const flightStmt = db.prepare(`
    SELECT fl.flight_number, fl.airline_name, fl.dep_time, fl.arr_time, fl.arr_day_offset, fl.base_price, da.city_id AS to_city
    FROM flights fl
    JOIN airports oa ON oa.iata = fl.origin_iata JOIN airports da ON da.iata = fl.dest_iata
    WHERE oa.city_id = ? AND instr(fl.operating_days, ?) > 0 AND fl.seats_left >= ?`);
  const cabTypes = db.prepare('SELECT * FROM cab_types').all();
  const cache = new Map();

  const scheduled = (cityId, date) => {
    const key = `${cityId}|${date}`;
    if (cache.has(key)) return cache.get(key);
    const wd = isoWeekday(date);
    const edges = [
      ...trainStmt.all(cityId, wd).map((r) => ({
        mode: 'train', to: r.to_city, dep: stamp(date, r.dep_time), arr: stamp(date, r.arr_time, r.day_diff),
        cost: Math.round(r.fare) * travelers, leg: { train_number: r.number, from_station: r.from_code, to_station: r.to_code },
      })),
      ...flightStmt.all(cityId, wd, travelers).map((r) => ({
        mode: 'flight', to: r.to_city, dep: stamp(date, r.dep_time), arr: stamp(date, r.arr_time, r.arr_day_offset),
        cost: Math.round(r.base_price * demandMultiplier(date)) * travelers, leg: { flight_number: r.flight_number },
      })),
    ];
    cache.set(key, edges);
    return edges;
  };

  const cabs = (cityId) => {
    const from = cities.get(cityId);
    const out = [];
    cities.forEach((to) => {
      if (to.id === cityId) return;
      const km = roadKm(from, to);
      if (km > CAB_EDGE_KM) return;
      const cost = Math.min(...cabTypes.map((c) => Math.ceil(travelers / c.capacity) * Math.round(c.base_fare + c.per_km * km)));
      out.push({ mode: 'cab', to: to.id, minutes: cabMinutes(km), cost, leg: {} });
    });
    return out;
  };

  return { cities, scheduled, cabs };
};

// All routes from `fromId` to `toId` leaving no earlier than `start`. Returns [{ legs, arrive, cost, cities }].
const searchRoutes = (src, fromId, toId, start) => {
  const results = [];
  let frontier = [{ city: fromId, at: start, cost: 0, legs: [], path: [fromId] }];
  const best = new Map(); // city -> labels kept so far

  for (let depth = 0; depth < MAX_LEGS && frontier.length; depth += 1) {
    const next = [];
    frontier.forEach((label) => {
      const lastCab = label.legs.length && label.legs[label.legs.length - 1].mode === 'cab';
      const candidates = [];
      [0, 1].forEach((n) => {
        src.scheduled(label.city, addDays(label.at.slice(0, 10), n)).forEach((e) => {
          const transit = label.legs.length > 0;
          const minDep = addMinutes(label.at, transit ? BUFFER_MIN[e.mode] : 0);
          const maxDep = addMinutes(label.at, transit ? MAX_LAYOVER_MIN : MAX_WAIT_MIN + 240);
          if (e.dep >= minDep && e.dep <= maxDep && (!transit || e.dep.slice(0, 10) === label.at.slice(0, 10))) candidates.push(e);
        });
      });
      if (!lastCab) {
        src.cabs(label.city).forEach((c) => {
          const dep = addMinutes(label.at, label.legs.length ? BUFFER_MIN.cab : 0);
          candidates.push({ ...c, dep, arr: addMinutes(dep, c.minutes) });
        });
      }
      candidates.forEach((e) => {
        if (label.path.includes(e.to)) return;
        const nl = { city: e.to, at: e.arr, cost: label.cost + e.cost, path: [...label.path, e.to],
          legs: [...label.legs, { mode: e.mode, from: label.city, to: e.to, dep: e.dep, arr: e.arr, cost: e.cost, ...e.leg }] };
        if (e.to === toId) { results.push({ legs: nl.legs, arrive: nl.at, cost: nl.cost, cities: nl.path }); return; }
        const kept = best.get(e.to) || [];
        if (kept.some((k) => k.at <= nl.at && k.cost <= nl.cost)) return;
        best.set(e.to, [...kept.filter((k) => !(nl.at <= k.at && nl.cost <= k.cost)), nl]);
        next.push(nl);
      });
    });
    frontier = next.filter((l) => best.get(l.city).includes(l));
  }
  return results;
};

const legFrom = (cityName, nameOf, leg) => ({
  mode: leg.mode, from: nameOf(leg.from), to: nameOf(leg.to), from_text: nameOf(leg.from), to_text: nameOf(leg.to),
  date: leg.dep.slice(0, 10), depart_after: null, depart_before: null,
  train_number: leg.train_number || null, flight_number: leg.flight_number || null,
  from_station: leg.from_station || null, to_station: leg.to_station || null,
  train_class: null, nights: null, note: '', est_cost: leg.cost,
});

/**
 * Turns trip constraints into an ordered list of legs: origin -> destination, a hotel stay, then back home.
 * Outbound: cheapest route arriving within a day of the fastest. Return: arrive home on the last day for the lowest
 * total of transport + hotel nights. Returns { journey, notes } or null when there is nothing to plan.
 */
const proposeJourney = (db, filters) => {
  const f = filters;
  const t = f.trip;
  if (!t || !f.origin || !f.destination || f.origin === f.destination) return null;
  const resolve = buildCityResolver(db);
  const o = resolve(f.origin);
  const d = resolve(f.destination);
  if (!o || !d) return null;
  const notes = [];
  const src = edgeSource(db, f.travelers);
  const nameOf = (id) => src.cities.get(id).name;
  const start = t.earliest_start || (f.date ? stamp(f.date, '08:00') : null);
  if (!start) return { journey: null, notes: ['Tell us the date you can start travelling to plan the full route.'] };

  const viaIds = t.via.map((n) => resolve(n)?.id).filter(Boolean);
  const throughVia = (r) => viaIds.every((v) => r.cities.includes(v));

  // outbound
  let out = searchRoutes(src, o.id, d.id, start).filter(throughVia);
  if (!out.length) return { journey: null, notes: [`No connected route from ${o.name} to ${d.name} found${viaIds.length ? ' through your stop-over' : ''}.`] };
  const fastest = out.reduce((m, r) => (r.arrive < m ? r.arrive : m), out[0].arrive);
  const limit = t.prefer === 'fastest' ? fastest : addMinutes(fastest, OUTBOUND_SLACK_MIN);
  out = out.filter((r) => r.arrive <= limit).sort((a, b) => a.cost - b.cost || a.arrive.localeCompare(b.arrive));
  const outbound = out[0];
  const checkIn = outbound.arrive.slice(0, 10);

  const legs = outbound.legs.map((l) => legFrom(null, nameOf, l));
  legs.push({ mode: 'hotel', from: d.name, to: d.name, from_text: d.name, to_text: d.name, date: checkIn, depart_after: null,
    depart_before: null, train_number: null, flight_number: null, from_station: null, to_station: null, train_class: null, nights: 1, note: '' });

  // return
  let homeBy = null;
  if (t.return_home) {
    homeBy = t.arrive_by;
    if (!homeBy) {
      notes.push('Add the date you need to be back so the return trip can be planned.');
    } else {
      const lastDay = homeBy.slice(0, 10);
      const probe = queryHotels(db, { ...f, nights: 1, destination: d.name }, d, { hotel: null }, true);
      const nightRate = (probe.length ? Math.min(...probe.map((h) => h.price_per_night)) : 3000) * rooms(f.travelers);
      let pick = null;
      for (let day = addDays(checkIn, 1); day <= lastDay; day = addDays(day, 1)) {
        const nights = diffDays(day, checkIn);
        searchRoutes(src, d.id, o.id, stamp(day, HOTEL_CHECK_OUT)).filter((r) => r.arrive <= homeBy).forEach((r) => {
          const score = [r.arrive.slice(0, 10) === lastDay ? 0 : 1, r.cost + nights * nightRate, r.arrive];
          if (!pick || score[0] < pick.score[0] || (score[0] === pick.score[0] && (score[1] < pick.score[1] ||
            (score[1] === pick.score[1] && score[2] > pick.score[2])))) pick = { route: r, score, day };
        });
      }
      if (pick) {
        legs.push(...pick.route.legs.map((l) => legFrom(null, nameOf, l)));
      } else {
        notes.push(`No return route from ${d.name} to ${o.name} fits before ${homeBy.replace('T', ' ')}.`);
      }
    }
  }
  notes.push(`Outbound is the cheapest of ${out.length} connected route(s) arriving within a day of the fastest; the return is the cheapest that gets you home on the last day.`);
  const transport_estimate = legs.reduce((sum, l) => sum + (l.est_cost || 0), 0);
  return { journey: { earliest_start: start, arrive_by: homeBy, legs, transport_estimate }, notes };
};

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const when = (at) => at.replace('T', ' ');

// Plain-language lines for the itinerary prompt, so the written plan uses the real times.
const summarizeJourney = (journey) =>
  journey.legs.filter((l) => l.options.length).map((l) => {
    const o = l.options[0];
    if (l.mode === 'hotel') return `Stay: ${o.name} (${o.stars}-star, ${o.area}, ${l.to}), check-in ${when(o.depart_at)}, check-out ${when(o.arrive_at)}, ${o.nights} night(s), ${inr(o.total_price)}`;
    const what = l.mode === 'cab' ? `${o.title} (${o.vehicles} vehicle(s))`
      : l.mode === 'train' ? `${o.number} ${o.name}, class ${o.chosen_class}` : `${o.airline} ${o.flight_number}`;
    return `${l.mode[0].toUpperCase()}${l.mode.slice(1)}: ${l.from} → ${l.to} by ${what}, departs ${when(o.depart_at)}, arrives ${when(o.arrive_at)}, ${inr(o.total_price)}`;
  });

module.exports = { proposeJourney, planJourney, summarizeJourney };
