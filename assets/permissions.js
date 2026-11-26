/* ============================================================================
   ADMINISTRATOR SETTINGS — the tabs, Permissions and Profiles
   ============================================================================
   The administrator screen is a row of tabs: Power Automate flows, Password,
   Deleted variations, Permissions, Profiles, Import. The tab last open is
   remembered for the session.

   Profiles lists everyone who has signed in (av_users). Permissions sets, per
   person, their level and the offices and projects it covers -- see
   assets/access.js for what each level allows and how it is applied.
============================================================================ */

const Permissions = (function(){

  /* ---- the tabs ------------------------------------------------------------ */

  const TAB_KEY = 'axisVariations:adminTab';
  const tabs = Array.prototype.slice.call(document.querySelectorAll('#admin-tabs .admin-tab'));
  const panes = Array.prototype.slice.call(document.querySelectorAll('#admin-body .admin-pane'));

  function showTab(name){
    if(!panes.some(p => p.getAttribute('data-pane') === name)) name = 'flows';
    tabs.forEach(t => t.classList.toggle('on', t.getAttribute('data-tab') === name));
    panes.forEach(p => { p.hidden = p.getAttribute('data-pane') !== name; });
    try { sessionStorage.setItem(TAB_KEY, name); } catch(e){}
    if(name === 'permissions') loadPeople();
    if(name === 'profiles') renderProfiles(true);
  }
  tabs.forEach(t => t.addEventListener('click', () => showTab(t.getAttribute('data-tab'))));

  /* ---- shared ---------------------------------------------------------------- */

  const on = () => typeof AxisDb !== 'undefined' && AxisDb.on();
  const by = () => (window.AXIS_USER && (window.AXIS_USER.name || window.AXIS_USER.username)) || '';
  const myEmail = () => String((window.AXIS_USER && window.AXIS_USER.username) || '').toLowerCase();
  const LABELS = Access.LABELS;
  const offices = () => StateRegister.rows();
  const officeName = code => { const r = offices().find(o => o.code === code); return r ? (r.name || code) : code; };
  const when = iso => iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  function set(id, text, cls){ const e = document.getElementById(id); e.textContent = text || ''; e.className = 'status-line' + (cls ? ' ' + cls : ''); }

  let people = [];
  let chosen = null;     // the email being edited
  let draft = null;      // its permissions, as being changed
  const projectsBy = {}; // office -> [projects], read when needed

  async function fetchPeople(){
    people = await AxisDb.listUsers();
    return people;
  }

  function officesText(u){
    if(u.level === 'admin') return 'Every office';
    if(u.offices.indexOf('*') !== -1) return 'Every office';
    if(!u.offices.length) return 'None';
    return u.offices.map(c => {
      const rule = u.projects[c];
      return c + (Array.isArray(rule) ? ' (' + rule.length + ' project' + (rule.length === 1 ? '' : 's') + ')' : '');
    }).join(', ');
  }

  /* ---- profiles --------------------------------------------------------------- */

  async function renderProfiles(fresh){
    const body = document.getElementById('prof-body');
    if(!on()){ set('prof-status', 'There is no database connected, so there are no profiles.', 'err'); return; }
    try {
      if(fresh) { set('prof-status', 'Reading…'); await fetchPeople(); }
      body.innerHTML = '<tr><th>Name</th><th>Email</th><th>Level</th><th>Offices</th><th>First signed in</th><th>Last signed in</th><th></th></tr>' +
        people.map(u =>
          '<tr><td>' + escapeHtml(u.name || '—') + (u.email === myEmail() ? ' <span class="perm-you">you</span>' : '') + '</td>' +
          '<td class="prof-email">' + escapeHtml(u.email) + '</td>' +
          '<td><span class="perm-level lv-' + u.level + '">' + escapeHtml(LABELS[u.level] || u.level) + '</span></td>' +
          '<td>' + escapeHtml(officesText(u)) + '</td>' +
          '<td>' + escapeHtml(when(u.firstSeen)) + '</td><td>' + escapeHtml(when(u.lastSeen)) + '</td>' +
          '<td><button type="button" class="link-btn" data-perm="' + escapeHtml(u.email) + '">Permissions</button></td></tr>').join('');
      set('prof-status', people.length + ' profile' + (people.length === 1 ? '' : 's') + '.');
    } catch(err){ set('prof-status', err.message, 'err'); }
  }
  document.getElementById('prof-refresh').addEventListener('click', () => renderProfiles(true));
  document.getElementById('prof-body').addEventListener('click', e => {
    const b = e.target.closest('[data-perm]');
    if(!b) return;
    chosen = b.getAttribute('data-perm');
    draft = null;
    showTab('permissions');
  });

  /* ---- permissions ------------------------------------------------------------ */

  const list = document.getElementById('perm-list');
  const edit = document.getElementById('perm-edit');
  const search = document.getElementById('perm-search');

  function describeState(){
    const admins = people.filter(u => u.level === 'admin').length;
    document.getElementById('perm-state').innerHTML = admins
      ? '<b>Switched on.</b> ' + admins + ' administrator' + (admins === 1 ? '' : 's') + '; everyone else sees only what they are given here.'
      : '<b>Not switched on yet.</b> Nobody is an Administrator, so everyone signed in can still see and do everything. ' +
        'Make yourself an Administrator first — that switches it on.';
  }

  async function loadPeople(){
    if(!on()){ set('perm-status', 'There is no database connected, so permissions cannot be set.', 'err'); return; }
    try {
      await fetchPeople();
      describeState();
      renderList();
      if(chosen && people.some(u => u.email === chosen)) pick(chosen);
      const start = (await AxisDb.getSetting('new_user')) || {};
      document.getElementById('perm-new-level').value = ['viewer', 'editor'].indexOf(start.level) !== -1 ? start.level : 'none';
      document.getElementById('perm-new-offices').value = (start.offices || []).indexOf('*') !== -1 ? '*' : '';
    } catch(err){ set('perm-status', err.message, 'err'); }
  }

  function renderList(){
    const q = search.value.trim().toLowerCase();
    const shown = people.filter(u => !q || (u.name + ' ' + u.email).toLowerCase().indexOf(q) !== -1);
    list.innerHTML = shown.map(u =>
      '<button type="button" class="perm-person' + (u.email === chosen ? ' on' : '') + '" data-email="' + escapeHtml(u.email) + '">' +
        '<span class="perm-person-name">' + escapeHtml(u.name || u.email) + (u.email === myEmail() ? ' <span class="perm-you">you</span>' : '') + '</span>' +
        '<span class="perm-person-email">' + escapeHtml(u.email) + '</span>' +
        '<span class="perm-level lv-' + u.level + '">' + escapeHtml(LABELS[u.level] || u.level) + '</span>' +
      '</button>').join('') || '<p class="settings-help">' + (people.length ? 'Nobody matches.' : 'Nobody has signed in yet.') + '</p>';
  }
  search.addEventListener('input', renderList);
  list.addEventListener('click', e => {
    const b = e.target.closest('.perm-person');
    if(b) pick(b.getAttribute('data-email'));
  });

  function pick(email){
    const u = people.find(x => x.email === email);
    if(!u) return;
    if(chosen !== email || !draft) draft = { level: u.level, offices: u.offices.slice(), projects: JSON.parse(JSON.stringify(u.projects || {})) };
    if(chosen !== email) set('perm-status', '');
    chosen = email;
    renderList();
    renderEditor();
  }

  async function projectsFor(code){
    if(!projectsBy[code]) projectsBy[code] = (await AxisDb.listProjects(code, { all: true })).filter(p => p.active !== false);
    return projectsBy[code];
  }

  async function renderEditor(){
    const u = people.find(x => x.email === chosen);
    if(!u){ edit.innerHTML = '<p class="settings-help">Choose a person on the left.</p>'; return; }
    const every = draft.offices.indexOf('*') !== -1;
    const admin = draft.level === 'admin';
    const scoped = !admin && draft.level !== 'none';
    let html = '<div class="perm-head"><b>' + escapeHtml(u.name || u.email) + '</b><span>' + escapeHtml(u.email) +
      ' · last signed in ' + escapeHtml(when(u.lastSeen)) + '</span></div>' +
      '<div class="field"><label>Level</label><div class="perm-levels">' +
      Access.LEVELS.map(l => '<label class="perm-level-pick' + (draft.level === l ? ' on' : '') + '"><input type="radio" name="perm-level" value="' + l + '"' +
        (draft.level === l ? ' checked' : '') + '> <b>' + LABELS[l] + '</b><span>' + ({
          admin: 'Everything, every office, and these settings',
          editor: 'Creates, edits and issues variations; sets up projects',
          viewer: 'Sees variations and dashboards; changes nothing',
          none: 'Cannot open the app'
        })[l] + '</span></label>').join('') + '</div></div>';
    if(scoped){
      html += '<div class="field"><label>Offices</label><div class="perm-offices">' +
        '<label class="perm-check perm-all"><input type="checkbox" data-office="*"' + (every ? ' checked' : '') + '> Every office</label>' +
        offices().map(o => '<label class="perm-check"><input type="checkbox" data-office="' + escapeHtml(o.code) + '"' +
          (every || draft.offices.indexOf(o.code) !== -1 ? ' checked' : '') + (every ? ' disabled' : '') + '> ' +
          escapeHtml(o.code) + ' <span>' + escapeHtml(o.name || '') + '</span></label>').join('') + '</div></div>';
      const codes = every ? offices().map(o => o.code) : draft.offices;
      if(codes.length){
        html += '<div class="field"><label>Projects</label><div class="perm-projects">';
        codes.forEach(code => {
          const rule = draft.projects[code];
          const some = Array.isArray(rule);
          html += '<div class="perm-office" data-code="' + escapeHtml(code) + '"><div class="perm-office-head"><b>' + escapeHtml(code) + '</b> ' +
            '<select data-rule="' + escapeHtml(code) + '"><option value="*">Every project</option><option value="some"' + (some ? ' selected' : '') + '>Only these projects…</option></select></div>' +
            (some ? '<div class="perm-project-list" data-list="' + escapeHtml(code) + '">Reading the projects…</div>' : '') + '</div>';
        });
        html += '</div></div>';
      }
    }
    html += '<div class="settings-actions"><button class="print-btn" id="perm-save" type="button">Save ' + escapeHtml((u.name || u.email).split(' ')[0]) + '’s permissions</button></div>';
    edit.innerHTML = html;
    // the project lists, once read
    for(const box of Array.prototype.slice.call(edit.querySelectorAll('[data-list]'))){
      const code = box.getAttribute('data-list');
      try {
        const projects = await projectsFor(code);
        const picked = (draft.projects[code] || []).map(String);
        box.innerHTML = projects.length ? projects.map(p => '<label class="perm-check"><input type="checkbox" data-project="' + escapeHtml(code) + '" value="' +
          escapeHtml(p.id) + '"' + (picked.indexOf(String(p.id)) !== -1 ? ' checked' : '') + '> ' + escapeHtml(p.project) +
          (p.projectNumber ? ' <span>' + escapeHtml(p.projectNumber) + '</span>' : '') + '</label>').join('')
          : '<span class="settings-help">No projects set up in ' + escapeHtml(officeName(code)) + ' yet.</span>';
      } catch(err){ box.textContent = err.message; }
    }
  }

  edit.addEventListener('change', e => {
    const t = e.target;
    if(t.name === 'perm-level'){
      draft.level = t.value;
      // somebody given access with no office yet starts on every office
      if((t.value === 'editor' || t.value === 'viewer') && !draft.offices.length) draft.offices = ['*'];
      renderEditor();
    } else if(t.hasAttribute('data-office')){
      const code = t.getAttribute('data-office');
      if(code === '*') draft.offices = t.checked ? ['*'] : [];
      else {
        draft.offices = draft.offices.filter(c => c !== code && c !== '*');
        if(t.checked) draft.offices.push(code);
        else delete draft.projects[code];
      }
      renderEditor();
    } else if(t.hasAttribute('data-rule')){
      const code = t.getAttribute('data-rule');
      if(t.value === '*') delete draft.projects[code]; else draft.projects[code] = [];
      renderEditor();
    } else if(t.hasAttribute('data-project')){
      const code = t.getAttribute('data-project');
      const picked = new Set((draft.projects[code] || []).map(String));
      if(t.checked) picked.add(t.value); else picked.delete(t.value);
      draft.projects[code] = Array.from(picked);
    }
  });

  edit.addEventListener('click', async e => {
    if(!e.target.closest('#perm-save')) return;
    const u = people.find(x => x.email === chosen);
    if(!u) return;
    const admins = people.filter(x => x.level === 'admin');
    if(u.level === 'admin' && draft.level !== 'admin' && admins.length === 1 &&
       !confirm(u.email + ' is the only Administrator. Without one, nothing is restricted for anybody. Go ahead?')) return;
    if(u.email === myEmail() && u.level === 'admin' && draft.level !== 'admin' && admins.length > 1 &&
       !confirm('You are taking your own Administrator level away, and with it these settings. Go ahead?')) return;
    // the projects of offices no longer given, and empty "only these" lists, are not kept
    const keep = {};
    Object.keys(draft.projects).forEach(code => {
      if(draft.offices.indexOf('*') !== -1 || draft.offices.indexOf(code) !== -1) keep[code] = draft.projects[code];
    });
    const out = { email: u.email, level: draft.level, offices: draft.level === 'admin' ? ['*'] : draft.offices, projects: keep };
    const empty = Object.keys(keep).filter(c => Array.isArray(keep[c]) && !keep[c].length);
    if(empty.length && !confirm('No projects are ticked for ' + empty.join(', ') + ', so ' + (u.name || u.email) +
       ' will see nothing there. Save anyway?')) return;
    set('perm-status', 'Saving…');
    try {
      await AxisDb.saveUser(out, by());
      Object.assign(u, out);
      draft = null;
      describeState();
      pick(u.email);
      set('perm-status', 'Saved. ' + (u.name || u.email) + ' gets it the next time they open or reload the app.', 'ok');
    } catch(err){ set('perm-status', 'Not saved — ' + err.message, 'err'); }
  });

  document.getElementById('perm-new-save').addEventListener('click', async () => {
    const level = document.getElementById('perm-new-level').value;
    const offices = document.getElementById('perm-new-offices').value === '*' ? ['*'] : [];
    try {
      await AxisDb.setSetting('new_user', { level: level, offices: offices }, by());
      set('perm-new-status', 'Saved. New sign-ins start as ' + LABELS[level] + (level !== 'none' ? ', ' + (offices.length ? 'every office' : 'no offices until set') : '') + '.', 'ok');
    } catch(err){ set('perm-new-status', 'Not saved — ' + err.message, 'err'); }
  });

  // called each time Administrator settings is opened
  function prepare(){
    let last = 'flows';
    try { last = sessionStorage.getItem(TAB_KEY) || 'flows'; } catch(e){}
    showTab(last);
  }

  return { prepare: prepare, showTab: showTab };
})();
