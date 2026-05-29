/* ─── LittleLoop frontend ────────────────────────────────────────────────
   Auth  → JWT stored in localStorage, sent as Bearer token
   Video → fetches demo video URL from /api/admin/demo-video
   Dashboard / Memories → scoped to user's family when logged in
   Memory capture modal → requires authentication
   ──────────────────────────────────────────────────────────────────────── */

'use strict';
const BASE = '/api';

/* ═══════════════════════════════════════════════════════════════════════
   AUTH STATE
   ═══════════════════════════════════════════════════════════════════════ */

let AUTH = (() => {
  try {
    const raw = localStorage.getItem('ll_user');
    return raw ? JSON.parse(raw) : null;   // { token, userId, name, email, familyId }
  } catch { return null; }
})();

function saveAuth(data) {
  AUTH = data;
  try { localStorage.setItem('ll_user', JSON.stringify(data)); } catch { /* private browsing */ }
}

function clearAuth() {
  AUTH = null;
  try { localStorage.removeItem('ll_user'); } catch { /* ignore */ }
}

function authHeaders() {
  return AUTH?.token ? { 'Authorization': `Bearer ${AUTH.token}` } : {};
}

/* ═══════════════════════════════════════════════════════════════════════
   LOOP CARDS (static)
   ═══════════════════════════════════════════════════════════════════════ */

const LOOP_CARDS = [
  { stage: 'Infant',     title: 'Tiny win',              prompt: 'Capture one sound, smile, or sleepy milestone from today.' },
  { stage: 'Little Kid', title: 'Bedtime laugh',         prompt: 'What made you laugh today?' },
  { stage: 'Teen',       title: 'Low-pressure check-in', prompt: 'Want advice, space, or just someone to listen?' },
  { stage: 'Siblings',   title: 'Kindness loop',         prompt: 'Send one kind thing you noticed about each other.' },
];

/* ═══════════════════════════════════════════════════════════════════════
   DOM HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

const qs  = (s) => document.querySelector(s);
function setText(sel, v) { const el = qs(sel); if (el) el.textContent = v; }
function show(el)  { if (el) { el.hidden = false; el.setAttribute('aria-hidden','false'); } }
function hide(el)  { if (el) { el.hidden = true;  el.setAttribute('aria-hidden','true'); } }
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || res.statusText), { status: res.status });
  }
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════════════
   HEADER — user avatar or sign-in button
   ═══════════════════════════════════════════════════════════════════════ */

function renderHeader() {
  const area = qs('#headerAuth');
  if (!area) return;

  if (AUTH) {
    const initial = (AUTH.name || AUTH.email || '?')[0].toUpperCase();
    area.innerHTML = `
      <button class="user-avatar-btn" id="userAvatarBtn" type="button" aria-label="Signed in as ${escHtml(AUTH.name)}">
        <span class="user-avatar-circle">${escHtml(initial)}</span>
        <span>${escHtml(AUTH.name.split(' ')[0])}</span>
      </button>
      <button class="sign-out-btn" id="signOutBtn" type="button">Sign out</button>`;

    qs('#signOutBtn')?.addEventListener('click', handleSignOut);
  } else {
    area.innerHTML = `<button class="header-cta" id="openAuthBtn" type="button">Sign in</button>`;
    qs('#openAuthBtn')?.addEventListener('click', () => openAuthModal('login'));
  }
}

function handleSignOut() {
  clearAuth();
  renderHeader();
  updateGuestBanner(true);
  loadDashboard();
  loadMemories();
}

/* ═══════════════════════════════════════════════════════════════════════
   GUEST BANNER
   ═══════════════════════════════════════════════════════════════════════ */

function updateGuestBanner(isGuest) {
  const banner = qs('#guestBanner');
  if (!banner) return;
  if (isGuest) {
    show(banner);
    qs('#guestSignInBtn')?.addEventListener('click', () => openAuthModal('login'), { once: true });
  } else {
    hide(banner);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   DASHBOARD & MEMORIES
   ═══════════════════════════════════════════════════════════════════════ */

let currentPrompt = 'What made you smile today?';

function renderLoopCards(cards) {
  const grid = qs('#loopCards');
  if (!grid) return;
  grid.innerHTML = cards.map((c) => `
    <article class="loop-card">
      <span class="chip">${c.stage}</span>
      <h4>${c.title}</h4>
      <p>${c.prompt}</p>
    </article>`).join('');
}

function renderMemories(memories) {
  const list = qs('#memoryList');
  if (!list) return;
  if (!memories?.length) {
    list.innerHTML = '<li class="memory-item">No memories yet — capture your first loop!</li>';
    return;
  }
  list.innerHTML = memories.slice(0, 6).map((m) => {
    if (m.image_data) {
      return `<li class="memory-item-photo">
        <img class="memory-photo-img" src="${escHtml(m.image_data)}" alt="Memory photo" loading="lazy"/>
        ${m.content ? `<p class="memory-photo-caption">${escHtml(m.content)}</p>` : ''}
      </li>`;
    }
    return `<li class="memory-item">${escHtml(m.content)}</li>`;
  }).join('');

  const n = memories.length;
  const label = `${n} saved moment${n !== 1 ? 's' : ''}`;
  setText('#memoryCount',     label);
  setText('#metricMemories',  n);
  setText('#heroMemoryCount', label);
}

async function loadDashboard() {
  try {
    const d = await apiFetch('/dashboard');
    setText('#metricCareSteps', d.careStepsWeek ?? '—');
    setText('#metricStreak',    d.streakDays    ?? '—');
    if (d.familyName) setText('#dashFamilyName', `${d.familyName}'s Family Loop`);
    if (d.todayLoop) {
      currentPrompt = d.todayLoop.prompt;
      setText('#activePrompt', d.todayLoop.prompt);
      setText('#activeAnswer', d.todayLoop.lastResponse ?? '');
      const mpTitle = qs('#modal-prompt-title');
      if (mpTitle) mpTitle.textContent = d.todayLoop.prompt;
      if (d.todayLoop.lastResponse) setText('#heroAnswer', d.todayLoop.lastResponse);
    }
    updateGuestBanner(!!d.isGuest);
  } catch {
    setText('#metricCareSteps', '12'); setText('#metricStreak', '5');
    setText('#activePrompt', 'What made you smile today?');
    setText('#activeAnswer',  'Aarav: "The art table at school."');
    updateGuestBanner(!AUTH);
  }
}

async function loadMemories() {
  try {
    const data = await apiFetch('/memories');
    renderMemories(data.memories ?? []);
  } catch {
    renderMemories([
      { content: 'First sleepy laugh from Milo' },
      { content: "Nora's playlist for Friday dinner" },
      { content: 'Zoe thanked Leo for helping with homework' },
    ]);
    setText('#metricMemories',  '28');
    setText('#heroMemoryCount', '28 saved moments');
    setText('#memoryCount',     '28 saved moments');
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTH MODAL
   ═══════════════════════════════════════════════════════════════════════ */

const authModal     = qs('#authModal');
const authError     = qs('#authError');
const authSaving    = qs('#authSaving');
const loginForm     = qs('#loginForm');
const registerForm  = qs('#registerForm');
const tabLogin      = qs('#tabLogin');
const tabRegister   = qs('#tabRegister');

function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  clearAuthError();
  show(authModal);
  document.body.style.overflow = 'hidden';
  setTimeout(() => qs(tab === 'login' ? '#loginEmail' : '#registerName')?.focus(), 220);
}

function closeAuthModal() {
  hide(authModal);
  document.body.style.overflow = '';
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  tabLogin?.classList.toggle('active', isLogin);
  tabRegister?.classList.toggle('active', !isLogin);
  tabLogin?.setAttribute('aria-selected', String(isLogin));
  tabRegister?.setAttribute('aria-selected', String(!isLogin));
  if (isLogin)  { show(loginForm);    hide(registerForm); }
  else          { hide(loginForm);    show(registerForm); }
  clearAuthError();
}

function showAuthError(msg) {
  if (!authError) return;
  authError.textContent = msg;
  show(authError);
}

function clearAuthError() {
  if (!authError) return;
  authError.textContent = '';
  hide(authError);
}

function setAuthLoading(on) {
  if (authSaving) { if (on) show(authSaving); else hide(authSaving); }
  const btns = authModal?.querySelectorAll('button[type="submit"], .auth-submit');
  btns?.forEach(b => { b.disabled = on; });
}

// Tab switching
tabLogin?.addEventListener('click',    () => switchAuthTab('login'));
tabRegister?.addEventListener('click', () => switchAuthTab('register'));
qs('#switchToRegister')?.addEventListener('click', () => switchAuthTab('register'));
qs('#switchToLogin')?.addEventListener('click',    () => switchAuthTab('login'));

// Close
qs('#authModalClose')?.addEventListener('click', closeAuthModal);
authModal?.addEventListener('click', (e) => { if (e.target === authModal) closeAuthModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeAuthModal(); closeModal(); }
});

// Hero sign-up button
qs('#heroSignUpBtn')?.addEventListener('click', () => openAuthModal('register'));

// Password show/hide toggles
document.querySelectorAll('.show-pass-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = qs('#' + btn.dataset.target);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  });
});

/* ── Login submit ─────────────────────────────────────────────────────── */
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthError();
  const email    = qs('#loginEmail')?.value.trim();
  const password = qs('#loginPassword')?.value;
  if (!email || !password) return showAuthError('Please fill in both fields.');

  setAuthLoading(true);
  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    saveAuth({ token: data.token, ...data.user });
    closeAuthModal();
    renderHeader();
    updateGuestBanner(false);
    loadDashboard();
    loadMemories();
    loadDemoVideo();   // show admin controls if applicable
  } catch (err) {
    showAuthError(err.message || 'Sign in failed. Please try again.');
  } finally {
    setAuthLoading(false);
  }
});

/* ── Register submit ──────────────────────────────────────────────────── */
registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthError();
  const name     = qs('#registerName')?.value.trim();
  const email    = qs('#registerEmail')?.value.trim();
  const password = qs('#registerPassword')?.value;

  if (!name)              return showAuthError('Please enter your name.');
  if (!email)             return showAuthError('Please enter your email.');
  if (!password || password.length < 6) return showAuthError('Password must be at least 6 characters.');

  setAuthLoading(true);
  try {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    saveAuth({ token: data.token, ...data.user });
    closeAuthModal();
    renderHeader();
    updateGuestBanner(false);
    loadDashboard();
    loadMemories();
    loadDemoVideo();
  } catch (err) {
    showAuthError(err.message || 'Registration failed. Please try again.');
  } finally {
    setAuthLoading(false);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   DEMO VIDEO SECTION
   ═══════════════════════════════════════════════════════════════════════ */

function isYouTubeUrl(url) { return /youtube\.com|youtu\.be/i.test(url); }
function isVimeoUrl(url)   { return /vimeo\.com/i.test(url); }

function youTubeEmbedUrl(url) {
  // handles watch?v=, youtu.be/, shorts/
  const id = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/)?.[1];
  return id ? `https://www.youtube.com/embed/${id}?rel=0&autoplay=0` : null;
}

function vimeoEmbedUrl(url) {
  const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
  return id ? `https://player.vimeo.com/video/${id}?byline=0&portrait=0` : null;
}

function renderVideo(url) {
  const wrap        = qs('#videoPlayerWrap');
  const placeholder = qs('#videoPlaceholder');
  if (!wrap) return;

  if (!url) {
    if (placeholder) show(placeholder);
    return;
  }

  if (placeholder) hide(placeholder);

  if (isYouTubeUrl(url)) {
    const embedUrl = youTubeEmbedUrl(url);
    wrap.innerHTML = embedUrl
      ? `<iframe src="${escHtml(embedUrl)}" title="LittleLoop demo" allowfullscreen loading="lazy"></iframe>`
      : `<p style="color:rgba(255,253,248,.6);padding:20px">Could not parse YouTube URL.</p>`;
  } else if (isVimeoUrl(url)) {
    const embedUrl = vimeoEmbedUrl(url);
    wrap.innerHTML = embedUrl
      ? `<iframe src="${escHtml(embedUrl)}" title="LittleLoop demo" allowfullscreen loading="lazy"></iframe>`
      : `<p style="color:rgba(255,253,248,.6);padding:20px">Could not parse Vimeo URL.</p>`;
  } else {
    // Local uploaded MP4
    wrap.innerHTML = `<video src="${escHtml(url)}" controls preload="metadata" poster="">
      Your browser does not support HTML5 video.
    </video>`;
  }
}

async function loadDemoVideo() {
  try {
    const data = await apiFetch('/admin/demo-video');
    renderVideo(data.url);

    // Show admin controls if logged in
    const adminArea = qs('#videoAdmin');
    if (adminArea && AUTH) show(adminArea);
    else if (adminArea)    hide(adminArea);
  } catch {
    // No video set, placeholder remains
  }
}

// Save YouTube/Vimeo URL
qs('#saveVideoUrlBtn')?.addEventListener('click', async () => {
  const url = qs('#videoUrlInput')?.value.trim();
  if (!url) return;
  try {
    await apiFetch('/admin/demo-video/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    renderVideo(url);
    if (qs('#videoUrlInput')) qs('#videoUrlInput').value = '';
  } catch (err) {
    alert('Could not save video URL: ' + err.message);
  }
});

// Upload video file
qs('#videoFileUpload')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const label = qs('.upload-video-label');
  if (label) label.textContent = 'Uploading…';

  const formData = new FormData();
  formData.append('video', file);

  try {
    const res = await fetch(`${BASE}/admin/demo-video/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    renderVideo(data.url);
  } catch (err) {
    alert('Upload failed: ' + err.message);
  } finally {
    if (label) label.textContent = '↑ Upload a video file (MP4, max 200 MB)';
    e.target.value = '';
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   MEMORY CAPTURE MODAL
   ═══════════════════════════════════════════════════════════════════════ */

let capturedImageBase64 = null;

const captureModal    = qs('#captureModal');
const modalClose      = qs('#modalClose');
const modalCancelBtn  = qs('#modalCancelBtn');
const saveMemoryBtn   = qs('#saveMemoryBtn');
const captureTextarea = qs('#captureText');
const charCountEl     = qs('#charCount');
const imageZone       = qs('#imageZone');
const imageFileInput  = qs('#imageFileInput');
const uploadPrompt    = qs('#uploadPrompt');
const imagePreviewWrap = qs('#imagePreviewWrap');
const imagePreview    = qs('#imagePreview');
const removeImageBtn  = qs('#removeImageBtn');
const modalSaving     = qs('#modalSaving');

function openModal() {
  // Require login to capture
  if (!AUTH) {
    openAuthModal('login');
    return;
  }
  resetModal();
  const mpTitle = qs('#modal-prompt-title');
  if (mpTitle) mpTitle.textContent = currentPrompt;
  show(captureModal);
  document.body.style.overflow = 'hidden';
  setTimeout(() => captureTextarea?.focus(), 240);
}

function closeModal() {
  hide(captureModal);
  document.body.style.overflow = '';
}

function resetModal() {
  capturedImageBase64 = null;
  if (captureTextarea)   captureTextarea.value = '';
  if (charCountEl)       charCountEl.textContent = '0';
  if (imageFileInput)    imageFileInput.value = '';
  if (uploadPrompt)      show(uploadPrompt);
  if (imagePreviewWrap)  hide(imagePreviewWrap);
  if (imagePreview)      imagePreview.src = '';
  if (modalSaving)       hide(modalSaving);
  if (saveMemoryBtn)     saveMemoryBtn.disabled = false;
}

captureTextarea?.addEventListener('input', () => {
  if (charCountEl) charCountEl.textContent = captureTextarea.value.length;
});

qs('#openCaptureModal')?.addEventListener('click', openModal);
modalClose?.addEventListener('click', closeModal);
modalCancelBtn?.addEventListener('click', closeModal);
captureModal?.addEventListener('click', (e) => { if (e.target === captureModal) closeModal(); });

imageZone?.addEventListener('click', (e) => {
  if (e.target.closest('#removeImageBtn')) return;
  imageFileInput?.click();
});
imageZone?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); imageFileInput?.click(); }
});

imageFileInput?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const label = uploadPrompt?.querySelector('p.upload-label');
  if (label) label.textContent = 'Compressing…';
  try {
    capturedImageBase64 = await compressImage(file);
    if (imagePreview) imagePreview.src = capturedImageBase64;
    hide(uploadPrompt); show(imagePreviewWrap);
  } catch {
    alert('Could not read that image — please try another.');
    if (label) label.textContent = 'Add a photo';
  }
});

removeImageBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  capturedImageBase64 = null;
  if (imageFileInput)  imageFileInput.value = '';
  if (imagePreview)    imagePreview.src = '';
  hide(imagePreviewWrap); show(uploadPrompt);
  const label = uploadPrompt?.querySelector('p.upload-label');
  if (label) label.textContent = 'Add a photo';
});

saveMemoryBtn?.addEventListener('click', async () => {
  const text = captureTextarea?.value?.trim() ?? '';
  if (!text && !capturedImageBase64) {
    captureTextarea?.focus();
    return;
  }
  show(modalSaving);
  if (saveMemoryBtn) saveMemoryBtn.disabled = true;
  try {
    const body = { response: text || 'A photo memory' };
    if (capturedImageBase64) body.image_data = capturedImageBase64;

    await apiFetch('/loops/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (text) setText('#activeAnswer', `You: "${text}"`);
    await loadMemories();
    await loadDashboard();
    closeModal();
  } catch (err) {
    hide(modalSaving);
    if (saveMemoryBtn) saveMemoryBtn.disabled = false;
    if (err.status === 401) {
      closeModal();
      openAuthModal('login');
    } else {
      alert('Could not save — is the server running? (npm start)');
    }
  }
});

// Drag-and-drop
imageZone?.addEventListener('dragover',  (e) => { e.preventDefault(); imageZone.style.borderColor = '#58765f'; });
imageZone?.addEventListener('dragleave', ()  => { imageZone.style.borderColor = ''; });
imageZone?.addEventListener('drop', async (e) => {
  e.preventDefault(); imageZone.style.borderColor = '';
  const file = e.dataTransfer?.files?.[0];
  if (file?.type.startsWith('image/')) {
    capturedImageBase64 = await compressImage(file);
    if (imagePreview) imagePreview.src = capturedImageBase64;
    hide(uploadPrompt); show(imagePreviewWrap);
  }
});

/* ─── Image compression ───────────────────────────────────────────────── */
function compressImage(file, maxPx = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale  = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════════ */

renderLoopCards(LOOP_CARDS);
renderHeader();
loadDashboard();
loadMemories();
loadDemoVideo();
