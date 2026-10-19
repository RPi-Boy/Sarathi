const out = document.getElementById('tripsOutput');
const headerEl = document.querySelector('.trips-header');
const logoutBtn = document.getElementById('logoutBtn');

const fmtInr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const fmtDuration = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
const fmtDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not set');
// 'YYYY-MM-DDTHH:MM' is a wall-clock time at the place of travel; format it without timezone conversion.
const fmtStart = (at) => (at ? `${fmtDate(at.slice(0, 10))}, ${at.slice(11)}` : 'No dates yet');

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let trips = [];

const KIND = {
  departure: { icon: '🛫', label: 'Departs' },
  arrival: { icon: '🛬', label: 'Arrives' },
  check_in: { icon: '🔑', label: 'Check-in' },
  check_out: { icon: '🧳', label: 'Check-out' },
};
const TYPE_ICON = { flight: '✈', train: '🚆', hotel: '🏨', cab: '🚕' };

const timelineView = (events) => {
  const wrap = el('div', 'timeline');
  if (!events.length) {
    wrap.appendChild(el('p', 'muted', 'No dated bookings yet. Book a flight, train or hotel to build the timeline.'));
    return wrap;
  }
  let currentDay = '';
  events.forEach((e) => {
    const day = e.at.slice(0, 10);
    if (day !== currentDay) {
      currentDay = day;
      wrap.appendChild(el('h4', 'timeline-day', fmtDate(day)));
    }
    const item = el('div', `timeline-item kind-${e.kind}`);
    item.appendChild(el('span', 'timeline-time', e.at.slice(11)));
    item.appendChild(el('span', 'timeline-dot', KIND[e.kind].icon));
    const body = el('div', 'timeline-body');
    body.appendChild(el('strong', '', `${KIND[e.kind].label} · ${e.title}`));
    body.appendChild(el('p', 'muted', e.place));
    item.appendChild(body);
    wrap.appendChild(item);
  });
  return wrap;
};

const bookingCard = (b, reload) => {
  const d = b.detail;
  const card = el('article', `rec-card booking${b.status === 'cancelled' ? ' cancelled' : ''}`);
  const head = el('div', 'booking-head');
  head.appendChild(el('span', '', `${TYPE_ICON[b.type]} ${b.type[0].toUpperCase()}${b.type.slice(1)}`));
  if (b.status === 'cancelled') head.appendChild(el('span', 'booking-status', 'Cancelled'));
  card.appendChild(head);
  card.appendChild(el('h5', 'rec-title', d.title));

  if (b.type === 'flight') {
    card.appendChild(el('p', 'rec-line muted', `${d.from.city} (${d.from.code}) ${d.departs} → ${d.to.city} (${d.to.code}) ${d.arrives}${d.arrives_next_day ? ' (+1)' : ''}`));
    card.appendChild(el('p', 'rec-line muted', `${fmtDate(b.travel_date)} · ${fmtDuration(d.duration_min)} · ${b.quantity} traveller(s)`));
  } else if (b.type === 'cab') {
    card.appendChild(el('p', 'rec-line muted', `${d.from.city} → ${d.to.city} · ${d.distance_km} km · ${fmtDuration(d.duration_min)}`));
    card.appendChild(el('p', 'rec-line muted', `${fmtDate(b.travel_date)} pickup ${b.start_time} · ${b.quantity} vehicle(s) · ${d.vehicle_class}`));
  } else if (b.type === 'train') {
    card.appendChild(el('p', 'rec-line muted', `${d.from.station} ${d.departs} → ${d.to.station} ${d.arrives}${d.arrives_day_offset ? ` (+${d.arrives_day_offset})` : ''}`));
    card.appendChild(el('p', 'rec-line muted', `${fmtDate(b.travel_date)} · class ${b.class_code} · ${b.quantity} traveller(s)`));
  } else {
    card.appendChild(el('p', 'rec-line muted', `${'★'.repeat(d.stars)} · ${d.area}, ${d.city}`));
    card.appendChild(el('p', 'rec-line muted', `Check-in ${fmtDate(b.travel_date)} · ${b.nights} night(s) · ${b.quantity} room(s)`));
  }

  const foot = el('div', 'rec-foot');
  foot.appendChild(el('strong', 'rec-price', fmtInr(b.total_price)));
  if (d.listing_url) {
    const link = el('a', 'rec-more', 'Open listing ↗');
    link.href = d.listing_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    foot.appendChild(link);
  }
  if (b.status === 'booked') {
    const cancel = el('button', 'btn tertiary-btn rec-save', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', async () => {
      if (!window.confirm(`Cancel ${d.title}?`)) return;
      cancel.disabled = true;
      await fetch(`/api/bookings/${b.id}`, { method: 'DELETE' });
      reload();
    });
    foot.appendChild(cancel);
  }
  card.appendChild(foot);
  return card;
};

const tripSummary = (trip) => {
  const card = el('article', 'glass-card trip-card trip-summary');
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  const head = el('div', 'trip-head');
  const titles = el('div');
  titles.appendChild(el('h3', '', trip.title));
  titles.appendChild(el('p', 'muted', `${trip.destination} · ${trip.travelers} traveller(s)`));
  titles.appendChild(el('p', 'muted', `Starts: ${fmtStart(trip.start_at)}`));
  head.appendChild(titles);
  const total = el('div', 'trip-total');
  total.appendChild(el('span', 'muted', `${trip.bookings.filter((b) => b.status === 'booked').length} booking(s)`));
  total.appendChild(el('strong', 'rec-price', fmtInr(trip.total_price)));
  head.appendChild(total);
  card.appendChild(head);
  const open = () => { window.location.hash = `trip-${trip.id}`; };
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  return card;
};

const tripDetail = (trip) => {
  const section = el('section', 'trip-detail');
  const back = el('a', 'trip-back', '← All trips');
  back.href = '#';
  section.appendChild(back);

  const card = el('div', 'glass-card trip-card');
  const head = el('div', 'trip-head');
  const titles = el('div');
  titles.appendChild(el('h3', '', trip.title));
  titles.appendChild(el('p', 'muted', `${trip.destination} · ${trip.travelers} traveller(s)`));
  titles.appendChild(el('p', '', `Trip starts: ${fmtStart(trip.start_at)}`));
  head.appendChild(titles);
  const total = el('div', 'trip-total');
  total.appendChild(el('span', 'muted', 'Booked total'));
  total.appendChild(el('strong', 'rec-price', fmtInr(trip.total_price)));
  head.appendChild(total);
  card.appendChild(head);

  card.appendChild(el('h4', 'answer-subhead', 'Timeline'));
  card.appendChild(timelineView(trip.timeline));

  card.appendChild(el('h4', 'answer-subhead', 'Bookings'));
  const grid = el('div', 'rec-grid');
  if (trip.bookings.length) trip.bookings.forEach((b) => grid.appendChild(bookingCard(b, load)));
  else grid.appendChild(el('p', 'muted', 'Nothing booked yet.'));
  card.appendChild(grid);

  if (trip.content) {
    const plan = el('details', 'trip-plan');
    plan.appendChild(el('summary', '', 'Day-by-day plan'));
    const text = el('div', 'trip-plan-text');
    text.appendChild(window.renderMarkdown(trip.content));
    plan.appendChild(text);
    card.appendChild(plan);
  }
  section.appendChild(card);
  return section;
};

const render = () => {
  const match = window.location.hash.match(/^#trip-(\d+)$/);
  const trip = match && trips.find((t) => t.id === Number(match[1]));
  if (headerEl) headerEl.classList.toggle('hidden', Boolean(trip));
  if (trip) {
    out.replaceChildren(tripDetail(trip));
    window.scrollTo(0, 0);
    return;
  }
  if (!trips.length) {
    const empty = el('p', 'muted', 'No trips yet. ');
    const link = el('a', '', 'Start planning');
    link.href = '/answer';
    empty.appendChild(link);
    out.replaceChildren(empty);
    return;
  }
  out.replaceChildren(...trips.map(tripSummary));
};

async function load() {
  const res = await fetch('/api/itineraries');
  if (res.status === 401) {
    window.location.href = '/login';
    return;
  }
  trips = (await res.json()).trips;
  render();
}

window.addEventListener('hashchange', render);

logoutBtn?.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

load().catch((err) => {
  console.error(err);
  out.replaceChildren(el('p', 'muted', 'Could not load your trips.'));
});
