// ============================================================
// LearningEngine v1.0.0 — Shared Learning Page Engine
// ============================================================
var ENGINE_VERSION = '1.0.0';

// Global state — accessible by topic functions
var S = {};

var LearningEngine = (function() {
  'use strict';

  var _config = null;
  var _partFns = null;
  var _hlRegex = null;
  var _storageKey = '';

  var DEFAULT_STATE_BASE = {
    currentPart: 1, xp: 0, completedParts: [], unlockedParts: [1],
    badges: [], expandedInsights: [], readParts: [],
    openingDone: false, briefingsRead: []
  };

  function _buildHlRegex(keywords, types) {
    var parts = ['(\\/\\/.*$)', '("(?:[^"\\\\]|\\\\.)*")', '(@\\w+)'];
    parts.push(keywords ? '(\\b(?:' + keywords + ')\\b)' : '()');
    parts.push(types ? '(\\b(?:' + types + ')\\b)' : '()');
    return new RegExp(parts.join('|'), 'gm');
  }

  var engine = {
    get config() { return _config; },

    init: function(config, partFns) {
      _config = config;
      _partFns = partFns;
      _storageKey = 'lp-topic-' + config.id;

      if (config.hlKeywords || config.hlTypes) {
        _hlRegex = _buildHlRegex(config.hlKeywords, config.hlTypes);
      }

      var defaultState = Object.assign({}, DEFAULT_STATE_BASE, config.defaultStateExtra || {});
      S = JSON.parse(JSON.stringify(defaultState));

      engine.load();

      if (typeof Trainer !== 'undefined') {
        Trainer.updateStreak();
        S.streak = Trainer.state.streak;
        S.lastDate = Trainer.state.lastDate;
      }

      if (S.openingDone) {
        var op = document.getElementById('opening');
        if (op) op.style.display = 'none';
      }

      engine.render();

      if (config.initExtra) config.initExtra();

      var mainEl = document.getElementById('main-content');
      if (mainEl) {
        mainEl.addEventListener('click', function() {
          document.getElementById('sidebar').classList.remove('open');
        });
      }
    },

    load: function() {
      try {
        var d = localStorage.getItem(_storageKey);
        if (d) { Object.assign(S, JSON.parse(d)); return; }
      } catch (e) {}

      if (_config.legacyKeys) {
        for (var i = 0; i < _config.legacyKeys.length; i++) {
          try {
            var d2 = localStorage.getItem(_config.legacyKeys[i]);
            if (d2) {
              Object.assign(S, JSON.parse(d2));
              localStorage.setItem(_storageKey, d2);
              localStorage.removeItem(_config.legacyKeys[i]);
              return;
            }
          } catch (e) {}
        }
      }
    },

    save: function() {
      try { localStorage.setItem(_storageKey, JSON.stringify(S)); } catch (e) {}
    },

    hl: function(code) {
      var c = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (!_hlRegex) return c;
      _hlRegex.lastIndex = 0;
      return c.replace(_hlRegex, function(m, cm, st, an, kw, ty) {
        if (cm) return '<span class="hl-cm">' + cm + '</span>';
        if (st) return '<span class="hl-st">' + st + '</span>';
        if (an) return '<span class="hl-an">' + an + '</span>';
        if (kw) return '<span class="hl-kw">' + kw + '</span>';
        if (ty) return '<span class="hl-ty">' + ty + '</span>';
        return m;
      });
    },

    codeBlock: function(code) {
      return '<div class="code-wrap"><code>' + engine.hl(code) + '</code></div>';
    },

    escapeHtmlAttr: function(s) {
      return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    showToast: function(text, type) {
      type = type || 'xp';
      var w = document.getElementById('toast-wrap');
      if (!w) return;
      var t = document.createElement('div');
      t.className = 'toast ' + type;
      t.textContent = text;
      w.appendChild(t);
      setTimeout(function() { t.remove(); }, 3000);
    },

    // ── Gamification ──
    addXP: function(amount, msg) {
      S.xp = Math.min(S.xp + amount, _config.totalXP);
      engine.save();
      engine.showToast('+' + amount + ' XP — ' + msg, 'xp');
      engine.renderTopbar();
      if (typeof Trainer !== 'undefined') Trainer.sync(_config.id, S, _config);
    },

    checkBadges: function() {
      _config.badges.forEach(function(b) {
        if (S.badges.includes(b.id)) return;
        if (b.req.every(function(r) { return S.completedParts.includes(r); })) {
          S.badges.push(b.id);
          engine.save();
          engine.showToast(b.icon + ' 獲得徽章：' + b.name, 'badge-t');
        }
      });
      engine.renderTopbar();
      engine.renderSidebar();
    },

    markRead: function(partId) {
      if (S.readParts.includes(partId)) return;
      var p = _config.parts.find(function(x) { return x.id === partId; });
      S.readParts.push(partId);
      engine.save();
      if (p && p.xpRead > 0) engine.addXP(p.xpRead, '完成 Part ' + partId + ' 閱讀');
      engine.render();
    },

    completePart: function(partId) {
      if (S.completedParts.includes(partId)) return;
      var p = _config.parts.find(function(x) { return x.id === partId; });
      S.completedParts.push(partId);
      var next = partId + 1;
      if (next <= _config.parts.length && !S.unlockedParts.includes(next)) {
        S.unlockedParts.push(next);
      }
      engine.save();
      if (p && p.xpQuiz > 0) engine.addXP(p.xpQuiz, '通過 Part ' + partId + ' 測驗');
      engine.checkBadges();
      engine.render();
      if (typeof Trainer !== 'undefined') Trainer.sync(_config.id, S, _config);
    },

    expandInsight: function(id) {
      var body = document.getElementById('insight-body-' + id);
      if (!body) return;
      body.classList.toggle('open');
      if (body.classList.contains('open') && !S.expandedInsights.includes(id)) {
        S.expandedInsights.push(id);
        engine.save();
        engine.addXP(25, '展開深入了解');
      }
    },

    markBriefingRead: function(partId) {
      if (!S.briefingsRead.includes(partId)) {
        S.briefingsRead.push(partId);
        engine.save();
      }
    },

    // ── Rendering ──
    render: function() {
      engine.renderTopbar();
      engine.renderSidebar();
      engine.renderMain();
    },

    renderTopbar: function() {
      var pct = Math.round(S.completedParts.length / _config.parts.length * 100);
      var pf = document.getElementById('progress-fill');
      if (pf) pf.style.width = pct + '%';
      var xn = document.getElementById('xp-num');
      if (xn) xn.textContent = S.xp;
      var br = document.getElementById('badge-row');
      if (br) {
        br.innerHTML = _config.badges.map(function(b) {
          return '<div class="badge-icon' + (S.badges.includes(b.id) ? ' earned' : '') + '" title="' + b.name + '">' + b.icon + '</div>';
        }).join('');
      }
      var st = document.getElementById('streak-tag');
      if (st) {
        var streak = (typeof Trainer !== 'undefined') ? Trainer.state.streak : (S.streak || 0);
        if (streak > 0) { st.style.display = ''; st.textContent = '🔥 連續 ' + streak + ' 天'; }
      }
      // Theme toggle button
      var tb = document.getElementById('topbar');
      if (tb && !tb.querySelector('.theme-toggle')) {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        var btn = document.createElement('button');
        btn.className = 'theme-toggle';
        btn.textContent = isDark ? '☀️' : '🌙';
        btn.onclick = function() { if (typeof toggleTheme === 'function') toggleTheme(); };
        tb.appendChild(btn);
      }
    },

    renderSidebar: function() {
      var sb = document.getElementById('sidebar');
      if (!sb) return;
      var parts = _config.parts;
      sb.innerHTML = '<h3>章節</h3>' + parts.map(function(p) {
        var locked = !S.unlockedParts.includes(p.id);
        var done = S.completedParts.includes(p.id);
        var active = S.currentPart === p.id;
        var cls = 'side-item';
        if (active) cls += ' active';
        if (done) cls += ' completed';
        if (locked) cls += ' locked';
        return '<div class="' + cls + '" tabindex="' + (locked ? '-1' : '0') + '" onclick="' + (locked ? '' : 'navigateTo(' + p.id + ')') + '">' +
          '<span>' + p.icon + '</span><span>Part ' + p.id + '</span><span style="flex:1;font-size:.8rem;color:var(--txt2)">' + p.title + '</span>' +
          (locked ? '<span class="lock">🔒</span>' : '') + '</div>';
      }).join('') +
      '<div class="side-sep"></div><h3>成就</h3><div class="side-badges">' +
      _config.badges.map(function(b) {
        return '<span class="side-badge' + (S.badges.includes(b.id) ? ' earned' : '') + '" title="' + b.name + '">' + b.icon + '</span>';
      }).join('') +
      '</div><div class="side-sep"></div><div class="side-stats">' +
      '📊 進度：' + S.completedParts.length + ' / ' + parts.length + '<br>⚡ XP：' + S.xp + ' / ' + _config.totalXP +
      '<br>🏅 徽章：' + S.badges.length + ' / ' + _config.badges.length + '</div>';
    },

    renderMain: function() {
      var c = document.getElementById('main-content');
      if (!c) return;
      var fn = _partFns[S.currentPart - 1];
      var content = fn ? fn() : '';
      c.innerHTML = content + engine.getRadarHTML();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // ── Navigation ──
    navigateTo: function(id) {
      if (!S.unlockedParts.includes(id)) return;
      S.currentPart = id;
      engine.save();
      engine.render();
    },

    toggleSidebar: function() {
      document.getElementById('sidebar').classList.toggle('open');
    },

    startJourney: function() {
      S.openingDone = true;
      engine.save();
      var op = document.getElementById('opening');
      if (op) {
        op.classList.add('hide');
        setTimeout(function() { op.style.display = 'none'; }, 800);
      }
    },

    // ── UI Helpers ──
    insightBlock: function(id, text) {
      var opened = S.expandedInsights.includes(id);
      return '<div class="insight-block"><button class="insight-head" onclick="expandInsight(' + id + ')">' +
        '<span>★ 深入了解 ' + (opened ? '' : '<span class="insight-xp">+25 XP</span>') + '</span><span>' + (opened ? '▲' : '▼') + '</span></button>' +
        '<div class="insight-body' + (opened ? ' open' : '') + '" id="insight-body-' + id + '"><div class="insight-inner">' + text + '</div></div></div>';
    },

    briefCard: function(part, title, points, q, a) {
      return '<div class="brief-card" onclick="markBriefingRead(' + part + ')"><h3>💼 向主管簡報 — Part ' + part + ': ' + title + '</h3>' +
        points.map(function(p) { return '<div class="brief-point"><span class="pin">📌</span><span>' + p + '</span></div>'; }).join('') +
        '<div class="brief-qa"><div class="q">💡 如果主管問：「' + q + '」</div><div>你可以回答：「' + a + '」</div></div></div>';
    },

    toggleAcc: function(btn) {
      btn.classList.toggle('open');
      btn.nextElementSibling.classList.toggle('open');
    },

    _getThemeColor: function(varName) {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    },

    // ── Radar Chart (Octalysis) ──
    getRadarHTML: function() {
      var parts = _config.parts;
      var streak = (typeof Trainer !== 'undefined') ? Trainer.state.streak : (S.streak || 0);
      var drives = [
        { name: '使命感', val: S.openingDone ? 1 : 0 },
        { name: '成就感', val: Math.min(S.xp / _config.totalXP, 1) },
        { name: '創造力', val: S.completedParts.includes(parts[parts.length - 1].id) ? 1 : 0 },
        { name: '擁有感', val: S.badges.length / _config.badges.length },
        { name: '社交影響', val: S.briefingsRead.length / parts.length },
        { name: '稀缺性', val: S.unlockedParts.length / parts.length },
        { name: '好奇心', val: S.expandedInsights.length / Math.max(parts.length - 1, 1) },
        { name: '避損心理', val: streak > 0 ? Math.min(streak / 7, 1) : 0 }
      ];
      var cx = 150, cy = 150, r = 110;
      var txtColor = engine._getThemeColor('--txt2') || '#8E8A9E';
      var gridColor = engine._getThemeColor('--border-lav') || '#e0dce8';
      var pts = [], labelHtml = '';
      drives.forEach(function(d, i) {
        var angle = -Math.PI / 2 + i * Math.PI / 4;
        var x = cx + r * Math.cos(angle), y = cy + r * Math.sin(angle);
        var vx = cx + r * d.val * Math.cos(angle), vy = cy + r * d.val * Math.sin(angle);
        pts.push(vx + ',' + vy);
        var lx = cx + (r + 25) * Math.cos(angle), ly = cy + (r + 25) * Math.sin(angle);
        labelHtml += '<text x="' + lx + '" y="' + ly + '" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="' + txtColor + '">' + d.name + '</text>';
        labelHtml += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '" stroke="' + gridColor + '" stroke-width="1"/>';
      });
      var gridHtml = '';
      [0.25, 0.5, 0.75, 1].forEach(function(s) {
        var gp = [];
        for (var i = 0; i < 8; i++) {
          var a = -Math.PI / 2 + i * Math.PI / 4;
          gp.push((cx + r * s * Math.cos(a)) + ',' + (cy + r * s * Math.sin(a)));
        }
        gridHtml += '<polygon points="' + gp.join(' ') + '" fill="none" stroke="' + gridColor + '" stroke-width="0.5"/>';
      });

      return '<div class="radar-section"><h2>八角遊戲化框架（Octalysis）</h2>' +
        '<svg viewBox="0 0 300 300" width="300" height="300" style="max-width:100%">' + gridHtml + labelHtml +
        '<polygon points="' + pts.join(' ') + '" fill="rgba(184,169,232,0.2)" stroke="var(--lav)" stroke-width="2"/></svg>' +
        '<div class="footer-summary">' +
        '<div class="foot-stat"><div class="val">' + S.completedParts.length + '/' + parts.length + '</div><div class="label">完成章節</div></div>' +
        '<div class="foot-stat"><div class="val">' + S.xp + '</div><div class="label">總 XP</div></div>' +
        '<div class="foot-stat"><div class="val">' + S.badges.length + '</div><div class="label">徽章</div></div>' +
        '<div class="foot-stat"><div class="val">' + Math.round(S.completedParts.length / parts.length * 100) + '%</div><div class="label">完成率</div></div>' +
        '</div></div>';
    }
  };

  return engine;
})();

// ============================================================
// Global shortcuts for onclick handlers & topic functions
// ============================================================
function startJourney() { LearningEngine.startJourney(); }
function toggleSidebar() { LearningEngine.toggleSidebar(); }
function navigateTo(id) { LearningEngine.navigateTo(id); }
function markRead(id) { LearningEngine.markRead(id); }
function expandInsight(id) { LearningEngine.expandInsight(id); }
function toggleAcc(btn) { LearningEngine.toggleAcc(btn); }
function markBriefingRead(id) { LearningEngine.markBriefingRead(id); }
function showToast(text, type) { LearningEngine.showToast(text, type); }
function addXP(amount, msg) { LearningEngine.addXP(amount, msg); }
function completePart(id) { LearningEngine.completePart(id); }
function hl(code) { return LearningEngine.hl(code); }
function codeBlock(code) { return LearningEngine.codeBlock(code); }
function escapeHtmlAttr(s) { return LearningEngine.escapeHtmlAttr(s); }
function insightBlock(id, text) { return LearningEngine.insightBlock(id, text); }
function briefCard(part, title, points, q, a) { return LearningEngine.briefCard(part, title, points, q, a); }
function save() { LearningEngine.save(); }
function render() { LearningEngine.render(); }
