/**
 * Sarathi — Homepage JavaScript
 * Handles:
 *  1. "Launch AI Planner" click → Sarathi logo animation → navigate to /answer
 *  2. Session-aware login icon state
 *
 * Note: particle canvas removed — replaced by scroll-driven frame canvas in scroll-canvas.js
 */

'use strict';

/* ── Launch Animation ────────────────────────────────────────────── */

const overlay = document.getElementById('launchOverlay');

/**
 * Play the Sarathi launch animation sequence, then navigate to /answer.
 */
const triggerLaunchAnimation = () => {
  if (!overlay) {
    window.location.href = '/answer';
    return;
  }
  overlay.classList.add('active');

  // swoop (0.8s) + spin-zoom (1.2s) = ~2s total, then fade + navigate
  setTimeout(() => {
    document.body.classList.add('transitioning');
    setTimeout(() => { window.location.href = '/answer'; }, 400);
  }, 1800);
};

// Bind all "Launch AI Planner" triggers
['launchPlannerNav', 'launchPlannerHero', 'launchPlannerCta'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (e) => { e.preventDefault(); triggerLaunchAnimation(); });
});

/* ── Session-Aware Login Icon ────────────────────────────────────── */

const navLoginBtn = document.getElementById('navLoginBtn');

/**
 * Check session and update the login button icon if user is authenticated.
 */
const updateNavSession = async () => {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (data?.authenticated && navLoginBtn) {
      navLoginBtn.title = data.user?.firstName || 'Account';
      const icon = navLoginBtn.querySelector('.material-icons');
      if (icon) icon.textContent = 'account_circle';
    }
  } catch (_) { /* fail silently */ }
};

updateNavSession();
