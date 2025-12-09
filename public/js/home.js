const form = document.getElementById('preferenceForm');
const statusEl = document.getElementById('formStatus');

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
