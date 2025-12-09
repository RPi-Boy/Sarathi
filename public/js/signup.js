const form = document.getElementById('signupForm');
const statusEl = document.getElementById('signupStatus');

const setStatus = (text, isError = false) => {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#ff9bbd' : 'var(--muted)';
};

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Creating your dossier...');

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to create account.');
      }

      setStatus('Account minted. Redirecting...');
      document.body.classList.add('transitioning');
      setTimeout(() => {
        window.location.href = '/answer';
      }, 450);
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Unable to create account.', true);
    }
  });
}
