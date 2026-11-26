/* ============================================================================
   PROJECT SETUP — what the SharePoint project register used to hold
   ============================================================================
   With Supabase configured, a project is set up here, in its office, rather
   than in a SharePoint list: + New project on the projects page, Project setup
   on a project's dashboard. The same fields the register had, and the
   project's agreed schedule of rates dropped in as its Excel workbook.

   A project is never deleted: unticking Active takes it off the projects page
   and the project list, and the projects page offers it back.
============================================================================ */

const ProjectSetup = (function(){

  const modal = document.getElementById('ps-modal');
  const statusLine = document.getElementById('ps-status');
  const ratesNow = document.getElementById('ps-rates-now');
  const FIELDS = ['project', 'projectNumber', 'headContractor', 'attention', 'recipientAddress', 'issuedBy',
                  'position', 'pmEmail', 'clauseRef', 'folderPath', 'siteUrl'];
  const box = f => document.getElementById('ps-' + f);
  const say = (t, cls) => { statusLine.textContent = t || ''; statusLine.className = 'status-line' + (cls ? ' ' + cls : ''); };

  let editing = null;        // the project being changed, or null for a new one
  let onSaved = null;        // set by a caller that redraws its own list (Administrator settings → Projects)
  let pendingRates = null;   // { bytes, name, lines } dropped but not yet saved
  let clearRates = false;

  const on = () => typeof AxisDb !== 'undefined' && AxisDb.on();
  function el(tag, cls, html){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(html !== undefined) e.innerHTML = html;
    return e;
  }
  /* The folder the filing flow needs is a path inside the site's document
     library: /Shared Documents/15.Projects_VIC/1510V_.../11.Variations/...
     People will paste what the browser shows them instead, so anything that
     looks like a SharePoint link is cut down to that:
       ...AllItems.aspx?id=%2Fsites%2FAXPVIC%2FShared%20Documents%2F...  (the folder open in the library)
       https://x.sharepoint.com/sites/AXPVIC/Shared%20Documents/...       (the address of the folder itself)
       https://x.sharepoint.com/:f:/r/sites/AXPVIC/Shared%20Documents/... (Copy link, "people with existing access")
       Shared Documents\15.Projects_VIC\...                              (typed, or from File Explorer)
     The site name, the encoding (%20, %2F, %5F, %2E), the view and the page
     name all go; what is left starts with / and has no / at the end. */
  function cleanFolderPath(raw){
    let text = String(raw || '').trim().replace(/^["'<]+|["'>]+$/g, '');
    if(!text) return { path: '', note: '', site: '' };
    let note = '', site = '';
    const decode = v => { try { return decodeURIComponent(v); } catch(e){ return v; } };
    if(/^https?:\/\//i.test(text)){
      let url = null;
      try { url = new URL(text); } catch(e){}
      if(url){
        const inside = url.searchParams.get('id') || url.searchParams.get('RootFolder');
        if(inside) text = inside;                       // already decoded by URLSearchParams
        else {
          text = decode(url.pathname);
          // a "Copy link" address: /:f:/r/sites/... is the real path; /:f:/s/... is a code that cannot be read
          if(/^\/:[a-z]:\/s\//i.test(text)){
            return { path: '', note: 'That is a sharing link, which does not say where the folder is. Open the folder in SharePoint and copy the address from the browser instead.' };
          }
          text = text.replace(/^\/:[a-z]:\/r(?=\/)/i, '');
        }
        note = 'Cut down from the SharePoint link.';
        const named = /^\/?((?:sites|teams)\/[^/]+)/i.exec(decode(text));
        if(named) site = url.origin + '/' + named[1];
      }
    }
    text = decode(text).replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    const inPath = /^\/?((?:sites|teams)\/[^/]+)(?=\/|$)/i.exec(text);
    if(inPath && !site) site = inPath[1];
    text = text.replace(/^\/?(?:sites|teams)\/[^/]+(?=\/|$)/i, '');                 // the site
    text = text.replace(/\/Forms\/[^/]*\.aspx$/i, '').replace(/\/[^/]*\.aspx$/i, ''); // the page showing it
    text = text.split('/').map(p => p.trim()).filter(Boolean).join('/');
    const path = text ? '/' + text : '';
    if(!note && path !== String(raw).trim()) note = 'Tidied into the form the filing flow needs.';
    return { path: path, note: path ? note : '', site: site };
  }

  const folderBox = document.getElementById('ps-folderPath');
  const folderHelp = folderBox.parentNode.querySelector('.field-help');
  const folderHelpText = folderHelp.innerHTML;
  /* the site: the listed sites, plus whatever a project already names */
  const siteBox = document.getElementById('ps-siteUrl');
  function fillSites(current, office){
    const sites = typeof SharePointSites !== 'undefined' ? SharePointSites.all() : [];
    const known = current && typeof SharePointSites !== 'undefined' ? SharePointSites.find(current) : null;
    siteBox.innerHTML = '<option value="">Choose the SharePoint site…</option>' +
      sites.map(s => '<option value="' + escapeHtml(s.url) + '">' + escapeHtml(s.name) + ' — ' + escapeHtml(s.url.replace(/^https:\/\//, '')) + '</option>').join('') +
      (current && !known ? '<option value="' + escapeHtml(current) + '">' + escapeHtml(current) + '</option>' : '');
    siteBox.value = known ? known.url : (current || (typeof SharePointSites !== 'undefined' ? SharePointSites.forOffice(office) : ''));
  }
  // a site named in a pasted link: one of the list, or added to it
  function pickSite(text){
    if(!text || typeof SharePointSites === 'undefined') return '';
    const s = SharePointSites.find(text);
    if(s){ siteBox.value = s.url; return s.name; }
    const full = /^https?:/i.test(text) ? text : 'https://axisplumbingptyltd.sharepoint.com/' + text.replace(/^\//, '');
    fillSites(full, '');
    return full;
  }

  function tidyFolderBox(){
    const out = cleanFolderPath(folderBox.value);
    if(out.path && out.path !== folderBox.value) folderBox.value = out.path;
    const siteName = out.site ? pickSite(out.site) : '';
    if(siteName) out.note = (out.note ? out.note + ' ' : '') + 'Site: ' + siteName + '.';
    folderHelp.innerHTML = out.note
      ? '<span class="' + (out.path ? 'ok' : 'err') + '">' + escapeHtml(out.note) + '</span> ' + folderHelpText
      : folderHelpText;
  }
  folderBox.addEventListener('change', tidyFolderBox);
  folderBox.addEventListener('paste', () => setTimeout(tidyFolderBox, 0));

  const whoAmI = () => (window.AXIS_USER && (window.AXIS_USER.name || window.AXIS_USER.username)) || '';

  function describeRates(){
    ratesNow.innerHTML = '';
    if(pendingRates){
      ratesNow.innerHTML = '<span class="ok">✓ <b>' + escapeHtml(pendingRates.name) + '</b> — ' + pendingRates.lines +
        ' rate' + (pendingRates.lines === 1 ? '' : 's') + ' read. It is stored when you save.</span>';
    } else if(editing && editing.ratesFile && !clearRates){
      ratesNow.innerHTML = 'In use: <b>' + escapeHtml(editing.ratesName || editing.ratesFile.split('/').pop()) + '</b>' +
        (editing.ratesUploadedAt ? ', added ' + escapeHtml(new Date(editing.ratesUploadedAt).toLocaleDateString('en-AU')) : '') +
        '. Drop another workbook to replace it.';
    } else {
      ratesNow.textContent = 'None — the project is priced at the master rates.';
    }
    if(pendingRates || (editing && editing.ratesFile && !clearRates)){
      const rm = el('button', 'link-btn', pendingRates ? 'Undo' : 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', () => {
        if(pendingRates) pendingRates = null; else clearRates = true;
        describeRates();
      });
      ratesNow.appendChild(rm);
    }
  }

  function open(project, opts){
    if(!on()) return;
    editing = project || null;
    onSaved = (opts && opts.onSaved) || null;
    pendingRates = null;
    clearRates = false;
    document.getElementById('ps-kicker').textContent = project ? 'Project setup' : 'New project · ' + (currentState ? currentState.code : '');
    document.getElementById('ps-title').textContent = project ? (project.project || 'Project') : 'Set up a project';
    fillSites(project ? project.siteUrl : '', project ? project.state : (currentState ? currentState.code : ''));
    FIELDS.forEach(f => { if(f !== 'siteUrl') box(f).value = project ? (project[f] || '') : ''; box(f).classList.remove('field-invalid'); });
    document.getElementById('ps-active').checked = project ? project.active !== false : true;
    describeRates();
    folderHelp.innerHTML = folderHelpText;
    say('');
    modal.hidden = false;
    setTimeout(() => box('project').focus(), 0);
  }

  function close(){ modal.hidden = true; editing = null; pendingRates = null; }

  // a workbook dropped in is read here, so a file that is not a schedule of
  // rates is turned away before anything is stored
  async function takeRates(file){
    if(!file) return;
    say('Reading ' + file.name + '…');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const read = AgreedRates.readWorkbook(bytes);
      pendingRates = { bytes: bytes, name: file.name, lines: read.count };
      clearRates = false;
      say('');
    } catch(err){
      say(file.name + ' was not used — ' + (err.message || 'it could not be read') + '.', 'err');
    }
    describeRates();
  }

  async function save(){
    const values = {};
    tidyFolderBox();
    FIELDS.forEach(f => { values[f] = box(f).value.trim(); });
    if(!values.project){
      box('project').classList.add('field-invalid');
      box('project').focus();
      say('Give the project a name.', 'err');
      return;
    }
    if(values.folderPath && !cleanFolderPath(values.folderPath).path){
      folderBox.classList.add('field-invalid');
      folderBox.focus();
      say('The PDF folder is a sharing link, which does not say where the folder is — paste the address from the browser with the folder open.', 'err');
      return;
    }
    folderBox.classList.remove('field-invalid');
    if(values.folderPath && !values.siteUrl){
      siteBox.classList.add('field-invalid');
      siteBox.focus();
      say('Choose the SharePoint site the folder is on.', 'err');
      return;
    }
    siteBox.classList.remove('field-invalid');
    const code = editing ? editing.state : (currentState && currentState.code);
    if(!code){ say('Pick an office first.', 'err'); return; }
    const button = document.getElementById('ps-save');
    button.disabled = true;
    say('Saving…');
    try {
      const change = Object.assign(values, { active: document.getElementById('ps-active').checked });
      if(editing){ change.id = editing.id; change.stateHint = editing.state || code; }
      else { change.state = code; change.createdBy = whoAmI(); }
      if(clearRates && !pendingRates) Object.assign(change, { ratesFile: '', ratesName: '', ratesUploadedAt: null });
      let saved = await AxisDb.saveProject(change);
      if(pendingRates){
        say('Saving the schedule of rates…');
        saved = await AxisDb.saveRates(saved.id, pendingRates.bytes, pendingRates.name);
      }
      const wasNew = !editing, then = onSaved;
      close();
      if(then){ then(saved); return; }
      await refresh(code);
      if(wasNew && saved.active) location.hash = '#/state/' + encodeURIComponent(code) + '/project/' + encodeURIComponent(saved.id);
    } catch(err){
      say('Not saved — ' + (err.message || 'Supabase did not answer') + ' Nothing on the form was lost.', 'err');
    } finally {
      button.disabled = false;
    }
  }

  // the projects everyone sees, read again, and the page on screen redrawn
  async function refresh(code){
    if(currentState && currentState.code === code){
      projectsLoading = loadProjects();
      await projectsLoading;
    }
    routeFromHash();
  }

  /* ---- hooks the dashboard calls ---------------------------------------------- */

  // the projects page: + New project, and any inactive projects to bring back
  async function onProjectsPage(code){
    document.getElementById('pj-new').hidden = !on();
    const holder = document.getElementById('pj-inactive');
    holder.hidden = true;
    holder.innerHTML = '';
    if(!on()) return;
    let all;
    try { all = await AxisDb.listProjects(code); } catch(e){ return; }
    if(!currentState || currentState.code !== code) return;
    const inactive = all.filter(p => !p.active);
    if(!inactive.length) return;
    holder.appendChild(document.createTextNode('Inactive: '));
    inactive.forEach((p, i) => {
      const b = el('button', 'link-btn', escapeHtml(p.project));
      b.type = 'button';
      b.title = 'Open its setup to make it active again';
      b.addEventListener('click', () => open(p));
      holder.appendChild(b);
      if(i < inactive.length - 1) holder.appendChild(document.createTextNode(' · '));
    });
    holder.hidden = false;
  }

  // a project's dashboard: Project setup, for that project
  function onProjectPage(project){
    const b = document.getElementById('db-edit-project');
    b.hidden = !on() || !project;
    b.onclick = () => open(project);
  }

  document.getElementById('pj-new').addEventListener('click', () => open(null));
  document.getElementById('ps-save').addEventListener('click', save);
  document.getElementById('ps-cancel').addEventListener('click', close);
  document.getElementById('ps-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if(e.target === modal) close(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !modal.hidden) close(); });

  const zone = document.getElementById('ps-rates-zone');
  const input = document.getElementById('ps-rates-file');
  input.addEventListener('change', () => { takeRates(input.files[0]); input.value = ''; });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('over');
    if(e.dataTransfer && e.dataTransfer.files.length) takeRates(e.dataTransfer.files[0]);
  });

  return { open: open, onProjectsPage: onProjectsPage, onProjectPage: onProjectPage, cleanFolderPath: cleanFolderPath };
})();
