/* ============================================================================
   DAY SHEETS — read off the signed sheet, checked, then put on the variation
   ============================================================================
   A day sheet variation is built from the signed day sheets. Each one dropped
   on the cover sheet is shown beside what could be read off it -- the day
   sheet number, the date, the description of the works and who approved it --
   in boxes that can be corrected. Only when someone presses Verified does it
   go into the day sheet table, with the file attached under it on the
   Documentation step. Nothing read off a sheet goes onto a variation unseen.

   Reading it:
     a PDF with text in it   the text, as pdf.js gives it
     a scan, photo or a PDF  OCR in the browser (Tesseract, vendor/tesseract),
     with no text            loaded the first time it is needed; nothing is
                             sent anywhere

   Day sheets are filled in by hand as often as not, and handwriting reads
   poorly, so the fields are a starting point: each says whether it was found
   on the sheet, and the text that was read is there to look at.
============================================================================ */

const DaySheets = (function(){

  const modal = document.getElementById('dsr-modal');
  const view = document.getElementById('dsr-view');
  const status = document.getElementById('dsr-status');
  const FIELDS = ['number', 'date', 'description', 'approvedBy'];
  const box = f => document.getElementById('dsr-' + f);
  const say = (t, cls) => { status.textContent = t || ''; status.className = 'status-line' + (cls ? ' ' + cls : ''); };

  let queue = [];          // files waiting to be checked
  let current = null;      // { file }
  let busy = false;

  function el(tag, cls, html){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(html !== undefined) e.innerHTML = html;
    return e;
  }

  /* ---- reading the text off a sheet ------------------------------------------ */

  // text a PDF already holds, one line per row of the page
  async function pdfText(doc){
    const pages = [];
    for(let n = 1; n <= doc.numPages; n++){
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const rows = [];
      content.items.forEach(it => {
        const y = Math.round(it.transform[5]);
        let row = rows.find(r => Math.abs(r.y - y) <= 3);
        if(!row){ row = { y: y, parts: [] }; rows.push(row); }
        row.parts.push({ x: it.transform[4], s: it.str });
      });
      rows.sort((a, b) => b.y - a.y);
      pages.push(rows.map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean).join('\n'));
    }
    return pages.join('\n');
  }

  // Tesseract, loaded the first time a sheet needs it
  let ocrWorker = null;
  function loadScript(src){
    return new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => bad(new Error('the text reader did not load'));
      document.head.appendChild(s);
    });
  }
  async function ocr(image){
    if(!ocrWorker){
      say('Getting the text reader ready (the first sheet takes a few seconds)…');
      if(typeof Tesseract === 'undefined') await loadScript('vendor/tesseract/tesseract.min.js');
      const base = new URL('vendor/tesseract/', location.href).href;
      ocrWorker = await Tesseract.createWorker('eng', 1, {
        workerPath: base + 'worker.min.js',
        // the one build vendored: every current browser runs WebAssembly SIMD, and naming the file
        // stops Tesseract looking for builds that are not shipped
        corePath: base + 'tesseract-core-simd-lstm.wasm.js',
        langPath: base + 'lang',
        gzip: false,
        logger: m => { if(m.status === 'recognizing text') say('Reading the day sheet… ' + Math.round((m.progress || 0) * 100) + '%'); }
      });
    }
    say('Reading the day sheet…');
    const result = await ocrWorker.recognize(image);
    return result.data.text || '';
  }

  /* ---- finding the fields in the text ------------------------------------------ */

  const tidy = s => String(s || '').replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const NAME = "([A-Z][A-Za-z'’.-]+(?:[ \\t]+[A-Z][A-Za-z'’.-]+){0,3})";
  const LABELS = /^(day\s*sheet|docket|date|job|project|site|client|builder|contractor|approved|authori[sz]ed|signed|signature|supervisor|foreman|description|works?|details|tasks?|labou?r|materials?|plant|hours|total|time|name|position|ref)\b/i;

  function findNumber(text){
    const pats = [
      /(?:day\s*sheet|daysheet|day\s*work(?:s)?\s*(?:docket|sheet)?|docket|dw)\s*(?:no\.?|number|num|#|ref)?\s*[:#.\-]?\s*([A-Z]{0,4}[-\s]?\d[\w\-\/]*)/i,
      /\b(DS[-\s]?\d+[\w\-]*)\b/i,
      /\b(?:sheet|ref(?:erence)?)\s*(?:no\.?|number|#)\s*[:#.\-]?\s*([A-Z0-9][\w\-\/]*)/i,
      /\bNo\.?\s*[:#]?\s*(\d{3,})\b/i
    ];
    for(const p of pats){ const m = p.exec(text); if(m) return tidy(m[1]).replace(/\s+/g, '-'); }
    return '';
  }

  function findDate(text){
    const m = /(?:date|dated|day)\s*[:\-]?\s*(\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4})/i.exec(text) ||
      /\b(\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4})\b/.exec(text) ||
      /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{2,4})\b/i.exec(text);
    return m ? tidy(m[1]).replace(/\s*([\/.\-])\s*/g, '$1') : '';
  }

  // the label is found whatever its case; the name after it must start with capitals
  const APPROVER_LABELS = [
    /(?:approved|authori[sz]ed|signed\s*off|verified|accepted)(?:\s*by)?(?:\s*\(?print\)?|\s*name)?\s*[:\-]?[ \t]*/ig,
    /(?:client|builder'?s?|site)\s*(?:rep(?:resentative)?|manager|supervisor|foreman)(?:\s*name)?\s*[:\-]?[ \t]*/ig,
    /(?:supervisor|site\s*manager|foreman)(?:\s*name)?\s*[:\-]?[ \t]*/ig
  ];
  function findApprover(text){
    for(const label of APPROVER_LABELS){
      label.lastIndex = 0;
      let m;
      while((m = label.exec(text))){
        const after = new RegExp('^' + NAME).exec(text.slice(m.index + m[0].length));
        // a label read straight after the one asked for is not a name
        if(after && !LABELS.test(after[1])) return tidy(after[1]);
        if(!m[0].length) label.lastIndex++;
      }
    }
    return '';
  }

  function findDescription(text){
    const lines = text.split(/\r?\n/).map(tidy).filter(Boolean);
    const at = lines.findIndex(l => /^(description(?:\s*of\s*works?)?|works?\s*(?:carried\s*out|performed|completed|undertaken)|details?\s*of\s*works?|work\s*description|task(?:s)?\s*(?:performed)?)\b/i.test(l));
    if(at !== -1){
      const first = lines[at].replace(/^[^:\-]*[:\-]\s*/, (lead) => /[:\-]\s*$/.test(lead) ? '' : lead).trim();
      const rest = [];
      for(let i = at + 1; i < lines.length && rest.length < 6; i++){
        if(LABELS.test(lines[i]) && !/^works?\b/i.test(lines[i])) break;
        rest.push(lines[i]);
      }
      const head = /^(description|works?|details?|task)/i.test(first) && !/[:\-]/.test(lines[at]) ? '' : first;
      return [head, ...rest].filter(Boolean).join(' ').replace(/^(description(?:\s*of\s*works?)?|work\s*description)\s*/i, '').trim();
    }
    // no heading found: the longest line that is not a label
    return lines.filter(l => !LABELS.test(l) && l.length > 20).sort((a, b) => b.length - a.length)[0] || '';
  }

  function extract(text){
    return { number: findNumber(text), date: findDate(text), description: findDescription(text), approvedBy: findApprover(text) };
  }

  /* ---- showing a sheet ---------------------------------------------------------- */

  async function show(file){
    current = { file: file };
    view.innerHTML = '';
    FIELDS.forEach(f => { box(f).value = ''; document.getElementById('dsr-' + f + '-found').textContent = ''; });
    document.getElementById('dsr-text').textContent = '';
    document.getElementById('dsr-sub').textContent = file.name + (queue.length ? ' · ' + queue.length + ' more after this one' : '');
    document.getElementById('dsr-verify').disabled = true;
    modal.hidden = false;
    say('Opening ' + file.name + '…');

    let text = '';
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if(isPdf){
        if(typeof pdfjsLib === 'undefined') throw new Error('the PDF viewer did not load');
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const canvases = [];
        for(let n = 1; n <= Math.min(doc.numPages, 4); n++){
          const page = await doc.getPage(n);
          const vp = page.getViewport({ scale: 2 });
          const c = el('canvas', 'dsr-page');
          c.width = Math.floor(vp.width);
          c.height = Math.floor(vp.height);
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          view.appendChild(c);
          canvases.push(c);
        }
        text = await pdfText(doc);
        // a scanned PDF has no text of its own: read the pages as pictures
        if(text.replace(/\s/g, '').length < 25){
          text = '';
          for(const c of canvases) text += (await ocr(c)) + '\n';
        }
        doc.destroy();
      } else {
        const url = URL.createObjectURL(file);
        const img = el('img', 'dsr-page');
        img.src = url;
        img.alt = file.name;
        view.appendChild(img);
        await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('the picture could not be opened')); });
        text = await ocr(img);
      }
    } catch(err){
      console.error(err);
      say('Could not read the text off it (' + String((err && err.message) || err || 'it could not be opened') + '). Fill in the boxes from the sheet.', 'err');
    }

    document.getElementById('dsr-text').textContent = text.trim() || '(no text could be read)';
    const found = extract(text);
    FIELDS.forEach(f => {
      box(f).value = found[f];
      const tag = document.getElementById('dsr-' + f + '-found');
      tag.textContent = found[f] ? 'read from the sheet' : 'not found — fill in';
      tag.className = 'dsr-found ' + (found[f] ? 'ok' : 'missing');
    });
    const got = FIELDS.filter(f => found[f]).length;
    if(text.trim()) say(got === FIELDS.length
      ? 'Everything was found. Check each box against the sheet, then press Verified.'
      : got + ' of ' + FIELDS.length + ' found. Check them against the sheet and fill in the rest, then press Verified.',
      got === FIELDS.length ? 'ok' : '');
    document.getElementById('dsr-verify').disabled = false;
    box(found.number ? 'description' : 'number').focus();
  }

  async function next(){
    if(busy) return;
    if(!queue.length){ close(); return; }
    busy = true;
    try { await show(queue.shift()); } finally { busy = false; }
  }

  function close(){
    modal.hidden = true;
    current = null;
    queue = [];
    view.innerHTML = '';
  }

  async function verify(){
    if(!current) return;
    const v = {};
    FIELDS.forEach(f => { v[f] = box(f).value.trim(); });
    if(!v.number){ box('number').classList.add('field-invalid'); box('number').focus(); say('Give it its day sheet number.', 'err'); return; }
    box('number').classList.remove('field-invalid');
    const already = collectDaySheets().find(d => d.number.toUpperCase() === v.number.toUpperCase());
    if(already && !confirm('Day sheet ' + v.number + ' is already on this variation. Add it again?')) return;
    // into the first empty row of the table, or a new one
    const rows = Array.from(dsRowsContainer.children);
    const row = rows.find(r => !r.querySelector('.ds-number').value.trim() && !r.querySelector('.ds-desc').value.trim()) || addDsRow();
    row.querySelector('.ds-number').value = v.number;
    row.querySelector('.ds-desc').value = [v.date, v.description].filter(Boolean).join(' — ');
    row.querySelector('.ds-by').value = v.approvedBy;
    renderDsPreview();
    // a day sheet variation with nothing written yet says what it is
    if(variationType === 'daysheet' && !els['desc-final'].value.trim()){
      els['desc-final'].value = 'Works carried out as day works, as recorded on the signed day sheets listed below and attached.';
    }
    render();
    const file = current.file;
    say('Added. Attaching the sheet…');
    try { await Stages.attachDaySheet(file, v.number); } catch(e){ console.error(e); }
    next();
  }

  function take(files){
    const list = Array.prototype.slice.call(files || []).filter(f => /^image\//.test(f.type) || f.type === 'application/pdf' || /\.(pdf|png|jpe?g|webp|bmp)$/i.test(f.name));
    if(!list.length) return;
    queue = queue.concat(list);
    if(modal.hidden) next();
    else document.getElementById('dsr-sub').textContent = current.file.name + ' · ' + queue.length + ' more after this one';
  }

  const zone = document.getElementById('ds-drop');
  const input = document.getElementById('ds-drop-file');
  input.addEventListener('change', () => { const f = Array.prototype.slice.call(input.files); input.value = ''; take(f); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('over');
    if(e.dataTransfer && e.dataTransfer.files.length) take(e.dataTransfer.files);
  });
  document.getElementById('dsr-verify').addEventListener('click', verify);
  document.getElementById('dsr-skip').addEventListener('click', next);
  document.getElementById('dsr-close').addEventListener('click', () => {
    if(queue.length && !confirm('Stop checking? The ' + queue.length + ' day sheet' + (queue.length === 1 ? '' : 's') + ' still to check will be left out.')) return;
    close();
  });

  return { take: take, extract: extract };
})();
