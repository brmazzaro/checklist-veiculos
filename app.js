'use strict';

/* Mostra erros na tela (ajuda a diagnosticar no celular) */
function mostrarErro(msg) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:8px;right:8px;top:60px;z-index:99;background:#fdecec;color:#8a1111;border:1px solid #c62828;border-radius:8px;padding:10px;font:13px monospace;white-space:pre-wrap';
  d.textContent = 'Erro: ' + msg; document.body.append(d);
}
window.addEventListener('error', e => mostrarErro(e.message + (e.lineno ? ' (linha ' + e.lineno + ')' : '')));
window.addEventListener('unhandledrejection', e => mostrarErro(String(e.reason && e.reason.message || e.reason)));

/* ---------- Dados do checklist (conforme "check list diaria veiculos.pdf", rev. 08/11/2024) ---------- */
const ITENS = [
  'Documentos do Veículo', 'Limpeza do veículo', 'Estado dos vidros', 'Espelhos retrovisores', 'Freio de mão',
  'Altura do pedal do freio', 'Pisca dianteiro direito', 'Pisca dianteiro esquerdo', 'Luz sinaleira diant. direita',
  'Luz sinaleira diant. esquerda', 'Luz baixa', 'Luz alta', 'Pisca alerta diant./ tras.', 'Luz sinaleira tras. direita',
  'Luz sinaleira tras. esquerda', 'Pisca traseiro direito', 'Pisca traseiro esquerdo', 'Buzina', 'Luz de freio',
  'Luz de ré', 'Palheta limpador para brisa', 'Água limpador para brisa', 'Nível do líquido do radiador', 'Nível do óleo',
  'Nível líquido de freio', 'Triângulo/Macaco/Chave Roda', 'Troca de pneu (furado/murcho)', 'Troca de condutor',
  'Estado dos Pneus dianteiros', 'Estado dos Pneus traseiros', 'Estado do estepe', 'Kit de Ferramenta',
  'Capô está bem fechado', 'Motor de arranque', 'Conserto do pneu'
];
const TIPOS = [['diaria', 'Inspeção Diária'], ['auditoria', 'Auditoria Interna'], ['troca', 'Inspeção p/ troca de condutor']];
const AVARIAS = [['A', 'Amassado'], ['R', 'Riscado'], ['X', 'Quebrado'], ['PF', 'Pneu furado']];
const OBS_FIXAS = [
  'Verificar o nível de combustível. O TANQUE DEVE ESTAR CHEIO.',
  'Verificar o nível do óleo. DEVE ESTAR NO NÍVEL.',
  'Verificar o nível do líquido do radiador. DEVE ESTAR NO NÍVEL.'
];
const AVISO = 'SE ALGUM DOS ÍTENS ESTIVER EM CONDIÇÕES RUINS, O MOTORISTA DEVERÁ INFORMAR IMEDIATAMENTE A GERÊNCIA, PARA TROCA OU REPARO DOS ÍTENS NECESSÁRIOS.';
const REVISAO = 'Última Revisão 08/11/2024';
const CW = 1000, CH = 636; // tamanho lógico do croqui

/* ---------- IndexedDB ---------- */
let dbp;
function db() {
  return dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('checklist-veiculos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('insp', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('insp', mode), s = t.objectStore('insp'), q = fn(s);
    t.oncomplete = () => res(q && q.result);
    t.onerror = () => rej(t.error);
  });
}
const dbAll = () => tx('readonly', s => s.getAll());
const dbPut = r => tx('readwrite', s => s.put(r));
const dbDel = id => tx('readwrite', s => s.delete(id));

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e[k] = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const pad2 = n => String(n).padStart(2, '0');
function hoje() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function brData(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }
function brMes(m) { return m ? m.split('-').reverse().join('/') : ''; }
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}
function novo() {
  const d = hoje();
  return {
    id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    status: 'rascunho', tipo: 'diaria', data: d, mesAno: d.slice(0, 7),
    veiculo: '', placa: '', km: '', condutorAnterior: '', trocaOleo: '', proximaRevisao: '',
    itens: {}, marks: [], obs: '', fotos: [], assin: { auditor: '', condutor: '', supervisor: '' },
    criado: Date.now(), atualizado: Date.now()
  };
}
const ncCount = r => ITENS.reduce((n, _, i) => n + (r.itens[i + 1] === 'NC' ? 1 : 0), 0);

/* ---------- Navegação ---------- */
let cur = null, saveT;
function setTitle(t, back) { $('#title').textContent = t; $('#btnBack').hidden = !back; }
$('#btnBack').onclick = () => flush().then(showList);
function flush() {
  clearTimeout(saveT);
  if (!cur) return Promise.resolve();
  cur.atualizado = Date.now();
  return dbPut(cur);
}
function autosave() { clearTimeout(saveT); saveT = setTimeout(flush, 500); }

/* ---------- Lista / histórico ---------- */
async function showList() {
  cur = null; setTitle('Checklist de Veículos', false);
  const all = (await dbAll()).sort((a, b) => b.atualizado - a.atualizado);
  const app = $('#app'); app.replaceChildren();
  const box = h('section', { class: 'card' }, h('h2', null, 'Inspeções'));
  if (!all.length) box.append(h('div', { class: 'empty' }, 'Nenhuma inspeção ainda.', h('br'), 'Toque em "Nova inspeção" para começar.'));
  for (const r of all) {
    const nc = ncCount(r);
    box.append(h('div', { class: 'hist' },
      h('div', { class: 'i', onclick: () => abrir(r) },
        h('b', null, `${r.placa || 'Sem placa'} · ${brData(r.data)}`,
          h('span', { class: 'tag ' + (r.status === 'final' ? 'ok' : 'dr') }, r.status === 'final' ? 'Concluída' : 'Rascunho'),
          nc ? h('span', { class: 'tag bad' }, `${nc} NC`) : null),
        h('small', null, `${TIPOS.find(t => t[0] === r.tipo)[1]}${r.veiculo ? ' · Veíc. ' + r.veiculo : ''} · ${r.fotos.length} foto(s)`)),
      h('button', { class: 'btn small sec', onclick: () => abrir(r) }, 'Abrir'),
      h('button', { class: 'btn small', onclick: () => entregarPdf(r, false) }, 'PDF'),
      h('button', { class: 'btn small danger', 'aria-label': 'Excluir', onclick: async () => { if (confirm('Excluir esta inspeção?')) { await dbDel(r.id); showList(); } } }, '✕')));
  }
  app.append(box, h('button', { class: 'btn fab', onclick: () => abrir(novo()) }, '+ Nova inspeção'));
}

/* ---------- Formulário ---------- */
function abrir(r) { cur = r; showForm(); }

function field(label, key, type = 'text', extra = {}) {
  const i = h('input', Object.assign({ type, value: cur[key] ?? '' }, extra));
  i.oninput = () => { cur[key] = i.value; autosave(); };
  return h('div', null, h('label', null, label), i);
}

function showForm() {
  setTitle('Inspeção', true);
  window.scrollTo(0, 0);
  const app = $('#app'); app.replaceChildren();

  // Identificação
  const tipoBtns = TIPOS.map(([k, n]) => h('button', { type: 'button', class: cur.tipo === k ? 'on' : '', onclick: e => {
    cur.tipo = k; tipoBtns.forEach(b => b.classList.remove('on')); e.target.classList.add('on'); autosave();
  } }, n));
  app.append(h('section', { class: 'card' }, h('h2', null, 'Identificação'),
    h('div', { class: 'seg' }, tipoBtns),
    h('div', { class: 'row' }, field('Nº Veículo', 'veiculo'), field('Placa', 'placa', 'text', { autocapitalize: 'characters', maxlength: 8 })),
    h('div', { class: 'row' }, field('Km', 'km', 'number', { inputmode: 'numeric' }), field('Data da inspeção', 'data', 'date')),
    field('Condutor anterior', 'condutorAnterior'),
    h('div', { class: 'row' }, field('Data mês/ano', 'mesAno', 'month'), field('Data troca do óleo', 'trocaOleo', 'date'))));

  // Itens
  const itens = h('section', { class: 'card' }, h('h2', null, 'Itens'),
    h('div', { class: 'warn' }, 'Legenda: C = Conforme · NC = Não conforme · N/A = Não se aplica'));
  itens.append(h('button', { class: 'btn sec small', type: 'button', onclick: () => {
    ITENS.forEach((_, i) => { if (!cur.itens[i + 1]) cur.itens[i + 1] = 'C'; });
    renderItens(lista); autosave();
  } }, 'Marcar restantes como Conforme'));
  const lista = h('div'); itens.append(lista);
  itens.append(h('label', null, 'Próxima revisão conf. KM'), (() => {
    const i = h('input', { type: 'number', inputmode: 'numeric', value: cur.proximaRevisao });
    i.oninput = () => { cur.proximaRevisao = i.value; autosave(); }; return i;
  })());
  OBS_FIXAS.forEach(t => itens.append(h('div', { class: 'warn' }, 'Obs.: ' + t)));
  itens.append(h('div', { class: 'crit' }, AVISO));
  app.append(itens);
  renderItens(lista);

  // Croqui
  app.append(croquiCard());

  // Observação
  const ta = h('textarea', { placeholder: 'Descreva problemas, avarias, ações...' }, cur.obs);
  ta.oninput = () => { cur.obs = ta.value; autosave(); };
  app.append(h('section', { class: 'card' }, h('h2', null, 'Observação'), ta));

  // Fotos
  app.append(fotosCard());

  // Assinaturas
  app.append(h('section', { class: 'card' }, h('h2', null, 'Assinaturas'),
    sigPad('Assinatura Auditor', 'auditor'),
    sigPad('Assinatura Condutor Atual', 'condutor'),
    sigPad('Assinatura Supervisor/Gerente', 'supervisor')));

  // Ações
  app.append(h('section', { class: 'card' }, h('h2', null, 'Finalizar'),
    h('button', { class: 'btn', onclick: () => finalizar(false) }, 'Concluir e gerar PDF'),
    h('button', { class: 'btn sec', onclick: () => finalizar(true) }, 'Concluir e compartilhar PDF'),
    h('button', { class: 'btn sec', onclick: async () => { await flush(); toast('Rascunho salvo'); showList(); } }, 'Salvar rascunho e sair')));
}

function renderItens(box) {
  box.replaceChildren();
  ITENS.forEach((nome, idx) => {
    const n = idx + 1, v = cur.itens[n];
    const row = h('div', { class: 'item' + (v === 'NC' ? ' nc' : '') });
    const set = val => { cur.itens[n] = cur.itens[n] === val ? null : val; renderRow(); autosave(); };
    const renderRow = () => {
      const v2 = cur.itens[n];
      row.className = 'item' + (v2 === 'NC' ? ' nc' : '');
      row.replaceChildren(
        h('span', { class: 'n' }, pad2(n)), h('span', { class: 't' }, nome),
        ...(v2 === 'NC' ? [h('button', { class: 'btn small sec', type: 'button', 'aria-label': 'Foto do item', onclick: () => pegarFoto(`Item ${pad2(n)} - ${nome}`) }, '📷')] : []),
        h('span', { class: 'opt' },
          h('button', { type: 'button', class: 'c' + (v2 === 'C' ? ' on' : ''), onclick: () => set('C') }, 'C'),
          h('button', { type: 'button', class: 'nc' + (v2 === 'NC' ? ' on' : ''), onclick: () => set('NC') }, 'NC'),
          h('button', { type: 'button', class: 'na' + (v2 === 'NA' ? ' on' : ''), onclick: () => set('NA') }, 'N/A')));
    };
    renderRow(); box.append(row);
  });
}

/* ---------- Croqui de avarias ---------- */
const CROQUI_IMG = new Image();
CROQUI_IMG.src = 'icons/croqui.jpg';
function desenharCroqui(ctx, marks) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CW, CH);
  if (CROQUI_IMG.complete && CROQUI_IMG.naturalWidth) ctx.drawImage(CROQUI_IMG, 0, 0, CW, CH);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  for (const mk of marks) {
    ctx.fillStyle = 'rgba(198,40,40,.92)'; ctx.beginPath(); ctx.arc(mk.x, mk.y, 16, 0, 7); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(mk.t, mk.x, mk.y + 1);
  }
}
function croquiImagem(marks) {
  const c = document.createElement('canvas'); c.width = CW * 2; c.height = CH * 2;
  const ctx = c.getContext('2d'); ctx.scale(2, 2); desenharCroqui(ctx, marks);
  return c.toDataURL('image/jpeg', 0.85);
}
function croquiCard() {
  let tipo = 'A';
  const c = h('canvas', { class: 'croqui', width: CW, height: CH });
  const ctx = c.getContext('2d');
  const redraw = () => desenharCroqui(ctx, cur.marks);
  c.onpointerdown = e => {
    const r = c.getBoundingClientRect();
    cur.marks.push({ x: Math.round((e.clientX - r.left) / r.width * CW), y: Math.round((e.clientY - r.top) / r.height * CH), t: tipo });
    redraw(); autosave();
  };
  const btns = AVARIAS.map(([k, n]) => h('button', { type: 'button', class: k === tipo ? 'on' : '', onclick: e => {
    tipo = k; btns.forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on');
  } }, `${k} - ${n}`));
  redraw(); if (!CROQUI_IMG.complete) CROQUI_IMG.addEventListener('load', redraw);
  return h('section', { class: 'card' }, h('h2', null, 'Avarias do veículo'),
    h('div', { class: 'seg' }, btns), h('p', { class: 'warn' }, 'Escolha o tipo e toque no desenho onde está a avaria.'), h('div', { class: 'cwrap' }, c),
    h('div', { class: 'row' },
      h('button', { class: 'btn sec', type: 'button', onclick: () => { cur.marks.pop(); redraw(); autosave(); } }, 'Desfazer'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => { cur.marks = []; redraw(); autosave(); } }, 'Limpar')));
}

/* ---------- Fotos ---------- */
let fotosBox, fileInput;
function fotosCard() {
  fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  fotosBox = h('div', { class: 'photos' });
  renderFotos();
  return h('section', { class: 'card' }, h('h2', null, 'Fotos'),
    h('button', { class: 'btn', type: 'button', onclick: () => pegarFoto('') }, '📷 Tirar foto'),
    h('button', { class: 'btn sec', type: 'button', onclick: () => pegarFoto('', true) }, 'Escolher da galeria'),
    fileInput, fotosBox);
}
function renderFotos() {
  if (!fotosBox) return;
  fotosBox.replaceChildren(...cur.fotos.map((f, i) => {
    const cap = h('input', { type: 'text', placeholder: 'Legenda', value: f.legenda });
    cap.oninput = () => { f.legenda = cap.value; autosave(); };
    return h('div', { class: 'ph' }, h('img', { src: f.data, alt: '' }), cap,
      h('button', { type: 'button', onclick: () => { cur.fotos.splice(i, 1); renderFotos(); autosave(); } }, 'Remover'));
  }));
}
function pegarFoto(legenda, galeria) {
  if (galeria) fileInput.removeAttribute('capture'); else fileInput.setAttribute('capture', 'environment');
  fileInput.value = '';
  fileInput.onchange = async () => {
    for (const file of fileInput.files) {
      try { const im = await reduzir(file); cur.fotos.push(Object.assign(im, { legenda })); }
      catch { toast('Não foi possível ler a foto'); }
    }
    renderFotos(); autosave();
    if (legenda) toast('Foto adicionada à seção Fotos');
  };
  fileInput.click();
}
function reduzir(file, max = 1280) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), w = Math.round(img.width * k), hh = Math.round(img.height * k);
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      c.getContext('2d').drawImage(img, 0, 0, w, hh); URL.revokeObjectURL(url);
      res({ data: c.toDataURL('image/jpeg', 0.72), w, h: hh });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(); };
    img.src = url;
  });
}

/* ---------- Assinatura ---------- */
function sigPad(titulo, key) {
  const c = h('canvas', { class: 'pad' });
  c.style.height = '130px';
  const ctx = c.getContext('2d');
  let desenhando = false, ajustado = false;
  const ajustar = () => {
    const r = c.getBoundingClientRect(); if (!r.width) return;
    const d = window.devicePixelRatio || 1; c.width = r.width * d; c.height = r.height * d;
    ctx.scale(d, d); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
    if (cur.assin[key]) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, r.width, r.height); im.src = cur.assin[key]; }
    ajustado = true;
  };
  const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  c.onpointerdown = e => { if (!ajustado) ajustar(); desenhando = true; c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); };
  c.onpointermove = e => { if (!desenhando) return; ctx.lineTo(...pos(e)); ctx.stroke(); };
  const fim = () => { if (!desenhando) return; desenhando = false; cur.assin[key] = c.toDataURL('image/png'); autosave(); };
  c.onpointerup = fim; c.onpointercancel = fim;
  requestAnimationFrame(() => requestAnimationFrame(ajustar));
  return h('div', null, h('label', null, titulo), c,
    h('button', { class: 'btn small sec', type: 'button', style: 'margin-top:6px', onclick: () => {
      const r = c.getBoundingClientRect(); ctx.clearRect(0, 0, r.width, r.height); cur.assin[key] = ''; autosave();
    } }, 'Limpar assinatura'));
}

/* ---------- Finalizar ---------- */
async function finalizar(compartilhar) {
  const falta = [];
  if (!cur.veiculo.trim()) falta.push('Nº do veículo');
  if (!cur.placa.trim()) falta.push('Placa');
  if (!cur.km) falta.push('Km');
  if (falta.length) { toast('Preencha: ' + falta.join(', ')); return; }
  const sem = ITENS.filter((_, i) => !cur.itens[i + 1]).length;
  if (sem && !confirm(`${sem} item(ns) sem resposta. Gerar o PDF mesmo assim?`)) return;
  cur.status = 'final'; await flush();
  await entregarPdf(cur, compartilhar);
}

async function entregarPdf(r, compartilhar) {
  try {
    const doc = gerarPdf(r), blob = doc.output('blob');
    const nome = `Checklist_${(r.placa || 'veiculo').replace(/[^A-Za-z0-9]/g, '')}_${r.data}.pdf`;
    const file = new File([blob], nome, { type: 'application/pdf' });
    if (compartilhar && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nome }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: nome });
    document.body.append(a); a.click(); a.remove();
    toast(compartilhar ? 'Compartilhamento indisponível – PDF baixado' : 'PDF salvo em Downloads');
  } catch (e) { console.error(e); toast('Erro ao gerar PDF'); }
}

/* ---------- PDF ---------- */
function gerarPdf(r) {
  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const M = 10, W = 190;
  const txt = (t, x, y, o = {}) => { doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.s || 9); doc.text(String(t ?? ''), x, y, o.a ? { align: o.a } : undefined); };
  const cell = (x, y, w, hh, label, val) => {
    doc.setDrawColor(120); doc.setLineWidth(.2); doc.rect(x, y, w, hh);
    txt(label, x + 1.5, y + hh / 2 + 1.3, { b: 1 }); const lw = doc.getTextWidth(label) + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(String(val || ''), x + lw, y + hh / 2 + 1.3);
  };

  // --- Página 1
  doc.setFillColor(22, 120, 60); doc.rect(M, M, W, 10, 'F');
  doc.setTextColor(255); txt('INSPEÇÃO CHECK-LIST DE VEÍCULOS', 105, M + 6.8, { b: 1, s: 13, a: 'center' }); doc.setTextColor(0);
  let y = M + 12; const rh = 7;
  cell(M, y, 95, rh, 'Nº Veículo:', r.veiculo); cell(M + 95, y, 95, rh, 'Condutor anterior:', r.condutorAnterior); y += rh;
  cell(M, y, 95, rh, 'Placa:', r.placa); cell(M + 95, y, 95, rh, 'Data mês/ano:', brMes(r.mesAno)); y += rh;
  cell(M, y, 95, rh, 'Km:', r.km); cell(M + 95, y, 95, rh, 'Data troca do óleo:', brData(r.trocaOleo)); y += rh;
  cell(M, y, 190, rh, 'Data da inspeção:', brData(r.data)); y += rh;
  doc.rect(M, y, 190, rh);
  TIPOS.forEach(([k, n], i) => { const x = M + 2 + i * 62; doc.rect(x, y + 2, 3, 3); if (r.tipo === k) txt('X', x + .5, y + 4.7, { b: 1, s: 8 }); txt(n, x + 5, y + 4.7, { b: 1 }); });
  y += rh + 2;

  // tabela de itens
  const c1 = 12, c3 = 28, c2 = W - c1 - c3, ih = 5.3;
  doc.setFillColor(225, 232, 227); doc.rect(M, y, W, ih, 'F'); doc.setDrawColor(120); doc.rect(M, y, W, ih);
  txt('Nº', M + 1.5, y + 3.8, { b: 1 }); txt('Ítem', M + c1 + 1.5, y + 3.8, { b: 1 }); txt('C / NC / N/A', M + c1 + c2 + c3 / 2, y + 3.8, { b: 1, a: 'center' });
  y += ih;
  ITENS.forEach((nome, i) => {
    const v = r.itens[i + 1];
    if (v === 'NC') { doc.setFillColor(253, 224, 224); doc.rect(M, y, W, ih, 'F'); }
    doc.rect(M, y, c1, ih); doc.rect(M + c1, y, c2, ih); doc.rect(M + c1 + c2, y, c3, ih);
    txt(pad2(i + 1), M + 1.5, y + 3.7); txt(nome, M + c1 + 1.5, y + 3.7);
    if (v === 'NC') doc.setTextColor(198, 40, 40);
    txt(v === 'NA' ? 'N/A' : v || '', M + c1 + c2 + c3 / 2, y + 3.7, { b: 1, a: 'center' }); doc.setTextColor(0);
    y += ih;
  });
  doc.rect(M, y, c1 + c2, ih); doc.rect(M + c1 + c2, y, c3, ih);
  doc.setTextColor(198, 40, 40); txt('Próxima revisão conf. KM', M + 1.5, y + 3.7); doc.setTextColor(0);
  txt(r.proximaRevisao, M + c1 + c2 + c3 / 2, y + 3.7, { a: 'center' }); y += ih + 2;
  txt('Legenda: C - Conforme / NC - Não conforme / N/A - Não se aplica', M, y + 2, { s: 7.5 });
  const nc = ncCount(r);
  txt(nc ? `Itens não conformes: ${nc}` : 'Nenhum item não conforme', M + W, y + 2, { b: 1, s: 8, a: 'right' });
  txt(REVISAO, M + W, 292, { s: 7, a: 'right' });

  // --- Página 2
  doc.addPage(); y = M;
  txt('Avarias do veículo', M, y + 3, { b: 1, s: 10 }); y += 5;
  const ch = W * CH / CW;
  doc.addImage(croquiImagem(r.marks), 'JPEG', M, y, W, ch); doc.rect(M, y, W, ch); y += ch + 4;
  txt('Legenda', M, y, { b: 1, s: 8 }); y += 4;
  txt(AVARIAS.map(([k, n]) => `${k} - ${n}`).join('     '), M, y, { s: 8 }); y += 6;
  txt('Observação:', M, y, { b: 1 }); y += 2;
  const linhas = doc.splitTextToSize(r.obs || '', W - 4), boxH = Math.max(28, linhas.length * 4 + 4);
  doc.rect(M, y, W, boxH); doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(linhas, M + 2, y + 5); y += boxH + 5;
  OBS_FIXAS.forEach(t => { txt('Obs.: ' + t, M, y, { s: 8 }); y += 4.2; });
  y += 2; doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  const av = doc.splitTextToSize(AVISO, W); doc.text(av, M, y); y += av.length * 4 + 4;
  if (y > 225) { doc.addPage(); y = M; }
  const sw = W / 3 - 2;
  [['Assinatura Auditor', 'auditor'], ['Assinatura Condutor Atual', 'condutor'], ['Assinatura Supervisor/Gerente', 'supervisor']].forEach(([t, k], i) => {
    const x = M + i * (sw + 3);
    doc.rect(x, y, sw, 22);
    if (r.assin[k]) doc.addImage(r.assin[k], 'PNG', x + 1, y + 1, sw - 2, 20);
    txt(t, x, y + 26, { b: 1, s: 8 });
  });
  txt(REVISAO, M + W, 292, { s: 7, a: 'right' });

  // --- Fotos
  if (r.fotos.length) {
    const cw = 92, chh = 80, ph = 68;
    r.fotos.forEach((f, i) => {
      if (i % 6 === 0) { doc.addPage(); txt(`Fotos - ${r.placa} - ${brData(r.data)}`, M, M + 3, { b: 1, s: 10 }); }
      const k = i % 6, x = M + (k % 2) * (cw + 6), yy = M + 8 + Math.floor(k / 2) * (chh + 6);
      const s = Math.min(cw / f.w, ph / f.h), iw = f.w * s, ih2 = f.h * s;
      doc.rect(x, yy, cw, ph); doc.addImage(f.data, 'JPEG', x + (cw - iw) / 2, yy + (ph - ih2) / 2, iw, ih2);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(doc.splitTextToSize(f.legenda || `Foto ${i + 1}`, cw).slice(0, 2), x, yy + ph + 4);
    });
  }
  return doc;
}

/* ---------- Início ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
window.addEventListener('pagehide', flush);
showList();