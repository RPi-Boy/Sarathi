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
  const wrapper = document.createElement('div');
  wrapper.className = 'formatted-itinerary';

  if (!text.trim()) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'We are ready to conjure something lovely. Submit preferences once more.';
    wrapper.appendChild(p);
    return wrapper;
  }

  const segments = text.replace(/\r/g, '').split(/\n{2,}/);
  segments.forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;

    const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;

    const block = document.createElement('section');
    block.className = 'itinerary-section';

    const headingMatch = lines[0].match(/^(day\s*\d+[^\n:]*)[:\-]?\s*(.*)$/i);
    if (headingMatch) {
      const heading = document.createElement('h4');
      heading.textContent = headingMatch[1].replace(/\s+/g, ' ').trim();
      block.appendChild(heading);
      const remainder = headingMatch[2]?.trim();
      if (remainder) {
        lines[0] = remainder;
      } else {
        lines.shift();
      }
    }

    const hasListFeel = lines.filter((line) => /^[-•]/.test(line)).length >= Math.min(lines.length, 2);
    if (hasListFeel) {
      const list = document.createElement('ul');
      list.className = 'itinerary-list';
      lines.forEach((line) => {
        if (!line) return;
        if (/^[-•]/.test(line)) {
          const item = document.createElement('li');
          item.textContent = line.replace(/^[-•]\s*/, '');
          list.appendChild(item);
        } else {
          const p = document.createElement('p');
          p.textContent = line;
          block.appendChild(p);
        }
      });
      block.appendChild(list);
    } else {
      lines.forEach((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        block.appendChild(p);
      });
    }

    wrapper.appendChild(block);
  });

  return wrapper;
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

const handleGeneration = async (payload, message = 'Crafting your route...') => {
  setAlert('');
  setStatus(message);
  try {
    await submitPreferences(payload);
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
  await Promise.all([fetchPreferences(), fetchItinerary(), updateSessionState()]);
};

init();
