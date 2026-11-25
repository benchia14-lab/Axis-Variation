/* ============================================================================
   IMPORT FROM SHAREPOINT — the project register and the variation history
   ============================================================================
   Administrator settings → E. Reads the two lists as exported to CSV and puts
   them into Supabase: register rows become projects in their office's setup,
   history rows become variations in the log. Column names are matched the way
   the flows' replies always were (Flows.ALIASES), so a display-name export
   ("Head Contractor") and an internal-name one (HeadContractor) both read.

   Re-runnable: a project already there (same office, and the same register ID
   or the same name) is left alone, and a variation is saved over its own row.
============================================================================ */

const Importer = (function(){

  const status = document.getElementById('imp-status');
  const logList = document.getElementById('imp-log');
  const files = { projects: null, history: null };
  const say = (t, cls) => { status.textContent = t || ''; status.className = 'status-line' + (cls ? ' ' + cls : ''); };
  const note = text => { const li = document.createElement('li'); li.textContent = text; logList.appendChild(li); };

  // CSV text -> rows keyed by the header, every value a string
  function readCsv(text){
    const wb = XLSX.read(text, { type: 'string', raw: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true }).map(row => {
      const out = {};
      Object.keys(row).forEach(k => { out[k] = String(row[k] === null || row[k] === undefined ? '' : row[k]); });
      return out;
    });
  }

  // a column of the export, by any spelling of its name
  function col(row, names){
    const index = {};
    Object.keys(row).forEach(k => { const n = Flows.normKey(k); if(index[n] === undefined) index[n] = row[k]; });
    for(const name of names){
      const v = index[Flows.normKey(name)];
      if(v !== undefined && String(v).trim() !== '') return String(v).replace(/\t/g, '').trim();
    }
    return '';
  }

  const money = v => {
    const t = String(v || '').replace(/[$,\s]/g, '');
    return t && !isNaN(Number(t)) ? Number(t) : null;
  };
  // SharePoint exports Australian dates: 4/11/2026 is the 4th of November
  function auDate(v){
    const t = String(v || '').trim();
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(t);
    if(m){
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 12), Number(m[5] || 0));
      return isNaN(d) ? null : d;
    }
    if(/^\d{4}-\d{2}-\d{2}/.test(t)){ const d = new Date(t); return isNaN(d) ? null : d; }
    return null;
  }
  const isoDay = d => d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : null;

  async function run(){
    if(typeof AxisDb === 'undefined' || !AxisDb.on()){ say('Supabase is not configured in this copy of the app.', 'err'); return; }
    if(!files.projects && !files.history){ say('Drop the project register CSV, the variation history CSV, or both.', 'err'); return; }
    const fallback = document.getElementById('imp-office').value;
    const button = document.getElementById('imp-run');
    button.disabled = true;
    logList.innerHTML = '';
    const known = {};   // office -> its projects in Supabase
    const projectsIn = async code => known[code] || (known[code] = await AxisDb.listProjects(code));
    const counts = { projectsAdded: 0, projectsThere: 0, fromHistory: 0, variations: 0, failed: 0 };

    // the project in Supabase a SharePoint row means: same register ID, or same name
    const find = (list, legacyId, title) => list.find(p => legacyId && String(p.legacyId) === String(legacyId)) ||
      list.find(p => title && p.project.trim().toLowerCase() === title.trim().toLowerCase());

    try {
      if(files.projects){
        const rows = readCsv(await files.projects.text());
        say('Projects: ' + rows.length + ' rows to look at…');
        for(const row of rows){
          const p = Flows.normaliseProject(row, 0);
          const code = (col(row, ['State']) || fallback).toUpperCase();
          const legacyId = col(row, ['ID', 'Id']);
          if(!p.project.trim()) continue;
          const list = await projectsIn(code);
          if(find(list, legacyId, p.project)){ counts.projectsThere++; continue; }
          const active = col(row, ['Active']);
          const saved = await AxisDb.saveProject({
            state: code, project: p.project.trim(), projectNumber: p.projectNumber || '', headContractor: p.headContractor,
            recipientAddress: p.recipientAddress, attention: p.attention, issuedBy: p.issuedBy, position: p.position,
            pmEmail: p.pmEmail, folderPath: p.folderRaw || col(row, ['FolderPath', 'Folder Path']), siteUrl: p.siteUrl || '',
            clauseRef: p.clauseRef || '', active: !/^(no|false|0)$/i.test(active), legacyId: legacyId,
            createdBy: 'SharePoint import'
          });
          list.push(saved);
          counts.projectsAdded++;
        }
        note(counts.projectsAdded + ' project' + (counts.projectsAdded === 1 ? '' : 's') + ' set up' +
          (counts.projectsThere ? '; ' + counts.projectsThere + ' already there, left as they were' : '') + '.');
      }

      if(files.history){
        const rows = readCsv(await files.history.text());
        for(let i = 0; i < rows.length; i++){
          const row = rows[i];
          const r = Flows.normaliseLogRow(row, i);
          if(!r.variationRef) continue;
          say('Variations: ' + (i + 1) + ' of ' + rows.length + '…');
          const code = (r.state || fallback).toUpperCase();
          const title = col(row, ['Title', 'Project']);
          const list = await projectsIn(code);
          let project = find(list, r.projectId, title);
          if(!project){
            // the register export did not have it (another office, usually):
            // set it up from what the variation says about it
            project = await AxisDb.saveProject({
              state: code, project: title || 'Project ' + r.projectId, headContractor: col(row, ['HeadContractor']),
              recipientAddress: col(row, ['RecipientAddress']), attention: col(row, ['Attention']),
              issuedBy: col(row, ['IssuedBy']), position: col(row, ['Position']), folderPath: col(row, ['FolderPath']),
              legacyId: r.projectId, createdBy: 'SharePoint import (from the variation history)'
            });
            list.push(project);
            counts.fromHistory++;
          }
          // the saved form names its project by the SharePoint ID; point it at the new one
          let payload = r.state_ ? JSON.parse(JSON.stringify(r.state_)) : null;
          if(payload){ payload.projectId = project.id; payload.office = code; }
          const updated = auDate(col(row, ['UpdatedAt', 'Modified']));
          const issued = auDate(col(row, ['DownloadedAt']));
          try {
            await AxisDb.writeVariation({
              state: code, projectId: project.id, variationRef: r.variationRef,
              baseRef: col(row, ['BaseRef']), revision: col(row, ['Revision']), project: title,
              projectNumber: col(row, ['ProjectNumber']), variationDescription: col(row, ['VariationDescription', 'Description']),
              headContractor: col(row, ['HeadContractor']), recipientAddress: col(row, ['RecipientAddress']),
              attention: col(row, ['Attention']), issuedBy: col(row, ['IssuedBy']), position: col(row, ['Position']),
              pmEmail: col(row, ['PmEmail']), siteInstructionRef: col(row, ['SiteInstructionRef']),
              clauseRef: col(row, ['ClauseRef']), aconexRef: col(row, ['AconexRef']),
              contractorDirection: col(row, ['ContractorDirection']), emailRef: col(row, ['EmailRef']),
              descriptionOfWorks: col(row, ['DescriptionOfWorks']), notes: col(row, ['Notes']),
              drawingsText: col(row, ['DrawingsText']), daySheetsText: col(row, ['DaySheetsText']),
              folderPath: col(row, ['FolderPath']), status: Flows.rowStatus(r).status,
              valueExGst: money(col(row, ['ValueExGst'])), approvedValue: money(col(row, ['ApprovedValue'])),
              approvedDate: isoDay(auDate(col(row, ['ApprovedDate']))),
              builderCommentary: col(row, ['BuilderCommentary']),
              deleted: !!(payload && payload.deleted),
              downloadedAt: issued ? issued.toISOString() : undefined,
              updatedAt: (updated || new Date()).toISOString(),
              payload: payload ? JSON.stringify(payload) : undefined
            });
            counts.variations++;
          } catch(err){
            counts.failed++;
            note(code + ' ' + r.variationRef + ' was not imported — ' + (err.message || 'Supabase refused it'));
          }
        }
        note(counts.variations + ' variation' + (counts.variations === 1 ? '' : 's') + ' in the log' +
          (counts.fromHistory ? '; ' + counts.fromHistory + ' project' + (counts.fromHistory === 1 ? '' : 's') +
            ' set up from the history, not being in the register export' : '') + '.');
        const attached = rows.filter(row => Number(col(row, ['Attachments'])) > 0).length;
        if(attached) note(attached + ' of them had a variation file attached in SharePoint. Those files do not come across in a CSV: ' +
          'reopen each variation, open its file from the SharePoint list with "open a file from this computer", and press ' +
          '"Attach to the log now" on the review tab to store it here.');
      }
      // the office open in the app reads its projects again, imported ones included
      if(currentState){ projectsLoading = loadProjects(); await projectsLoading; }
      say(counts.failed ? 'Imported, with ' + counts.failed + ' problem' + (counts.failed === 1 ? '' : 's') + ' — see below.' : 'Imported.',
          counts.failed ? 'err' : 'ok');
    } catch(err){
      say('The import stopped — ' + (err.message || 'something went wrong') + ' What was imported before it stopped is kept; run it again to carry on.', 'err');
    } finally {
      button.disabled = false;
    }
  }

  function takeFile(which, file){
    if(!file) return;
    files[which] = file;
    document.getElementById('imp-' + which + '-name').textContent = file.name;
  }

  ['projects', 'history'].forEach(which => {
    const zone = document.getElementById('imp-' + which + '-zone');
    const input = document.getElementById('imp-' + which);
    input.addEventListener('change', () => takeFile(which, input.files[0]));
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('over');
      if(e.dataTransfer && e.dataTransfer.files.length) takeFile(which, e.dataTransfer.files[0]);
    });
  });
  document.getElementById('imp-run').addEventListener('click', run);

  // the offices to choose from, filled when Administrator settings opens
  function prepare(){
    const pick = document.getElementById('imp-office');
    const keep = pick.value || (currentState ? currentState.code : '');
    pick.innerHTML = StateRegister.rows().map(r => '<option value="' + escapeHtml(r.code) + '">' + escapeHtml(r.code) + '</option>').join('');
    if(keep) pick.value = keep;
    document.getElementById('import-section').hidden = typeof AxisDb === 'undefined' || !AxisDb.on();
  }

  return { prepare: prepare, readCsv: readCsv };
})();
