const fetch = require('node-fetch');
const { FILTER_SCHEMA, heuristicFilters } = require('./filters');

const isMock = () => process.env.SARATHI_LLM_MOCK === '1';

const chat = async (messages, { json = false, temperature = 0.7 } = {}) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY in .env');

  const body = {
    model: process.env.GEMINI_MODEL || 'openai/gpt-5-mini',
    messages,
    temperature,
  };
  if (json) body.response_format = { type: 'json_object' };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.OPENROUTER_REFERRER || 'http://localhost:3000',
      'X-Title': 'Sarathi',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
};

// Models often wrap JSON in ```json fences or add prose; take the outermost {...}.
const parseJsonObject = (text) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in model output');
  return JSON.parse(text.slice(start, end + 1));
};

/**
 * Ask the model to turn free-text trip preferences into the structured filter JSON.
 * Returns { filters, source } where source is 'llm' or 'heuristic'. Never throws.
 */
const extractFilters = async (prefs, { cityNames, today = new Date().toISOString().slice(0, 10) }) => {
  if (isMock()) return { filters: heuristicFilters(prefs), source: 'heuristic' };

  const messages = [
    {
      role: 'system',
      content:
        'You convert travel preferences into search filters for a flight/train/hotel database. ' +
        'Reply with ONLY one JSON object matching the schema. Use null for anything the user did not specify; do not invent constraints. ' +
        'Interpret vague wording ("luxury" -> min_stars 4, "cheap" -> sort price). Amounts are INR.\n\n' +
        'TRIP RULES: set "trip" when the origin differs from the destination and the traveller needs more than a one-way hop: ' +
        'they must get home again, they give a start time or deadline, or they name places to pass through. The server then ' +
        'designs the cabs/trains/flights; you only supply constraints. return_home=true when the stated dates imply coming back. ' +
        'earliest_start = the moment they are free and at the origin (e.g. "exam ends 1 PM on the 28th" -> that date at 13:00). ' +
        'arrive_by = end of the last stated date (23:59) when they must be home by then. via = cities they say they travel "through". ' +
        'prefer "cheapest" unless they ask for speed. Leave trip null for a simple one-way search.\n\nSchema:\n' +
        FILTER_SCHEMA,
    },
    {
      role: 'user',
      content: `Today: ${today}\nKnown cities: ${cityNames.join(', ')}\nPreferences:\n${JSON.stringify(prefs)}`,
    },
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await chat(messages, { json: true, temperature: 0.1 });
      return { filters: parseJsonObject(text), source: 'llm' };
    } catch (err) {
      console.warn(`Filter extraction attempt ${attempt + 1} failed:`, err.message);
    }
  }
  return { filters: heuristicFilters(prefs), source: 'heuristic' };
};

const buildPromptFromPreferences = (prefs = {}, picks = null) => {
  const {
    origin = '',
    destination = 'a memorable location',
    dates = 'flexible upcoming dates',
    budget = 'a comfortable but not extravagant budget',
    passengers = 'two travelers',
    interests = 'culture, food, and hidden gems',
    weather = 'pleasant weather',
    pace = 'balanced pacing',
    specialNotes = 'no specific constraints',
  } = prefs;

  const lines = [
    origin ? `Departing from: ${origin}` : null,
    `Destination or region: ${destination}`,
    `Travel dates or timeframe: ${dates}`,
    `Budget guidance: ${budget}`,
    `Group size: ${passengers}`,
    `Interests & must-do themes: ${interests}`,
    `Preferred climate or weather: ${weather}`,
    `Desired pace/style: ${pace}`,
    `Extra notes / user constraints: ${specialNotes}`,
  ].filter(Boolean);

  let bookings = '';
  if (Array.isArray(picks) && picks.length) {
    bookings = `\nThe travel legs below are already arranged with real timings. Build the day-by-day plan around these exact times (travel days, arrival, check-in/out) and do not invent other flights, trains, cabs or hotels:\n${picks.map((p) => `- ${p}`).join('\n')}\n`;
  } else if (picks) {
    bookings = `\nThe traveller has these real options on file; weave the top picks into the plan (arrival day, where they stay) and do not invent other flights, trains, or hotels:\n${JSON.stringify(picks)}\n`;
  }

  return `You are Sarathi, an empathetic and detail-obsessed travel concierge. Draft a rich day-by-day itinerary.

${lines.join('\n')}
${bookings}
Deliver:
- A poetic intro paragraph setting the mood.
- Daily sections with morning, afternoon, and night suggestions.
- A dining highlight and a mindful/local tip each day.
- Close with a short checklist and packing tip list.
Keep it conversational yet authoritative.`;
};

const generateItinerary = async (prefs, picks = null) => {
  if (isMock()) {
    return `Day 1\n- Mock itinerary for ${prefs.destination || 'your destination'} (SARATHI_LLM_MOCK=1).`;
  }
  const text = await chat([
    {
      role: 'system',
      content:
        'You are Sarathi, a refined travel-planning co-pilot. Craft itineraries that feel bespoke, grounded in reality, and culturally respectful.',
    },
    { role: 'user', content: buildPromptFromPreferences(prefs, picks) },
  ]);
  return text || 'No itinerary returned.';
};

module.exports = { extractFilters, generateItinerary, parseJsonObject };
