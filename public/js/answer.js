const itineraryOutput = document.getElementById('itineraryOutput');
const answerForm = document.getElementById('answerForm');
const statusEl = document.getElementById('answerStatus');
const alertEl = document.getElementById('answerAlert');
const regenerateBtn = document.getElementById('regenerateBtn');
const exportBtn = document.getElementById('exportBtn');
const sessionBtn = document.getElementById('sessionBtn');
const logoutBtn = document.getElementById('logoutBtn');

let isAuthenticated = false;
let latestPreferences = {};

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
      itineraryOutput.textContent = data.itinerary;
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
    itineraryOutput.textContent = itinerary;
    latestPreferences = payload;
    setStatus('Itinerary refreshed.');
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
