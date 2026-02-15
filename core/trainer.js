// ============================================================
// Trainer v1.0.0 — Global Trainer System
// ============================================================
var Trainer = (function() {
  'use strict';

  var STORAGE_KEY = 'lp-trainer';
  var VERSION = 1;

  var LEVELS = [
    { level: 1, xp: 0, name: '新手訓練師', icon: '🥚' },
    { level: 2, xp: 200, name: '初階學習者', icon: '🐛' },
    { level: 3, xp: 500, name: '知識收集家', icon: '🦋' },
    { level: 4, xp: 1000, name: '技能探索者', icon: '⚡' },
    { level: 5, xp: 1800, name: '架構見習生', icon: '🌟' },
    { level: 6, xp: 2800, name: '模式掌握者', icon: '🔥' },
    { level: 7, xp: 4000, name: '資深開發者', icon: '💎' },
    { level: 8, xp: 5500, name: '技術導師', icon: '🐉' },
    { level: 9, xp: 7500, name: '架構大師', icon: '👑' },
    { level: 10, xp: 10000, name: '傳說訓練師', icon: '🏆' }
  ];

  var GLOBAL_BADGES = [
    { id: 'explorer-1', name: '初探冒險家', icon: '🗺️', type: 'topics_started', threshold: 1 },
    { id: 'explorer-3', name: '三域探險家', icon: '🧭', type: 'topics_completed', threshold: 3 },
    { id: 'streak-7', name: '七日連勝', icon: '🔥', type: 'streak', threshold: 7 },
    { id: 'streak-30', name: '月度堅持者', icon: '💪', type: 'streak', threshold: 30 },
    { id: 'xp-1000', name: '千分智者', icon: '⚡', type: 'global_xp', threshold: 1000 },
    { id: 'xp-5000', name: '五千達人', icon: '🎯', type: 'global_xp', threshold: 5000 }
  ];

  var DEFAULT_STATE = {
    _version: VERSION,
    globalXP: 0,
    streak: 0,
    lastDate: null,
    topicSnapshots: {},
    globalBadges: []
  };

  var _state = null;
  var _storageAvailable = true;

  function _checkStorage() {
    try {
      localStorage.setItem('__lp_test__', '1');
      localStorage.removeItem('__lp_test__');
      return true;
    } catch (e) {
      return false;
    }
  }

  function _localDateStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function _yesterdayStr() {
    var d = new Date(Date.now() - 864e5);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function _load() {
    try {
      var d = localStorage.getItem(STORAGE_KEY);
      if (d) {
        _state = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_STATE)), JSON.parse(d));
      } else {
        _state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        _migrateStreak();
      }
    } catch (e) {
      _state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  function _save() {
    if (!_storageAvailable) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); } catch (e) {}
  }

  function _migrateStreak() {
    var legacyKeys = ['ca-learn', 'nia-arch-learn'];
    var maxStreak = 0;
    var latestDate = null;
    legacyKeys.forEach(function(key) {
      try {
        var d = localStorage.getItem(key);
        if (d) {
          var parsed = JSON.parse(d);
          if (parsed.streak > maxStreak) {
            maxStreak = parsed.streak;
            latestDate = parsed.lastDate;
          }
        }
      } catch (e) {}
    });
    if (maxStreak > 0) {
      _state.streak = maxStreak;
      _state.lastDate = latestDate;
    }
  }

  function _getLevel() {
    for (var i = LEVELS.length - 1; i >= 0; i--) {
      if (_state.globalXP >= LEVELS[i].xp) return LEVELS[i];
    }
    return LEVELS[0];
  }

  function _getNextLevel() {
    var current = _getLevel();
    if (current.level >= LEVELS.length) return null;
    return LEVELS[current.level];
  }

  function _checkGlobalBadges() {
    var topicIds = Object.keys(_state.topicSnapshots);
    var completedTopics = topicIds.filter(function(id) {
      var snap = _state.topicSnapshots[id];
      return snap.completedParts && snap.completedParts.length >= snap.totalParts;
    });

    GLOBAL_BADGES.forEach(function(badge) {
      if (_state.globalBadges.includes(badge.id)) return;
      var earned = false;
      switch (badge.type) {
        case 'topics_started':
          earned = topicIds.length >= badge.threshold;
          break;
        case 'topics_completed':
          earned = completedTopics.length >= badge.threshold;
          break;
        case 'streak':
          earned = _state.streak >= badge.threshold;
          break;
        case 'global_xp':
          earned = _state.globalXP >= badge.threshold;
          break;
      }
      if (earned) _state.globalBadges.push(badge.id);
    });
  }

  var trainer = {
    get state() { return _state; },
    get levels() { return LEVELS; },
    get globalBadges() { return GLOBAL_BADGES; },
    get storageAvailable() { return _storageAvailable; },

    getLevel: function() { return _getLevel(); },
    getNextLevel: function() { return _getNextLevel(); },

    init: function() {
      _storageAvailable = _checkStorage();
      if (_storageAvailable) {
        _load();
      } else {
        _state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      }
    },

    updateStreak: function() {
      if (!_storageAvailable) return;
      _load();
      var today = _localDateStr();
      if (_state.lastDate === today) return;
      var yesterday = _yesterdayStr();
      _state.streak = _state.lastDate === yesterday ? _state.streak + 1 : 1;
      _state.lastDate = today;
      _save();
    },

    sync: function(topicId, topicState, topicConfig) {
      if (!_storageAvailable) return;
      _load();

      _state.topicSnapshots[topicId] = {
        xp: topicState.xp,
        completedParts: [].concat(topicState.completedParts),
        totalParts: topicConfig.parts.length,
        badges: topicState.badges.length,
        totalBadges: topicConfig.badges.length
      };

      var totalXP = 0;
      Object.keys(_state.topicSnapshots).forEach(function(id) {
        totalXP += _state.topicSnapshots[id].xp;
      });
      _state.globalXP = totalXP;

      _checkGlobalBadges();
      _save();
    },

    exportData: function() {
      var data = { trainer: _state, topics: {} };
      Object.keys(_state.topicSnapshots).forEach(function(id) {
        try {
          var d = localStorage.getItem('lp-topic-' + id);
          if (d) data.topics[id] = JSON.parse(d);
        } catch (e) {}
      });
      return JSON.stringify(data, null, 2);
    },

    importData: function(jsonStr) {
      try {
        var data = JSON.parse(jsonStr);
        if (data.trainer) {
          _state = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_STATE)), data.trainer);
          _save();
        }
        if (data.topics) {
          Object.keys(data.topics).forEach(function(id) {
            localStorage.setItem('lp-topic-' + id, JSON.stringify(data.topics[id]));
          });
        }
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  trainer.init();
  return trainer;
})();
