/* ============================================================================
   THE DATABASE — projects, the variation log and files, in Supabase
   ============================================================================
   Replaces the SharePoint project register, the Variation History list and the
   flows that read and wrote them (flows 1, 4, 5, 6 and 7). flows.js routes to
   here whenever assets/supabase-config.js names a project, so the rest of the
   app asks for projects and log rows exactly as before.

   Talks to Supabase's REST and storage APIs directly with fetch: no library
   to load, and nothing here the browser could not do on its own.

     av_projects     one row per project, set up in the app
     av_variations   one row per variation (state + project + reference)
     av_offices      the office register's details, as changed in Settings
     av-files        bucket: rates/<project>/...  variation-files/<state>/<project>/...
============================================================================ */

const AxisDb = (function(){

  const cfg = (typeof SUPABASE !== 'undefined' && SUPABASE) || {};
  const on = () => !!(cfg.url && cfg.key);
  const BUCKET = 'av-files';

  function headers(extra){
    // a publishable key goes in apikey only; a legacy anon key (a JWT) also
    // has to be the bearer token
    const h = { apikey: cfg.key };
    if(/^eyJ/.test(cfg.key)) h.Authorization = 'Bearer ' + cfg.key;
    return Object.assign(h, extra || {});
  }

  async function failure(res, what){
    let detail = '';
    try {
      const body = await res.json();
      detail = body.message || body.error_description || body.error || body.msg || '';
    } catch(e){}
    const err = new Error('Supabase could not ' + what + ' (' + res.status + (detail ? ': ' + detail : '') + ').');
    err.status = res.status;
    return err;
  }

  async function call(path, opts, what){
    let res;
    try { res = await fetch(cfg.url + path, opts); }
    catch(e){ throw new Error('Supabase could not be reached to ' + what + ' — check the connection and try again.'); }
    if(!res.ok) throw await failure(res, what);
    return res;
  }

  async function rest(table, query, opts, what){
    const res = await call('/rest/v1/' + table + (query ? '?' + query : ''), opts, what);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const eq = v => 'eq.' + encodeURIComponent(String(v));

  /* ---- projects ------------------------------------------------------------ */

  // av_projects column -> the name the app uses for it (Flows.ALIASES)
  const PROJECT_FIELDS = {
    title: 'project', project_number: 'projectNumber', head_contractor: 'headContractor',
    recipient_address: 'recipientAddress', attention: 'attention', issued_by: 'issuedBy',
    position: 'position', pm_email: 'pmEmail', folder_path: 'folderPath', site_url: 'siteUrl',
    clause_ref: 'clauseRef', rates_path: 'ratesFile', rates_name: 'ratesName'
  };

  function projectToApp(row){
    const out = { id: String(row.id), state: row.state, active: row.active !== false,
                  ratesUploadedAt: row.rates_uploaded_at || '', legacyId: row.legacy_id || '' };
    Object.keys(PROJECT_FIELDS).forEach(c => { out[PROJECT_FIELDS[c]] = row[c] || ''; });
    return out;
  }

  function projectToRow(p){
    const row = {};
    Object.keys(PROJECT_FIELDS).forEach(c => {
      if(p[PROJECT_FIELDS[c]] !== undefined) row[c] = String(p[PROJECT_FIELDS[c]] || '').trim();
    });
    if(p.state !== undefined) row.state = p.state;
    if(p.active !== undefined) row.active = !!p.active;
    if(p.ratesUploadedAt !== undefined) row.rates_uploaded_at = p.ratesUploadedAt || null;
    if(p.legacyId !== undefined) row.legacy_id = p.legacyId || null;
    if(p.createdBy !== undefined) row.created_by = p.createdBy || '';
    return row;
  }

  /* What the person signed in may see and change (assets/access.js). Every
     read below is narrowed to it and every write checked against it, so the
     screens need not each remember to. `all` is for the permissions screen
     itself, which has to list every project to hand them out. */
  const access = () => (typeof Access !== 'undefined' ? Access : null);
  function mayChange(state, projectId){
    const a = access();
    if(a && !a.canEdit(state, projectId)){
      throw new Error(a.level() === 'viewer'
        ? 'You have view-only access, so nothing can be saved. Ask the administrator if you need to make changes.'
        : 'You do not have access to change ' + (projectId ? 'this project' : 'projects in ' + state) + '.');
    }
  }

  // every project for an office, inactive ones included (the caller filters)
  async function listProjects(state, opts){
    const a = access();
    if(a && !(opts && opts.all) && !a.canOffice(state)) return [];
    const rows = await rest('av_projects', 'state=' + eq(state) + '&order=title.asc', { headers: headers() }, 'read the projects');
    const out = rows.map(projectToApp);
    return a && !(opts && opts.all) ? out.filter(p => a.canProject(state, p.id)) : out;
  }

  // new when it has no id; returns the project as saved
  async function saveProject(p){
    mayChange(p.state || p.stateHint || '', p.id || '');
    const row = projectToRow(p);
    row.updated_at = new Date().toISOString();
    const opts = { method: p.id ? 'PATCH' : 'POST', body: JSON.stringify(row),
                   headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }) };
    const out = await rest('av_projects', p.id ? 'id=' + eq(p.id) : '', opts, 'save the project');
    return projectToApp(out[0]);
  }

  /* ---- the variation log ---------------------------------------------------- */

  // what the app sends the log (logPayloadFromSaved) -> av_variations columns
  const LOG_FIELDS = {
    variationRef: 'variation_ref', baseRef: 'base_ref', revision: 'revision', project: 'project',
    projectNumber: 'project_number', variationDescription: 'variation_description',
    headContractor: 'head_contractor', recipientAddress: 'recipient_address', attention: 'attention',
    issuedBy: 'issued_by', position: 'position', pmEmail: 'pm_email',
    siteInstructionRef: 'site_instruction_ref', clauseRef: 'clause_ref', aconexRef: 'aconex_ref',
    contractorDirection: 'contractor_direction', emailRef: 'email_ref',
    descriptionOfWorks: 'description_of_works', notes: 'notes', drawingsText: 'drawings_text',
    daySheetsText: 'day_sheets_text', folderPath: 'folder_path', status: 'status',
    builderCommentary: 'builder_commentary', deletedBy: 'deleted_by'
  };
  const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);

  function variationToRow(p){
    const row = { state: p.state, project_id: Number(p.projectId) };
    Object.keys(LOG_FIELDS).forEach(k => { if(p[k] !== undefined) row[LOG_FIELDS[k]] = p[k] === null ? '' : String(p[k]); });
    if(p.valueExGst !== undefined) row.value_ex_gst = num(p.valueExGst);
    if(p.approvedValue !== undefined) row.approved_value = num(p.approvedValue);
    if(p.approvedDate !== undefined) row.approved_date = p.approvedDate ? String(p.approvedDate).slice(0, 10) : null;
    if(p.deleted !== undefined) row.deleted = !!p.deleted;
    if(p.deletedAt !== undefined) row.deleted_at = p.deletedAt || null;
    // a save that does not say when it was issued leaves the date it has
    if(p.downloadedAt) row.downloaded_at = p.downloadedAt;
    if(p.payload !== undefined){
      try { row.payload = typeof p.payload === 'string' ? JSON.parse(p.payload) : p.payload; }
      catch(e){ row.payload = null; }
    }
    row.updated_at = p.updatedAt || new Date().toISOString();
    return row;
  }

  // the row as the log flow used to return it, so Flows reads it the same way
  function variationToApp(r){
    return {
      variationRef: r.variation_ref, projectId: String(r.project_id), state: r.state, project: r.project,
      variationDescription: r.variation_description, headContractor: r.head_contractor,
      issuedBy: r.issued_by, updatedAt: r.updated_at, downloadedAt: r.downloaded_at || '',
      status: r.status, valueExGst: r.value_ex_gst, approvedValue: r.approved_value,
      approvedDate: r.approved_date || '', folderPath: r.folder_path,
      payload: r.payload ? JSON.stringify(r.payload) : '',
      variationFilePath: r.variation_file_path || ''
    };
  }

  async function listVariations(state, projectId){
    const a = access();
    if(a && (!a.canOffice(state) || (projectId && !a.canProject(state, projectId)))) return [];
    const q = 'state=' + eq(state) + (projectId ? '&project_id=' + eq(projectId) : '') + '&order=updated_at.desc';
    const rows = await rest('av_variations', q, { headers: headers() }, 'read the variation log');
    const out = rows.map(variationToApp);
    return a ? out.filter(v => a.canProject(state, v.projectId)) : out;
  }

  // insert or update by office + project + reference; a file sent with it is
  // stored first and the row points at it
  async function writeVariation(p){
    const row = variationToRow(p);
    if(!row.state || !row.project_id || !row.variation_ref) throw new Error('A variation needs an office, a project and a reference to be saved.');
    mayChange(row.state, String(row.project_id));
    if(p.attachment && p.attachment.contentBase64){
      const path = ['variation-files', safe(row.state), row.project_id, safe(row.variation_ref) + '.json'].join('/');
      await upload(path, base64Bytes(p.attachment.contentBase64), 'application/json');
      row.variation_file_path = path;
    }
    const opts = { method: 'POST', body: JSON.stringify(row),
                   headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }) };
    await rest('av_variations', 'on_conflict=state,project_id,variation_ref', opts, 'save the variation');
    return { ok: true };
  }

  // the variation file stored with a row, parsed
  async function variationFile(state, projectId, variationRef){
    const a = access();
    if(a && !a.canProject(state, projectId)) throw new Error('You do not have access to this project.');
    const rows = await rest('av_variations', 'select=variation_file_path&state=' + eq(state) + '&project_id=' + eq(projectId) +
      '&variation_ref=' + eq(variationRef), { headers: headers() }, 'find the variation');
    const path = rows[0] && rows[0].variation_file_path;
    if(!path){
      const err = new Error('There is no variation file saved with ' + variationRef + '.');
      err.status = 404;
      throw err;
    }
    return JSON.parse(new TextDecoder().decode(await download(path)));
  }

  /* ---- files ---------------------------------------------------------------- */

  const safe = s => String(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'file';
  const objectUrl = path => cfg.url + '/storage/v1/object/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/');

  function base64Bytes(b64){
    const bin = atob(String(b64).replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function upload(path, bytes, type){
    await call('/storage/v1/object/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), {
      method: 'POST', body: bytes,
      headers: headers({ 'Content-Type': type || 'application/octet-stream', 'x-upsert': 'true' })
    }, 'store the file');
    return path;
  }

  async function download(path){
    let res;
    try { res = await fetch(objectUrl(path), { headers: headers() }); }
    catch(e){ throw new Error('Supabase could not be reached to fetch the file — check the connection and try again.'); }
    if(!res.ok){
      const err = await failure(res, 'fetch the file');
      if(res.status === 400 || res.status === 404) err.status = 404;
      throw err;
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  // a project's agreed schedule of rates: stored, and the project pointed at it
  async function saveRates(projectId, bytes, name){
    const path = ['rates', projectId, Date.now() + '-' + safe(name)].join('/');
    await upload(path, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return saveProject({ id: projectId, ratesFile: path, ratesName: name, ratesUploadedAt: new Date().toISOString() });
  }

  /* ---- people and what they may do ----------------------------------------- */

  const USER_COLS = 'email,name,level,offices,projects,first_seen,last_seen,updated_by,updated_at';
  const userToApp = r => ({ email: r.email, name: r.name || '', level: r.level || 'none',
    offices: Array.isArray(r.offices) ? r.offices : [], projects: r.projects && typeof r.projects === 'object' ? r.projects : {},
    firstSeen: r.first_seen || '', lastSeen: r.last_seen || '', updatedBy: r.updated_by || '', updatedAt: r.updated_at || '' });

  async function getUser(email){
    const rows = await rest('av_users', 'select=' + USER_COLS + '&email=' + eq(email), { headers: headers() }, 'read your profile');
    return rows[0] ? userToApp(rows[0]) : null;
  }
  async function listUsers(){
    const rows = await rest('av_users', 'select=' + USER_COLS + '&order=name.asc', { headers: headers() }, 'read the people');
    return rows.map(userToApp);
  }
  async function hasAdmin(){
    const rows = await rest('av_users', 'select=email&level=eq.admin&limit=1', { headers: headers() }, 'read the people');
    return rows.length > 0;
  }
  // a first sign-in: the profile, with what new people are given
  async function addUser(u){
    await rest('av_users', '', { method: 'POST', body: JSON.stringify({ email: u.email, name: u.name || '', level: u.level || 'none',
      offices: u.offices || [], projects: u.projects || {} }),
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }) }, 'create your profile');
  }
  async function touchUser(email, name){
    await rest('av_users', 'email=' + eq(email), { method: 'PATCH', body: JSON.stringify({ name: name || '', last_seen: new Date().toISOString() }),
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }) }, 'update your profile');
  }
  async function saveUser(u, by){
    await rest('av_users', 'email=' + eq(u.email), { method: 'PATCH', body: JSON.stringify({ level: u.level, offices: u.offices,
      projects: u.projects, updated_by: by || '', updated_at: new Date().toISOString() }),
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }) }, 'save the permissions');
  }
  async function getSetting(key){
    const rows = await rest('av_settings', 'select=value&key=' + eq(key), { headers: headers() }, 'read the settings');
    return rows[0] ? rows[0].value : null;
  }
  async function setSetting(key, value, by){
    await rest('av_settings', 'on_conflict=key', { method: 'POST',
      body: JSON.stringify({ key: key, value: value, updated_by: by || '', updated_at: new Date().toISOString() }),
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }) }, 'save the settings');
  }

  /* ---- the office register ------------------------------------------------- */

  // [{ code, ...fields changed from assets/state-register.js }]
  async function listOffices(){
    const rows = await rest('av_offices', 'select=code,details', { headers: headers() }, 'read the office register');
    return rows.map(r => Object.assign({}, r.details || {}, { code: r.code }));
  }

  // one row per office, replaced whole: list is [{ code, details }]
  async function saveOffices(list, by){
    const now = new Date().toISOString();
    const body = list.map(o => ({ code: o.code, details: o.details || {}, updated_by: by || '', updated_at: now }));
    await rest('av_offices', 'on_conflict=code', { method: 'POST', body: JSON.stringify(body),
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }) },
      'save the office register');
  }

  return { on: on, url: () => cfg.url, listProjects: listProjects, saveProject: saveProject, saveRates: saveRates,
           listVariations: listVariations, writeVariation: writeVariation, variationFile: variationFile,
           download: download, upload: upload, listOffices: listOffices, saveOffices: saveOffices,
           getUser: getUser, listUsers: listUsers, hasAdmin: hasAdmin, addUser: addUser, touchUser: touchUser,
           saveUser: saveUser, getSetting: getSetting, setSetting: setSetting };
})();
