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

app.get('/answer', (req, res) => {
  if (!req.session.preferences) {
    return res.redirect('/');
  }
  return res.sendFile(path.join(__dirname, 'public', 'answer.html'));
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
