/**
 * journal.js — Travel Journal timeline
 * Renders dummy journal entries with live Unsplash hero images.
 */

const JOURNAL_ENTRIES = [
  {
    id: 1,
    destination: 'Patagonia, Argentina',
    query: 'patagonia glacier landscape',
    date: 'November 12, 2025',
    mood: 'Adventurous',
    moodIcon: 'hiking',
    title: 'Where the wind tells stories',
    excerpt:
      'Standing at the foot of Perito Moreno, the ice cracked like thunder across the silence. We trekked for six hours through winds that bent the grass sideways, and every step felt earned. The guanaco herds watched us like we were the curious ones.',
  },
  {
    id: 2,
    destination: 'Marrakech, Morocco',
    query: 'marrakech souk colorful',
    date: 'February 18, 2025',
    mood: 'Cultural',
    moodIcon: 'palette',
    title: 'A labyrinth of color and spice',
    excerpt:
      'The medina swallowed us whole — a maze of saffron-stained walls, copper lanterns catching the light, and the distant call to prayer threading through every alley. We found our riad by accident, guided by the scent of orange blossom and mint tea.',
  },
  {
    id: 3,
    destination: 'Kyoto, Japan',
    query: 'kyoto bamboo grove',
    date: 'October 3, 2024',
    mood: 'Serene',
    moodIcon: 'spa',
    title: 'Silence between the bamboo',
    excerpt:
      'Arashiyama at dawn is a different world. The bamboo sings when the wind passes through — not a melody, but a low resonance that you feel in your chest. We walked the grove before the crowds came, and for a brief moment, the city disappeared entirely.',
  },
  {
    id: 4,
    destination: 'Amalfi Coast, Italy',
    query: 'amalfi coast positano',
    date: 'July 22, 2024',
    mood: 'Romantic',
    moodIcon: 'favorite',
    title: 'Lemon trees and sea spray',
    excerpt:
      'Positano tumbled down to the sea in a cascade of pastel pinks and yellows. We ate limoncello cake on a terrace overlooking the Tyrrhenian, and time simply stopped. The ferry skipped across the waves to Ravello, where the gardens felt like a painting you could walk inside.',
  },
  {
    id: 5,
    destination: 'Reykjavik, Iceland',
    query: 'iceland northern lights',
    date: 'January 8, 2024',
    mood: 'Awe-struck',
    moodIcon: 'auto_awesome',
    title: 'When the sky danced',
    excerpt:
      'We drove two hours into complete darkness, chasing a weather forecast and a prayer. Then the sky tore open — green and violet curtains rippling across the horizon. No photograph could capture it. Some things are meant to be felt, not framed.',
  },
];

const MOOD_COLORS = {
  'Adventurous': '#83ffd1',
  'Cultural': '#fde3c8',
  'Serene': '#a8c8ff',
  'Romantic': '#ff8fa3',
  'Awe-struck': '#c4b5fd',
};

const MOOD_I18N = {
  'Adventurous': 'journal.moodAdventurous',
  'Cultural': 'journal.moodCultural',
  'Serene': 'journal.moodSerene',
  'Romantic': 'journal.moodRomantic',
  'Awe-struck': 'journal.moodAwestruck',
};

/**
 * Fetch a single Unsplash image for a destination.
 * @param {string} query
 * @returns {Promise<string>}
 */
async function fetchImage(query) {
  try {
    const res = await fetch(`/api/unsplash?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Unsplash fetch failed');
    const data = await res.json();
    if (data.photos && data.photos.length > 0) {
      return data.photos[0].url || data.photos[0].thumb || '';
    }
  } catch (e) {
    console.warn('Image fetch failed for:', query, e);
  }
  return '';
}

/**
 * Build a single journal entry HTML.
 * @param {object} entry
 * @param {string} imageUrl
 * @param {number} index
 * @returns {string}
 */
function buildEntry(entry, imageUrl, index) {
  const side = index % 2 === 0 ? 'left' : 'right';
  const moodColor = MOOD_COLORS[entry.mood] || '#83ffd1';
  const t = window.i18n ? window.i18n.t : (k, fb) => fb || k;
  const moodLabel = t(MOOD_I18N[entry.mood] || entry.mood, entry.mood);

  return `
    <div class="journal-entry journal-entry--${side}" style="animation-delay: ${index * 0.15}s">
      <div class="journal-entry-dot" style="background: ${moodColor}; box-shadow: 0 0 12px ${moodColor}44;"></div>
      <div class="journal-entry-card glass-card">
        <div class="journal-hero">
          ${imageUrl
      ? `<img src="${imageUrl}" alt="${entry.destination}" loading="lazy" />`
      : `<div class="journal-hero-placeholder"><span class="material-icons">photo_camera</span></div>`
    }
          <div class="journal-hero-overlay">
            <span class="journal-date">${entry.date}</span>
            <span class="journal-mood-tag" style="background: ${moodColor}22; color: ${moodColor}; border: 1px solid ${moodColor}33;">
              <span class="material-icons">${entry.moodIcon}</span>
              ${moodLabel}
            </span>
          </div>
        </div>
        <div class="journal-entry-body">
          <p class="journal-destination">
            <span class="material-icons">place</span>
            ${entry.destination}
          </p>
          <h3 class="journal-entry-title">${entry.title}</h3>
          <p class="journal-entry-excerpt">${entry.excerpt}</p>
        </div>
      </div>
    </div>
  `;
}

/** Cached images to avoid redundant API calls on langchange */
let cachedImages = [];

/**
 * Render entries (re-used on init and langchange).
 */
function renderEntries() {
  const timeline = document.getElementById('journalTimeline');
  if (!timeline) return;
  timeline.innerHTML = JOURNAL_ENTRIES.map((entry, i) =>
    buildEntry(entry, cachedImages[i] || '', i)
  ).join('');
}

/**
 * Initialize the journal page.
 */
async function init() {
  const timeline = document.getElementById('journalTimeline');
  if (!timeline) return;

  // Show skeleton loaders
  timeline.innerHTML = JOURNAL_ENTRIES.map((_, i) => `
    <div class="journal-entry journal-entry--${i % 2 === 0 ? 'left' : 'right'}">
      <div class="journal-entry-dot"></div>
      <div class="journal-entry-card glass-card">
        <div class="journal-hero skeleton-shimmer" style="height: 220px;"></div>
        <div class="journal-entry-body">
          <div class="skeleton-line skeleton-shimmer" style="width: 40%; height: 14px;"></div>
          <div class="skeleton-line skeleton-shimmer" style="width: 80%; height: 20px; margin-top: 10px;"></div>
          <div class="skeleton-line skeleton-shimmer" style="width: 100%; height: 12px; margin-top: 8px;"></div>
          <div class="skeleton-line skeleton-shimmer" style="width: 90%; height: 12px; margin-top: 4px;"></div>
        </div>
      </div>
    </div>
  `).join('');

  // Fetch all images in parallel
  const imagePromises = JOURNAL_ENTRIES.map(e => fetchImage(e.query));
  cachedImages = await Promise.all(imagePromises);

  // Render entries
  renderEntries();
}

// Listen for language changes to re-render mood labels
document.addEventListener('langchange', () => renderEntries());

document.addEventListener('DOMContentLoaded', init);
