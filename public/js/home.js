const form = document.getElementById('preferenceForm');
const statusEl = document.getElementById('formStatus');
const mapBackdrop = document.getElementById('mapBackdrop');
let cursorAnimationFrame;
let cursorTarget = { x: 50, y: 50 };
let currentCursor = { x: 50, y: 50 };

const setStatus = (text, isError = false) => {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#ff9bbd' : 'var(--muted)';
};

const handleTransition = () => {
  document.body.classList.add('transitioning');
  setTimeout(() => {
    window.location.href = '/answer';
  }, 500);
};

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Configuring your journey...');

    const formData = new FormData(form);
    const preferences = Object.fromEntries(formData.entries());

    try {
      const response = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        throw new Error('Unable to save preferences.');
      }

      setStatus('Perfect. Curating scenes...');
      handleTransition();
    } catch (error) {
      console.error(error);
      setStatus('We hit light turbulence. Try again?', true);
    }
  });
}

const updateMapBackdrop = () => {
  if (!mapBackdrop) return;
  currentCursor.x += (cursorTarget.x - currentCursor.x) * 0.08;
  currentCursor.y += (cursorTarget.y - currentCursor.y) * 0.08;
  mapBackdrop.style.setProperty('--cursor-x', `${currentCursor.x}%`);
  mapBackdrop.style.setProperty('--cursor-y', `${currentCursor.y}%`);
  cursorAnimationFrame = requestAnimationFrame(updateMapBackdrop);
};

if (mapBackdrop) {
  window.addEventListener('pointermove', (event) => {
    const { innerWidth, innerHeight } = window;
    cursorTarget = {
      x: Math.max(0, Math.min(100, (event.clientX / innerWidth) * 100)),
      y: Math.max(0, Math.min(100, (event.clientY / innerHeight) * 100)),
    };
  });

  window.addEventListener('pointerleave', () => {
    cursorTarget = { x: 50, y: 50 };
  });

  cursorAnimationFrame = requestAnimationFrame(updateMapBackdrop);
}
