const CIRCUMFERENCE = 2 * Math.PI * 90;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const MODE_LABELS = {
  work:         { tab: '专注',  full: '工作中' },
  'short-break': { tab: '短休',  full: '短休息' },
  'long-break':  { tab: '长休',  full: '长休息' },
};

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// --- 单个计时器实例 ---
class TimerInstance {
  constructor(id, settings) {
    this.id = id;
    this.settings = { ...settings };
    this.mode = 'work';
    this.isRunning = false;
    this.remainingSeconds = this.settings.workMinutes * 60;
    this.totalSeconds = this.remainingSeconds;
    this.completedPomodoros = 0;
    this.timerId = null;
  }

  getModeSeconds() {
    switch (this.mode) {
      case 'work': return this.settings.workMinutes * 60;
      case 'short-break': return this.settings.shortBreakMinutes * 60;
      case 'long-break': return this.settings.longBreakMinutes * 60;
      default: return this.settings.workMinutes * 60;
    }
  }

  start(onTick, onEnd) {
    this.isRunning = true;
    this.timerId = setInterval(() => {
      this.remainingSeconds--;
      if (this.remainingSeconds <= 0) {
        clearInterval(this.timerId);
        this.isRunning = false;
        onEnd();
        return;
      }
      onTick();
    }, 1000);
  }

  pause() {
    this.isRunning = false;
    clearInterval(this.timerId);
  }

  reset() {
    this.isRunning = false;
    clearInterval(this.timerId);
    this.remainingSeconds = this.getModeSeconds();
    this.totalSeconds = this.remainingSeconds;
  }

  switchMode(mode) {
    this.mode = mode;
    this.remainingSeconds = this.getModeSeconds();
    this.totalSeconds = this.remainingSeconds;
  }
}

// --- 主应用 ---
class PomodoroApp {
  constructor() {
    this.tabs = [];
    this.activeTabId = null;
    this.nextId = 1;
    this.settings = this.loadSettings();
    this.audioCtx = null;

    this.init();
    this.addTab();
  }

  init() {
    $('#btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
    $('#btn-close').addEventListener('click', () => window.electronAPI.close());
    $('#btn-settings-cancel').addEventListener('click', () => this.closeSettings());
    $('#btn-settings-save').addEventListener('click', () => this.saveSettings());

    // 事件委托：标签栏
    $('#tab-bar').addEventListener('click', (e) => {
      const closeBtn = e.target.closest('.tab-close');
      if (closeBtn) {
        e.stopPropagation();
        this.closeTab(parseInt(closeBtn.dataset.id));
        return;
      }
      const tabEl = e.target.closest('.tab-item');
      if (tabEl) {
        this.switchTab(parseInt(tabEl.dataset.id));
      }
    });

    // 事件委托：主内容
    $('#container').addEventListener('click', (e) => {
      if (e.target.closest('#btn-start')) { this.toggleTimer(); return; }
      if (e.target.closest('#btn-reset')) { this.resetTimer(); return; }
      if (e.target.closest('#btn-settings')) { this.openSettings(); return; }
      const modeBtn = e.target.closest('.mode-btn');
      if (modeBtn) { this.switchMode(modeBtn.dataset.mode); return; }
    });
  }

  getActiveTab() {
    return this.tabs.find(t => t.id === this.activeTabId);
  }

  // --- 标签管理 ---

  addTab() {
    const id = this.nextId++;
    const tab = new TimerInstance(id, this.settings);
    this.tabs.push(tab);
    this.buildTab(tab);
    this.switchTab(id);
  }

  closeTab(id) {
    if (this.tabs.length <= 1) return;
    const idx = this.tabs.findIndex(t => t.id === id);
    const tab = this.tabs[idx];
    if (tab.isRunning) tab.pause();

    // 移除 DOM
    const tabEl = $(`[data-id="${id}"].tab-item`);
    if (tabEl) tabEl.remove();

    this.tabs.splice(idx, 1);
    if (this.activeTabId === id) {
      const newIdx = Math.min(idx, this.tabs.length - 1);
      this.switchTab(this.tabs[newIdx].id);
    }
    this.updateAddBtn();
  }

  switchTab(id) {
    this.activeTabId = id;
    this.updateTabActiveStates();
    this.renderContent();
    this.updateTabLabels();
  }

  // --- 标签 DOM ---

  buildTab(tab) {
    const bar = $('#tab-bar');
    const el = document.createElement('div');
    el.className = 'tab-item';
    el.dataset.id = tab.id;
    el.innerHTML = `
      <span class="tab-label"></span>
      <button class="tab-close" data-id="${tab.id}">&#x2715;</button>
    `;
    // 插入到添加按钮之前
    const addBtn = bar.querySelector('.tab-add');
    bar.insertBefore(el, addBtn);
    this.updateAddBtn();
  }

  updateAddBtn() {
    let addBtn = $('#tab-bar .tab-add');
    if (!addBtn) {
      addBtn = document.createElement('button');
      addBtn.className = 'tab-add';
      addBtn.textContent = '+';
      addBtn.title = '新建小猫钟';
      addBtn.addEventListener('click', () => this.addTab());
      $('#tab-bar').appendChild(addBtn);
    }
    // 显示/隐藏关闭按钮
    $$('.tab-close').forEach(btn => {
      btn.style.display = this.tabs.length > 1 ? '' : 'none';
    });
  }

  updateTabActiveStates() {
    $$('.tab-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.id) === this.activeTabId);
    });
  }

  updateTabLabels() {
    this.tabs.forEach(tab => {
      const el = $(`[data-id="${tab.id}"].tab-item`);
      if (!el) return;
      const label = el.querySelector('.tab-label');
      if (label) {
        label.textContent = `${MODE_LABELS[tab.mode].tab} ${formatTime(tab.remainingSeconds)}`;
      }
    });
  }

  // --- 内容渲染 ---

  renderContent() {
    const tab = this.getActiveTab();
    if (!tab) return;

    const container = $('#container');
    const dotCount = tab.completedPomodoros % tab.settings.longBreakInterval;

    container.innerHTML = `
      <div class="status-label" id="status-label">${MODE_LABELS[tab.mode].full}</div>
      <div class="timer-ring">
        <svg viewBox="0 0 200 200">
          <circle class="ring-bg" cx="100" cy="100" r="90" />
          <circle class="ring-progress" id="ring-progress" cx="100" cy="100" r="90" />
        </svg>
        <div class="timer-display" id="timer-display"></div>
      </div>
      <div class="pomodoro-count" id="pomodoro-count">
        ${Array.from({ length: tab.settings.longBreakInterval }, (_, i) =>
          `<span class="dot${i < dotCount ? ' active' : ''}"></span>`
        ).join('')}
      </div>
      <div class="mode-buttons">
        <button class="mode-btn${tab.mode === 'work' ? ' active' : ''}" data-mode="work">专注<br><span class="mode-time">${tab.settings.workMinutes}</span>min</button>
        <button class="mode-btn${tab.mode === 'short-break' ? ' active' : ''}" data-mode="short-break">短休息<br><span class="mode-time">${tab.settings.shortBreakMinutes}</span>min</button>
        <button class="mode-btn${tab.mode === 'long-break' ? ' active' : ''}" data-mode="long-break">长休息<br><span class="mode-time">${tab.settings.longBreakMinutes}</span>min</button>
      </div>
      <div class="controls">
        <button class="btn btn-secondary" id="btn-reset" title="重置">↺</button>
        <button class="btn btn-primary" id="btn-start">${tab.isRunning ? '暂停' : (tab.remainingSeconds < tab.totalSeconds ? '继续' : '开始')}</button>
      </div>
      <button class="btn-settings" id="btn-settings">⚙ 设置</button>
    `;

    // 初始化进度环
    const progress = $('#ring-progress');
    if (progress) progress.style.strokeDasharray = CIRCUMFERENCE;

    this.updateDisplay();
    this.updateTheme(tab);

    if (!tab.isRunning && tab.remainingSeconds < tab.totalSeconds) {
      const display = $('#timer-display');
      if (display) display.classList.add('paused');
    }
  }

  updateDisplay() {
    const tab = this.getActiveTab();
    if (!tab) return;
    const display = $('#timer-display');
    const progress = $('#ring-progress');
    if (!display || !progress) return;

    display.textContent = formatTime(tab.remainingSeconds);
    const pct = tab.remainingSeconds / tab.totalSeconds;
    progress.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct);
  }

  updateTheme(tab) {
    document.body.className = tab.mode;
  }

  // --- 计时器控制 ---

  toggleTimer() {
    const tab = this.getActiveTab();
    if (!tab) return;

    if (tab.isRunning) {
      tab.pause();
    } else {
      tab.start(
        () => this.onTick(),
        () => this.onTimerEnd()
      );
    }
    this.renderContent();
    this.updateTabLabels();
  }

  resetTimer() {
    const tab = this.getActiveTab();
    if (!tab) return;
    tab.reset();
    this.renderContent();
    this.updateTabLabels();
  }

  switchMode(mode) {
    const tab = this.getActiveTab();
    if (!tab) return;
    if (tab.isRunning) tab.pause();
    tab.switchMode(mode);
    this.renderContent();
    this.updateTabLabels();
  }

  onTick() {
    this.updateDisplay();
    this.updateTabLabels();
  }

  onTimerEnd() {
    const tab = this.getActiveTab();
    if (!tab) return;
    this.playSound();

    if (tab.mode === 'work') {
      tab.completedPomodoros++;
      const isLong = tab.completedPomodoros % tab.settings.longBreakInterval === 0;
      tab.switchMode(isLong ? 'long-break' : 'short-break');
      this.notify(isLong ? '长休息时间到！' : '休息一下吧！', '辛苦了，喝杯水放松一下~');
    } else {
      tab.switchMode('work');
      this.notify('休息结束', '开始新的小猫吧！');
    }

    this.renderContent();
    this.updateTabLabels();
  }

  // --- 设置 ---

  loadSettings() {
    const defaults = {
      workMinutes: 25,
      shortBreakMinutes: 10,
      longBreakMinutes: 20,
      longBreakInterval: 4,
    };
    try {
      const saved = JSON.parse(localStorage.getItem('pomodoro-settings'));
      return saved ? { ...defaults, ...saved } : defaults;
    } catch {
      return defaults;
    }
  }

  openSettings() {
    const tab = this.getActiveTab();
    if (!tab) return;
    $('#setting-work').value = tab.settings.workMinutes;
    $('#setting-short').value = tab.settings.shortBreakMinutes;
    $('#setting-long').value = tab.settings.longBreakMinutes;
    $('#setting-interval').value = tab.settings.longBreakInterval;
    $('#settings-overlay').classList.add('show');
  }

  closeSettings() {
    $('#settings-overlay').classList.remove('show');
  }

  saveSettings() {
    const tab = this.getActiveTab();
    if (!tab) return;

    tab.settings.workMinutes = Math.max(1, parseInt($('#setting-work').value) || 25);
    tab.settings.shortBreakMinutes = Math.max(1, parseInt($('#setting-short').value) || 10);
    tab.settings.longBreakMinutes = Math.max(1, parseInt($('#setting-long').value) || 20);
    tab.settings.longBreakInterval = Math.max(2, parseInt($('#setting-interval').value) || 4);

    localStorage.setItem('pomodoro-settings', JSON.stringify(tab.settings));

    if (tab.isRunning) tab.pause();
    tab.reset();
    this.renderContent();
    this.updateTabLabels();
    this.closeSettings();
  }

  // --- 提示音 ---

  playSound() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = this.audioCtx;
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.2);
        osc.stop(ctx.currentTime + i * 0.2 + 0.4);
      });
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }

  notify(title, body) {
    if (window.electronAPI) {
      window.electronAPI.notify(title, body);
    }
  }
}

new PomodoroApp();
