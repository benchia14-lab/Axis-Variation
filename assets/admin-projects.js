/* ============================================================================
   ADMINISTRATOR SETTINGS → PROJECTS — every project, in every office
   ============================================================================
   One table of all of them, hidden and deleted ones included, to find, edit,
   hide, move and delete -- one at a time, or several ticked together.

     Edit      the project's setup (the same window as on its dashboard)
     Hide      active = false: off the projects page and the project list;
               its variations stay. Show puts it back.
     Move      to another office, with its variations (their office changes too)
     Delete    a mark, not a removal: the project is gone from everywhere but
               here, with its variations, until Restore
============================================================================ */

const AdminProjects = (function(){

  const body = document.getElementById('ap-body');
  const office = document.getElementById('ap-office');
  const search = document.getElementById('ap-search');
  const show = document.getElementById('ap-show');
  const bulk = document.getElementById('ap-bulk');
  const moveTo = document.getElementById('ap-move-to');
  const say = (t, cls) => { const e = document.getElementById('ap-status'); e.textContent = t || ''; e.className = 'status-line' + (cls ? ' ' + cls : ''); };
  const by = () => (window.AXIS_USER && (window.AXIS_USER.name || window.AXIS_USER.username)) || '';

  let projects = [];
  let counts = {};
  const picked = new Set();

  const offices = () => StateRegister.rows();
  function fillOffices(){
    const keep = office.value, keepMove = moveTo.value;
    const opts = offices().map(o => '<option value="' + escapeHtml(o.code) + '">' + escapeHtml(o.code + ' — ' + (o.name || '')) + '</option>').join('');
    office.innerHTML = '<option value="">Every office</option>' + opts;
    moveTo.innerHTML = '<option value="">Move to…</option>' + opts;
    office.value = keep; moveTo.value = keepMove;
  }

  async function load(){
    if(typeof AxisDb === 'undefined' || !AxisDb.on()){ say('There is no database connected.', 'err'); return; }
    fillOffices();
    say('Reading the projects…');
    try {
      [projects, counts] = await Promise.all([AxisDb.allProjects(), AxisDb.variationCounts()]);
      say('');
      render();
    } catch(err){ say(err.message, 'err'); }
  }

  const stateOf = p => p.deleted ? 'deleted' : p.active ? 'active' : 'hidden';
  const STATE_LABEL = { active: 'In use', hidden: 'Hidden', deleted: 'Deleted' };

  function shown(){
    const q = search.value.trim().toLowerCase();
    const want = show.value;
    return projects.filter(p => {
      if(office.value && p.state !== office.value) return false;
      const st = stateOf(p);
      if(want === 'live' && st === 'deleted') return false;
      if(want === 'active' && st !== 'active') return false;
      if(want === 'hidden' && st !== 'hidden') return false;
      if(want === 'deleted' && st !== 'deleted') return false;
      if(q && (p.project + ' ' + p.projectNumber + ' ' + p.folderPath + ' ' + p.headContractor + ' ' + p.state).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function render(){
    const list = shown();
    // ticks on rows that are no longer shown are let go
    Array.from(picked).forEach(id => { if(!list.some(p => p.id === id)) picked.delete(id); });
    const site = p => p.siteUrl ? (typeof SharePointSites !== 'undefined' ? SharePointSites.nameOf(p.siteUrl) : p.siteUrl).replace(/^Axis (Plumbing|Services) /, '') : '';
    body.innerHTML = '<tr><th class="ap-tick"><input type="checkbox" id="ap-all"' + (list.length && list.every(p => picked.has(p.id)) ? ' checked' : '') + ' title="Tick every project shown"></th>' +
      '<th>Office</th><th>Project</th><th>No.</th><th>Variations</th><th>PDF folder</th><th>Rates</th><th>State</th><th></th></tr>' +
      list.map(p => {
        const st = stateOf(p);
        const n = counts[p.id] || 0;
        return '<tr class="ap-' + st + '" data-id="' + escapeHtml(p.id) + '">' +
          '<td class="ap-tick"><input type="checkbox" data-pick="' + escapeHtml(p.id) + '"' + (picked.has(p.id) ? ' checked' : '') + '></td>' +
          '<td class="code">' + escapeHtml(p.state) + '</td>' +
          '<td><b>' + escapeHtml(p.project || '(no name)') + '</b>' + (p.headContractor ? '<span class="ap-sub">' + escapeHtml(p.headContractor) + '</span>' : '') + '</td>' +
          '<td>' + escapeHtml(p.projectNumber || '—') + '</td>' +
          '<td class="ap-num">' + n + '</td>' +
          '<td class="ap-folder">' + (p.folderPath ? '<span class="ap-site">' + escapeHtml(site(p)) + '</span>' + escapeHtml(p.folderPath) : '<span class="ap-missing">not set</span>') + '</td>' +
          '<td>' + (p.ratesFile ? 'Agreed' : 'Master') + '</td>' +
          '<td><span class="ap-state ap-state-' + st + '">' + STATE_LABEL[st] + '</span></td>' +
          '<td class="ap-actions">' +
            (st === 'deleted'
              ? '<button type="button" class="link-btn" data-act="restore">Restore</button>'
              : '<button type="button" class="link-btn" data-act="edit">Edit</button>' +
                '<button type="button" class="link-btn" data-act="' + (st === 'active' ? 'hide' : 'show') + '">' + (st === 'active' ? 'Hide' : 'Show') + '</button>' +
                '<button type="button" class="link-btn" data-act="move">Move</button>' +
                '<button type="button" class="link-btn" data-act="open">Open</button>' +
                '<button type="button" class="link-btn ap-del" data-act="delete">Delete</button>') +
          '</td></tr>';
      }).join('') +
      (list.length ? '' : '<tr><td colspan="9" class="ap-none">No projects match.</td></tr>');
    const total = projects.filter(p => !p.deleted).length, hidden = projects.filter(p => !p.deleted && !p.active).length,
          gone = projects.filter(p => p.deleted).length;
    document.getElementById('ap-status').className = 'status-line';
    if(!document.getElementById('ap-status').textContent || /^\d+ project/.test(document.getElementById('ap-status').textContent)){
      say(list.length + ' project' + (list.length === 1 ? '' : 's') + ' shown · ' + total + ' in all, ' + hidden + ' hidden, ' + gone + ' deleted.');
    }
    describePicked();
  }

  function describePicked(){
    bulk.hidden = !picked.size;
    document.getElementById('ap-picked').textContent = picked.size + ' ticked:';
  }

  // one action on several projects, one after another, saying how it went
  async function act(action, ids, opts){
    const list = ids.map(id => projects.find(p => p.id === id)).filter(Boolean);
    if(!list.length) return;
    const names = list.length === 1 ? '"' + list[0].project + '"' : list.length + ' projects';
    const vars = list.reduce((n, p) => n + (counts[p.id] || 0), 0);
    if(action === 'delete' && !confirm('Delete ' + names + '?' + (vars ? '\n\n' + vars + ' variation' + (vars === 1 ? '' : 's') + ' go with ' + (list.length === 1 ? 'it' : 'them') + '.' : '') +
       '\n\nThey can be restored from here (show: Deleted).')) return;
    if(action === 'move'){
      const to = opts.to;
      const from = Array.from(new Set(list.map(p => p.state)));
      if(!confirm('Move ' + names + ' from ' + from.join(', ') + ' to ' + to + '?' + (vars ? '\n\nTheir ' + vars + ' variation' + (vars === 1 ? '' : 's') + ' move too.' : '') +
         '\n\nAnyone given only particular projects in ' + from.join(', ') + ' under Permissions will need them given again in ' + to + '.')) return;
    }
    say('Working…');
    let done = 0;
    const failed = [];
    for(const p of list){
      try {
        if(action === 'hide') await AxisDb.setProjectActive(p.id, false);
        if(action === 'show') await AxisDb.setProjectActive(p.id, true);
        if(action === 'delete') await AxisDb.setProjectDeleted(p.id, true, by());
        if(action === 'restore') await AxisDb.setProjectDeleted(p.id, false, by());
        if(action === 'move' && p.state !== opts.to) await AxisDb.moveProject(p.id, opts.to);
        done++;
      } catch(err){ failed.push(p.project + ': ' + err.message); }
    }
    const verb = { hide: 'Hidden', show: 'Shown again', delete: 'Deleted', restore: 'Restored', move: 'Moved to ' + (opts && opts.to) }[action];
    picked.clear();
    await load();
    say(failed.length ? verb + ': ' + done + '. Not done: ' + failed.join('; ') : verb + ': ' + done + ' project' + (done === 1 ? '' : 's') + '.', failed.length ? 'err' : 'ok');
    // the rest of the app reads its projects again
    if(typeof currentState !== 'undefined' && currentState) projectsLoading = loadProjects();
  }

  body.addEventListener('change', e => {
    const t = e.target;
    if(t.id === 'ap-all'){
      shown().forEach(p => { if(t.checked) picked.add(p.id); else picked.delete(p.id); });
      render();
    } else if(t.hasAttribute('data-pick')){
      const id = t.getAttribute('data-pick');
      if(t.checked) picked.add(id); else picked.delete(id);
      describePicked();
    }
  });

  body.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if(!b) return;
    const id = b.closest('tr').getAttribute('data-id');
    const p = projects.find(x => x.id === id);
    const a = b.getAttribute('data-act');
    if(a === 'edit') ProjectSetup.open(p, { onSaved: () => { load().then(() => say('Saved "' + p.project + '".', 'ok')); } });
    else if(a === 'move'){
      // the office to move to is picked in the bar that ticking brings up
      picked.clear(); picked.add(id); render();
      moveTo.focus();
      say('Choose the office to move "' + p.project + '" to, in "Move to…" above.');
    }
    else if(a === 'open') location.hash = '#/state/' + encodeURIComponent(p.state) + '/project/' + encodeURIComponent(p.id);
    else act(a, [id]);
  });

  bulk.addEventListener('click', e => {
    const b = e.target.closest('[data-bulk]');
    if(!b) return;
    const a = b.getAttribute('data-bulk');
    if(a === 'clear'){ picked.clear(); render(); return; }
    act(a, Array.from(picked));
  });
  moveTo.addEventListener('change', () => {
    const to = moveTo.value;
    moveTo.value = '';
    if(to) act('move', Array.from(picked), { to: to });
  });

  [office, show].forEach(x => x.addEventListener('change', () => { say(''); render(); }));
  search.addEventListener('input', () => { say(''); render(); });
  document.getElementById('ap-refresh').addEventListener('click', () => { say(''); load(); });

  return { load: load };
})();
