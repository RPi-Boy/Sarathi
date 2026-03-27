/**
 * plans.js — My Plans dashboard
 * Renders dummy plan cards with live Unsplash destination images.
 */

const DUMMY_PLANS = [
  {
    id: 1,
    destination: 'Kyoto, Japan',
    query: 'kyoto japan temple',
    dates: 'Apr 12 – 20, 2026',
    travelers: 2,
    pace: 'Leisurely',
    status: 'active',
    budget: '$3,200',
    highlights: 'Tea ceremonies, bamboo groves, temple trails',
  },
  {
    id: 2,
    destination: 'Santorini, Greece',
    query: 'santorini greece sunset',
    dates: 'Jun 1 – 8, 2026',
    travelers: 2,
    pace: 'Balanced',
    status: 'active',
    budget: '€4,500',
    highlights: 'Caldera views, wine tasting, volcanic beaches',
  },
  {
    id: 3,
    destination: 'Patagonia, Argentina',
    query: 'patagonia argentina landscape',
    dates: 'Nov 5 – 15, 2025',
    travelers: 4,
    pace: 'Fast-paced',
    status: 'completed',
    budget: '$6,800',
    highlights: 'Glacier trekking, wildlife, Tierra del Fuego',
  },
  {
    id: 4,
    destination: 'Marrakech, Morocco',
    query: 'marrakech morocco medina',
    dates: 'Feb 14 – 21, 2025',
    travelers: 3,
    pace: 'Balanced',
    status: 'completed',
    budget: '$2,100',
    highlights: 'Souks, riads, Atlas Mountains day trip',
  },
  {
    id: 5,
    destination: 'Swiss Alps',
    query: 'swiss alps mountain village',
    dates: 'Jul 20 – 28, 2026',
    travelers: 2,
    pace: 'Leisurely',
    status: 'active',
    budget: 'CHF 5,000',
    highlights: 'Glacier Express, fondue, alpine meadows',
  },
  {
    id: 6,
    destination: 'Bali, Indonesia',
    query: 'bali indonesia rice terrace',
    dates: 'TBD',
    travelers: 1,
    pace: 'Leisurely',
    status: 'draft',
    budget: '$1,800',
    highlights: 'Rice terraces, surf breaks, temple sunsets',
  },
];

const STATUS_META = {
  active: { labelKey: 'plans.statusActive', icon: 'schedule', class: 'status--active' },
  completed: { labelKey: 'plans.statusCompleted', icon: 'check_circle', class: 'status--completed' },
  draft: { labelKey: 'plans.statusDraft', icon: 'edit_note', class: 'status--draft' },
};

/**
 * Fetch a single Unsplash image for a destination.
 * @param {string} query - Search query
 * @returns {Promise<string>} - Image URL (regular size)
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
 * Build a single plan card HTML string.
 * @param {object} plan - Plan data
 * @param {string} imageUrl - Unsplash image URL
 * @returns {string} - HTML string
 */
function buildCard(plan, imageUrl) {
  const meta = STATUS_META[plan.status] || STATUS_META.draft;
  const t = window.i18n ? window.i18n.t : (k, fb) => fb || k;
  const statusLabel = t(meta.labelKey, plan.status);
  const travelersLabel = plan.travelers > 1 ? t('plans.travelers', 'travelers') : t('plans.traveler', 'traveler');
  const viewLabel = t('plans.viewItinerary', 'View Itinerary');
  return `
    <article class="plan-card" data-status="${plan.status}">
      <div class="plan-card-image">
        ${imageUrl
      ? `<img src="${imageUrl}" alt="${plan.destination}" loading="lazy" />`
      : `<div class="plan-card-placeholder"><span class="material-icons">landscape</span></div>`
    }
        <span class="plan-status-badge ${meta.class}">
          <span class="material-icons">${meta.icon}</span>
          ${statusLabel}
        </span>
      </div>
      <div class="plan-card-body">
        <h3 class="plan-card-dest">${plan.destination}</h3>
        <div class="plan-card-meta">
          <span><span class="material-icons">calendar_today</span>${plan.dates}</span>
          <span><span class="material-icons">group</span>${plan.travelers} ${travelersLabel}</span>
        </div>
        <p class="plan-card-highlights">${plan.highlights}</p>
        <div class="plan-card-footer">
          <span class="plan-card-budget">${plan.budget}</span>
          <button class="plan-card-btn" onclick="alert('Opening itinerary for ${plan.destination}…')">
            <span class="material-icons">arrow_forward</span>
            ${viewLabel}
          </button>
        </div>
      </div>
    </article>
  `;
}

/** Cached images to avoid redundant API calls on langchange */
let cachedImages = [];

/**
 * Render cards (re-used on init and langchange).
 */
function renderCards() {
  const grid = document.getElementById('plansGrid');
  if (!grid) return;
  grid.innerHTML = '';
  DUMMY_PLANS.forEach((plan, i) => {
    const card = document.createElement('div');
    card.innerHTML = buildCard(plan, cachedImages[i] || '');
    const article = card.firstElementChild;
    article.style.animationDelay = `${i * 0.1}s`;
    grid.appendChild(article);
  });
}

/**
 * Initialize the plans page.
 */
async function init() {
  const grid = document.getElementById('plansGrid');
  if (!grid) return;

  // Show skeleton loaders
  grid.innerHTML = DUMMY_PLANS.map(() => `
    <article class="plan-card plan-card--skeleton">
      <div class="plan-card-image skeleton-shimmer"></div>
      <div class="plan-card-body">
        <div class="skeleton-line skeleton-shimmer" style="width: 70%; height: 22px;"></div>
        <div class="skeleton-line skeleton-shimmer" style="width: 90%; height: 14px; margin-top: 10px;"></div>
        <div class="skeleton-line skeleton-shimmer" style="width: 50%; height: 14px; margin-top: 6px;"></div>
      </div>
    </article>
  `).join('');

  // Fetch all images in parallel
  const imagePromises = DUMMY_PLANS.map(p => fetchImage(p.query));
  cachedImages = await Promise.all(imagePromises);

  // Render cards
  renderCards();
}

// Listen for language changes to re-render card labels
document.addEventListener('langchange', () => renderCards());

document.addEventListener('DOMContentLoaded', init);
