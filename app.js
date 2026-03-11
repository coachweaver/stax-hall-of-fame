// ============================================================
//  $tax Hall of Fame — app.js
//  GitHub Pages static frontend
//  Fetches data from Apps Script Web App via CONFIG.DATA_URL
// ============================================================

'use strict';

// ------------------------------------------------------------
//  Global State
// ------------------------------------------------------------
let allData          = [];
let customViewsData  = [];
let uniqueGamesGlobal = [];
let currentSortMode  = 'networth';
let roiChartInstance = null;
let btmChartInstance = null;

// Computer's fixed starting investment (constant across all games)
const COMP_INV = 214657.66;

// ROI bracket definitions
const ROI_BRACKETS = [
  { label: 'Lost Money',  min: -Infinity, max: 0    },
  { label: '0 – 25%',    min: 0,         max: 25   },
  { label: '25 – 50%',   min: 25,        max: 50   },
  { label: '50 – 100%',  min: 50,        max: 100  },
  { label: '100%+',      min: 100,       max: Infinity }
];

// Year cohort definitions for Beat the Market trend
const YEAR_COHORTS = [
  { label: '2023', keywords: ['2022-23'] },
  { label: '2024', keywords: ['2023-24'] },
  { label: '2025', keywords: ['2024-25'] },
  { label: '2026', keywords: ['2025-26'] }
];


// ============================================================
//  Bootstrap
// ============================================================
window.addEventListener('DOMContentLoaded', function () {
  if (!window.CONFIG || !CONFIG.DATA_URL || CONFIG.DATA_URL === 'PASTE_YOUR_WEB_APP_URL_HERE') {
    showError('config.js is missing or the DATA_URL has not been set. Open config.js and paste your Apps Script Web App URL.');
    return;
  }

  fetch(CONFIG.DATA_URL)
    .then(function (res) {
      if (!res.ok) throw new Error('Network response was not ok (' + res.status + ')');
      return res.json();
    })
    .then(function (data) {
      initializeDashboard(data);
    })
    .catch(function (err) {
      showError('Could not load data. ' + err.message);
    });
});


// ============================================================
//  Error Display
// ============================================================
function showError(msg) {
  var el = document.getElementById('statusMessage');
  if (el) el.innerHTML = '<div class="alert alert-danger rounded-0 shadow"><strong>Error:</strong> ' + msg + '</div>';
}


// ============================================================
//  Utility — safe number parser
// ============================================================
function safeNum(val) {
  if (val === null || val === undefined) return 0;
  var n = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
  return isNaN(n) ? 0 : n;
}

function formatCurrency(n) {
  if (typeof n !== 'number' || isNaN(n)) return 'N/A';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(ts) {
  if (!ts) return '—';
  var d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}


// ============================================================
//  Initialize Dashboard
// ============================================================
function initializeDashboard(response) {
  if (!response || response.error) {
    showError(response ? response.error : 'The server sent empty data.');
    return;
  }

  // Timestamp
  var now = new Date();
  var tsEl = document.getElementById('lastUpdated');
  if (tsEl) {
    tsEl.textContent = 'Last updated: '
      + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      + ' '
      + now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  }

  var statusEl = document.getElementById('statusMessage');
  if (statusEl) statusEl.style.display = 'none';

  var navEl = document.getElementById('navTabs');
  if (navEl) navEl.style.setProperty('display', 'flex', 'important');

  var indivEl = document.getElementById('indivView');
  if (indivEl) indivEl.style.display = 'block';

  allData         = Array.isArray(response.records)     ? response.records     : [];
  customViewsData = Array.isArray(response.customViews) ? response.customViews : [];

  // ----------------------------------------------------------
  //  Pre-compute numeric fields on every record
  // ----------------------------------------------------------
  allData.forEach(function (row) {
    row.numericValue          = safeNum(row.portfolioValue);
    row.totalInvestedNumeric  = safeNum(row.totalInvested);
    row.expensesNumeric       = safeNum(row.expensesFromLifeEvents);
    row.totalReturnNumeric    = safeNum(row.totalReturn);

    // ROI
    row.roi = row.totalInvestedNumeric > 0
      ? ((row.numericValue - row.totalInvestedNumeric) / row.totalInvestedNumeric) * 100
      : 0;

    // Student CAGR
    var stRatio = row.totalInvestedNumeric > 0 ? (row.numericValue / row.totalInvestedNumeric) : 1;
    row.studentCAGR = stRatio > 0 ? (Math.pow(stRatio, 1 / 20) - 1) * 100 : 0;

    // Computer metrics
    var compPort    = safeNum(row.computerNetWorth);
    row.compPortfolio = compPort;
    var compRatio   = COMP_INV > 0 ? (compPort / COMP_INV) : 1;
    row.compCAGR    = compRatio > 0 ? (Math.pow(compRatio, 1 / 20) - 1) * 100 : 0;
    row.margin      = row.numericValue - row.compPortfolio;

    // Beat market normalised flag
    var bm = String(row.beatMarket || '').toLowerCase();
    row.beatMarketBool = (bm === 'yes' || bm === 'true' || bm === '1');

    // Team key
    row.teamMatchKey = (row.teamName && row.teamName.toLowerCase() !== 'no team' && row.teamName.trim() !== '')
      ? row.teamName.trim().toLowerCase()
      : 'none';
  });

  populateDropdowns();
  updateLeaderboard();
  renderGameView();
  renderTeamView();

  // Bootstrap tooltips
  var tooltipEls = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipEls.forEach(function (el) { new bootstrap.Tooltip(el); });
}


// ============================================================
//  Tab Switching
// ============================================================
function switchTab(tab) {
  ['indiv', 'game', 'team'].forEach(function (t) {
    var view = document.getElementById(t === 'indiv' ? 'indivView' : t === 'game' ? 'gameView' : 'teamView');
    var btn  = document.getElementById(t === 'indiv' ? 'tabIndiv' : t === 'game' ? 'tabGame' : 'tabTeam');
    if (view) view.style.display = 'none';
    if (btn)  btn.classList.remove('active');
  });

  var activeView = document.getElementById(tab === 'indiv' ? 'indivView' : tab === 'game' ? 'gameView' : 'teamView');
  var activeBtn  = document.getElementById(tab === 'indiv' ? 'tabIndiv' : tab === 'game' ? 'tabGame' : 'tabTeam');
  if (activeView) activeView.style.display = 'block';
  if (activeBtn)  activeBtn.classList.add('active');
}


// ============================================================
//  Populate Dropdowns
// ============================================================
function populateDropdowns() {
  // --- Investors dropdown ---
  var selectIndiv = document.getElementById('classFilter');
  if (!selectIndiv) return;
  selectIndiv.innerHTML = '';

  var exactOrder = [
    'ALL TIME RECORDS',
    'BEST OF 2026', '2026 1A', '2026 2A', '2026 3A', '2026 4A', '2026 2B', '2026 4B',
    'TOP SAVINGS ACCOUNT', 'TOP CERTIFICATE OF DEPOSIT', 'TOP INDEX FUND',
    'TOP INDIVIDUAL STOCKS', 'TOP GOVERNMENT BONDS', 'TOP CROP COMMODITY', 'TOP GOLD',
    'BEST OF 2025', '2025 3A', '2025 4A', '2025 4B', '2025 Marketing',
    'BEST OF 2024', '2024 4A', '2024 3B', '2024 4B',
    'BEST OF 2023', '2023 2A', '2023 4B'
  ];

  exactOrder.forEach(function (viewName) {
    var opt = document.createElement('option');
    if (viewName === 'ALL TIME RECORDS') {
      opt.value       = 'ALL TIME';
      opt.textContent = '🏆 ALL TIME RECORDS';
    } else {
      var isCustom    = customViewsData.some(function (v) { return v.name === viewName; });
      opt.value       = isCustom ? 'CUSTOM_' + viewName : viewName;
      opt.textContent = viewName.includes('BEST OF') ? '⭐ ' + viewName : viewName;
    }
    selectIndiv.appendChild(opt);
  });

  // --- Team / Game dropdown ---
  var validGameSet = new Set();
  allData.forEach(function (r) {
    if (r.teamMatchKey !== 'none' && r.timestamp) {
      var d = new Date(r.timestamp);
      if (!isNaN(d) && r.classPeriod) {
        var dateKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        validGameSet.add(dateKey + ' | ' + r.classPeriod);
      }
    }
  });

  uniqueGamesGlobal = Array.from(validGameSet).sort(function (a, b) {
    return new Date(b.split(' | ')[0]) - new Date(a.split(' | ')[0]);
  });

  var selectGame = document.getElementById('gameFilter');
  if (selectGame) {
    selectGame.innerHTML = '';
    if (uniqueGamesGlobal.length === 0) {
      var emptyOpt = document.createElement('option');
      emptyOpt.textContent = 'No team games found';
      selectGame.appendChild(emptyOpt);
    } else {
      uniqueGamesGlobal.forEach(function (g) {
        var opt = document.createElement('option');
        opt.value = g; opt.textContent = g;
        selectGame.appendChild(opt);
      });
    }
  }
}


// ============================================================
//  Asset Badge
// ============================================================
function getAssetBadgeClass(asset) {
  var a = String(asset || '').toLowerCase();
  if (a.includes('stocks'))                   return 'asset-stocks';
  if (a.includes('index'))                    return 'asset-index';
  if (a.includes('savings'))                  return 'asset-savings';
  if (a.includes('cd') || a.includes('certificate')) return 'asset-cd';
  if (a.includes('bonds'))                    return 'asset-bonds';
  if (a.includes('crop'))                     return 'asset-crop';
  if (a === 'gold' || a.includes('gold'))     return 'asset-gold';
  return 'asset-na';
}

function getAssetLabel(asset) {
  var a = String(asset || '').trim();
  return a === '' || a.toLowerCase() === 'none' ? 'N/A' : a;
}


// ============================================================
//  Sort Mode
// ============================================================
function setSortMode(mode) {
  currentSortMode = mode;
  updateLeaderboard();
}


// ============================================================
//  Filter Records for a Given Dropdown Value
// ============================================================
function getFilteredRecords(filterValue) {
  var fv = String(filterValue || '').trim();

  if (fv === 'ALL TIME') return allData.slice();

  // Custom view (BEST OF year or TOP asset)
  if (fv.startsWith('CUSTOM_')) {
    var viewName = fv.replace('CUSTOM_', '');
    var view = customViewsData.find(function (v) { return v.name === viewName; });
    if (!view) return [];

    if (view.performer) {
      var perf = view.performer.toLowerCase();
      return allData.filter(function (r) {
        return String(r.highestPerformer || '').toLowerCase().includes(perf);
      });
    }

    if (view.periods && view.periods.length > 0) {
      return allData.filter(function (r) {
        return view.periods.includes(String(r.rawClassPeriod || '').toLowerCase());
      });
    }
    return [];
  }

  // TOP asset views (not wrapped in CUSTOM_ — direct value match)
  var topMatch = customViewsData.find(function (v) { return v.name === fv && v.performer; });
  if (topMatch) {
    var perf2 = topMatch.performer.toLowerCase();
    return allData.filter(function (r) {
      return String(r.highestPerformer || '').toLowerCase().includes(perf2);
    });
  }

  // Plain class period label
  return allData.filter(function (r) { return r.classPeriod === fv; });
}


// ============================================================
//  Investors Leaderboard
// ============================================================
function updateLeaderboard() {
  var filterEl  = document.getElementById('classFilter');
  var searchEl  = document.getElementById('searchInput');
  if (!filterEl) return;

  var filterValue = filterEl.value;
  var searchTerm  = searchEl ? searchEl.value.trim().toLowerCase() : '';

  var filtered = getFilteredRecords(filterValue);

  if (searchTerm) {
    filtered = filtered.filter(function (r) {
      return r.fullName.toLowerCase().includes(searchTerm);
    });
  }

  // Sort
  filtered.sort(function (a, b) {
    return currentSortMode === 'roi'
      ? b.roi - a.roi
      : b.numericValue - a.numericValue;
  });

  // Stats
  updateIndivStats(filtered);

  // Render rows
  var tbody = document.getElementById('leaderboardBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color: rgba(244,241,234,0.5); padding: 30px;">No records found.</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function (row, idx) {
    var rank      = idx + 1;
    var medal     = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    var star      = row.beatMarketBool ? ' ⭐' : '';
    var roiColor  = row.roi >= 0 ? '#2ecc71' : '#e74c3c';
    var badgeClass = getAssetBadgeClass(row.highestPerformer);
    var assetLabel = getAssetLabel(row.highestPerformer);
    var delay      = Math.min(idx * 40, 800);

    html += '<tr class="animated-row" style="animation-delay:' + delay + 'ms" onclick="openPlayerModal(' + idx + ', ' + JSON.stringify(filtered.map(function(r){ return allData.indexOf(r); })).replace(/"/g, '&quot;') + ')">';
    html += '<td class="rank-col">' + medal + '</td>';
    html += '<td><strong>' + escHtml(row.fullName) + '</strong>' + star + '</td>';
    html += '<td>' + escHtml(row.classPeriod) + '</td>';
    html += '<td><span class="currency">' + formatCurrency(row.numericValue) + '</span><br><small style="color:' + roiColor + '; font-weight:700;">' + row.roi.toFixed(1) + '% ROI</small></td>';
    html += '<td><span class="badge ' + badgeClass + '">' + escHtml(assetLabel) + '</span></td>';
    html += '<td><small>' + formatDate(row.timestamp) + '</small></td>';
    html += '</tr>';
  });

  tbody.innerHTML = html;
}

function updateIndivStats(filtered) {
  // Average portfolio
  var avgEl = document.getElementById('statAvgVal');
  if (avgEl) {
    if (filtered.length === 0) {
      avgEl.textContent = '--';
    } else {
      var sum = filtered.reduce(function (acc, r) { return acc + r.numericValue; }, 0);
      avgEl.textContent = formatCurrency(sum / filtered.length);
    }
  }

  // Most common highest asset
  var highEl = document.getElementById('statTopHigh');
  if (highEl) highEl.textContent = getMostCommonAsset(filtered, 'highestPerformer');

  // Most common lowest asset
  var lowEl = document.getElementById('statTopLow');
  if (lowEl) lowEl.textContent = getMostCommonAsset(filtered, 'lowestPerformer');
}

function getMostCommonAsset(records, field) {
  var counts = {};
  records.forEach(function (r) {
    var val = String(r[field] || '').trim().toLowerCase();
    if (val && val !== 'none' && val !== 'n/a') {
      counts[val] = (counts[val] || 0) + 1;
    }
  });
  var keys = Object.keys(counts);
  if (keys.length === 0) return '--';
  keys.sort(function (a, b) { return counts[b] - counts[a]; });
  return keys[0].replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}


// ============================================================
//  Player Modal
// ============================================================
function openPlayerModal(filteredIdx, allDataIndexes) {
  var dataIdx = Array.isArray(allDataIndexes) ? allDataIndexes[filteredIdx] : filteredIdx;
  var row = allData[dataIdx];
  if (!row) return;

  var set = function (id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  var setHtml = function (id, val) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = val;
  };

  set('modalName',        row.fullName);
  set('modalPortfolio',   formatCurrency(row.numericValue));
  set('modalInvested',    row.totalInvestedNumeric > 0 ? formatCurrency(row.totalInvestedNumeric) : 'N/A');
  set('modalExpenses',    row.expensesNumeric > 0      ? formatCurrency(row.expensesNumeric)       : 'N/A');
  set('modalTotalReturn', row.totalReturnNumeric !== 0 ? formatCurrency(row.totalReturnNumeric)    : 'N/A');

  // ROI colour
  var roiEl = document.getElementById('modalROI');
  if (roiEl) {
    roiEl.textContent = row.roi.toFixed(2) + '%';
    roiEl.style.color = row.roi >= 0 ? '#27ae60' : '#e74c3c';
  }

  var cagrEl = document.getElementById('modalStCAGR');
  if (cagrEl) {
    cagrEl.textContent = row.studentCAGR.toFixed(2) + '%';
    cagrEl.style.color = row.studentCAGR >= 0 ? '#27ae60' : '#e74c3c';
  }

  // Computer section
  var hasComp = row.compPortfolio > 0;
  var compDivider  = document.getElementById('modalCompDivider');
  var compRow      = document.getElementById('modalCompRow');
  var marginRow    = document.getElementById('modalMarginRow');

  if (compDivider) compDivider.style.display  = hasComp ? '' : 'none';
  if (compRow)     compRow.style.display      = hasComp ? '' : 'none';
  if (marginRow)   marginRow.style.display    = hasComp ? '' : 'none';

  if (hasComp) {
    set('modalComputer', formatCurrency(row.compPortfolio));

    var compCagrEl = document.getElementById('modalCompCAGR');
    if (compCagrEl) {
      compCagrEl.textContent = row.compCAGR.toFixed(2) + '%';
      compCagrEl.style.color = row.compCAGR >= 0 ? '#27ae60' : '#e74c3c';
    }

    var marginEl = document.getElementById('modalMargin');
    if (marginEl) {
      var prefix = row.margin >= 0 ? '+' : '';
      marginEl.textContent = prefix + formatCurrency(row.margin);
      marginEl.style.color = row.margin >= 0 ? '#27ae60' : '#e74c3c';
    }
  }

  set('modalHigh',  getAssetLabel(row.highestPerformer));
  set('modalLow',   getAssetLabel(row.lowestPerformer));
  set('modalClass', row.classPeriod);

  var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('playerModal'));
  modal.show();
}


// ============================================================
//  Game Analytics View
// ============================================================
function renderGameView() {
  renderGlobalStats();
  renderGameLeaderboard();
  renderROIChart();
  renderBTMChart();
}

function renderGlobalStats() {
  // Win rate for 2026 cohort
  var cohort2026 = allData.filter(function (r) {
    return String(r.rawClassPeriod || '').toLowerCase().includes('2025-26');
  });

  var winRateEl = document.getElementById('gameStatWinRate');
  if (winRateEl) {
    if (cohort2026.length === 0) {
      winRateEl.textContent = 'N/A';
    } else {
      var winners = cohort2026.filter(function (r) { return r.beatMarketBool; }).length;
      var pct     = (winners / cohort2026.length) * 100;
      winRateEl.innerHTML = '<span class="win-rate-pulse">' + pct.toFixed(1) + '%</span>';
    }
  }

  // Overall top 3
  var sorted = allData.slice().sort(function (a, b) { return b.numericValue - a.numericValue; });
  var overallEl = document.getElementById('gameStatOverall');
  if (overallEl) {
    if (sorted.length === 0) {
      overallEl.textContent = '--';
    } else {
      var medals = ['🥇', '🥈', '🥉'];
      var html   = '';
      sorted.slice(0, 3).forEach(function (r, i) {
        html += '<div>' + medals[i] + ' ' + escHtml(r.fullName) + ' — <span class="currency" style="font-size:1rem;">' + formatCurrency(r.numericValue) + '</span></div>';
      });
      overallEl.innerHTML = html;
    }
  }

  // Largest wealth gap (within a single class period)
  var gapEl = document.getElementById('gameStatGap');
  if (gapEl) {
    var maxGap = 0;
    var periodMap = {};
    allData.forEach(function (r) {
      if (!periodMap[r.classPeriod]) periodMap[r.classPeriod] = [];
      periodMap[r.classPeriod].push(r.numericValue);
    });
    Object.values(periodMap).forEach(function (vals) {
      if (vals.length < 2) return;
      var gap = Math.max.apply(null, vals) - Math.min.apply(null, vals);
      if (gap > maxGap) maxGap = gap;
    });
    gapEl.textContent = maxGap > 0 ? formatCurrency(maxGap) : 'N/A';
  }
}

function renderGameLeaderboard() {
  // Group by class period
  var periodMap = {};
  allData.forEach(function (r) {
    var key = r.classPeriod || 'Unknown';
    if (!periodMap[key]) periodMap[key] = [];
    periodMap[key].push(r);
  });

  var games = Object.keys(periodMap).map(function (period) {
    var players = periodMap[period];
    var avgROI  = players.reduce(function (s, r) { return s + r.roi; }, 0) / players.length;
    var winRate = (players.filter(function (r) { return r.beatMarketBool; }).length / players.length) * 100;
    var vals    = players.map(function (r) { return r.numericValue; });
    var gap     = vals.length > 1 ? Math.max.apply(null, vals) - Math.min.apply(null, vals) : 0;

    // Earliest timestamp for the period
    var dates = players.map(function (r) { return new Date(r.timestamp); }).filter(function (d) { return !isNaN(d); });
    var dateStr = dates.length > 0
      ? new Date(Math.min.apply(null, dates)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';

    return { period: period, players: players.length, avgROI: avgROI, winRate: winRate, gap: gap, dateStr: dateStr };
  });

  games.sort(function (a, b) { return b.avgROI - a.avgROI; });

  var tbody = document.getElementById('gameLeaderboardBody');
  if (!tbody) return;

  if (games.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:rgba(244,241,234,0.5);padding:30px;">No game data found.</td></tr>';
    return;
  }

  var html = '';
  games.forEach(function (g, idx) {
    var rank      = idx + 1;
    var medal     = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    var roiColor  = g.avgROI >= 0 ? '#2ecc71' : '#e74c3c';
    var winColor  = g.winRate >= 50 ? '#2ecc71' : '#e74c3c';

    html += '<tr onclick="openGameModal(\'' + escHtml(g.period) + '\')">';
    html += '<td class="rank-col">' + medal + '</td>';
    html += '<td><strong>' + escHtml(g.period) + '</strong></td>';
    html += '<td><small>' + escHtml(g.dateStr) + '</small></td>';
    html += '<td>' + g.players + '</td>';
    html += '<td style="color:' + winColor + '; font-weight:700;">' + g.winRate.toFixed(1) + '%</td>';
    html += '<td style="color:' + roiColor + '; font-weight:700;">' + g.avgROI.toFixed(1) + '%</td>';
    html += '<td class="currency">' + formatCurrency(g.gap) + '</td>';
    html += '</tr>';
  });

  tbody.innerHTML = html;
}


// ============================================================
//  ROI Distribution Chart
// ============================================================
function renderROIChart() {
  var canvas = document.getElementById('roiChart');
  var wrap   = document.getElementById('roiChartWrap');
  if (!canvas || !wrap) return;

  // Count brackets
  var counts = ROI_BRACKETS.map(function () { return 0; });
  var valid   = 0;

  allData.forEach(function (r) {
    if (r.totalInvestedNumeric <= 0) return; // skip malformed
    valid++;
    for (var i = 0; i < ROI_BRACKETS.length; i++) {
      if (r.roi >= ROI_BRACKETS[i].min && r.roi < ROI_BRACKETS[i].max) {
        counts[i]++;
        break;
      }
    }
  });

  if (valid === 0) {
    wrap.innerHTML = '<div class="chart-empty">Not enough data to display this chart.</div>';
    return;
  }

  if (roiChartInstance) {
    roiChartInstance.destroy();
    roiChartInstance = null;
  }

  roiChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ROI_BRACKETS.map(function (b) { return b.label; }),
      datasets: [{
        label: 'Students',
        data: counts,
        backgroundColor: ['#e74c3c', '#e8a838', '#ebd186', '#9ab0a6', '#d4af37'],
        borderColor:     ['#c0392b', '#c47d10', '#cbb36b', '#7d9389', '#a88a2c'],
        borderWidth: 2,
        borderRadius: 3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var pct = valid > 0 ? ((ctx.parsed.y / valid) * 100).toFixed(1) : '0';
              return ctx.parsed.y + ' students (' + pct + '%)';
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#f4f1ea', font: { family: 'Montserrat', weight: '600' } },
          grid:  { color: 'rgba(212,175,55,0.15)' }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: '#f4f1ea',
            font:  { family: 'Montserrat' },
            stepSize: 1,
            callback: function (v) { return Number.isInteger(v) ? v : ''; }
          },
          grid: { color: 'rgba(212,175,55,0.15)' }
        }
      }
    }
  });
}


// ============================================================
//  Beat the Market Trend Chart
// ============================================================
function renderBTMChart() {
  var canvas = document.getElementById('btmChart');
  var wrap   = document.getElementById('btmChartWrap');
  if (!canvas || !wrap) return;

  var labels   = [];
  var winRates = [];

  YEAR_COHORTS.forEach(function (cohort) {
    var players = allData.filter(function (r) {
      var rcp = String(r.rawClassPeriod || '').toLowerCase();
      return cohort.keywords.some(function (k) { return rcp.includes(k); });
    });

    if (players.length === 0) return; // skip cohorts with no data silently

    var winners = players.filter(function (r) { return r.beatMarketBool; }).length;
    labels.push(cohort.label);
    winRates.push(parseFloat(((winners / players.length) * 100).toFixed(1)));
  });

  if (labels.length === 0) {
    wrap.innerHTML = '<div class="chart-empty">Not enough data across cohorts to display this chart.</div>';
    return;
  }

  if (btmChartInstance) {
    btmChartInstance.destroy();
    btmChartInstance = null;
  }

  btmChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Beat the Market %',
        data: winRates,
        backgroundColor: winRates.map(function (v) {
          return v >= 50 ? 'rgba(46,204,113,0.75)' : 'rgba(212,175,55,0.75)';
        }),
        borderColor: winRates.map(function (v) {
          return v >= 50 ? '#27ae60' : '#a88a2c';
        }),
        borderWidth: 2,
        borderRadius: 3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.parsed.y + '% of students beat the market'; }
          }
        },
        annotation: {}
      },
      scales: {
        x: {
          ticks: { color: '#f4f1ea', font: { family: 'Montserrat', weight: '600' } },
          grid:  { color: 'rgba(212,175,55,0.15)' }
        },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: '#f4f1ea',
            font:  { family: 'Montserrat' },
            callback: function (v) { return v + '%'; }
          },
          grid: { color: 'rgba(212,175,55,0.15)' }
        }
      }
    }
  });
}


// ============================================================
//  Game Modal (roster for a class period)
// ============================================================
function openGameModal(period) {
  var players = allData.filter(function (r) { return r.classPeriod === period; });
  players.sort(function (a, b) { return b.numericValue - a.numericValue; });

  var titleEl = document.getElementById('listModalTitle');
  if (titleEl) titleEl.textContent = period + ' — Roster';

  var tbody = document.getElementById('listModalBody');
  if (!tbody) return;

  if (players.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center list-player-text" style="padding:20px;">No players found.</td></tr>';
  } else {
    var html = '';
    players.forEach(function (r) {
      var badgeClass = getAssetBadgeClass(r.highestPerformer);
      var assetLabel = getAssetLabel(r.highestPerformer);
      var star = r.beatMarketBool ? ' ⭐' : '';
      html += '<tr>';
      html += '<td class="list-player-text"><strong>' + escHtml(r.fullName) + '</strong>' + star + '</td>';
      html += '<td class="currency" style="text-shadow:none;color:var(--olive-dark)!important;">' + formatCurrency(r.numericValue) + '</td>';
      html += '<td><span class="badge ' + badgeClass + '">' + escHtml(assetLabel) + '</span></td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
  }

  var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('listModal'));
  modal.show();
}


// ============================================================
//  Team View
// ============================================================
function renderTeamView() {
  var gameFilterEl = document.getElementById('gameFilter');
  if (!gameFilterEl || uniqueGamesGlobal.length === 0) {
    var tbody = document.getElementById('teamLeaderboardBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color:rgba(244,241,234,0.5);padding:30px;">No team data found. Teams require a game date and class period.</td></tr>';
    return;
  }

  var selectedGame = gameFilterEl.value;
  if (!selectedGame) return;

  var parts       = selectedGame.split(' | ');
  var gameDateStr = parts[0] ? parts[0].trim() : '';
  var gamePeriod  = parts[1] ? parts[1].trim() : '';

  // Match records to this specific game: same class period + same submission date
  var gamePlayers = allData.filter(function (r) {
    if (r.classPeriod !== gamePeriod) return false;
    var d = new Date(r.timestamp);
    if (isNaN(d)) return false;
    var rDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return rDate === gameDateStr;
  });

  // Group by team
  var teamMap = {};
  gamePlayers.forEach(function (r) {
    if (r.teamMatchKey === 'none') return;
    if (!teamMap[r.teamMatchKey]) {
      teamMap[r.teamMatchKey] = { displayName: r.teamName.trim(), members: [] };
    }
    teamMap[r.teamMatchKey].members.push(r);
  });

  var teams = Object.values(teamMap).map(function (t) {
    var total   = t.members.reduce(function (s, r) { return s + r.numericValue; }, 0);
    var average = t.members.length > 0 ? total / t.members.length : 0;
    return { displayName: t.displayName, members: t.members, average: average };
  });

  // Sort by average portfolio value descending
  teams.sort(function (a, b) { return b.average - a.average; });

  var tbody = document.getElementById('teamLeaderboardBody');
  if (!tbody) return;

  if (teams.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color:rgba(244,241,234,0.5);padding:30px;">No teams found for this game.</td></tr>';
    return;
  }

  var html = '';
  teams.forEach(function (team, idx) {
    var rank  = idx + 1;
    var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

    // Member names as a comma-separated list
    var memberNames = team.members
      .slice()
      .sort(function (a, b) { return b.numericValue - a.numericValue; })
      .map(function (r) { return escHtml(r.fullName); })
      .join(', ');

    html += '<tr onclick="openTeamModal(\'' + escHtml(team.displayName) + '\', \'' + escHtml(gamePeriod) + '\', \'' + escHtml(gameDateStr) + '\')">';
    html += '<td class="rank-col">' + medal + '</td>';
    html += '<td><strong>' + escHtml(team.displayName) + '</strong></td>';
    html += '<td><small style="line-height:1.8;">' + memberNames + '</small></td>';
    html += '<td><span class="currency">' + formatCurrency(team.average) + '</span></td>';
    html += '</tr>';
  });

  tbody.innerHTML = html;
}


// ============================================================
//  Team Modal
// ============================================================
function openTeamModal(teamName, period, gameDateStr) {
  var teamKey = teamName.trim().toLowerCase();

  var members = allData.filter(function (r) {
    if (r.teamMatchKey !== teamKey) return false;
    if (r.classPeriod !== period) return false;
    var d = new Date(r.timestamp);
    if (isNaN(d)) return false;
    var rDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return rDate === gameDateStr;
  });

  members.sort(function (a, b) { return b.numericValue - a.numericValue; });

  var titleEl = document.getElementById('teamModalTitle');
  if (titleEl) titleEl.textContent = teamName + ' — Team Roster';

  var tbody = document.getElementById('teamModalBody');
  if (!tbody) return;

  if (members.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center list-player-text" style="padding:20px;">No members found.</td></tr>';
  } else {
    var html = '';
    members.forEach(function (r) {
      var badgeClass = getAssetBadgeClass(r.highestPerformer);
      var assetLabel = getAssetLabel(r.highestPerformer);
      var star = r.beatMarketBool ? ' ⭐' : '';
      html += '<tr>';
      html += '<td class="list-player-text"><strong>' + escHtml(r.fullName) + '</strong>' + star + '</td>';
      html += '<td class="currency" style="text-shadow:none;color:var(--olive-dark)!important;">' + formatCurrency(r.numericValue) + '</td>';
      html += '<td><span class="badge ' + badgeClass + '">' + escHtml(assetLabel) + '</span></td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
  }

  var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('teamModal'));
  modal.show();
}


// ============================================================
//  XSS Safety — escape HTML before inserting into innerHTML
// ============================================================
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
