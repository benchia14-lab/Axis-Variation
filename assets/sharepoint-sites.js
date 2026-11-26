/* ============================================================================
   SHAREPOINT SITES — where the PDFs can be filed
   ============================================================================
   Each project names the SharePoint site its folder is on (Project setup →
   SharePoint site), and the filing flow's Create file uses it as its Site
   Address. `offices` are the offices a new project defaults to that site for;
   an office not listed has to choose.

   To add a site, add a line here and deploy.
============================================================================ */

const SHAREPOINT_SITES = [
  { name: 'Axis Plumbing Victoria',            url: 'https://axisplumbingptyltd.sharepoint.com/sites/AXPVIC',  offices: ['VIC', 'SIXAVIC'] },
  { name: 'Axis Plumbing New South Wales',     url: 'https://axisplumbingptyltd.sharepoint.com/sites/AXP_NSW', offices: ['NSW', 'NSWSW'] },
  { name: 'Axis Plumbing Queensland',          url: 'https://axisplumbingptyltd.sharepoint.com/sites/AXPQLD',  offices: ['QLD'] },
  { name: 'Axis Services South Australia',     url: 'https://axisplumbingptyltd.sharepoint.com/sites/AXPSA',   offices: ['SA'] },
  { name: 'Axis Services WA',                  url: 'https://axisplumbingptyltd.sharepoint.com/sites/AXP_WA',  offices: ['WA'] },
  { name: 'Axis Plumbing Australian Capital Territory', url: 'https://axisplumbingptyltd.sharepoint.com/sites/AXPACT', offices: ['ACT'] },
  { name: 'Axis Plumbing New Zealand',         url: 'https://axisplumbingptyltd.sharepoint.com/sites/AXPNZ',   offices: ['NZ'] },
  { name: 'Axis Services Group Estimating',    url: 'https://axisplumbingptyltd.sharepoint.com/sites/AxisServicesGroup', offices: ['ASG'] }
];

const SharePointSites = (function(){
  const norm = u => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
  const all = () => SHAREPOINT_SITES.slice();
  // the site a new project in an office starts on, or '' to choose
  const forOffice = code => { const s = SHAREPOINT_SITES.find(x => x.offices.indexOf(code) !== -1); return s ? s.url : ''; };
  // a listed site by its address, or by the /sites/NAME part of any link
  function find(text){
    const t = norm(text);
    if(!t) return null;
    const exact = SHAREPOINT_SITES.find(s => norm(s.url) === t);
    if(exact) return exact;
    const m = /\/(sites|teams)\/([^/?#]+)/i.exec(t);
    if(!m) return null;
    return SHAREPOINT_SITES.find(s => norm(s.url).endsWith('/' + m[1] + '/' + m[2].toLowerCase())) || null;
  }
  const nameOf = url => { const s = find(url); return s ? s.name : String(url || ''); };
  return { all: all, forOffice: forOffice, find: find, nameOf: nameOf };
})();
