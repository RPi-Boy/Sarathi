const itineraryOutput = document.getElementById('itineraryOutput');
const answerForm = document.getElementById('answerForm');
const statusEl = document.getElementById('answerStatus');
const alertEl = document.getElementById('answerAlert');
const regenerateBtn = document.getElementById('regenerateBtn');
const exportBtn = document.getElementById('exportBtn');
const sessionBtn = document.getElementById('sessionBtn');
const logoutBtn = document.getElementById('logoutBtn');
const backdropEl = document.getElementById('dynamicBackdrop');
const mediaCarousel = document.getElementById('mediaCarousel');
const mediaPrev = document.getElementById('mediaPrev');
const mediaNext = document.getElementById('mediaNext');
const mediaSourceEl = document.getElementById('mediaSource');
const mediaPlaceholder = document.getElementById('mediaPlaceholder');
const readMoreBtn = document.getElementById('readMoreBtn');
const itineraryModal = document.getElementById('itineraryModal');
const modalItineraryContent = document.getElementById('modalItineraryContent');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalDismissEls = document.querySelectorAll('[data-modal-dismiss]');

let isAuthenticated = false;
let latestPreferences = {};
let mediaImages = [];
let mediaIndex = 0;
const VISIBLE_MEDIA_COUNT = 3;
let currentItineraryText = '';
let backdropSwapTimeout;

const setStatus = (text, isError = false) => {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.style.color = isError ? '#ff9bbd' : 'var(--muted)';
  }
};

const setAlert = (text) => {
  if (!alertEl) return;
  if (!text) {
    alertEl.classList.add('hidden');
    alertEl.textContent = '';
  } else {
    alertEl.classList.remove('hidden');
    alertEl.textContent = text;
  }
};

const applyBackdrop = (imageUrl) => {
  if (!backdropEl) return;
  const layers = backdropEl.querySelectorAll('.backdrop-layer');
  if (layers.length < 2) return;

  const [layerA, layerB] = layers;
  const activeLayer = layerA.classList.contains('active') ? layerA : layerB;
  const nextLayer = activeLayer === layerA ? layerB : layerA;

  if (backdropSwapTimeout) {
    clearTimeout(backdropSwapTimeout);
    backdropSwapTimeout = null;
  }

  if (imageUrl) {
    nextLayer.style.backgroundImage = `url(${imageUrl})`;
    backdropEl.classList.add('visible');
    nextLayer.classList.add('active');
    nextLayer.classList.remove('fading');

    activeLayer.classList.remove('active');
    activeLayer.classList.add('fading');

    backdropSwapTimeout = setTimeout(() => {
      activeLayer.classList.remove('fading');
    }, 2000);
  } else {
    [layerA, layerB].forEach((layer) => {
      layer.style.backgroundImage = '';
      layer.classList.remove('active', 'fading');
    });
    backdropEl.classList.remove('visible');
  }
};

const updateMediaSource = (text) => {
  if (!mediaSourceEl) return;
  mediaSourceEl.textContent = text;
};

const buildFormattedItinerary = (text = '') => {
  if (!text.trim()) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'We are ready to conjure something lovely. Submit preferences once more.';
    return p;
  }
  return window.renderMarkdown(text);
};

const updateItineraryDisplay = (text) => {
  currentItineraryText = text || '';
  if (!itineraryOutput) return;

  const formatted = buildFormattedItinerary(currentItineraryText);
  itineraryOutput.replaceChildren(formatted.cloneNode(true));

  if (modalItineraryContent) {
    modalItineraryContent.replaceChildren(formatted);
  }

  if (readMoreBtn) {
    const disabled = !currentItineraryText;
    readMoreBtn.disabled = disabled;
    readMoreBtn.setAttribute('aria-disabled', String(disabled));
  }
};

const renderMediaCarousel = () => {
  if (!mediaCarousel) return;
  mediaCarousel.innerHTML = '';

  if (!mediaImages.length) {
    if (mediaPlaceholder) {
      mediaPlaceholder.classList.remove('hidden');
    }
    if (mediaPrev) mediaPrev.disabled = true;
    if (mediaNext) mediaNext.disabled = true;
    applyBackdrop(null);
    return;
  }

  if (mediaPlaceholder) {
    mediaPlaceholder.classList.add('hidden');
  }

  const fragment = document.createDocumentFragment();
  const windowed = mediaImages.length <= VISIBLE_MEDIA_COUNT ? mediaImages : [];

  if (!windowed.length) {
    for (let i = 0; i < VISIBLE_MEDIA_COUNT; i += 1) {
      const idx = (mediaIndex + i) % mediaImages.length;
      windowed.push(mediaImages[idx]);
    }
  }

  windowed.forEach((photo) => {
    const slide = document.createElement('figure');
    slide.className = 'media-slide';

    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = photo.description || 'Destination inspiration';
    slide.appendChild(img);

    const caption = document.createElement('figcaption');
    const descSpan = document.createElement('span');
    descSpan.textContent = photo.description || 'Destination inspiration';
    caption.appendChild(descSpan);

    if (photo.photographer && photo.photographerLink) {
      const separator = document.createTextNode(' · ');
      caption.appendChild(separator);
      const creditLink = document.createElement('a');
      creditLink.href = photo.photographerLink;
      creditLink.target = '_blank';
      creditLink.rel = 'noopener noreferrer';
      creditLink.textContent = photo.photographer;
      caption.appendChild(creditLink);
    }

    slide.appendChild(caption);
    fragment.appendChild(slide);
  });

  mediaCarousel.classList.toggle('single', mediaImages.length <= 2);
  mediaCarousel.appendChild(fragment);

  if (mediaPrev) {
    mediaPrev.disabled = mediaImages.length <= VISIBLE_MEDIA_COUNT;
  }
  if (mediaNext) {
    mediaNext.disabled = mediaImages.length <= VISIBLE_MEDIA_COUNT;
  }

  applyBackdrop(mediaImages[mediaIndex]?.url);
};

const loadDestinationMedia = async (destination) => {
  if (!destination) {
    mediaImages = [];
    mediaIndex = 0;
    updateMediaSource('Add a destination to paint the canvas.');
    renderMediaCarousel();
    return;
  }

  updateMediaSource('Curating atmosphere...');
  try {
    const response = await fetch(`/api/destination-media?q=${encodeURIComponent(destination)}`);
    const data = await response.json();
    mediaImages = Array.isArray(data.images) ? data.images : [];
    mediaIndex = 0;

    if (data?.source === 'unsplash' && data.query) {
      updateMediaSource(`Images via Unsplash · ${data.query}`);
    } else if (data?.source === 'placeholder') {
      updateMediaSource('Showing curated inspiration');
    } else {
      updateMediaSource('Images refreshed.');
    }

    renderMediaCarousel();
  } catch (error) {
    console.error('Failed to load destination media', error);
    updateMediaSource('Unable to load imagery. Showing curated placeholders.');
    mediaImages = [];
    mediaIndex = 0;
    renderMediaCarousel();
  }
};

const fillForm = (prefs = {}) => {
  if (!answerForm) return;
  const entries = Object.entries(prefs);
  entries.forEach(([key, value]) => {
    if (key in answerForm.elements && answerForm.elements[key]) {
      answerForm.elements[key].value = value || '';
    }
  });
};

const fetchPreferences = async () => {
  try {
    const response = await fetch('/api/preferences');
    const data = await response.json();
    if (data?.preferences) {
      latestPreferences = data.preferences;
      fillForm(latestPreferences);
      if (latestPreferences.destination) {
        await loadDestinationMedia(latestPreferences.destination);
      }
    }
  } catch (error) {
    console.error('Failed to fetch preferences', error);
  }
};

const fetchItinerary = async () => {
  try {
    const response = await fetch('/api/itinerary/latest');
    if (!response.ok) return;
    const data = await response.json();
    if (data.itinerary) {
      updateItineraryDisplay(data.itinerary);
    }
  } catch (error) {
    console.error('Failed to fetch itinerary', error);
  }
};

const updateSessionState = async () => {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    isAuthenticated = Boolean(data?.authenticated);

    if (isAuthenticated) {
      regenerateBtn?.removeAttribute('disabled');
      sessionBtn?.classList.add('hidden');
      logoutBtn?.classList.remove('hidden');
    } else {
      regenerateBtn?.setAttribute('disabled', 'true');
      sessionBtn?.classList.remove('hidden');
      logoutBtn?.classList.add('hidden');
    }
  } catch (error) {
    console.error('Unable to check session', error);
  }
};

const submitPreferences = async (payload) => {
  const response = await fetch('/api/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error('Unable to capture preferences');
  }
};

const requestItinerary = async (payload) => {
  const response = await fetch('/api/itinerary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Unable to generate itinerary');
  }
  return data.itinerary;
};

/* ── Recommendations (flights / trains / hotels from the database) ── */

const recsOutput = document.getElementById('recsOutput');
const recsNotes = document.getElementById('recsNotes');

const fmtInr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const fmtDuration = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let lastFilters = {};

const recCard = (item, title, lines, price, priceNote) => {
  const card = el('article', 'rec-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.appendChild(el('h5', 'rec-title', title));
  lines.forEach((line) => card.appendChild(el('p', 'rec-line muted', line)));
  const foot = el('div', 'rec-foot');
  foot.appendChild(el('strong', 'rec-price', price));
  if (priceNote) foot.appendChild(el('span', 'muted', priceNote));
  foot.appendChild(el('span', 'rec-more', 'Details →'));
  card.appendChild(foot);
  const open = () => openDetails(item);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return card;
};

/* ── Details + booking modal ─────────────────────────────────────── */

const detailModal = document.getElementById('detailModal');
const detailBody = document.getElementById('detailBody');
const todayIso = () => new Date().toISOString().slice(0, 10);
let detailItem = null;

const closeDetails = () => {
  detailModal?.classList.add('hidden');
  document.body?.classList.remove('modal-open');
};

const field = (label, input) => {
  const wrap = el('label', 'detail-field');
  wrap.appendChild(el('span', '', label));
  wrap.appendChild(input);
  return wrap;
};
const input = (type, value, attrs = {}) => {
  const node = document.createElement('input');
  node.type = type;
  if (value !== undefined && value !== null) node.value = value;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
};
const row = (k, v) => {
  const r = el('div', 'detail-row');
  r.appendChild(el('span', 'muted', k));
  r.appendChild(el('span', '', v));
  return r;
};

const detailUrl = (item, params) => {
  const q = new URLSearchParams(params);
  return `/api/details/${item.type}/${encodeURIComponent(item.id)}?${q}`;
};

const openDetails = async (item) => {
  detailItem = item;
  detailBody.replaceChildren(el('p', 'muted', 'Loading…'));
  detailModal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  let trips = [];
  if (isAuthenticated) {
    try {
      const res = await fetch('/api/itineraries?summary=1');
      if (res.ok) trips = (await res.json()).trips;
    } catch (_) { /* booking will still offer "new trip" */ }
  }
  const state = {
    tripId: trips.length ? String(trips[0].id) : 'new',
    tripName: '',
    travelers: lastFilters.travelers || 1,
    date: lastFilters.date || '',
    nights: lastFilters.nights || 1,
    startTime: '08:00',
    cls: '',
  };
  const segment = item.type === 'train' ? { from: item.from.code, to: item.to.code }
    : item.type === 'cab' ? { from: item.from.city, to: item.to.city } : {};

  const load = async () => {
    const params = { travelers: state.travelers, nights: state.nights, start_time: state.startTime, ...segment };
    if (state.date) params.date = state.date;
    const res = await fetch(detailUrl(item, params));
    if (!res.ok) throw new Error('Could not load details');
    return res.json();
  };

  const render = (d) => {
    const nodes = [el('h3', 'detail-title', d.title)];
    if (d.type === 'flight') {
      nodes.push(
        row('Route', `${d.from.city} (${d.from.code}) → ${d.to.city} (${d.to.code})`),
        row('Airports', `${d.from.airport} → ${d.to.airport}`),
        row('Schedule', `${d.departs} → ${d.arrives}${d.arrives_next_day ? ' (+1 day)' : ''} · ${fmtDuration(d.duration_min)}`),
        row('Stops', d.stops ? `${d.stops} stop` : 'Non-stop'),
        row('Cabin', d.cabin.replace('_', ' ')),
        row('Seats left', String(d.seats_left)),
      );
    } else if (d.type === 'train') {
      nodes.push(
        row('Category', d.category),
        row('Journey', `${d.from.station} (${d.from.code}) ${d.departs} → ${d.to.station} (${d.to.code}) ${d.arrives}${d.arrives_day_offset ? ` (+${d.arrives_day_offset})` : ''}`),
        row('Duration', `${fmtDuration(d.duration_min)} · ${d.distance_km} km`),
      );
      const stops = el('details', 'detail-stops');
      stops.appendChild(el('summary', '', `Full route (${d.stops.length} stops)`));
      d.stops.forEach((s) => stops.appendChild(row(
        `${s.station} (${s.code})`,
        `${s.arr_time || '—'} / ${s.dep_time || '—'}${s.day_offset ? ` · day ${s.day_offset + 1}` : ''} · ${s.distance_km} km`,
      )));
      nodes.push(stops);
    } else if (d.type === 'cab') {
      nodes.push(
        row('Route', `${d.from.city} → ${d.to.city}`),
        row('Distance', `${d.distance_km} km · about ${fmtDuration(d.duration_min)}`),
        row('Vehicle', `${d.vehicle_class} (${d.models}), seats ${d.capacity}`),
        row('Vehicles needed', `${d.vehicles} for ${state.travelers} traveller(s)`),
        row('Provider', d.provider),
      );
    } else {
      nodes.push(
        row('Location', `${d.area}, ${d.city}`),
        row('Rating', `${'★'.repeat(d.stars)} · ${d.rating} (${d.review_count.toLocaleString('en-IN')} reviews)`),
        row('Rooms left', String(d.rooms_left)),
        row('Amenities', d.amenities.map((a) => a.name).join(', ')),
      );
    }

    const travelers = input('number', state.travelers, { min: 1, max: 20 });
    travelers.addEventListener('change', () => { state.travelers = Math.max(1, Math.min(20, Number(travelers.value) || 1)); refresh(); });
    const form = el('div', 'detail-form');
    form.appendChild(field(d.type === 'hotel' ? 'Guests' : 'Travelers', travelers));

    {
      const date = input('date', state.date, { min: todayIso() });
      date.addEventListener('change', () => { state.date = date.value; refresh(); });
      form.appendChild(field(d.type === 'hotel' ? 'Check-in' : 'Travel date', date));
    }
    if (d.type === 'cab') {
      const time = input('time', state.startTime);
      time.addEventListener('change', () => { state.startTime = time.value || '08:00'; });
      form.appendChild(field('Pickup time', time));
    }
    if (d.type === 'hotel') {
      const nights = input('number', state.nights, { min: 1, max: 30 });
      nights.addEventListener('change', () => { state.nights = Math.max(1, Math.min(30, Number(nights.value) || 1)); refresh(); });
      form.appendChild(field('Nights', nights));
    }
    if (d.type === 'train') {
      const select = document.createElement('select');
      d.classes.forEach((c) => {
        const o = document.createElement('option');
        o.value = c.class;
        o.textContent = `${c.class} · ${fmtInr(c.fare)} per person`;
        select.appendChild(o);
      });
      state.cls = d.classes.some((c) => c.class === state.cls) ? state.cls : d.classes[0].class;
      select.value = state.cls;
      select.addEventListener('change', () => { state.cls = select.value; render(d); });
      form.appendChild(field('Class', select));
    }
    nodes.push(form);

    // Which trip does this go into?
    const tripForm = el('div', 'detail-form');
    const tripSelect = document.createElement('select');
    trips.forEach((t) => {
      const o = document.createElement('option');
      o.value = String(t.id);
      o.textContent = `${t.title} · ${t.destination}`;
      tripSelect.appendChild(o);
    });
    const newOpt = document.createElement('option');
    newOpt.value = 'new';
    newOpt.textContent = '+ New trip…';
    tripSelect.appendChild(newOpt);
    tripSelect.value = state.tripId;
    tripForm.appendChild(field('Add to trip', tripSelect));
    const nameInput = input('text', state.tripName, { maxlength: 80, placeholder: `e.g. ${d.destination} getaway` });
    nameInput.addEventListener('input', () => { state.tripName = nameInput.value; });
    const nameField = field('New trip name', nameInput);
    nameField.classList.toggle('hidden', state.tripId !== 'new');
    tripSelect.addEventListener('change', () => {
      state.tripId = tripSelect.value;
      nameField.classList.toggle('hidden', state.tripId !== 'new');
    });
    tripForm.appendChild(nameField);
    nodes.push(tripForm);

    const total = d.type === 'train'
      ? d.classes.find((c) => c.class === state.cls).total
      : d.total_price;
    const bar = el('div', 'detail-total');
    bar.appendChild(el('span', 'muted', d.type === 'hotel' ? `${d.nights} night(s) · ${d.rooms_needed} room(s)` : 'Total'));
    bar.appendChild(el('strong', 'rec-price', fmtInr(total)));
    nodes.push(bar);

    const errorEl = el('p', 'detail-error');
    const book = el('button', 'btn', 'Book now');
    book.type = 'button';
    book.addEventListener('click', async () => {
      if (!isAuthenticated) { window.location.href = '/login'; return; }
      errorEl.textContent = '';
      if (!state.date) { errorEl.textContent = 'Pick a travel date first.'; return; }
      if (state.tripId === 'new' && !state.tripName.trim()) { errorEl.textContent = 'Name your new trip first.'; return; }
      book.disabled = true;
      // Open the provider tab now (inside the click) so popup blockers allow it; point it at the listing after booking.
      const listingTab = window.open('', '_blank');
      if (listingTab) { try { listingTab.opener = null; } catch (_) { /* ignore */ } }
      const body = { type: d.type, ref: d.id, travelers: state.travelers, date: state.date };
      if (state.tripId === 'new') body.new_trip_name = state.tripName.trim();
      else body.itinerary_id = Number(state.tripId);
      if (d.type === 'hotel') body.nights = state.nights;
      if (d.type === 'train') Object.assign(body, { from: d.from.code, to: d.to.code, class: state.cls });
      if (d.type === 'cab') Object.assign(body, { from: d.from.city, to: d.to.city, start_time: state.startTime });
      try {
        const res = await fetch('/api/bookings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Booking failed');
        if (listingTab && data.listing_url) listingTab.location.href = data.listing_url;
        window.location.href = `/itineraries#trip-${data.itinerary_id}`;
      } catch (err) {
        listingTab?.close();
        errorEl.textContent = err.message;
        book.disabled = false;
      }
    });
    nodes.push(errorEl, book);
    if (!isAuthenticated) nodes.push(el('p', 'muted', 'You will be asked to log in to book.'));
    detailBody.replaceChildren(...nodes);
  };

  const refresh = async () => {
    try { render(await load()); } catch (err) { detailBody.replaceChildren(el('p', 'detail-error', err.message)); }
  };
  refresh();
};

document.querySelectorAll('[data-detail-dismiss]').forEach((n) => n.addEventListener('click', closeDetails));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetails(); });

const recGroup = (label, cards) => {
  if (!cards.length) return null;
  const group = el('div', 'rec-group');
  group.appendChild(el('h4', 'answer-subhead', label));
  const grid = el('div', 'rec-grid');
  cards.forEach((c) => grid.appendChild(c));
  group.appendChild(grid);
  return group;
};

/* ── Journey plan (multi-leg: cab → train → cab → hotel → train → train) ── */

const MODE_ICON = { cab: '🚕', train: '🚆', flight: '✈️', hotel: '🏨' };
const fmtDT = (at) => {
  const d = new Date(`${at.slice(0, 10)}T00:00:00`);
  return `${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, ${at.slice(11)}`;
};

const optionLines = (mode, o) => {
  if (mode === 'cab') {
    return [`${o.title} · ${o.models}`, `${o.distance_km} km · ${fmtDuration(o.duration_min)} · ${o.vehicles} vehicle(s) for the group`];
  }
  if (mode === 'train') {
    return [`${o.number} ${o.name} · class ${o.chosen_class}`, `${o.from.station} → ${o.to.station} · ${fmtDuration(o.duration_min)}`];
  }
  if (mode === 'flight') {
    return [`${o.airline} ${o.flight_number}`, `${o.from.code} → ${o.to.code} · ${fmtDuration(o.duration_min)} · ${o.stops ? `${o.stops} stop` : 'non-stop'}`];
  }
  return [`${'★'.repeat(o.stars)} · ${o.rating} · ${o.area}`, `${o.nights} night(s) · ${o.rooms_needed} room(s) · ${fmtInr(o.price_per_night)} per room/night`];
};

const renderJourney = (journey) => {
  const wrap = el('section', 'journey');
  wrap.appendChild(el('h4', 'answer-subhead', 'Your journey, leg by leg'));
  const state = journey.legs.map((l) => l.selected || 0);
  const totalEl = el('strong', 'rec-price');
  const warnEls = [];

  const recompute = () => {
    let total = 0;
    journey.legs.forEach((leg, i) => {
      const o = leg.options[state[i]];
      if (o) total += o.total_price;
      const prevLeg = i > 0 ? journey.legs[i - 1] : null;
      const prevO = prevLeg && prevLeg.options[state[i - 1]];
      const broken = o && prevO && leg.mode !== 'hotel' && prevLeg.mode !== 'hotel' && o.depart_at < prevO.arrive_at;
      warnEls[i].textContent = broken ? '⚠ Departs before the previous leg arrives.' : '';
    });
    totalEl.textContent = fmtInr(total);
  };

  journey.legs.forEach((leg, i) => {
    const card = el('article', 'journey-leg');
    const head = el('div', 'journey-head');
    head.appendChild(el('span', 'journey-icon', MODE_ICON[leg.mode]));
    head.appendChild(el('strong', '', leg.mode === 'hotel' ? `Stay in ${leg.to}` : `${leg.from} → ${leg.to}`));
    card.appendChild(head);
    const warn = el('p', 'detail-error');
    warnEls.push(warn);

    if (!leg.options.length) {
      card.appendChild(el('p', 'detail-error', leg.issues.join(' ') || 'No options found for this leg.'));
      wrap.appendChild(card);
      return;
    }
    const body = el('div', 'journey-body');
    const draw = () => {
      const o = leg.options[state[i]];
      const [l1, l2] = optionLines(leg.mode, o);
      body.replaceChildren(
        el('p', 'journey-when', `${fmtDT(o.depart_at)}  →  ${fmtDT(o.arrive_at)}`),
        el('p', 'rec-line', l1),
        el('p', 'rec-line muted', l2),
        el('strong', 'rec-price', fmtInr(o.total_price)),
      );
    };
    draw();
    card.appendChild(body);
    card.appendChild(warn);
    leg.issues.forEach((t) => card.appendChild(el('p', 'muted journey-issue', `ℹ ${t}`)));

    if (leg.options.length > 1) {
      const more = el('details', 'journey-more');
      more.appendChild(el('summary', '', `Other options (${leg.options.length - 1})`));
      leg.options.forEach((o, k) => {
        const row = el('label', 'journey-option');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `leg-${i}`;
        radio.checked = k === state[i];
        radio.addEventListener('change', () => { state[i] = k; draw(); recompute(); });
        row.appendChild(radio);
        const [l1] = optionLines(leg.mode, o);
        row.appendChild(el('span', '', ` ${l1} · ${fmtDT(o.depart_at)} · ${fmtInr(o.total_price)}`));
        more.appendChild(row);
      });
      card.appendChild(more);
    }
    wrap.appendChild(card);
  });

  const foot = el('div', 'journey-foot');
  foot.appendChild(el('span', 'muted', 'Estimated total'));
  foot.appendChild(totalEl);
  wrap.appendChild(foot);
  journey.notes.forEach((n) => wrap.appendChild(el('p', 'muted journey-issue', `ℹ ${n}`)));

  // Book the whole journey into one named trip.
  const complete = journey.legs.every((l) => l.options.length);
  const bookBar = el('div', 'detail-form');
  const nameInput = input('text', '', { maxlength: 80, placeholder: `e.g. ${journey.destination} trip` });
  bookBar.appendChild(field('Trip name', nameInput));
  const errorEl = el('p', 'detail-error');
  const book = el('button', 'btn', 'Book entire journey');
  book.type = 'button';
  book.disabled = !complete;
  book.addEventListener('click', async () => {
    errorEl.textContent = '';
    if (!isAuthenticated) { window.location.href = '/login'; return; }
    if (!nameInput.value.trim()) { errorEl.textContent = 'Name your trip first.'; return; }
    book.disabled = true;
    const items = journey.legs.map((l, i) => ({ ...l.options[state[i]].book, travelers: lastFilters.travelers || 1 }));
    try {
      const res = await fetch('/api/bookings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, new_trip_name: nameInput.value.trim(), trip_destination: journey.destination }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');
      window.location.href = `/itineraries#trip-${data.itinerary_id}`;
    } catch (err) {
      errorEl.textContent = err.message;
      book.disabled = false;
    }
  });
  wrap.appendChild(bookBar);
  wrap.appendChild(errorEl);
  wrap.appendChild(book);
  if (!complete) wrap.appendChild(el('p', 'muted', 'Some legs have no options, so the whole journey cannot be booked at once.'));
  recompute();
  return wrap;
};

const renderRecommendations = (data) => {
  if (!recsOutput) return;
  lastFilters = data.filters || {};
  const flights = (data.flights || []).map((f) => recCard(
    f, `${f.airline} ${f.flight_number}`,
    [`${f.from.code} ${f.departs} → ${f.to.code} ${f.arrives}${f.arrives_next_day ? ' (+1)' : ''}`,
      `${fmtDuration(f.duration_min)} · ${f.stops ? `${f.stops} stop` : 'Non-stop'} · ${f.cabin.replace('_', ' ')}`],
    fmtInr(f.price_per_person), `per person · ${fmtInr(f.total_price)} total`,
  ));
  const trains = (data.trains || []).map((t) => recCard(
    t, `${t.number} ${t.name}`,
    [`${t.from.code} ${t.departs} → ${t.to.code} ${t.arrives}${t.arrives_day_offset ? ` (+${t.arrives_day_offset})` : ''}`,
      `${fmtDuration(t.duration_min)} · ${t.classes.map((c) => `${c.class} ${fmtInr(c.fare)}`).join(' · ')}`],
    `from ${fmtInr(t.price_per_person)}`, `per person · ${fmtInr(t.total_price)} total`,
  ));
  const hotels = (data.hotels || []).map((h) => recCard(
    h, h.name,
    [`${'★'.repeat(h.stars)} · ${h.rating} (${h.review_count.toLocaleString('en-IN')} reviews) · ${h.area}`,
      h.amenities.slice(0, 5).join(', ').replace(/_/g, ' ')],
    `${fmtInr(h.price_per_night)}/night`, `${fmtInr(h.total_price)} for ${h.rooms_needed} room(s)`,
  ));

  const cabs = (data.cabs || []).map((c) => recCard(
    c, c.title,
    [`${c.from.city} → ${c.to.city} · ${c.distance_km} km · ${fmtDuration(c.duration_min)}`, `${c.models} · ${c.vehicles} vehicle(s)`],
    fmtInr(c.total_price), 'for the group',
  ));

  const sections = data.journey
    ? [renderJourney(data.journey)]
    : [recGroup('Flights', flights), recGroup('Trains', trains), recGroup('Cabs', cabs), recGroup('Hotels', hotels)];
  recsOutput.replaceChildren(...sections.filter(Boolean));
  if (!recsOutput.children.length) {
    recsOutput.appendChild(el('p', 'muted', 'No matching options found for these preferences.'));
  }
  if (recsNotes) recsNotes.textContent = (data.notes || []).join(' ');
};

const requestRecommendations = async (payload) => {
  try {
    const response = await fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('recommendations unavailable');
    renderRecommendations(await response.json());
  } catch (error) {
    console.error(error);
    if (recsNotes) recsNotes.textContent = 'Could not load recommendations right now.';
  }
};

const loadCities = async () => {
  try {
    const data = await (await fetch('/api/cities')).json();
    const list = document.getElementById('cityList');
    data.cities.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      list?.appendChild(option);
    });
  } catch (_) { /* datalist is a convenience only */ }
};

const handleGeneration = async (payload, message = 'Crafting your route...') => {
  setAlert('');
  setStatus(message);
  try {
    await submitPreferences(payload);
    await requestRecommendations(payload); // first, so the itinerary can reference the real picks
    const itinerary = await requestItinerary(payload);
    updateItineraryDisplay(itinerary);
    latestPreferences = payload;
    setStatus('Itinerary refreshed.');
    await loadDestinationMedia(payload.destination);
  } catch (error) {
    console.error(error);
    setStatus('We hit turbulence.', true);
    setAlert(error.message || 'Unable to generate itinerary at the moment.');
  }
};

if (answerForm) {
  answerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(answerForm);
    const payload = Object.fromEntries(formData.entries());
    await handleGeneration(payload);
  });
}

if (regenerateBtn) {
  regenerateBtn.addEventListener('click', async () => {
    if (!isAuthenticated) return;
    await handleGeneration(latestPreferences, 'Regenerating with a fresh perspective...');
  });
}

if (mediaPrev) {
  mediaPrev.addEventListener('click', () => {
    if (!mediaImages.length || mediaPrev.disabled) return;
    mediaIndex = (mediaIndex - 1 + mediaImages.length) % mediaImages.length;
    renderMediaCarousel();
  });
}

if (mediaNext) {
  mediaNext.addEventListener('click', () => {
    if (!mediaImages.length || mediaNext.disabled) return;
    mediaIndex = (mediaIndex + 1) % mediaImages.length;
    renderMediaCarousel();
  });
}

const toggleItineraryModal = (show) => {
  if (!itineraryModal) return;
  itineraryModal.classList.toggle('hidden', !show);
  document.body?.classList.toggle('modal-open', show);
};

if (readMoreBtn) {
  readMoreBtn.addEventListener('click', () => {
    if (!currentItineraryText) return;
    toggleItineraryModal(true);
  });
}

modalDismissEls.forEach((el) => {
  el.addEventListener('click', () => toggleItineraryModal(false));
});

modalCloseBtn?.addEventListener('click', () => toggleItineraryModal(false));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && itineraryModal && !itineraryModal.classList.contains('hidden')) {
    toggleItineraryModal(false);
  }
});

if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    const card = document.getElementById('itineraryCard');
    if (!card || typeof html2pdf === 'undefined') return;
    html2pdf().set({
      margin: 0.5,
      filename: 'sarathi-itinerary.pdf',
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    }).from(card).save();
  });
}

if (sessionBtn) {
  sessionBtn.addEventListener('click', () => {
    window.location.href = '/login';
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      await updateSessionState();
      setStatus('Logged out. Regeneration disabled until you sign in again.');
    } catch (error) {
      console.error('Logout failed', error);
    }
  });
}

const init = async () => {
  await Promise.all([fetchPreferences(), fetchItinerary(), updateSessionState(), loadCities()]);
};

init();
