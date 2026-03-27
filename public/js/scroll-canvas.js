/**
 * Sarathi — Scroll-Driven Canvas Animation
 *
 * Architecture:
 *  1. Preloader   — batch-loads all WebP frames; shows loader screen until done
 *  2. Scroll evt  — { passive: true }, updates scrollProgress only
 *  3. rAF loop    — draws frame + applies 3D tilt, decoupled from scroll
 *  4. Phase mgr   — fades content overlays in/out by scroll window
 */

'use strict';

/* ── Config ─────────────────────────────────────────────────────── */

const TOTAL_FRAMES = 120;
const FRAME_PATH = (n) => `/frames/frame-${String(n).padStart(4, '0')}.webp`;
const TILT_MIN_DEG = -4;
const TILT_MAX_DEG = 8;
const BATCH_SIZE = 10;   // images loaded per microtask batch

/* ── DOM refs ───────────────────────────────────────────────────── */

const canvas = document.getElementById('frame-canvas');
const ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null;
const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');

/* ── State ──────────────────────────────────────────────────────── */

const frames = new Array(TOTAL_FRAMES).fill(null);
let scrollProgress = 0;
let lastFrame = -1;
let rafId;

/* ── Phase definitions ──────────────────────────────────────────── */

const phases = [
    { el: document.getElementById('phase-1'), start: 0.0, end: 0.32 },
    { el: document.getElementById('phase-2'), start: 0.38, end: 0.62 },
    { el: document.getElementById('phase-3'), start: 0.68, end: 0.92 },
];

/* ── Helpers ────────────────────────────────────────────────────── */

/**
 * Linear interpolation.
 * @param {number} a
 * @param {number} b
 * @param {number} t - 0–1
 */
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

/**
 * Resize canvas to match viewport, preserving pixel-perfect output.
 */
const resizeCanvas = () => {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
};

/**
 * Draw a single image frame to the canvas, covering the viewport
 * with object-fit:cover semantics.
 * @param {HTMLImageElement} img
 */
const drawFrame = (img) => {
    if (!ctx || !canvas || !img) return;
    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth || 1280;
    const ih = img.naturalHeight || 720;

    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
};

/**
 * Apply a subtle 3D tilt to the canvas driven by scroll progress.
 * @param {number} progress - 0–1
 */
const applyTilt = (progress) => {
    if (!canvas) return;
    const deg = lerp(TILT_MIN_DEG, TILT_MAX_DEG, progress);
    canvas.style.transform = `perspective(1200px) rotateY(${deg.toFixed(2)}deg)`;
};

/**
 * Update phase overlay visibility.
 * @param {number} progress - 0–1
 */
const updatePhases = (progress) => {
    phases.forEach(({ el, start, end }) => {
        if (!el) return;
        const visible = progress >= start && progress <= end;
        el.classList.toggle('visible', visible);
    });
};

/* ── Preloader ──────────────────────────────────────────────────── */

/**
 * Load images in batches to avoid flooding the browser's request queue.
 * Updates a progress bar while loading.
 * @returns {Promise<void>}
 */
const preloadFrames = () => new Promise((resolve) => {
    let loaded = 0;

    const onLoad = () => {
        loaded++;
        const pct = loaded / TOTAL_FRAMES;
        if (loaderBar) loaderBar.style.width = `${(pct * 100).toFixed(1)}%`;
        if (loaded === TOTAL_FRAMES) resolve();
    };

    // Load in batches to avoid locking the browser
    const loadBatch = (startIdx) => {
        const end = Math.min(startIdx + BATCH_SIZE, TOTAL_FRAMES);
        for (let i = startIdx; i < end; i++) {
            const img = new Image();
            img.onload = onLoad;
            img.onerror = onLoad; // still advance even on failure
            img.src = FRAME_PATH(i + 1);
            frames[i] = img;
        }
        if (end < TOTAL_FRAMES) {
            // Schedule next batch
            setTimeout(() => loadBatch(end), 0);
        }
    };

    loadBatch(0);
});

/* ── rAF Render Loop ────────────────────────────────────────────── */

/**
 * Main render loop — runs continuously at display refresh rate.
 * Reads latest scrollProgress, decides which frame to draw.
 */
const renderLoop = () => {
    const frameIndex = Math.min(
        Math.floor(scrollProgress * (TOTAL_FRAMES - 1)),
        TOTAL_FRAMES - 1,
    );

    // Only redraw if the frame has actually changed
    if (frameIndex !== lastFrame) {
        const img = frames[frameIndex];
        if (img && img.complete) {
            drawFrame(img);
            // applyTilt(scrollProgress); // Removed 3D tilt as per request
        }
        lastFrame = frameIndex;
    }

    updatePhases(scrollProgress);
    rafId = requestAnimationFrame(renderLoop);
};

/* ── Scroll Listener ────────────────────────────────────────────── */

const onScroll = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = maxScroll > 0 ? Math.min(1, window.scrollY / maxScroll) : 0;
};

/* ── Boot ───────────────────────────────────────────────────────── */

const init = async () => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('scroll', onScroll, { passive: true });

    // Draw first frame immediately so there's no blank canvas flash
    if (ctx) {
        ctx.fillStyle = '#08080d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await preloadFrames();

    // Dismiss loader with a fade
    if (loader) {
        loader.classList.add('done');
        // Draw frame 0 before the loader fully fades
        drawFrame(frames[0]);
    }

    // Start render loop after a brief delay to let loader fade
    setTimeout(() => {
        rafId = requestAnimationFrame(renderLoop);
    }, 600);
};

init();
