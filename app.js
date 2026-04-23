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

// Calculate missed days for an item
function getMissedDays(item) {
  if (!item.repeat || item.repeat === 'once') return [];
  
  const todayStr = today();
  const startDate = new Date(item.createdDate);
  const endDate = new Date(todayStr);
  endDate.setDate(endDate.getDate() - 1); // Don't count today as missed yet
  
  const missed = [];
  const completed = item.completedDates || [];
  
  let current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    
    // Check if this date should have been completed based on repeat type
    let shouldComplete = false;
    if (item.repeat === 'daily') {
      shouldComplete = true;
    } else if (item.repeat === 'weekly') {
      const dayOfWeek = current.getDay();
      const startDayOfWeek = startDate.getDay();
      shouldComplete = dayOfWeek === startDayOfWeek;
    } else if (item.repeat === 'once-a-week') {
      const weeksSinceStart = Math.floor((current - startDate) / (7 * 24 * 60 * 60 * 1000));
      const startOfWeek = new Date(startDate);
      startOfWeek.setDate(startDate.getDate() + weeksSinceStart * 7);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      // Check if any day in this week was completed
      const weekCompleted = completed.some(d => {
        const cd = new Date(d);
        return cd >= startOfWeek && cd <= endOfWeek;
      });
      
      // Only mark last day of week as missed if nothing was done
      if (current.getTime() === endOfWeek.getTime() && !weekCompleted) {
        shouldComplete = true;
      }
    } else if (item.repeat === 'monthly') {
      const dayOfMonth = current.getDate();
      const startDayOfMonth = startDate.getDate();
      shouldComplete = dayOfMonth === startDayOfMonth;
    }
    
    if (shouldComplete && !completed.includes(dateStr)) {
      missed.push(dateStr);
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return missed;
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
  renderMissed();
  renderCategoryLists();
  renderWeeklyChart();
  updateGlobalStreak();
  renderCalendar();
  renderCreator();
  renderSubjectCards();
}

function renderMissed() {
  const container = document.getElementById('missed-list');
  if (!container) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Build a map: { dateStr -> [items missed on that day] }
  const byDate = {};
  state.items
    .filter(i => i.repeat !== 'once')
    .forEach(i => {
      const missed = getMissedDays(i).filter(d => d >= cutoffStr);
      missed.forEach(d => {
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(i);
      });
    });

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a)); // newest first

  if (dates.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-trophy"></i><p>No missed habits in the last 7 days. Keep it up!</p></div>`;
    return;
  }

  container.innerHTML = dates.map(dateStr => {
    const [y, m, d] = dateStr.split('-');
    const label = new Date(y, m-1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const items = byDate[dateStr];
    const itemsHtml = items.map(item => `
      <div class="missed-day-item">
        <div class="missed-x">&#x2717;</div>
        <div class="item-body">
          <div class="item-title">${escHtml(item.title)}</div>
          <div class="item-meta"><span style="color:${catColors[item.cat]}">${item.cat}</span> &middot; ${item.repeat}</div>
        </div>
        <div class="item-cat-dot" style="background:${catColors[item.cat]}"></div>
      </div>
    `).join('');

    return `
      <div class="missed-date-row" data-date="${dateStr}">
        <div class="missed-date-header">
          <div class="missed-date-label">
            <i class="fas fa-calendar-times" style="color:var(--danger)"></i>
            ${label}
          </div>
          <div class="missed-date-right">
            <span class="missed-count">${items.length} missed</span>
            <i class="fas fa-chevron-down missed-chevron"></i>
          </div>
        </div>
        <div class="missed-date-items" style="display:none">${itemsHtml}</div>
      </div>
    `;
  }).join('');

  // Click to expand/collapse
  container.querySelectorAll('.missed-date-row').forEach(row => {
    row.querySelector('.missed-date-header').addEventListener('click', () => {
      const panel = row.querySelector('.missed-date-items');
      const chevron = row.querySelector('.missed-chevron');
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      chevron.style.transform = open ? '' : 'rotate(180deg)';
      row.classList.toggle('expanded', !open);
    });
  });
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

    // Make card clickable
    const card = document.querySelector(`.stat-card[data-cat="${cat}"]`);
    if (card) {
      card.style.cursor = 'pointer';
      card.onclick = () => switchView(cat === 'jobs' ? 'jobs' : cat);
    }
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
  const subjectLabel = item.cat === 'learning' && item.subject
    ? ` · 📚 ${SUBJECTS.find(s => s.key === item.subject)?.label || item.subject}`
    : '';
  const missed = item.repeat !== 'once' ? getMissedDays(item) : [];
  const missedLabel = missed.length > 0 ? ` · <span class="missed-badge">❌ ${missed.length} missed</span>` : '';

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
          ${subjectLabel}
          ${streak > 1 ? ` · 🔥 ${streak} day streak` : ''}
          ${missedLabel}
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

  const todayStr = today();
  if (!item.completedDates) item.completedDates = [];
  const alreadyDone = item.completedDates.includes(todayStr);

  // If unchecking, just unmark — no popup needed
  if (alreadyDone) {
    item.completedDates.splice(item.completedDates.indexOf(todayStr), 1);
    saveState();
    renderAll();
    showToast(`"${item.title}" unmarked`, 'error');
    return;
  }

  // If learning item, show subject picker first
  if (item.cat === 'learning') {
    // If item title suggests it's project work, go straight to project picker
    const isProjectItem = item.title.toLowerCase().includes('project');
    openSubjectPopup(id, isProjectItem);
    return;
  }

  item.completedDates.push(todayStr);
  saveState();
  renderAll();
  showToast(`"${item.title}" marked done! 🎉`);
}

function openSubjectPopup(itemId, goToProjects = false) {
  const grid = document.getElementById('subject-popup-grid');

  function showSubjectGrid() {
    document.getElementById('subject-popup-title').textContent = '📚 What did you study?';
    grid.innerHTML = SUBJECTS.map(s => `
      <button class="subj-pick-btn" data-key="${s.key}" style="--sc:${s.color}">
        <i class="fas ${s.icon}"></i>
        <span>${s.label}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.subj-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.key === 'projects') {
          showProjectGrid();
        } else {
          completeWithSubject(itemId, btn.dataset.key, null);
          closeSubjectPopup();
        }
      });
    });
  }

  function showProjectGrid() {
    const projects = (learnState.subjects['projects'] && learnState.subjects['projects'].topics) || [];
    document.getElementById('subject-popup-title').textContent = '🗂️ Which project?';

    if (projects.length === 0) {
      grid.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:12px 0;grid-column:1/-1">No projects added yet. Add them in the Learning → Projects section.</p>`;
    } else {
      grid.innerHTML = `
        <button class="subj-pick-btn back-btn" style="--sc:#6b7280;grid-column:1/-1">
          <i class="fas fa-arrow-left"></i><span>Back to subjects</span>
        </button>
        ${projects.map(p => `
          <button class="subj-pick-btn" data-project-id="${p.id}" data-project-name="${escHtml(p.name)}" style="--sc:#4ade80">
            <i class="fas fa-folder-open" style="color:#4ade80"></i>
            <span>${escHtml(p.name)}</span>
          </button>
        `).join('')}
      `;
      grid.querySelector('.back-btn').addEventListener('click', showSubjectGrid);
      grid.querySelectorAll('.subj-pick-btn:not(.back-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
          completeWithSubject(itemId, 'projects', btn.dataset.projectName);
          closeSubjectPopup();
        });
      });
    }
  }

  if (goToProjects) {
    showProjectGrid();
  } else {
    showSubjectGrid();
  }

  document.getElementById('subject-popup-skip').onclick = () => {
    completeWithSubject(itemId, null, null);
    closeSubjectPopup();
  };

  document.getElementById('subject-popup-overlay').classList.add('open');
}

function closeSubjectPopup() {
  document.getElementById('subject-popup-overlay').classList.remove('open');
}

function completeWithSubject(itemId, subjectKey, projectName) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  const todayStr = today();
  if (!item.completedDates) item.completedDates = [];
  item.completedDates.push(todayStr);

  if (subjectKey === 'projects' && projectName) {
    showToast(`"${item.title}" done · logged to ${projectName}! 🎉`);
  } else if (subjectKey && learnState.subjects[subjectKey]) {
    const subj = SUBJECTS.find(s => s.key === subjectKey);
    showToast(`"${item.title}" done · logged to ${subj.label}! 🎉`);
  } else {
    showToast(`"${item.title}" marked done! 🎉`);
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

function addItem(title, cat, notes, repeat, timing, subject) {
  const item = {
    id: uid(),
    title,
    cat,
    notes,
    repeat,
    timing: timing || 'anytime',
    subject: subject || '',
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

  const titles = { dashboard: 'Dashboard', habits: 'Habits', activities: 'Activities', learning: 'Learning', jobs: 'Job Hunting', creator: 'Creator' };
  document.getElementById('view-title').textContent = titles[view] || view;
  document.getElementById('open-modal').style.display = view === 'creator' ? 'none' : 'flex';
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
  document.getElementById('edit-cat').value = item.cat;
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

// ── Learning / Subject Tracker ─────────────────────────
const LEARN_KEY = 'habitflow_learning';

const SUBJECTS = [
  { key: 'dsa',     label: 'DSA',             icon: 'fa-code-branch',      color: '#f97316' },
  { key: 'dbms',    label: 'DBMS',            icon: 'fa-database',         color: '#22d3ee' },
  { key: 'os',      label: 'OS',              icon: 'fa-server',           color: '#a78bfa' },
  { key: 'cn',      label: 'Computer Networks', icon: 'fa-network-wired',  color: '#34d399' },
  { key: 'oop',     label: 'OOP',             icon: 'fa-cubes',            color: '#f43f5e' },
  { key: 'sd',      label: 'System Design',   icon: 'fa-sitemap',          color: '#fbbf24' },
  { key: 'coa',     label: 'COA',             icon: 'fa-microchip',        color: '#60a5fa' },
  { key: 'se',      label: 'Software Engg',   icon: 'fa-project-diagram',  color: '#e879f9' },
  { key: 'leetcode',label: 'LeetCode',        icon: 'fa-terminal',         color: '#fb923c' },
  { key: 'projects',label: 'Projects',        icon: 'fa-folder-open',      color: '#4ade80' },
];

let learnState = {
  subjects: {},   // { key: { topics: [{id, name, status, notes, date}] } }
  activeSubject: null,
  topicStatus: 'not-started'
};

function loadLearn() {
  try {
    const saved = localStorage.getItem(LEARN_KEY);
    if (saved) learnState.subjects = JSON.parse(saved);
  } catch(e) {}
  // ensure all subjects exist
  SUBJECTS.forEach(s => {
    if (!learnState.subjects[s.key]) learnState.subjects[s.key] = { topics: [] };
  });
}

function saveLearn() {
  localStorage.setItem(LEARN_KEY, JSON.stringify(learnState.subjects));
}

function renderSubjectCards() {
  const container = document.getElementById('subject-cards');
  if (!container) return;

  container.innerHTML = SUBJECTS.map(s => {
    const data = learnState.subjects[s.key] || { topics: [] };
    const total = data.topics.length;
    const done  = data.topics.filter(t => t.status === 'done').length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    const isActive = learnState.activeSubject === s.key;

    return `
      <div class="subject-card ${isActive ? 'active' : ''}" data-key="${s.key}" style="--sc:${s.color}">
        <div class="sc-icon"><i class="fas ${s.icon}"></i></div>
        <div class="sc-body">
          <div class="sc-label">${s.label}</div>
          <div class="sc-progress-bar"><div class="sc-progress-fill" style="width:${pct}%"></div></div>
          <div class="sc-meta">${done}/${total} topics · ${pct}%</div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.subject-card').forEach(card => {
    card.addEventListener('click', () => {
      learnState.activeSubject = card.dataset.key;
      renderSubjectCards();
      renderSubjectDetail(card.dataset.key);
    });
  });
}

function renderSubjectDetail(key) {
  const panel = document.getElementById('subject-detail-panel');
  if (!panel) return;
  const subj = SUBJECTS.find(s => s.key === key);
  const data  = learnState.subjects[key] || { topics: [] };
  const topics = data.topics;

  const statusOrder = { 'in-progress': 0, 'not-started': 1, 'done': 2 };
  const sorted = [...topics].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  const statusIcon = {
    'not-started': '<i class="fas fa-circle" style="color:var(--border);font-size:0.6rem"></i>',
    'in-progress':  '<i class="fas fa-spinner" style="color:#fbbf24;font-size:0.75rem"></i>',
    'done':         '<i class="fas fa-check-circle" style="color:var(--jobs);font-size:0.75rem"></i>'
  };
  const statusColor = { 'not-started': 'var(--text-muted)', 'in-progress': '#fbbf24', 'done': 'var(--jobs)' };

  panel.innerHTML = `
    <div class="sd-header">
      <div class="sd-title" style="color:${subj.color}"><i class="fas ${subj.icon}"></i> ${subj.label}</div>
      <button class="btn-add-topic" data-key="${key}"><i class="fas fa-plus"></i> Add Topic</button>
    </div>
    <div class="sd-topics">
      ${sorted.length === 0
        ? `<div class="empty-state"><i class="fas fa-list-ul"></i><p>No topics yet. Add your first one!</p></div>`
        : sorted.map(t => `
          <div class="topic-item" data-id="${t.id}">
            <span class="topic-status-icon">${statusIcon[t.status]}</span>
            <div class="topic-body">
              <div class="topic-name">${escHtml(t.name)}</div>
              ${t.notes ? `<div class="topic-notes">${escHtml(t.notes)}</div>` : ''}
            </div>
            <div class="item-actions">
              <button class="item-btn edit-topic-btn" data-key="${key}" data-id="${t.id}" title="Edit"><i class="fas fa-pen"></i></button>
              <button class="item-btn delete-topic-btn" data-key="${key}" data-id="${t.id}" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;

  panel.querySelector('.btn-add-topic').addEventListener('click', () => openTopicModal(key, null));
  panel.querySelectorAll('.edit-topic-btn').forEach(btn => {
    btn.addEventListener('click', () => openTopicModal(btn.dataset.key, btn.dataset.id));
  });
  panel.querySelectorAll('.delete-topic-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteTopic(btn.dataset.key, btn.dataset.id));
  });
}

function openTopicModal(key, topicId) {
  learnState.topicStatus = 'not-started';
  const subj = SUBJECTS.find(s => s.key === key);
  document.getElementById('topic-subject-key').value = key;
  document.getElementById('topic-id').value = topicId || '';
  document.getElementById('topic-modal-title').textContent = `${topicId ? 'Edit' : 'Add'} Topic — ${subj.label}`;

  if (topicId) {
    const t = (learnState.subjects[key].topics || []).find(t => t.id === topicId);
    if (!t) return;
    document.getElementById('topic-name').value = t.name;
    document.getElementById('topic-notes').value = t.notes || '';
    learnState.topicStatus = t.status;
  } else {
    document.getElementById('topic-form').reset();
    document.getElementById('topic-subject-key').value = key;
  }

  document.querySelectorAll('.topic-status-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.status === learnState.topicStatus);
  });

  document.getElementById('topic-modal-overlay').classList.add('open');
  document.getElementById('topic-name').focus();
}

function closeTopicModal() {
  document.getElementById('topic-modal-overlay').classList.remove('open');
}

function saveTopic(key, topicId, name, notes, status) {
  const arr = learnState.subjects[key].topics;
  if (topicId) {
    const idx = arr.findIndex(t => t.id === topicId);
    if (idx !== -1) arr[idx] = { ...arr[idx], name, notes, status };
  } else {
    arr.push({ id: uid(), name, notes, status, date: today() });
  }
  saveLearn();
  renderSubjectCards();
  if (learnState.activeSubject === key) renderSubjectDetail(key);
  showToast(topicId ? 'Topic updated!' : `Topic added to ${SUBJECTS.find(s=>s.key===key).label}!`);
}

function deleteTopic(key, topicId) {
  learnState.subjects[key].topics = learnState.subjects[key].topics.filter(t => t.id !== topicId);
  saveLearn();
  renderSubjectCards();
  if (learnState.activeSubject === key) renderSubjectDetail(key);
  showToast('Topic deleted', 'error');
}

// ── Creator State ──────────────────────────────────────
const CREATOR_KEY = 'habitflow_creator';

let creatorState = {
  instagram: { followers: 0, posts: [] },
  substack:  { subscribers: 0, posts: [] },
  editPostId: null,
  editPlatform: null,
  postType: 'reel'
};

const instaTypes  = ['reel','post','story','carousel'];
const substackTypes = ['newsletter','article','note'];

function loadCreator() {
  try {
    const saved = localStorage.getItem(CREATOR_KEY);
    if (saved) {
      const d = JSON.parse(saved);
      creatorState.instagram = d.instagram || { followers: 0, posts: [] };
      creatorState.substack  = d.substack  || { subscribers: 0, posts: [] };
    }
  } catch(e) {}
}

function saveCreator() {
  localStorage.setItem(CREATOR_KEY, JSON.stringify({
    instagram: creatorState.instagram,
    substack:  creatorState.substack
  }));
}

function renderCreator() {
  // Sync follower/subscriber inputs
  const fi = document.getElementById('insta-followers');
  const fs = document.getElementById('substack-subscribers');
  if (fi && !fi.matches(':focus')) fi.value = creatorState.instagram.followers || '';
  if (fs && !fs.matches(':focus')) fs.value = creatorState.substack.subscribers || '';

  renderCreatorStats();
  renderPosts('instagram');
  renderPosts('substack');
}

function renderCreatorStats() {
  const ig = creatorState.instagram;
  const ss = creatorState.substack;
  const igPosts = ig.posts.length;
  const ssPosts = ss.posts.length;
  const igLikes = ig.posts.reduce((a, p) => a + (parseInt(p.likes) || 0), 0);
  const ssOpens = ss.posts.reduce((a, p) => a + (parseInt(p.likes) || 0), 0);

  document.getElementById('creator-stats-row').innerHTML = `
    <div class="creator-stat-card insta-card">
      <div class="cs-icon"><i class="fab fa-instagram"></i></div>
      <div class="cs-body">
        <span class="cs-num">${(ig.followers || 0).toLocaleString()}</span>
        <span class="cs-label">Followers</span>
      </div>
    </div>
    <div class="creator-stat-card insta-card">
      <div class="cs-icon"><i class="fas fa-images"></i></div>
      <div class="cs-body">
        <span class="cs-num">${igPosts}</span>
        <span class="cs-label">Posts Logged</span>
      </div>
    </div>
    <div class="creator-stat-card insta-card">
      <div class="cs-icon"><i class="fas fa-heart"></i></div>
      <div class="cs-body">
        <span class="cs-num">${igLikes.toLocaleString()}</span>
        <span class="cs-label">Total Likes</span>
      </div>
    </div>
    <div class="creator-stat-card sub-card">
      <div class="cs-icon"><i class="fas fa-envelope-open-text"></i></div>
      <div class="cs-body">
        <span class="cs-num">${(ss.subscribers || 0).toLocaleString()}</span>
        <span class="cs-label">Subscribers</span>
      </div>
    </div>
    <div class="creator-stat-card sub-card">
      <div class="cs-icon"><i class="fas fa-newspaper"></i></div>
      <div class="cs-body">
        <span class="cs-num">${ssPosts}</span>
        <span class="cs-label">Issues Logged</span>
      </div>
    </div>
    <div class="creator-stat-card sub-card">
      <div class="cs-icon"><i class="fas fa-eye"></i></div>
      <div class="cs-body">
        <span class="cs-num">${ssOpens.toLocaleString()}</span>
        <span class="cs-label">Total Opens</span>
      </div>
    </div>
  `;
}

function renderPosts(platform) {
  const data = creatorState[platform];
  const posts = [...data.posts].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const container = document.getElementById(`${platform === 'instagram' ? 'insta' : 'substack'}-posts`);
  if (!container) return;

  if (posts.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-pen-nib"></i><p>No posts yet. Hit "Log Post" to start.</p></div>`;
    return;
  }

  const typeColors = {
    reel: '#f97316', post: '#22d3ee', story: '#a78bfa', carousel: '#34d399',
    newsletter: '#f97316', article: '#22d3ee', note: '#a78bfa'
  };

  container.innerHTML = posts.map(p => `
    <div class="post-item" data-id="${p.id}">
      <div class="post-type-badge" style="background:${typeColors[p.type] || '#6b7280'}22; color:${typeColors[p.type] || '#6b7280'}">${p.type}</div>
      <div class="post-body">
        <div class="post-title">${escHtml(p.title)}</div>
        <div class="post-meta">
          ${p.date ? `📅 ${p.date}` : ''}
          ${p.likes ? ` · ${platform === 'instagram' ? '❤️' : '👁️'} ${parseInt(p.likes).toLocaleString()}` : ''}
          ${p.notes ? ` · ${escHtml(p.notes)}` : ''}
        </div>
      </div>
      <div class="item-actions">
        <button class="item-btn edit-post-btn" data-platform="${platform}" data-id="${p.id}" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="item-btn delete-post-btn" data-platform="${platform}" data-id="${p.id}" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.edit-post-btn').forEach(btn => {
    btn.addEventListener('click', () => openPostModal(btn.dataset.platform, btn.dataset.id));
  });
  container.querySelectorAll('.delete-post-btn').forEach(btn => {
    btn.addEventListener('click', () => deletePost(btn.dataset.platform, btn.dataset.id));
  });
}

function openPostModal(platform, postId = null) {
  creatorState.editPlatform = platform;
  creatorState.editPostId = postId;
  const types = platform === 'instagram' ? instaTypes : substackTypes;
  const isInsta = platform === 'instagram';

  document.getElementById('post-platform').value = platform;
  document.getElementById('post-modal-title').textContent = `${postId ? 'Edit' : 'Log'} ${isInsta ? 'Instagram' : 'Substack'} Post`;
  document.getElementById('post-date').value = today();

  // Build type buttons
  const selector = document.getElementById('post-type-selector');
  creatorState.postType = types[0];
  selector.innerHTML = types.map(t => `
    <button type="button" class="post-type-btn ${t === types[0] ? 'active' : ''}" data-type="${t}">${t}</button>
  `).join('');
  selector.querySelectorAll('.post-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selector.querySelectorAll('.post-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      creatorState.postType = btn.dataset.type;
    });
  });

  document.getElementById('post-likes').placeholder = isInsta ? 'Likes' : 'Opens / Views';

  if (postId) {
    const post = creatorState[platform].posts.find(p => p.id === postId);
    if (!post) return;
    document.getElementById('post-title').value = post.title;
    document.getElementById('post-date').value = post.date || today();
    document.getElementById('post-likes').value = post.likes || '';
    document.getElementById('post-notes').value = post.notes || '';
    creatorState.postType = post.type;
    selector.querySelectorAll('.post-type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === post.type);
    });
  } else {
    document.getElementById('post-form').reset();
    document.getElementById('post-date').value = today();
  }

  document.getElementById('post-modal-overlay').classList.add('open');
  document.getElementById('post-title').focus();
}

function closePostModal() {
  document.getElementById('post-modal-overlay').classList.remove('open');
}

function savePost(platform, postId, data) {
  const arr = creatorState[platform].posts;
  if (postId) {
    const idx = arr.findIndex(p => p.id === postId);
    if (idx !== -1) arr[idx] = { ...arr[idx], ...data };
  } else {
    arr.unshift({ id: uid(), ...data });
  }
  saveCreator();
  renderCreator();
  showToast(postId ? 'Post updated!' : 'Post logged!');
}

function deletePost(platform, postId) {
  creatorState[platform].posts = creatorState[platform].posts.filter(p => p.id !== postId);
  saveCreator();
  renderCreator();
  showToast('Post deleted', 'error');
}

// ── Calendar / Interview State ─────────────────────────
const CAL_KEY = 'habitflow_calendar';

let calState = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  events: {},        // { 'YYYY-MM-DD': [ {id, company, role, type, time, notes, result} ] }
  selectedDate: null,
  evType: 'interview',
  evResult: 'pending'
};

function loadCalEvents() {
  try {
    const saved = localStorage.getItem(CAL_KEY);
    if (saved) calState.events = JSON.parse(saved);
  } catch(e) { calState.events = {}; }
}

function saveCalEvents() {
  localStorage.setItem(CAL_KEY, JSON.stringify(calState.events));
}

// ── Calendar Render ────────────────────────────────────
function renderCalendar() {
  const { year, month, events } = calState;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-label').textContent = `${monthNames[month]} ${year}`;

  const grid = document.getElementById('cal-grid');
  const days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today();

  let html = days.map(d => `<div class="cal-day-name">${d}</div>`).join('');

  for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const evs = events[dateStr] || [];
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === calState.selectedDate;

    const dots = evs.map(ev => `<span class="cal-dot ${ev.result !== 'pending' ? ev.result : ev.type}"></span>`).join('');

    html += `<div class="cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${evs.length ? 'has-events' : ''}" data-date="${dateStr}">
      <span class="cal-day-num">${d}</span>
      <div class="cal-dots">${dots}</div>
    </div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => selectCalDate(cell.dataset.date));
  });

  if (calState.selectedDate) renderDayEvents(calState.selectedDate);
}

function selectCalDate(dateStr) {
  calState.selectedDate = dateStr;
  renderCalendar();
  renderDayEvents(dateStr);
}

function renderDayEvents(dateStr) {
  const container = document.getElementById('cal-day-events');
  const evs = calState.events[dateStr] || [];
  const [y, m, d] = dateStr.split('-');
  const label = new Date(y, m-1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const resultColors = { pending: '#6b7280', passed: '#34d399', failed: '#f43f5e' };
  const typeIcons = { interview: 'fa-user-tie', assessment: 'fa-laptop-code' };

  let html = `<div class="day-events-header">
    <span>${label}</span>
    <button class="btn-add-event" data-date="${dateStr}"><i class="fas fa-plus"></i> Add</button>
  </div>`;

  if (evs.length === 0) {
    html += `<p class="no-events">No events. Click Add to schedule one.</p>`;
  } else {
    html += evs.map(ev => `
      <div class="cal-event-item">
        <div class="cal-event-icon ${ev.type}"><i class="fas ${typeIcons[ev.type]}"></i></div>
        <div class="cal-event-body">
          <div class="cal-event-company">${escHtml(ev.company)}</div>
          <div class="cal-event-meta">
            ${ev.role ? escHtml(ev.role) + ' · ' : ''}
            ${ev.time ? ev.time + ' · ' : ''}
            ${ev.notes ? escHtml(ev.notes) : ''}
          </div>
        </div>
        <div class="cal-event-actions">
          <span class="ev-result-badge" style="color:${resultColors[ev.result]}">${ev.result}</span>
          <button class="item-btn edit-ev-btn" data-date="${dateStr}" data-id="${ev.id}" title="Edit"><i class="fas fa-pen"></i></button>
          <button class="item-btn delete-ev-btn" data-date="${dateStr}" data-id="${ev.id}" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  }

  container.innerHTML = html;

  container.querySelector('.btn-add-event').addEventListener('click', () => openInterviewModal(dateStr, null));
  container.querySelectorAll('.edit-ev-btn').forEach(btn => {
    btn.addEventListener('click', () => openInterviewModal(btn.dataset.date, btn.dataset.id));
  });
  container.querySelectorAll('.delete-ev-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteCalEvent(btn.dataset.date, btn.dataset.id));
  });
}

// ── Interview Modal ────────────────────────────────────
function openInterviewModal(dateStr, eventId) {
  const overlay = document.getElementById('interview-modal-overlay');
  calState.evType = 'interview';
  calState.evResult = 'pending';

  document.getElementById('interview-date').value = dateStr;
  document.getElementById('interview-id').value = eventId || '';

  const [y, m, d] = dateStr.split('-');
  const label = new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (eventId) {
    const ev = (calState.events[dateStr] || []).find(e => e.id === eventId);
    if (!ev) return;
    document.getElementById('interview-modal-title').textContent = `Edit Event — ${label}`;
    document.getElementById('interview-company').value = ev.company;
    document.getElementById('interview-role').value = ev.role || '';
    document.getElementById('interview-time').value = ev.time || '';
    document.getElementById('interview-notes').value = ev.notes || '';
    calState.evType = ev.type;
    calState.evResult = ev.result;
  } else {
    document.getElementById('interview-modal-title').textContent = `Add Event — ${label}`;
    document.getElementById('interview-form').reset();
    document.getElementById('interview-date').value = dateStr;
  }

  // Sync type buttons
  document.querySelectorAll('.ev-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === calState.evType));
  document.querySelectorAll('.ev-result-btn').forEach(b => b.classList.toggle('active', b.dataset.result === calState.evResult));

  overlay.classList.add('open');
  document.getElementById('interview-company').focus();
}

function closeInterviewModal() {
  document.getElementById('interview-modal-overlay').classList.remove('open');
}

function saveCalEvent(dateStr, eventId, data) {
  if (!calState.events[dateStr]) calState.events[dateStr] = [];
  if (eventId) {
    const idx = calState.events[dateStr].findIndex(e => e.id === eventId);
    if (idx !== -1) calState.events[dateStr][idx] = { ...calState.events[dateStr][idx], ...data };
  } else {
    calState.events[dateStr].push({ id: uid(), ...data });
  }
  saveCalEvents();
  renderCalendar();
  showToast(eventId ? 'Event updated!' : 'Event added!');
}

function deleteCalEvent(dateStr, eventId) {
  if (!calState.events[dateStr]) return;
  calState.events[dateStr] = calState.events[dateStr].filter(e => e.id !== eventId);
  if (calState.events[dateStr].length === 0) delete calState.events[dateStr];
  saveCalEvents();
  renderCalendar();
  showToast('Event deleted', 'error');
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
    const title  = document.getElementById('form-title').value.trim();
    const notes  = document.getElementById('form-notes').value.trim();
    const repeat = document.getElementById('form-repeat').value;
    if (!title) return;
    addItem(title, state.selectedCat, notes, repeat, state.selectedTiming);
    closeModal();
  });

  // Edit form submit
  document.getElementById('edit-form').addEventListener('submit', e => {
    e.preventDefault();
    const id     = document.getElementById('edit-id').value;
    const title  = document.getElementById('edit-title').value.trim();
    const notes  = document.getElementById('edit-notes').value.trim();
    const repeat = document.getElementById('edit-repeat').value;
    if (!title) return;
    editItem(id, title, notes, repeat, state.editTiming);
    closeEditModal();
  });

  // Keyboard shortcut
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeEditModal(); closeInterviewModal(); closePostModal(); closeTopicModal(); closeSubjectPopup(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openModal(); }
  });

  // Learning subject tracker
  loadLearn();
  renderSubjectCards();

  document.getElementById('close-topic-modal').addEventListener('click', closeTopicModal);
  document.getElementById('topic-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('topic-modal-overlay')) closeTopicModal();
  });
  document.querySelectorAll('.topic-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.topic-status-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      learnState.topicStatus = btn.dataset.status;
    });
  });
  document.getElementById('topic-form').addEventListener('submit', e => {
    e.preventDefault();
    const key      = document.getElementById('topic-subject-key').value;
    const topicId  = document.getElementById('topic-id').value || null;
    const name     = document.getElementById('topic-name').value.trim();
    const notes    = document.getElementById('topic-notes').value.trim();
    if (!name) return;
    saveTopic(key, topicId, name, notes, learnState.topicStatus);
    closeTopicModal();
  });

  // Creator section
  loadCreator();

  document.querySelectorAll('.btn-add-post').forEach(btn => {
    btn.addEventListener('click', () => openPostModal(btn.dataset.platform));
  });

  document.querySelectorAll('.btn-save-metric').forEach(btn => {
    btn.addEventListener('click', () => {
      const platform = btn.dataset.platform;
      if (platform === 'instagram') {
        creatorState.instagram.followers = parseInt(document.getElementById('insta-followers').value) || 0;
      } else {
        creatorState.substack.subscribers = parseInt(document.getElementById('substack-subscribers').value) || 0;
      }
      saveCreator();
      renderCreator();
      showToast('Metrics saved!');
    });
  });

  document.getElementById('close-post-modal').addEventListener('click', closePostModal);
  document.getElementById('post-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('post-modal-overlay')) closePostModal();
  });

  document.getElementById('post-form').addEventListener('submit', e => {
    e.preventDefault();
    const platform = document.getElementById('post-platform').value;
    const postId = document.getElementById('post-id').value || null;
    const title = document.getElementById('post-title').value.trim();
    const date = document.getElementById('post-date').value;
    const likes = document.getElementById('post-likes').value;
    const notes = document.getElementById('post-notes').value.trim();
    if (!title) return;
    savePost(platform, postId, { title, type: creatorState.postType, date, likes, notes });
    closePostModal();
  });

  // Calendar nav
  loadCalEvents();
  document.getElementById('cal-prev').addEventListener('click', () => {
    calState.month--;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calState.month++;
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    renderCalendar();
  });

  // Interview modal type/result buttons
  document.querySelectorAll('.ev-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ev-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      calState.evType = btn.dataset.type;
    });
  });
  document.querySelectorAll('.ev-result-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ev-result-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      calState.evResult = btn.dataset.result;
    });
  });

  // Interview modal close
  document.getElementById('close-interview-modal').addEventListener('click', closeInterviewModal);
  document.getElementById('interview-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('interview-modal-overlay')) closeInterviewModal();
  });

  // Interview form submit
  document.getElementById('interview-form').addEventListener('submit', e => {
    e.preventDefault();
    const dateStr = document.getElementById('interview-date').value;
    const eventId = document.getElementById('interview-id').value || null;
    const company = document.getElementById('interview-company').value.trim();
    const role = document.getElementById('interview-role').value.trim();
    const time = document.getElementById('interview-time').value;
    const notes = document.getElementById('interview-notes').value.trim();
    if (!company) return;
    saveCalEvent(dateStr, eventId, { company, role, time, notes, type: calState.evType, result: calState.evResult });
    closeInterviewModal();
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
