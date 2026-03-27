const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_DB_PATH = path.join(__dirname, 'data', 'users.json');
const SESSION_SECRET = process.env.SARATHI_SESSION_SECRET || 'sarathi-secret';

const ensureUsersStore = async () => {
  try {
    await fsPromises.access(USERS_DB_PATH);
  } catch (error) {
    await fsPromises.mkdir(path.dirname(USERS_DB_PATH), { recursive: true });
    await fsPromises.writeFile(
      USERS_DB_PATH,
      JSON.stringify({ users: [] }, null, 2),
      'utf-8',
    );
  }
};

const readUsers = async () => {
  await ensureUsersStore();
  const fileBuffer = await fsPromises.readFile(USERS_DB_PATH, 'utf-8');
  return JSON.parse(fileBuffer || '{"users": []}');
};

const writeUsers = async (payload) => {
  await fsPromises.writeFile(USERS_DB_PATH, JSON.stringify(payload, null, 2), 'utf-8');
};

const buildPromptFromPreferences = (prefs = {}) => {
  const {
    destination = 'a memorable location',
    dates = 'flexible upcoming dates',
    budget = 'a comfortable but not extravagant budget',
    passengers = 'two travelers',
    interests = 'culture, food, and hidden gems',
    weather = 'pleasant weather',
    pace = 'balanced pacing',
    specialNotes = 'no specific constraints',
  } = prefs;

  return `You are Sarathi, an empathetic and detail-obsessed travel concierge. Draft a rich day-by-day itinerary.

Destination or region: ${destination}
Travel dates or timeframe: ${dates}
Budget guidance: ${budget}
Group size: ${passengers}
Interests & must-do themes: ${interests}
Preferred climate or weather: ${weather}
Desired pace/style: ${pace}
Extra notes / user constraints: ${specialNotes}

Deliver:
- A poetic intro paragraph setting the mood.
- Daily sections with morning, afternoon, and night suggestions.
- A dining highlight and a mindful/local tip each day.
- Close with a short checklist and packing tip list.
Keep it conversational yet authoritative.`;
};

const callOpenRouter = async (preferences) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY in .env');
  }

  const model = process.env.GEMINI_MODEL || 'openai/gpt-5-mini';
  const referer = process.env.OPENROUTER_REFERRER || 'http://localhost:3000';
  const prompt = buildPromptFromPreferences(preferences);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': referer,
      'X-Title': 'Sarathi',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are Sarathi, a refined travel-planning co-pilot. Craft itineraries that feel bespoke, grounded in reality, and culturally respectful.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const itinerary = data?.choices?.[0]?.message?.content || 'No itinerary returned.';
  return itinerary;
};

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
    const { email, firstName, lastName, password } = req.body;
    if (!email || !firstName || !lastName || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const db = await readUsers();
    const existingUser = db.users.find((user) => user.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    db.users.push({
      email,
      firstName,
      lastName,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
    });
    await writeUsers(db);

    req.session.user = { email, firstName, lastName };
    res.json({ success: true, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to sign up.', details: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = await readUsers();
    const existingUser = db.users.find((user) => user.email === email);
    if (!existingUser) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const passwordMatch = await bcrypt.compare(password, existingUser.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    req.session.user = {
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

app.post('/api/itinerary', requirePreferences, async (req, res) => {
  try {
    const preferences = {
      ...req.session.preferences,
      ...(req.body || {}),
    };
    req.session.preferences = preferences;
    const itinerary = await callOpenRouter(preferences);
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

app.use((err, _req, res, _next) => {
  console.error('Unexpected server error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again later.' });
});

app.listen(PORT, () => {
  console.log(`Sarathi running at http://localhost:${PORT}`);
});
