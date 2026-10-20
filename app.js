const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const database = require('./db');
const { extractFilters, generateItinerary } = require('./services/llm');
const { recommend, cityNames } = require('./services/recommend');
const bookings = require('./services/bookings');
const { proposeJourney, planJourney, summarizeJourney } = require('./services/journey');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SARATHI_SESSION_SECRET || 'sarathi-secret';

const db = database.init();
const users = database.userRepo(db);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const PLACEHOLDER_IMAGES = [
  {
    id: 'placeholder-aurora',
    url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80',
    thumb: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=400&q=80',
    description: 'Aurora over a coastal ridge',
    photographer: 'Roxanne Desgagnés',
    photographerLink: 'https://unsplash.com/@roxannerhoads',
  },
  {
    id: 'placeholder-desert',
    url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=80',
    thumb: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=400&q=80',
    description: 'Golden dunes at dusk',
    photographer: 'Nathan McBride',
    photographerLink: 'https://unsplash.com/@nathanmcbride',
  },
  {
    id: 'placeholder-city',
    url: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1600&q=80',
    thumb: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=400&q=80',
    description: 'City skyline at twilight',
    photographer: 'Denys Nevozhai',
    photographerLink: 'https://unsplash.com/@dnevozhai',
  },
  {
    id: 'placeholder-lake',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=80',
    thumb: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
    description: 'Mirror lake among alpine peaks',
    photographer: 'Danielle MacInnes',
    photographerLink: 'https://unsplash.com/@dmacinnes',
  },
  {
    id: 'placeholder-jungle',
    url: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&w=1600&q=80',
    thumb: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&w=400&q=80',
    description: 'Mist rolling over rainforest cliffs',
    photographer: 'Paul Carmona',
    photographerLink: 'https://unsplash.com/@paulcar',
  },
  {
    id: 'placeholder-coast',
    url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80',
    thumb: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=400&q=80',
    description: 'Sunset on dramatic coastline',
    photographer: 'Luca Bravo',
    photographerLink: 'https://unsplash.com/@lucabravo',
  },
];

const formatUnsplashPhotos = (results = []) =>
  results
    .filter((photo) => photo?.urls?.regular)
    .map((photo) => ({
      id: photo.id,
      url: `${photo.urls.regular}&auto=format&fit=crop&w=1600&q=80`,
      thumb: `${photo.urls.small}&auto=format&fit=crop&w=400&q=80`,
      description: photo.description || photo.alt_description || 'Travel inspiration',
      photographer: photo.user?.name,
      photographerLink: photo.user?.links?.html,
    }));

const fetchUnsplashPhotos = async (query, apiKey) => {
  const searchUrl = new URL('https://api.unsplash.com/search/photos');
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('per_page', '10');
  searchUrl.searchParams.set('orientation', 'landscape');
  searchUrl.searchParams.set('content_filter', 'high');

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Authorization: `Client-ID ${apiKey}`,
      'Accept-Version': 'v1',
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Unsplash error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return formatUnsplashPhotos(data?.results || []);
};

const getDestinationMedia = async (destination) => {
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!apiKey) {
    return {
      images: PLACEHOLDER_IMAGES,
      source: 'placeholder',
      reason: 'UNSPLASH_ACCESS_KEY missing in environment.',
    };
  }

  const trimmed = destination.trim();
  const primary = trimmed.split(',')[0];
  const candidateQueries = Array.from(
    new Set([
      trimmed,
      `${primary} skyline`,
      `${primary} landmarks`,
      `${primary} travel`,
      'inspiring travel destinations',
    ]),
  );

  for (const query of candidateQueries) {
    try {
      const photos = await fetchUnsplashPhotos(query, apiKey);
      if (photos.length) {
        return {
          images: photos.slice(0, 10),
          source: 'unsplash',
          query,
        };
      }
    } catch (error) {
      console.warn(`Unsplash query failed for "${query}":`, error.message || error);
    }
  }

  return {
    images: PLACEHOLDER_IMAGES,
    source: 'placeholder',
    reason: 'Unsplash returned no usable results.',
  };
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  }),
);

app.use(express.static(path.join(__dirname, 'public')));

const requirePreferences = (req, res, next) => {
  if (!req.session.preferences) {
    return res.status(400).json({ error: 'Please provide trip preferences first.' });
  }
  return next();
};

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/answer', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'answer.html'));
});

app.get('/about', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/privacy', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/terms', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/plans', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'plans.html'));
});

app.get('/itineraries', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'itineraries.html'));
});

app.get('/journal', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'journal.html'));
});

/**
 * Proxy endpoint for client-side Unsplash image fetching.
 * Keeps the API key server-side.
 */
app.get('/api/unsplash', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Unsplash API key not configured.' });
  }
  try {
    const photos = await fetchUnsplashPhotos(query, apiKey);
    res.json({ photos });
  } catch (err) {
    console.error('Unsplash proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch images.' });
  }
});

app.get('/api/session', (req, res) => {
  res.json({
    authenticated: Boolean(req.session.user),
    user: req.session.user || null,
  });
});

app.post('/api/preferences', (req, res) => {
  const prefs = req.body || {};
  req.session.preferences = {
    destination: prefs.destination || '',
    dates: prefs.dates || '',
    budget: prefs.budget || '',
    origin: prefs.origin || '',
    passengers: prefs.passengers || '',
    interests: prefs.interests || '',
    weather: prefs.weather || '',
    pace: prefs.pace || '',
    specialNotes: prefs.specialNotes || '',
  };
  res.json({ success: true, preferences: req.session.preferences });
});

app.get('/api/preferences', (req, res) => {
  res.json({ preferences: req.session.preferences || null });
});

app.get('/api/destination-media', async (req, res) => {
  const destinationQuery = (req.query.q || '').trim();
  if (!destinationQuery) {
    return res.status(400).json({ error: 'Destination query is required.' });
  }

  try {
    const payload = await getDestinationMedia(destinationQuery);
    res.json(payload);
  } catch (error) {
    console.error('Destination media error:', error);
    res.json({
      images: PLACEHOLDER_IMAGES,
      source: 'placeholder',
      reason: error.message || 'Failed to resolve destination imagery.',
    });
  }
});

app.post('/api/signup', async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body;
    const email = normalizeEmail(req.body.email);
    if (!email || !firstName || !lastName || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (users.findByEmail(email)) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let id;
    try {
      id = users.create({ email, firstName, lastName, passwordHash });
    } catch (err) {
      // lost a race with a concurrent signup for the same email (UNIQUE constraint)
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    req.session.user = { id, email, firstName, lastName };
    res.json({ success: true, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to sign up.', details: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const existingUser = users.findByEmail(email);
    if (!existingUser) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const passwordMatch = await bcrypt.compare(password, existingUser.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    req.session.user = {
      id: existingUser.id,
      email: existingUser.email,
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
    };
    res.json({ success: true, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log in.', details: error.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

const requireLogin = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in first.' });
  return next();
};

app.post('/api/itinerary', requirePreferences, async (req, res) => {
  try {
    const preferences = {
      ...req.session.preferences,
      ...(req.body || {}),
    };
    req.session.preferences = preferences;
    const itinerary = await generateItinerary(preferences, req.session.lastPicks || null);
    req.session.lastItinerary = itinerary;
    res.json({ itinerary });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to generate itinerary at the moment.',
      details: error.message,
    });
  }
});

app.get('/api/itinerary/latest', (req, res) => {
  if (!req.session.lastItinerary) {
    return res.status(404).json({ error: 'No itinerary generated yet.' });
  }
  return res.json({ itinerary: req.session.lastItinerary });
});

app.get('/api/cities', (_req, res) => {
  res.json({ cities: cityNames(db) });
});

/**
 * AI-filtered recommendations: the LLM turns the stored preferences into a filter JSON,
 * the server validates it, and the database does the actual matching and ranking.
 */
app.post('/api/recommendations', requirePreferences, async (req, res) => {
  try {
    const preferences = { ...req.session.preferences, ...(req.body || {}) };
    const { filters: proposed, source } = await extractFilters(preferences, {
      cityNames: cityNames(db),
    });
    // Fields the user typed explicitly win over the model's reading of them.
    if (preferences.origin) proposed.origin = preferences.origin;
    if (preferences.destination) proposed.destination = preferences.destination;

    const result = recommend(db, proposed);
    const proposal = proposeJourney(db, result.filters);
    const journey = proposal?.journey ? planJourney(db, result.filters, proposal.journey) : null;
    if (journey && proposal) journey.notes.unshift(...proposal.notes);
    if (!journey && proposal) result.notes.push(...proposal.notes);
    if (journey) {
      // The multi-leg plan supersedes "no flights/trains for A -> B" style notes of the direct search.
      result.notes = result.notes.filter((n) => !/^No (direct )?(flight|train)/.test(n));
    }
    const counts = {
      flights: result.flights.length,
      trains: result.trains.length,
      cabs: result.cabs.length,
      hotels: result.hotels.length,
      journey_legs: journey ? journey.legs.length : 0,
    };
    db.prepare(
      'INSERT INTO searches (user_id, preferences, filters, filter_source, result_counts) VALUES (?, ?, ?, ?, ?)',
    ).run(
      req.session.user?.id ?? null,
      JSON.stringify(preferences),
      JSON.stringify(result.filters),
      source,
      JSON.stringify(counts),
    );

    req.session.lastPicks = journey
      ? summarizeJourney(journey)
      : { flights: result.flights.slice(0, 2), trains: result.trains.slice(0, 2), hotels: result.hotels.slice(0, 2) };
    res.json({ ...result, journey, filter_source: source });
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ error: 'Unable to build recommendations.', details: error.message });
  }
});

const handleBookingError = (res, err) => {
  if (err instanceof bookings.BookingError) return res.status(err.status).json({ error: err.message });
  console.error('Booking error:', err);
  return res.status(500).json({ error: 'Something went wrong.' });
};

// Full record for the details modal (train stops, all amenities, ...).
app.get('/api/details/:type/:ref', (req, res) => {
  try {
    const detail = bookings.getDetails(db, req.params.type, req.params.ref, req.query);
    if (!detail) return res.status(404).json({ error: 'Not found.' });
    return res.json(detail);
  } catch (err) {
    return handleBookingError(res, err);
  }
});

app.post('/api/bookings', requireLogin, (req, res) => {
  try {
    const body = req.body || {};
    const plan = req.session.lastItinerary && req.session.preferences?.destination
      ? { destination: req.session.preferences.destination, text: req.session.lastItinerary }
      : null;
    return res.json({ success: true, ...bookings.createBooking(db, req.session.user.id, body, { plan }) });
  } catch (err) {
    return handleBookingError(res, err);
  }
});

app.post('/api/bookings/batch', requireLogin, (req, res) => {
  try {
    const plan = req.session.lastItinerary && req.session.preferences?.destination
      ? { destination: req.session.preferences.destination, text: req.session.lastItinerary }
      : null;
    return res.json({ success: true, ...bookings.createBookings(db, req.session.user.id, req.body || {}, { plan }) });
  } catch (err) {
    return handleBookingError(res, err);
  }
});

app.delete('/api/bookings/:id', requireLogin, (req, res) => {
  try {
    return res.json({ success: bookings.cancelBooking(db, req.session.user.id, Number(req.params.id)) });
  } catch (err) {
    return handleBookingError(res, err);
  }
});

app.get('/api/itineraries', requireLogin, (req, res) => {
  if (req.query.summary) return res.json({ trips: bookings.tripSummaries(db, req.session.user.id) });
  return res.json({ trips: bookings.listTrips(db, req.session.user.id) });
});

app.use((err, _req, res, _next) => {
  console.error('Unexpected server error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again later.' });
});

app.listen(PORT, () => {
  console.log(`Sarathi running at http://localhost:${PORT}`);
});
