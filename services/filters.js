// The JSON contract between the AI and the database.
// The LLM (or the heuristic fallback) proposes filters; sanitizeFilters() whitelists and coerces
// every field, so nothing the model says can reach SQL except as a bound parameter.

const MODES = ['flight', 'train', 'cab', 'hotel'];
const SORTS = ['best', 'price', 'duration', 'rating'];
const CABINS = ['economy', 'premium_economy', 'business'];
const TRAIN_CLASSES = ['SL', '3A', '2A', '1A', 'CC', 'EC'];
const AMENITY_CODES = [
  'wifi', 'ac', 'breakfast', 'restaurant', 'parking', 'gym', 'pool', 'spa', 'bar',
  'airport_shuttle', 'pet_friendly', 'beach', 'lake_view', 'ghat_view', 'taj_view',
];

// Shown to the LLM verbatim.
const FILTER_SCHEMA = `{
  "origin": string|null,            // city the traveller departs from (use a name from the city list)
  "destination": string|null,       // city to travel to (use a name from the city list)
  "date": "YYYY-MM-DD"|null,        // departure date
  "nights": integer 1-30,           // length of stay
  "travelers": integer 1-20,
  "modes": array of "flight"|"train"|"cab"|"hotel",
  "budget_total_inr": number|null,  // whole-trip budget in INR
  "transport": {
    "max_price_inr": number|null,   // per person, one way
    "max_duration_min": integer|null,
    "max_stops": integer|null,      // flights only
    "depart_after": "HH:MM"|null,
    "depart_before": "HH:MM"|null,
    "cabin": "economy"|"premium_economy"|"business"|null,
    "train_classes": array of "SL"|"3A"|"2A"|"1A"|"CC"|"EC"
  },
  "hotel": {
    "min_stars": integer 1-5|null,
    "max_stars": integer 1-5|null,
    "min_rating": number 0-5|null,
    "max_price_per_night_inr": number|null,
    "amenities": array of ${AMENITY_CODES.map((c) => `"${c}"`).join('|')}
  },
  "sort": "best"|"price"|"duration"|"rating",
  "limit": integer 1-10,
  "trip": null | {                  // ONLY for multi-leg trips (see rules)
    "return_home": boolean,         // the traveller must also get back to the origin
    "earliest_start": "YYYY-MM-DDTHH:MM"|null,  // when the traveller is free AND at the origin
    "arrive_by": "YYYY-MM-DDTHH:MM"|null,       // deadline for being back home (end of the stated date range)
    "via": array of city names,     // places the route must pass through
    "prefer": "cheapest"|"fastest"
  }
}`;

const num = (v, lo, hi) => {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
};
const int = (v, lo, hi) => {
  const n = num(v, lo, hi);
  return n === null ? null : Math.round(n);
};
const hhmm = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : null);
const oneOf = (v, allowed) => (allowed.includes(v) ? v : null);
const listOf = (v, allowed) =>
  Array.isArray(v) ? [...new Set(v.filter((x) => allowed.includes(x)))] : [];
const isoDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
};

// resolveCity(text) -> canonical city name or null
const sanitizeFilters = (raw, resolveCity) => {
  const r = raw && typeof raw === 'object' ? raw : {};
  const t = r.transport && typeof r.transport === 'object' ? r.transport : {};
  const h = r.hotel && typeof r.hotel === 'object' ? r.hotel : {};
  const city = (v) => (typeof v === 'string' && v.trim() ? resolveCity(v) : null);
  const modes = listOf(r.modes, MODES);

  return {
    origin: city(r.origin),
    destination: city(r.destination),
    date: isoDate(r.date),
    nights: int(r.nights, 1, 30) ?? 3,
    travelers: int(r.travelers, 1, 20) ?? 1,
    modes: modes.length ? modes : MODES,
    budget_total_inr: num(r.budget_total_inr, 0, 1e8) || null,
    transport: {
      max_price_inr: num(t.max_price_inr, 0, 1e7) || null,
      max_duration_min: int(t.max_duration_min, 1, 5000),
      max_stops: int(t.max_stops, 0, 3),
      depart_after: hhmm(t.depart_after),
      depart_before: hhmm(t.depart_before),
      cabin: oneOf(t.cabin, CABINS),
      train_classes: listOf(t.train_classes, TRAIN_CLASSES),
    },
    hotel: {
      min_stars: int(h.min_stars, 1, 5),
      max_stars: int(h.max_stars, 1, 5),
      min_rating: num(h.min_rating, 0, 5),
      max_price_per_night_inr: num(h.max_price_per_night_inr, 0, 1e7) || null,
      amenities: listOf(h.amenities, AMENITY_CODES),
    },
    sort: oneOf(r.sort, SORTS) || 'best',
    limit: int(r.limit, 1, 10) ?? 5,
    trip: sanitizeTrip(r.trip, resolveCity),
  };
};

const HHMM_DT = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const isoDateTime = (v) => (typeof v === 'string' && HHMM_DT.test(v.trim()) && isoDate(v.trim().slice(0, 10)) ? v.trim() : null);

const sanitizeTrip = (raw, resolveCity) => {
  if (!raw || typeof raw !== 'object') return null;
  const via = (Array.isArray(raw.via) ? raw.via : []).map((v) => (typeof v === 'string' ? resolveCity(v) : null)).filter(Boolean);
  return {
    return_home: raw.return_home === true,
    earliest_start: isoDateTime(raw.earliest_start),
    arrive_by: isoDateTime(raw.arrive_by),
    via: [...new Set(via)],
    prefer: raw.prefer === 'fastest' ? 'fastest' : 'cheapest',
  };
};

// Parses "50,000", "50k", "1.5 lakh" -> number
const parseMoney = (text) => {
  const m = String(text || '').toLowerCase().replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k|lakh|lac|lakhs|crore)?/);
  if (!m) return null;
  const mult = { k: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, crore: 1e7 }[m[2]] || 1;
  return Number(m[1]) * mult;
};

const parseDate = (text) => {
  const s = String(text || '').trim();
  const iso = s.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return isoDate(iso[0]);
  if (/\b(19|20)\d{2}\b/.test(s)) {
    const d = new Date(`${s.split(/\s+(?:to|-|–)\s+/i)[0]} UTC`);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
};

// Rule-based fallback: used when the LLM is unavailable, returns junk, or SARATHI_LLM_MOCK=1.
const heuristicFilters = (prefs = {}) => {
  const text = `${prefs.budget || ''} ${prefs.interests || ''} ${prefs.specialNotes || ''}`.toLowerCase();
  const raw = {
    origin: prefs.origin,
    destination: prefs.destination,
    date: parseDate(prefs.dates),
    travelers: prefs.passengers,
    nights: Number((String(prefs.dates || '').match(/(\d+)\s*(?:nights?|days?)/i) || [])[1]) || undefined,
    budget_total_inr: /\d/.test(prefs.budget || '') ? parseMoney(prefs.budget) : null,
    transport: {},
    hotel: { amenities: [] },
    sort: 'best',
  };
  if (/luxur|premium|5.?star|splurge/.test(text)) raw.hotel.min_stars = 4;
  if (/budget|cheap|backpack|afford|economical/.test(text)) { raw.sort = 'price'; raw.hotel.max_stars = 3; }
  if (/\bpool\b/.test(text)) raw.hotel.amenities.push('pool');
  if (/\bspa\b/.test(text)) raw.hotel.amenities.push('spa');
  if (/beach/.test(text)) raw.hotel.amenities.push('beach');
  if (/pet/.test(text)) raw.hotel.amenities.push('pet_friendly');
  if (/direct|non.?stop/.test(text)) raw.transport.max_stops = 0;
  if (/morning/.test(text)) { raw.transport.depart_after = '05:00'; raw.transport.depart_before = '12:00'; }
  if (/evening|night/.test(text)) { raw.transport.depart_after = '17:00'; raw.transport.depart_before = '23:59'; }
  if (/fast|quick|short/.test(text) || prefs.pace === 'Fast-paced') raw.sort = 'duration';
  return raw;
};

module.exports = { sanitizeTrip, FILTER_SCHEMA, AMENITY_CODES, MODES, sanitizeFilters, heuristicFilters };
