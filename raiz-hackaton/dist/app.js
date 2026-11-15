'use strict';
const $ = selector => document.querySelector(selector);
const statuses = ['Pendiente', 'En curso', 'Hecho'];
let tasks = [], signature = '', busy = 0;
const status = (message, error = false) => { $('#sync-status').textContent = message; $('#sync-status').classList.toggle('error', error); };
async function api(path = '/api/tasks', options = {}) {
  const response = await fetch(path, {cache:'no-store', ...options, headers:{'Content-Type':'application/json', ...options.headers}});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No se pudo guardar el cambio');
  return body;
}
function render() {
  const filter = $('#filter').value;
  const visible = tasks.filter(task => filter === 'Todas' || task.status === filter);
  const list = $('#task-list');
  list.replaceChildren();
  for (const task of visible) {
    const row = document.createElement('tr');
    if (task.status === 'Hecho') row.className = 'done';
    for (const value of [task.title, task.area]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    const ownerCell = document.createElement('td');
    const owner = document.createElement('input');
    owner.value = task.owner; owner.placeholder = 'Sin asignar'; owner.maxLength = 80;
    owner.setAttribute('aria-label', `Responsable: ${task.title}`);
    owner.addEventListener('change', () => update(task.id, 'owner', owner.value, owner));
    ownerCell.append(owner); row.append(ownerCell);
    const stateCell = document.createElement('td');
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Estado: ${task.title}`);
    for (const value of statuses) { const option = document.createElement('option'); option.value = value; option.textContent = value; select.append(option); }
    select.value = task.status;
    select.addEventListener('change', () => update(task.id, 'status', select.value, select));
    stateCell.append(select); row.append(stateCell); list.append(row);
  }
  if (!visible.length) { const row=document.createElement('tr'); const cell=document.createElement('td'); cell.colSpan=4; cell.className='empty'; cell.textContent='No hay tareas en este estado.'; row.append(cell); list.append(row); }
  const done = tasks.filter(task => task.status === 'Hecho').length;
  const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  $('#progress-bar').style.width = `${percent}%`;
  $('.progress').setAttribute('aria-valuenow', percent);
  $('#progress-label').textContent = `${done} de ${tasks.length} tareas completadas · ${percent}%`;
  $('#task-count').textContent = `${visible.length} visibles de ${tasks.length}`;
}
async function refresh(force = false) {
  if (!force && (busy || $('#task-list').contains(document.activeElement))) return;
  try {
    const fresh = await api();
    const next = JSON.stringify(fresh);
    tasks = fresh;
    if (next !== signature || force) { signature = next; render(); }
    status('Tablero compartido conectado · Los cambios se guardan en el servidor.');
  } catch (error) {
    status('Sin conexión al tablero. No se guardarán cambios hasta reconectar. ' + error.message, true);
    if (!signature) $('#task-list').innerHTML = '<tr><td colspan="4" class="empty">El tablero requiere iniciar server.py. El contenido del reto sí está disponible.</td></tr>';
  }
}
async function update(id, key, value, control) {
  busy++; control.disabled = true;
  const previous = tasks.find(task => task.id === id)?.[key];
  try {
    await api(`/api/tasks/${id}`, {method:'PATCH', body:JSON.stringify({[key]:value})});
    const task = tasks.find(task => task.id === id); if (task) task[key] = value.trim();
    signature = '';
    status('Cambio guardado.');
    // Preserve focus and controls while editing; refresh after focus leaves the row.
    const done = tasks.filter(task => task.status === 'Hecho').length;
    const percent = tasks.length ? Math.round(done/tasks.length*100) : 0;
    $('#progress-bar').style.width = `${percent}%`; $('.progress').setAttribute('aria-valuenow', percent);
    $('#progress-label').textContent = `${done} de ${tasks.length} tareas completadas · ${percent}%`;
    control.closest('tr').classList.toggle('done', task?.status === 'Hecho');
  } catch(error) { control.value = previous ?? ''; status('No se guardó el cambio. ' + error.message, true); }
  finally { busy--; control.disabled=false; }
}
$('#filter').addEventListener('change', render);
$('#new-task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const title = $('#task-title').value.trim(); if (!title) { $('#task-title').setCustomValidity('Escribe una tarea.'); $('#task-title').reportValidity(); return; }
  const button = event.currentTarget.querySelector('button'); button.disabled=true; busy++;
  try { await api('/api/tasks',{method:'POST', body:JSON.stringify({title,area:$('#task-area').value.trim() || 'Equipo'})}); $('#task-title').value=''; await refresh(true); }
  catch(error) { status('No se añadió la tarea. ' + error.message, true); }
  finally { button.disabled=false; busy--; }
});
$('#task-title').addEventListener('input',event=>event.target.setCustomValidity(''));
$('#export').addEventListener('click',async()=>{
  try {
    const current = await api();
    // JSON preserves exact content without spreadsheet formula interpretation.
    const blob = new Blob([JSON.stringify({exportado:new Date().toISOString(),tareas:current},null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob), link=document.createElement('a'); link.href=url; link.download='raiz-tareas.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('Tareas exportadas.');
  } catch(error) { status('No se pudo exportar. ' + error.message,true); }
});
const menu=$('.mobile-menu');
menu.addEventListener('click',()=>{const open=$('#navigation').classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
const links=[...document.querySelectorAll('#navigation a')];
for(const link of links) link.addEventListener('click',()=>{$('#navigation').classList.remove('open');menu.setAttribute('aria-expanded','false');});
const sections=links.map(link=>document.querySelector(link.getAttribute('href')));
const observer=new IntersectionObserver(()=>{
  const above=sections.filter(section=>section.getBoundingClientRect().top<innerHeight*.38);
  const current=(above.at(-1)||sections[0]).id;
  for(const link of links){const active=link.hash===`#${current}`;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
},{rootMargin:'-5% 0px -55% 0px',threshold:0});
sections.forEach(section=>observer.observe(section));
window.addEventListener('beforeprint',()=>document.querySelectorAll('details').forEach(detail=>detail.open=true));
refresh().then(()=>openTarget()); setInterval(()=>refresh(),5000);

function openTarget(){const t=location.hash&&document.querySelector(location.hash);if(t&&t.tagName==='DETAILS'){t.open=true;t.scrollIntoView({behavior:'instant'});}}
window.addEventListener('hashchange',openTarget);openTarget();

// These exports read the agreed project context directly from the current page.
// They do not call an AI provider or need access through the public tunnel.
function roleContext(role) {
  const read = element => {
    const copy = element.cloneNode(true);
    copy.querySelectorAll('.role-export, .task .label, .code.wrap').forEach(node => node.remove());
    copy.querySelectorAll('details').forEach(node => node.open = true);
    // The export must include collapsed task details without changing the UI.
    const serialize = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/[ \t]+/g, ' ');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const text = [...node.childNodes].map(serialize).join('');
      if (node.tagName === 'A') return `[${text.trim()}](${node.getAttribute('href')})`;
      if (node.tagName === 'LI') return `\n- ${text.trim()}\n`;
      if (node.tagName === 'TD' || node.tagName === 'TH') return `${text.trim()} | `;
      if (node.tagName === 'TR') return `\n${text}\n`;
      if (/^H[1-6]$/.test(node.tagName) || node.tagName === 'SUMMARY') return `\n\n### ${text.trim()}\n\n`;
      if (/^(P|DIV|ARTICLE|SECTION|DETAILS|TABLE|UL|OL|PRE)$/.test(node.tagName)) return `\n${text}\n`;
      return text;
    };
    return serialize(copy).replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  const title = role.querySelector('summary').textContent.trim();
  return [
    `# Raíz · ${title}`,
    'Este archivo contiene el alcance del proyecto y la ficha de mi rol. Trabaja sobre estas tareas; no necesitas abrir el enlace de Cloudflare. Si necesitas archivos de código, pídeme los concretos antes de asumir su contenido.',
    '## Alcance y canales\n' + read($('#propuesta')),
    '## Fuentes y procesamiento\n' + read($('#datos')),
    '## Rotaciones e indicadores\n' + read($('#estrategias')),
    '## Validez y límites\n' + read($('#consideraciones')),
    '## Contexto fechado, afirmaciones y reproducción\n' + read($('#ganar')),
    '## MVP, tecnologías y contrato resumido\n' + read($('#mvp')),
    '## Hitos y recortes\n' + read($('#hitos-plan')),
    '## Mis tareas y criterios de aceptación\n' + read(role),
    '## Instrucción de inicio\nEmpieza por la primera tarea de mi ficha. Plan vigente v3.1: una zona Oruro, POWER + ONI, periodos históricos/recientes, ENSO de la campaña de decisión y tres secuencias por tres posiciones (9 casos). Separar KPI de campaña y ciclo; Niño fuerte con n y sin conclusión si n<3. Contexto NOAA/IRI solo como pronóstico externo fechado; 4 de 5 solo tras reproducción D1 con punto final. Resultados precalculados; FastAPI solo si ya está integrado. Sin pronóstico a 24 h, ¿Acertamos?, POST de observaciones, Santa Cruz, Telegram ni modo offline en este MVP. Ficha, audio y boletín comparten evidencia. No inventes datos ni una validación del productor. No declares terminada una tarea sin demostrar sus criterios. Envío interno domingo 10:30–11:00, hora oficial por confirmar con organización.'
  ].join('\n\n') + '\n';
}
for (const role of document.querySelectorAll('.persona')) {
  const toolbar = document.createElement('div'); toolbar.className = 'role-export';
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'button secondary'; copy.textContent = 'Copiar contexto';
  const download = document.createElement('button'); download.type = 'button'; download.className = 'button secondary'; download.textContent = 'Descargar .md';
  const feedback = document.createElement('p'); feedback.className = 'small'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  feedback.textContent = 'Incluye tu ficha v3.1, el alcance integrado, los datos NASA/ONI, los hitos y el contrato resumido. Adjunta el .md a ChatGPT o Claude si no pueden abrir el enlace.';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(roleContext(role));
      feedback.textContent = 'Contexto copiado. Pégalo en la conversación con ChatGPT o Claude.';
    } catch {
      feedback.textContent = 'El navegador no permitió copiar. Usa Descargar .md y adjunta el archivo a la conversación.';
    }
  });
  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([roleContext(role)], {type:'text/markdown;charset=utf-8'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `raiz-${role.id}-contexto.md`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback.textContent = 'Descarga iniciada. Adjunta el archivo .md a ChatGPT o Claude.';
  });
  toolbar.append(copy, download, feedback);
  role.querySelector(':scope > div').prepend(toolbar);
}
