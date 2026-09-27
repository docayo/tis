// ================================================================
// TIS EMIS — USERS & PERMISSIONS MODULE (frontend)
// File: users-module.js
// ================================================================
// SECTION MAP:
//   [USR-FE-01] CONFIG + JSONP HELPER
//   [USR-FE-02] TAB RENDER (table of users)
//   [USR-FE-03] PERMISSION EDITOR (collapsible grid)
//   [USR-FE-04] ROLE EDITOR
//   [USR-FE-05] PASSWORD RESET
//   [USR-FE-06] PUBLIC API
// ================================================================

(function () {
  'use strict';

  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwp8WB7ZCYOiolA70SQAPi7--1cmclVwRQEMBaur6CwymD_8sDo9uL7dNNh9LFUkIZd/exec';
  let matrixCache = null;
  let expandedUserIds = {};

  function getSession() {
    const p = (window.State && window.State.profile) || {};
    return { userId: p.operator_id || p.id || '', userName: p.name || '' };
  }
  function showToast(msg, type) {
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    console.log('[USR]', msg);
  }
  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  // [USR-FE-01] JSONP HELPER
  function usrCall(fnName) {
    const args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve) {
      const cbName = 'usr_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
      let settled = false;
      let scriptEl = null;
      function cleanup() {
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
      }
      window[cbName] = function (data) {
        if (settled) return;
        settled = true; cleanup();
        // doGet wraps apiCall result as {success, data}, unwrap if so
        if (data && typeof data === 'object' && 'success' in data && 'data' in data &&
            data.data && typeof data.data === 'object') {
          const merged = Object.assign({ success: data.success }, data.data);
          resolve(merged);
        } else {
          resolve(data || { success: false, message: 'Empty response' });
        }
      };
      const url = BACKEND_URL +
                  '?action=' + encodeURIComponent(fnName) +
                  '&args=' + encodeURIComponent(JSON.stringify(args)) +
                  '&callback=' + encodeURIComponent(cbName);
      scriptEl = document.createElement('script');
      scriptEl.src = url;
      scriptEl.onerror = function () {
        if (settled) return;
        settled = true; cleanup();
        resolve({ success: false, message: 'Network error.' });
      };
      setTimeout(function () {
        if (settled) return;
        settled = true; cleanup();
        resolve({ success: false, message: 'Timeout (60s).' });
      }, 60000);
      document.head.appendChild(scriptEl);
    });
  }

  // [USR-FE-02] TAB RENDER
  async function renderUsersTab() {
    const container = document.getElementById('usersContent') ||
                      document.getElementById('usersTabContent') ||
                      document.querySelector('#users .tab-content');
    if (!container) {
      console.warn('[USR] No container found for users tab');
      return;
    }
    container.innerHTML = '<div class="page-loader"><p>Loading users…</p></div>';

    const r = await usrCall('getPermissionMatrix');
    if (!r || !r.success) {
      container.innerHTML = '<div class="empty-state"><h3>Could not load users</h3><p>' +
                            escapeHtml((r && (r.error || r.message)) || 'unknown') + '</p></div>';
      return;
    }
    matrixCache = r;
    container.innerHTML = buildTabHtml(r);
    attachHandlers(container);
  }

  function buildTabHtml(r) {
    const users = r.users || [];
    let html = '';
    html += '<div class="card-bg" style="margin-bottom:14px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">';
    html += '<div><h3 style="margin:0;color:#0d4d26;">👥 Users &amp; Permissions</h3>';
    html += '<p style="margin:4px 0 0 0;font-size:12px;color:#555;">' + users.length +
            ' user(s). Click a row to expand the permission matrix. Unchecked boxes lock the action.</p></div>';
    html += '<button type="button" class="btn btn-sm btn-secondary" id="usrRefreshBtn">🔄 Refresh</button>';
    html += '</div></div>';

    html += '<div class="card-bg"><table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:#0d4d26;color:#fff;">';
    html += '<th style="text-align:left;padding:8px;width:60px;">ID</th>';
    html += '<th style="text-align:left;padding:8px;">Name</th>';
    html += '<th style="text-align:left;padding:8px;width:120px;">Role</th>';
    html += '<th style="text-align:center;padding:8px;width:90px;">Active</th>';
    html += '<th style="text-align:center;padding:8px;width:110px;">Actions</th>';
    html += '</tr></thead><tbody>';

    users.forEach(function (u) {
      const isExpanded = !!expandedUserIds[u.id];
      const arrow = isExpanded ? '▾' : '▸';
      html += '<tr class="usr-row" data-uid="' + escapeHtml(u.id) + '" style="cursor:pointer;">';
      html += '<td style="padding:8px;border-bottom:1px solid #eee;">' + escapeHtml(u.id) + '</td>';
      html += '<td style="padding:8px;border-bottom:1px solid #eee;">' + arrow + ' ' + escapeHtml(u.name) + '</td>';
      html += '<td style="padding:8px;border-bottom:1px solid #eee;">' + escapeHtml(u.role) + '</td>';
      html += '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">' +
              (u.isActive ? '✅' : '—') + '</td>';
      html += '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center;" onclick="event.stopPropagation()">';
      html += '<button type="button" class="btn btn-sm btn-warning usrResetPw" data-uid="' + escapeHtml(u.id) + '">Reset PW</button>';
      html += '</td></tr>';
      if (isExpanded) {
        html += '<tr><td colspan="5" style="padding:0;border-bottom:2px solid #0d4d26;">';
        html += buildPermissionEditor(u, r.modules, r.actions);
        html += '</td></tr>';
      }
    });

    html += '</tbody></table></div>';
    return html;
  }

  // [USR-FE-03] PERMISSION EDITOR (collapsible grid per user)
  function buildPermissionEditor(user, modules, actions) {
    let html = '';
    html += '<div style="background:#f7fbf7;padding:14px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">';
    html += '<div><b style="color:#0d4d26;">' + escapeHtml(user.name) + '</b> ' +
            '<span style="color:#666;font-size:12px;">(' + escapeHtml(user.role) + ')</span></div>';
    html += '<div style="display:flex;gap:8px;">';
    html += '<button type="button" class="btn btn-sm btn-secondary usrAllOn" data-uid="' + escapeHtml(user.id) + '">All On</button>';
    html += '<button type="button" class="btn btn-sm btn-secondary usrAllOff" data-uid="' + escapeHtml(user.id) + '">All Off</button>';
    html += '<button type="button" class="btn btn-sm btn-success usrSave" data-uid="' + escapeHtml(user.id) + '">Save Permissions</button>';
    html += '</div></div>';

    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;">';
    html += '<thead><tr style="background:#e8f5e9;">';
    html += '<th style="text-align:left;padding:6px;">Module</th>';
    actions.forEach(function (a) {
      html += '<th style="text-align:center;padding:6px;width:80px;text-transform:capitalize;">' + escapeHtml(a) + '</th>';
    });
    html += '</tr></thead><tbody>';

    modules.forEach(function (m) {
      html += '<tr>';
      html += '<td style="padding:6px;border-bottom:1px solid #eee;">' + escapeHtml(m.label) + '</td>';
      actions.forEach(function (a) {
        const key = a + '_' + m.key;
        const checked = user.authorities && user.authorities[key] ? ' checked' : '';
        html += '<td style="padding:6px;border-bottom:1px solid #eee;text-align:center;">';
        html += '<input type="checkbox" class="usrPermBox" data-uid="' + escapeHtml(user.id) +
                '" data-key="' + escapeHtml(key) + '"' + checked + '>';
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  // [USR-FE-04] helpers to read / write DOM checkbox state
  function readPermissionsFromDom(userId) {
    const boxes = document.querySelectorAll('.usrPermBox[data-uid="' + userId + '"]');
    const auth = {};
    boxes.forEach(function (b) {
      auth[b.getAttribute('data-key')] = !!b.checked;
    });
    return auth;
  }

  function setAllPermissionsInDom(userId, value) {
    const boxes = document.querySelectorAll('.usrPermBox[data-uid="' + userId + '"]');
    boxes.forEach(function (b) { b.checked = value; });
  }

  async function savePermissions(userId) {
    const auth = readPermissionsFromDom(userId);
    const r = await usrCall('setUserAuthorities', userId, auth);
    if (r && r.success) {
      showToast('Permissions saved for ' + userId, 'success');
      if (matrixCache) {
        for (var i = 0; i < matrixCache.users.length; i++) {
          if (matrixCache.users[i].id === userId) matrixCache.users[i].authorities = auth;
        }
      }
    } else {
      showToast('Save failed: ' + ((r && (r.error || r.message)) || 'unknown'), 'error');
    }
  }

  // [USR-FE-05] PASSWORD RESET
  async function resetPassword(userId) {
    const np = prompt('New password for ' + userId + ':');
    if (!np) return;
    if (np.length < 4) { showToast('Password must be at least 4 characters', 'warning'); return; }
    const sess = getSession();
    const r = await usrCall('adminResetPassword', userId, np, sess.userName || 'Admin');
    if (r && r.success) showToast('Password reset for ' + userId, 'success');
    else showToast('Reset failed: ' + ((r && (r.error || r.message)) || 'unknown'), 'error');
  }

  // [USR-FE-06] WIRE UP EVENT HANDLERS
  function attachHandlers(container) {
    const refreshBtn = container.querySelector('#usrRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { renderUsersTab(); });

    container.querySelectorAll('.usr-row').forEach(function (row) {
      row.addEventListener('click', function () {
        const uid = row.getAttribute('data-uid');
        expandedUserIds[uid] = !expandedUserIds[uid];
        renderUsersTab();
      });
    });

    container.querySelectorAll('.usrResetPw').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        resetPassword(b.getAttribute('data-uid'));
      });
    });

    container.querySelectorAll('.usrAllOn').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        setAllPermissionsInDom(b.getAttribute('data-uid'), true);
      });
    });
    container.querySelectorAll('.usrAllOff').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        setAllPermissionsInDom(b.getAttribute('data-uid'), false);
      });
    });
    container.querySelectorAll('.usrSave').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        savePermissions(b.getAttribute('data-uid'));
      });
    });

    // Prevent clicks inside the editor table from collapsing the row
    container.querySelectorAll('table input, table button').forEach(function (el) {
      el.addEventListener('click', function (e) { e.stopPropagation(); });
    });
  }

  // [USR-FE-06] PUBLIC API
  window.USR = {
    renderUsersTab: renderUsersTab,
    refresh: renderUsersTab
  };
  console.log('[USR] Users & Permissions module loaded.');
})();
