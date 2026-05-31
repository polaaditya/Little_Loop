/* ─── LittleLoop frontend v6 ──────────────────────────────────────────────
   Auth        → JWT in localStorage, sent as Bearer token
   Onboarding  → 3-step wizard after first registration
   Invite      → share link via #invite=TOKEN hash
   Video       → demo video via /api/admin/demo-video
   Dashboard   → family-scoped when logged in, demo data as guest
   Memory jar  → photo + text grid
   ──────────────────────────────────────────────────────────────────────── */

'use strict';
const BASE = '/api';

/* ═══════════════════════════════════════════════════════════════════════
   AUTH STATE
   ═══════════════════════════════════════════════════════════════════════ */

let AUTH = (() => {
  try {
    const raw = localStorage.getItem('ll_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
})();

function saveAuth(data) {
  AUTH = data;
  try { localStorage.setItem('ll_user', JSON.stringify(data)); } catch { }
}

function clearAuth() {
  AUTH = null;
  try { localStorage.removeItem('ll_user'); } catch { }
}

function authHeaders() {
  return AUTH?.token ? { 'Authorization': `Bearer ${AUTH.token}` } : {};
}

/* ═══════════════════════════════════════════════════════════════════════
   LOOP CARDS (static display)
   ═══════════════════════════════════════════════════════════════════════ */

const LOOP_CARDS = [
  { stage: 'Infant',     title: 'Tiny win',              prompt: 'Capture one sound, smile, or sleepy milestone from today.' },
  { stage: 'Little Kid', title: 'Bedtime laugh',         prompt: 'What made you laugh today?' },
  { stage: 'Teen',       title: 'Low-pressure check-in', prompt: 'Want advice, space, or just someone to listen?' },
  { stage: 'Siblings',   title: 'Kindness loop',         prompt: 'Send one kind thing you noticed about each other.' },
];

/* ═══════════════════════════════════════════════════════════════════════
   ONBOARDING PROMPTS (for step 2 selection)
   ═══════════════════════════════════════════════════════════════════════ */

const STARTER_PROMPTS = [
  'What made you smile today?',
  'What was the best part of your day?',
  'What made you laugh today?',
  'What are you looking forward to this week?',
  'Share one small win from today.',
  'What\'s something kind someone did for you?',
];

/* ═══════════════════════════════════════════════════════════════════════
   DOM HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

const qs  = (s) => document.querySelector(s);
function setText(sel, v) { const el = qs(sel); if (el) el.textContent = v; }
function show(el)  { if (el) { el.hidden = false; el.setAttribute('aria-hidden','false'); } }
function hide(el)  { if (el) { el.hidden = true;  el.setAttribute('aria-hidden','true');  } }
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
   HEADER
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
  hideInviteStrip();
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
   INVITE STRIP
   ═══════════════════════════════════════════════════════════════════════ */

function hideInviteStrip() {
  hide(qs('#inviteStrip'));
}

async function loadInviteLink() {
  if (!AUTH) { hideInviteStrip(); return; }
  try {
    const data = await apiFetch('/auth/me/invite');
    if (!data.inviteToken) return;

    const inviteUrl = `${location.origin}${location.pathname}#invite=${data.inviteToken}`;
    const strip     = qs('#inviteStrip');
    const input     = qs('#inviteLinkInput');
    if (input) input.value = inviteUrl;
    if (strip) show(strip);
  } catch { /* not critical */ }
}

qs('#copyInviteBtn')?.addEventListener('click', () => {
  const input = qs('#inviteLinkInput');
  if (!input) return;
  navigator.clipboard?.writeText(input.value).catch(() => {
    input.select(); document.execCommand('copy');
  });
  const btn = qs('#copyInviteBtn');
  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy link'; }, 2000); }
});

/* ═══════════════════════════════════════════════════════════════════════
   INVITE HASH — handle #invite=TOKEN on page load
   ═══════════════════════════════════════════════════════════════════════ */

function getHashParam(key) {
  const hash = location.hash.slice(1);
  for (const part of hash.split('&')) {
    const [k, v] = part.split('=');
    if (k === key) return decodeURIComponent(v || '');
  }
  return null;
}

let PENDING_INVITE_TOKEN = null;

async function checkInviteHash() {
  const token = getHashParam('invite');
  if (!token || AUTH) return; // already logged in

  try {
    const data = await apiFetch(`/auth/invite/${token}`);
    PENDING_INVITE_TOKEN = token;
    // Open register tab with a note about the family
    openAuthModal('register');
    // Show family name hint
    const heading = qs('#registerForm .auth-heading');
    if (heading) heading.textContent = `Join ${data.familyName}`;
    const subheading = qs('#registerForm .auth-subheading');
    if (subheading) subheading.textContent = `Create your account to join ${data.familyName}.`;
  } catch {
    PENDING_INVITE_TOKEN = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   DASHBOARD & MEMORIES
   ═══════════════════════════════════════════════════════════════════════ */

let currentPrompt = 'What made you smile today?';
let currentLoopId = null;

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
  const grid = qs('#memoryList');
  if (!grid) return;

  if (!memories?.length) {
    grid.innerHTML = '<p class="memory-empty">No memories yet — capture your first loop!</p>';
    return;
  }

  grid.innerHTML = memories.slice(0, 8).map((m) => {
    if (m.image_data) {
      return `<div class="memory-card memory-card-photo">
        <img class="memory-photo-img" src="${escHtml(m.image_data)}" alt="Memory photo" loading="lazy"/>
        ${m.content && m.content !== 'A photo memory'
          ? `<p class="memory-photo-caption">${escHtml(m.content)}</p>` : ''}
      </div>`;
    }
    return `<div class="memory-card memory-card-text">
      <p>${escHtml(m.content)}</p>
      <span class="memory-date">${formatRelativeDate(m.created_at)}</span>
    </div>`;
  }).join('');

  const n = memories.length;
  const label = `${n} saved moment${n !== 1 ? 's' : ''}`;
  setText('#memoryCount',     label);
  setText('#metricMemories',  n);
  setText('#heroMemoryCount', label);
}

function formatRelativeDate(ts) {
  if (!ts) return '';
  try {
    const d    = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 86400000)    return 'Today';
    if (diff < 172800000)   return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

async function loadDashboard() {
  try {
    const d = await apiFetch('/dashboard');
    setText('#metricCareSteps', d.careStepsWeek ?? '—');
    setText('#metricStreak',    d.streakDays    ?? '—');
    if (d.familyName) setText('#dashFamilyName', `${d.familyName}'s Family Loop`);
    if (d.todayLoop) {
      currentPrompt = d.todayLoop.prompt;
      currentLoopId = d.todayLoop.id ?? null;
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

const authModal    = qs('#authModal');
const authError    = qs('#authError');
const authSaving   = qs('#authSaving');
const loginForm    = qs('#loginForm');
const registerForm = qs('#registerForm');
const tabLogin     = qs('#tabLogin');
const tabRegister  = qs('#tabRegister');

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
  if (isLogin) { show(loginForm); hide(registerForm); }
  else         { hide(loginForm); show(registerForm); }
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
  authModal?.querySelectorAll('.auth-submit').forEach(b => { b.disabled = on; });
}

tabLogin?.addEventListener('click',    () => switchAuthTab('login'));
tabRegister?.addEventListener('click', () => switchAuthTab('register'));
qs('#switchToRegister')?.addEventListener('click', () => switchAuthTab('register'));
qs('#switchToLogin')?.addEventListener('click',    () => switchAuthTab('login'));

qs('#authModalClose')?.addEventListener('click', closeAuthModal);
authModal?.addEventListener('click', (e) => { if (e.target === authModal) closeAuthModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeAuthModal(); closeModal(); closeOnboarding(); }
});

qs('#heroSignUpBtn')?.addEventListener('click', () => openAuthModal('register'));

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
    await loadDashboard();
    await loadMemories();
    await loadInviteLink();
    loadDemoVideo();
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

  if (!name)                         return showAuthError('Please enter your name.');
  if (!email)                        return showAuthError('Please enter your email.');
  if (!password || password.length < 6) return showAuthError('Password must be at least 6 characters.');

  setAuthLoading(true);
  try {
    let data;

    if (PENDING_INVITE_TOKEN) {
      // Join existing family
      data = await apiFetch('/auth/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, inviteToken: PENDING_INVITE_TOKEN }),
      });
      PENDING_INVITE_TOKEN = null;
      location.hash = ''; // clear invite hash
    } else {
      // Create new family
      data = await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
    }

    saveAuth({ token: data.token, ...data.user });
    closeAuthModal();
    renderHeader();
    updateGuestBanner(false);
    await loadDashboard();
    await loadMemories();
    loadDemoVideo();

    // Show onboarding for new accounts (not joins)
    if (data.isNew) {
      openOnboarding(data.inviteToken);
    } else {
      await loadInviteLink();
    }
  } catch (err) {
    showAuthError(err.message || 'Registration failed. Please try again.');
  } finally {
    setAuthLoading(false);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   ONBOARDING WIZARD
   ═══════════════════════════════════════════════════════════════════════ */

let _onboardInviteToken = null;

function openOnboarding(inviteToken) {
  _onboardInviteToken = inviteToken ?? null;
  showOnboardStep(1);
  show(qs('#onboardingModal'));
  document.body.style.overflow = 'hidden';
}

function closeOnboarding() {
  hide(qs('#onboardingModal'));
  document.body.style.overflow = '';
  // Make sure invite strip reflects reality
  loadInviteLink();
}

function showOnboardStep(n) {
  [1, 2, 3].forEach(i => {
    const step = qs(`#onboardStep${i}`);
    const dot  = qs(`#stepDot${i}`);
    if (step) { if (i === n) show(step); else hide(step); }
    if (dot)  dot.classList.toggle('active', i <= n);
  });
}

/* Step 1: Add members */
qs('#addMemberBtn')?.addEventListener('click', () => {
  const container = qs('#memberInputs');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'member-row';
  row.innerHTML = `
    <input class="form-input member-name" type="text" placeholder="Name" autocomplete="off" />
    <select class="form-input member-stage">
      <option value="">Age stage</option>
      <option value="Infant">Infant (0–2)</option>
      <option value="Little Kid">Little Kid (3–7)</option>
      <option value="Big Kid">Big Kid (8–12)</option>
      <option value="Teen">Teen (13+)</option>
    </select>`;
  container.appendChild(row);
  row.querySelector('.member-name')?.focus();
});

qs('#step1Next')?.addEventListener('click', async () => {
  const rows    = document.querySelectorAll('#memberInputs .member-row');
  const members = [];
  rows.forEach(row => {
    const name  = row.querySelector('.member-name')?.value.trim();
    const stage = row.querySelector('.member-stage')?.value;
    if (name) members.push({ name, age_stage: stage || null });
  });

  if (members.length > 0 && AUTH?.familyId) {
    // Save members in parallel (best effort)
    await Promise.allSettled(members.map(m =>
      apiFetch(`/families/${AUTH.familyId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: m.name, role: 'Member', age_stage: m.age_stage }),
      })
    ));
  }
  goToOnboardStep2();
});

qs('#step1Skip')?.addEventListener('click', () => goToOnboardStep2());

function goToOnboardStep2() {
  // Populate prompt grid
  const grid = qs('#promptPickGrid');
  if (grid) {
    grid.innerHTML = STARTER_PROMPTS.map((p, i) => `
      <button class="prompt-pick-btn${i === 0 ? ' selected' : ''}" type="button" data-prompt="${escHtml(p)}">${escHtml(p)}</button>
    `).join('');

    grid.querySelectorAll('.prompt-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.prompt-pick-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }
  showOnboardStep(2);
}

qs('#step2Back')?.addEventListener('click', () => showOnboardStep(1));

qs('#step2Next')?.addEventListener('click', async () => {
  const selectedBtn = qs('#promptPickGrid .prompt-pick-btn.selected');
  const prompt      = selectedBtn?.dataset.prompt;

  if (prompt && AUTH?.familyId) {
    // Create the chosen loop prompt
    await apiFetch(`/families/${AUTH.familyId}/loops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, loop_type: 'Parent-child' }),
    }).catch(() => { /* not critical */ });

    // Refresh dashboard so active prompt updates
    await loadDashboard();
  }

  // Setup invite on step 3
  if (_onboardInviteToken) {
    const inviteUrl   = `${location.origin}${location.pathname}#invite=${_onboardInviteToken}`;
    const inviteInput = qs('#onboardInviteInput');
    if (inviteInput) inviteInput.value = inviteUrl;
    show(qs('#onboardInviteBox'));
  }

  showOnboardStep(3);
});

qs('#step3Done')?.addEventListener('click', () => {
  closeOnboarding();
  // Scroll to dashboard
  qs('#dashboard')?.scrollIntoView({ behavior: 'smooth' });
});

// Copy invite in onboarding step 3
qs('#copyOnboardInviteBtn')?.addEventListener('click', () => {
  const input = qs('#onboardInviteInput');
  if (!input) return;
  navigator.clipboard?.writeText(input.value).catch(() => {
    input.select(); document.execCommand('copy');
  });
  const btn = qs('#copyOnboardInviteBtn');
  if (btn) { btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
});

/* ═══════════════════════════════════════════════════════════════════════
   DEMO VIDEO SECTION
   ═══════════════════════════════════════════════════════════════════════ */

function isYouTubeUrl(url) { return /youtube\.com|youtu\.be/i.test(url); }
function isVimeoUrl(url)   { return /vimeo\.com/i.test(url); }

function youTubeEmbedUrl(url) {
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

  if (!url) { if (placeholder) show(placeholder); return; }
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
    wrap.innerHTML = `<video src="${escHtml(url)}" controls preload="metadata">Your browser does not support HTML5 video.</video>`;
  }
}

async function loadDemoVideo() {
  try {
    const data    = await apiFetch('/admin/demo-video');
    renderVideo(data.url);
    const adminArea = qs('#videoAdmin');
    if (adminArea && AUTH) show(adminArea); else if (adminArea) hide(adminArea);
  } catch { /* no video set */ }
}

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
  } catch (err) { alert('Could not save video URL: ' + err.message); }
});

qs('#videoFileUpload')?.addEventListener('change', async (e) => {
  const file  = e.target.files?.[0];
  if (!file) return;
  const label = qs('.upload-video-label');
  if (label) label.textContent = 'Uploading…';
  const formData = new FormData();
  formData.append('video', file);
  try {
    const res  = await fetch(`${BASE}/admin/demo-video/upload`, {
      method: 'POST', headers: authHeaders(), body: formData,
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

const captureModal     = qs('#captureModal');
const modalClose       = qs('#modalClose');
const modalCancelBtn   = qs('#modalCancelBtn');
const saveMemoryBtn    = qs('#saveMemoryBtn');
const captureTextarea  = qs('#captureText');
const charCountEl      = qs('#charCount');
const imageZone        = qs('#imageZone');
const imageFileInput   = qs('#imageFileInput');
const uploadPrompt     = qs('#uploadPrompt');
const imagePreviewWrap = qs('#imagePreviewWrap');
const imagePreview     = qs('#imagePreview');
const removeImageBtn   = qs('#removeImageBtn');
const modalSaving      = qs('#modalSaving');

function openModal() {
  if (!AUTH) { openAuthModal('login'); return; }
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
  if (!text && !capturedImageBase64) { captureTextarea?.focus(); return; }
  show(modalSaving);
  if (saveMemoryBtn) saveMemoryBtn.disabled = true;
  try {
    const body = { response: text || 'A photo memory' };
    if (capturedImageBase64) body.image_data = capturedImageBase64;
    if (currentLoopId)       body.loopId     = currentLoopId;

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
    if (err.status === 401) { closeModal(); openAuthModal('login'); }
    else { alert('Could not save — is the server running? (npm start)'); }
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
    reader.onload  = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload  = () => {
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
if (AUTH) loadInviteLink();
checkInviteHash();
