// ── State ──────────────────────────────────────────────
const STORAGE_KEY = 'habitflow_data';
const HISTORY_KEY = 'habitflow_history';

let state = {
  items: [],
  selectedCat: 'habits'
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) state.items = JSON.parse(saved);
  } catch(e) { state.items = []; }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch(e) { return {}; }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// ── Helpers ────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];

const catColors = {
  habits: '#f97316',
  activities: '#22d3ee',
  learning: '#a78bfa',
  jobs: '#34d399'
};

const catIcons = {
  habits: 'fa-fire',
  activities: 'fa-running',
  learning: 'fa-book-open',
  jobs: 'fa-briefcase'
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Toast ──────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  const icon = type === 'success' ? '✅' : '❌';
  t.innerHTML = `${icon} ${msg}`;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = 'toast', 2800);
}

// ── Render ─────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderTodayList();
  renderCategoryLists();
  renderWeeklyChart();
  updateGlobalStreak();
}

function renderStats() {
  const cats = ['habits', 'activities', 'learning', 'jobs'];
  const todayStr = today();

  cats.forEach(cat => {
    const all = state.items.filter(i => i.cat === cat);
    const done = all.filter(i => i.completedDates && i.completedDates.includes(todayStr));
    const total = all.length;
    const pct = total > 0 ? done.length / total : 0;

    document.getElementById(`stat-${cat}`).textContent = `${done.length}/${total}`;

    const ring = document.getElementById(`ring-${cat}`);
    const circumference = 94.2;
    ring.style.strokeDashoffset = circumference - (pct * circumference);
  });
}

function renderTodayList() {
  const container = document.getElementById('today-list');
  const todayStr = today();
  const todayItems = state.items.filter(i =>
    i.repeat === 'daily' || i.createdDate === todayStr
  );

  if (todayItems.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-sun"></i><p>No items for today. Add something!</p></div>`;
    return;
  }

  container.innerHTML = todayItems.map(item => renderItem(item, true)).join('');
  attachItemEvents(container);
}

function renderCategoryLists() {
  ['habits', 'activities', 'learning', 'jobs'].forEach(cat => {
    const container = document.getElementById(`list-${cat}`);
    if (!container) return;
    const items = state.items.filter(i => i.cat === cat);

    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state"><i class="fas ${catIcons[cat]}"></i><p>No ${cat} yet. Hit "Add Item" to get started.</p></div>`;
      return;
    }

    container.innerHTML = items.map(item => renderItem(item)).join('');
    attachItemEvents(container);
  });
}

const timingIcons = { morning: '🌅', afternoon: '☀️', evening: '🌙', anytime: '🕐' };

function renderItem(item, compact = false) {
  const todayStr = today();
  const isDone = item.completedDates && item.completedDates.includes(todayStr);
  const streak = calcStreak(item);
  const timingLabel = item.timing && item.timing !== 'anytime' ? ` · ${timingIcons[item.timing]} ${item.timing}` : '';

  return `
    <div class="item ${isDone ? 'done' : ''}" data-id="${item.id}">
      <button class="item-check" data-id="${item.id}" title="Mark complete">
        ${isDone ? '<i class="fas fa-check"></i>' : ''}
      </button>
      <div class="item-body">
        <div class="item-title">${escHtml(item.title)}</div>
        <div class="item-meta">
          <span style="color:${catColors[item.cat]}">${item.cat}</span>
          ${item.notes ? ` · ${escHtml(item.notes)}` : ''}
          ${timingLabel}
          ${streak > 1 ? ` · 🔥 ${streak} day streak` : ''}
          · ${item.repeat}
        </div>
      </div>
      <div class="item-actions">
        <button class="item-btn edit-btn" data-id="${item.id}" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="item-btn delete-btn" data-id="${item.id}" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
      <div class="item-cat-dot" style="background:${catColors[item.cat]}"></div>
    </div>
  `;
}

function attachItemEvents(container) {
  container.querySelectorAll('.item-check').forEach(btn => {
    btn.addEventListener('click', () => toggleItem(btn.dataset.id));
  });
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.dataset.id));
  });
}

function renderWeeklyChart() {
  const container = document.getElementById('weekly-chart');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const now = new Date();
  const bars = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const count = state.items.filter(item =>
      item.completedDates && item.completedDates.includes(dateStr)
    ).length;
    bars.push({ label: days[d.getDay()], count, isToday: i === 0 });
  }

  const max = Math.max(...bars.map(b => b.count), 1);

  container.innerHTML = bars.map(b => `
    <div class="week-bar-wrap">
      <div class="week-bar" style="height:${Math.max((b.count / max) * 90, 4)}px; ${b.isToday ? 'background: linear-gradient(180deg, #f97316, #ef4444)' : ''}"></div>
      <span class="week-label">${b.label}</span>
    </div>
  `).join('');
}

function updateGlobalStreak() {
  const todayStr = today();
  let streak = 0;
  const d = new Date();

  while (true) {
    const dateStr = d.toISOString().split('T')[0];
    const hasActivity = state.items.some(item =>
      item.completedDates && item.completedDates.includes(dateStr)
    );
    if (!hasActivity) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  document.getElementById('global-streak').textContent = streak;
}

function calcStreak(item) {
  if (!item.completedDates || item.completedDates.length === 0) return 0;
  let streak = 0;
  const d = new Date();

  while (true) {
    const dateStr = d.toISOString().split('T')[0];
    if (!item.completedDates.includes(dateStr)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

// ── Actions ────────────────────────────────────────────
function toggleItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;

  if (!item.completedDates) item.completedDates = [];
  const todayStr = today();
  const idx = item.completedDates.indexOf(todayStr);

  if (idx === -1) {
    item.completedDates.push(todayStr);
    showToast(`"${item.title}" marked done! 🎉`);
  } else {
    item.completedDates.splice(idx, 1);
    showToast(`"${item.title}" unmarked`, 'error');
  }

  saveState();
  renderAll();
}

function deleteItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  state.items = state.items.filter(i => i.id !== id);
  saveState();
  renderAll();
  showToast(`Deleted "${item.title}"`, 'error');
}

function addItem(title, cat, notes, repeat, timing) {
  const item = {
    id: uid(),
    title,
    cat,
    notes,
    repeat,
    timing: timing || 'anytime',
    createdDate: today(),
    completedDates: []
  };
  state.items.unshift(item);
  saveState();
  renderAll();
  showToast(`Added "${title}" to ${cat}!`);
}

function editItem(id, title, notes, repeat, timing) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  item.title = title;
  item.notes = notes;
  item.repeat = repeat;
  item.timing = timing || 'anytime';
  saveState();
  renderAll();
  showToast(`"${title}" updated!`);
}

// ── Navigation ─────────────────────────────────────────
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const viewEl = document.getElementById(`view-${view}`);
  const navEl = document.querySelector(`.nav-item[data-view="${view}"]`);

  if (viewEl) viewEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  const titles = { dashboard: 'Dashboard', habits: 'Habits', activities: 'Activities', learning: 'Learning', jobs: 'Job Hunting' };
  document.getElementById('view-title').textContent = titles[view] || view;
}

// ── Modal ──────────────────────────────────────────────
function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('form-title').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('add-form').reset();
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.cat-btn[data-cat="habits"]').classList.add('active');
  document.querySelectorAll('.timing-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.timing-btn[data-timing="anytime"]').classList.add('active');
  state.selectedCat = 'habits';
  state.selectedTiming = 'anytime';
}

function openEditModal(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  document.getElementById('edit-id').value = item.id;
  document.getElementById('edit-title').value = item.title;
  document.getElementById('edit-notes').value = item.notes || '';
  document.getElementById('edit-repeat').value = item.repeat;

  const timing = item.timing || 'anytime';
  document.querySelectorAll('#edit-timing-selector .timing-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.timing === timing);
  });
  state.editTiming = timing;

  document.getElementById('edit-modal-overlay').classList.add('open');
  document.getElementById('edit-title').focus();
}

function closeEditModal() {
  document.getElementById('edit-modal-overlay').classList.remove('open');
}

// ── Escape HTML ────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────
function init() {
  loadState();

  // Set date
  document.getElementById('view-date').textContent = formatDate(new Date());

  // Nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      switchView(item.dataset.view);
    });
  });

  // Modal open/close
  document.getElementById('open-modal').addEventListener('click', openModal);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Edit modal close
  document.getElementById('close-edit-modal').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('edit-modal-overlay')) closeEditModal();
  });

  // Category buttons
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedCat = btn.dataset.cat;
    });
  });

  // Timing buttons (add modal)
  state.selectedTiming = 'anytime';
  document.querySelectorAll('#modal-overlay .timing-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#modal-overlay .timing-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedTiming = btn.dataset.timing;
    });
  });

  // Timing buttons (edit modal)
  state.editTiming = 'anytime';
  document.querySelectorAll('#edit-timing-selector .timing-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#edit-timing-selector .timing-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.editTiming = btn.dataset.timing;
    });
  });

  // Form submit
  document.getElementById('add-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('form-title').value.trim();
    const notes = document.getElementById('form-notes').value.trim();
    const repeat = document.getElementById('form-repeat').value;
    if (!title) return;
    addItem(title, state.selectedCat, notes, repeat, state.selectedTiming);
    closeModal();
  });

  // Edit form submit
  document.getElementById('edit-form').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const title = document.getElementById('edit-title').value.trim();
    const notes = document.getElementById('edit-notes').value.trim();
    const repeat = document.getElementById('edit-repeat').value;
    if (!title) return;
    editItem(id, title, notes, repeat, state.editTiming);
    closeEditModal();
  });

  // Keyboard shortcut
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openModal(); }
  });

  // Seed demo data if empty
  if (state.items.length === 0) seedDemo();

  renderAll();
}

function seedDemo() {
  const demos = [
    { title: 'Morning Meditation', cat: 'habits', notes: '10 mins', repeat: 'daily' },
    { title: 'Drink 8 glasses of water', cat: 'habits', notes: '', repeat: 'daily' },
    { title: 'Evening Walk', cat: 'activities', notes: '30 mins', repeat: 'daily' },
    { title: 'Read "Atomic Habits"', cat: 'learning', notes: 'Chapter 3', repeat: 'daily' },
    { title: 'LeetCode Problem', cat: 'learning', notes: 'Easy/Medium', repeat: 'daily' },
    { title: 'Apply to 3 jobs', cat: 'jobs', notes: 'LinkedIn + Indeed', repeat: 'daily' },
    { title: 'Update Resume', cat: 'jobs', notes: '', repeat: 'once' },
  ];

  demos.forEach(d => {
    state.items.push({
      id: uid(),
      title: d.title,
      cat: d.cat,
      notes: d.notes,
      repeat: d.repeat,
      createdDate: today(),
      completedDates: []
    });
  });

  saveState();
}

document.addEventListener('DOMContentLoaded', init);
