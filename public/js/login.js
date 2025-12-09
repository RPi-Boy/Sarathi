const form = document.getElementById('loginForm');
const statusEl = document.getElementById('loginStatus');

const setStatus = (text, isError = false) => {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#ff9bbd' : 'var(--muted)';
};

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Authenticating...');

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to log in.');
      }

      setStatus('Welcome back. Redirecting...');
      document.body.classList.add('transitioning');
      setTimeout(() => {
        window.location.href = '/answer';
      }, 400);
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Unable to log in.', true);
    }
  });
}
