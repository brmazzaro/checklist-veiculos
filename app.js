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
    veiculo: '', placa: '', modelo: '', condutor: '', regiao: '', radio: '',
    km: '', condutorAnterior: '', trocaOleo: '', proximaRevisao: '',
    itens: {}, marks: [], obs: '', fotos: [], assin: { condutor: '' },
    criado: Date.now(), atualizado: Date.now()
  };
}
const ncCount = r => ITENS.reduce((n, _, i) => n + (r.itens[i + 1] === 'NC' ? 1 : 0), 0);

/* ---------- Navegação ---------- */
let cur = null, saveT;
function setTitle(t, back, sub = '') {
  $('#title').textContent = t; $('#sub').textContent = sub; $('#sub').hidden = !sub; $('#btnBack').hidden = !back;
  if (!back) { $('#prog').hidden = true; $('#net').hidden = true; }
}
$('#btnBack').onclick = () => flush().then(showList);
function flush() {
  clearTimeout(saveT);
  if (!cur) return Promise.resolve();
  cur.atualizado = Date.now();
  return dbPut(cur).then(() => { if (cur && !$('#btnBack').hidden) { const n = $('#net'); n.textContent = 'Salvo ✓'; n.hidden = false; } });
}
function autosave() { clearTimeout(saveT); saveT = setTimeout(flush, 500); }

/* ---------- Ícones ---------- */
const IC = {
  dados: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
  itens: 'M22 7h-9v2h9V7zm0 8h-9v2h9v-2zM5.54 11L2 7.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 11zm0 8L2 15.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 19z',
  carro: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  foto: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z',
  ok: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  voltar: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  mais: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  pdf: 'M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3.5h-1.5v1h1.5v1.5h-1.5V13H18V7h2v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z',
  lixo: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  share: 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z'
};
function icon(k, sz = 24) {
  const s = document.createElement('span'); s.className = 'ico';
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="currentColor"><path d="${IC[k]}"/></svg>`;
  return s;
}
$('#btnBack').replaceChildren(icon('voltar'));
const vibra = () => { try { navigator.vibrate && navigator.vibrate(12); } catch {} };

/* ---------- Lista / histórico ---------- */
async function showList() {
  cur = null; setTitle('Checklist de Veículos', false, 'Inspeção de veículos');
  const all = (await dbAll()).sort((a, b) => b.atualizado - a.atualizado);
  const app = $('#app'); app.replaceChildren();
  window.scrollTo(0, 0);
  if (!all.length) {
    app.append(h('div', { class: 'empty' }, icon('carro', 96), h('br'), 'Nenhuma inspeção ainda.', h('br'), 'Toque em "Nova inspeção" para começar.'));
  } else {
    app.append(h('div', { class: 'hero' }, h('b', null, 'Inspeções'), h('span', null, `${all.length} registro(s) neste aparelho`)),
      h('button', { class: 'btn sec', style: 'margin:0 0 14px', onclick: showRelatorio }, icon('pdf'), 'Relatório do mês'));
  }
  for (const r of all) {
    const nc = ncCount(r), tipo = TIPOS.find(t => t[0] === r.tipo)[1];
    app.append(h('div', { class: 'hcard' + (nc ? ' bad' : '') },
      h('div', { class: 'av' }, r.veiculo || '—'),
      h('div', { class: 'i', onclick: () => abrir(r) },
        h('b', null, r.placa || 'Sem placa'),
        h('small', null, [r.modelo, r.condutor].filter(Boolean).join(' · ') || '—'), h('br'),
        h('small', null, `${brData(r.data)} · ${tipo}`),
        h('div', { class: 'chips' },
          h('span', { class: 'tag ' + (r.status === 'final' ? 'ok' : 'dr') }, r.status === 'final' ? 'Concluída' : 'Rascunho'),
          nc ? h('span', { class: 'tag bad' }, `${nc} NC`) : null,
          r.fotos.length ? h('span', { class: 'tag' }, `${r.fotos.length} foto(s)`) : null)),
      h('button', { class: 'ib', 'aria-label': 'Gerar PDF', onclick: () => entregarPdf(r, false) }, icon('pdf')),
      h('button', { class: 'ib danger', 'aria-label': 'Excluir', onclick: async () => { if (confirm('Excluir esta inspeção?')) { await dbDel(r.id); showList(); } } }, icon('lixo'))));
  }
  app.append(h('button', { class: 'fab', onclick: () => abrir(novo()) }, icon('mais'), 'Nova inspeção'));
}

/* ---------- Formulário (em etapas) ---------- */
function abrir(r) { cur = r; showForm(); }

function field(label, key, type = 'text', extra = {}) {
  const i = h('input', Object.assign({ type, value: cur[key] ?? '' }, extra));
  i.oninput = () => { cur[key] = i.value; autosave(); };
  return h('div', null, h('label', null, label), i);
}

const ETAPAS = [['Dados', 'dados'], ['Itens', 'itens'], ['Avarias', 'carro'], ['Fotos', 'foto'], ['Finalizar', 'ok']];
const respondidos = () => ITENS.filter((_, i) => cur.itens[i + 1]).length;

function showForm() {
  const app = $('#app'); app.replaceChildren();
  let etapa = 0, assinatura;
  const cab = () => setTitle(ETAPAS[etapa][0], true, `${cur.placa || 'Nova inspeção'}${cur.veiculo ? ' · Veículo ' + cur.veiculo : ''}`);
  const prog = () => { $('#prog').hidden = false; $('#prog i').style.width = (respondidos() / ITENS.length * 100) + '%'; };
  const continuar = () => h('button', { class: 'btn', type: 'button', onclick: () => go(etapa + 1) }, 'Continuar');

  /* 1 - Dados */
  const tipoBtns = TIPOS.map(([k, n]) => h('button', { type: 'button', class: cur.tipo === k ? 'on' : '', onclick: e => {
    cur.tipo = k; tipoBtns.forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); autosave();
  } }, n));
  const fVeic = field('Nº Veículo (prefixo)', 'veiculo', 'text', { inputmode: 'numeric', list: 'listaVeiculos', autocomplete: 'off' });
  const fPlaca = field('Placa', 'placa', 'text', { autocapitalize: 'characters', maxlength: 10 });
  const fModelo = field('Modelo', 'modelo', 'text', { autocapitalize: 'characters' });
  const fCond = field('Condutor atual', 'condutor');
  const fRegiao = field('Região', 'regiao');
  const iVeic = fVeic.querySelector('input'), iPlaca = fPlaca.querySelector('input');
  const aviso = h('small', { style: 'color:var(--mut)' });
  const sel = h('select', null, h('option', { value: '' }, 'Selecione o veículo...'),
    Object.keys(VEICULOS).sort((a, b) => a - b).map(n => {
      const v = VEICULOS[n];
      return h('option', { value: n, selected: n === cur.veiculo }, `${n} · ${v.modelo} · ${v.placa} · ${v.motorista}`);
    }));
  sel.onchange = () => { if (sel.value) { iVeic.value = cur.veiculo = sel.value; buscarPlaca(); } };
  const preenche = (f, k, v) => { cur[k] = v || ''; f.querySelector('input').value = cur[k]; };
  let ultimo = cur.veiculo; // só preenche de novo quando o nº muda (não apaga edições manuais)
  const buscarPlaca = () => {
    const t = iVeic.value.trim(), n = VEICULOS[t] ? t : t.replace(/^0+/, ''), v = VEICULOS[n];
    if (v && n !== ultimo) {
      preenche(fPlaca, 'placa', v.placa); preenche(fModelo, 'modelo', v.modelo);
      preenche(fCond, 'condutor', v.motorista); preenche(fRegiao, 'regiao', v.regiao); cur.radio = v.radio || '';
      autosave();
    }
    ultimo = n; sel.value = v ? n : '';
    aviso.textContent = v ? `Dados do cadastro · Rádio PX Motorola: ${v.radio || '—'}`
      : n && Object.keys(VEICULOS).length ? 'Veículo não cadastrado – preencha os dados' : '';
    cab();
  };
  ['input', 'change', 'blur'].forEach(ev => iVeic.addEventListener(ev, buscarPlaca));
  iPlaca.addEventListener('input', cab);
  buscarPlaca();
  const pDados = h('div', { class: 'page' },
    h('section', { class: 'card' }, h('h2', null, 'Tipo de inspeção'), h('div', { class: 'seg' }, tipoBtns)),
    h('section', { class: 'card' }, h('h2', null, 'Veículo'),
      h('label', null, 'Cadastro do Inventário Florestal'), sel,
      h('datalist', { id: 'listaVeiculos' }, Object.keys(VEICULOS).sort((a, b) => a - b).map(n => h('option', { value: n }))),
      h('div', { class: 'row' }, fVeic, fPlaca), aviso,
      h('div', { class: 'row' }, fModelo, fRegiao),
      fCond,
      h('div', { class: 'row' }, field('Km', 'km', 'number', { inputmode: 'numeric' }), field('Data da inspeção', 'data', 'date')),
      field('Condutor anterior', 'condutorAnterior'),
      h('div', { class: 'row' }, field('Data mês/ano', 'mesAno', 'month'), field('Data troca do óleo', 'trocaOleo', 'date'))),
    continuar());

  /* 2 - Itens */
  let filtro = 'todos';
  const sum = h('div', { class: 'sum' }), lista = h('div');
  const atualizaSum = () => {
    const nc = ncCount(cur);
    sum.replaceChildren(h('span', null, h('b', null, `${respondidos()} de ${ITENS.length}`), ' respondidos'),
      nc ? h('span', { class: 'tag bad' }, `${nc} não conforme(s)`) : h('span', { class: 'tag ok' }, 'Nenhuma NC'));
    prog();
  };
  const linha = (n, nome) => {
    const row = h('div', { class: 'item' });
    const desenha = () => {
      const v = cur.itens[n];
      row.className = 'item' + (v === 'NC' ? ' nc' : v === 'C' ? ' okk' : '');
      row.replaceChildren(
        h('div', { class: 'top' }, h('span', { class: 'n' }, pad2(n)), h('span', { class: 't' }, nome)),
        h('div', { class: 'opt' }, ['C', 'NC', 'NA'].map(k => h('button', { type: 'button', class: k.toLowerCase() + (v === k ? ' on' : ''), onclick: () => {
          cur.itens[n] = cur.itens[n] === k ? null : k; vibra(); desenha(); atualizaSum(); autosave();
        } }, k === 'NA' ? 'N/A' : k))),
        ...(v === 'NC' ? [h('button', { class: 'chip photo', type: 'button', onclick: () => pegarFoto(`Item ${pad2(n)} - ${nome}`) }, icon('foto', 18), 'Adicionar foto deste item')] : []));
    };
    desenha(); return row;
  };
  const renderLista = () => {
    lista.replaceChildren();
    ITENS.forEach((nome, i) => {
      const v = cur.itens[i + 1];
      if ((filtro === 'pend' && v) || (filtro === 'nc' && v !== 'NC')) return;
      lista.append(linha(i + 1, nome));
    });
    if (!lista.children.length) lista.append(h('div', { class: 'empty' }, filtro === 'nc' ? 'Nenhum item não conforme.' : 'Tudo respondido!'));
  };
  const chips = [['todos', 'Todos'], ['pend', 'Pendentes'], ['nc', 'Não conformes']].map(([k, n]) =>
    h('button', { type: 'button', class: 'chip' + (k === filtro ? ' on' : ''), onclick: e => {
      filtro = k; chips.forEach(c => c.classList.remove('on')); e.currentTarget.classList.add('on'); renderLista();
    } }, n));
  const iRev = h('input', { type: 'number', inputmode: 'numeric', value: cur.proximaRevisao });
  iRev.oninput = () => { cur.proximaRevisao = iRev.value; autosave(); };
  const pItens = h('div', { class: 'page' },
    h('div', { class: 'warn' }, 'Legenda: C = Conforme · NC = Não conforme · N/A = Não se aplica'),
    sum, h('div', { class: 'filters' }, chips), lista,
    h('button', { class: 'btn sec', type: 'button', onclick: () => {
      ITENS.forEach((_, i) => { if (!cur.itens[i + 1]) cur.itens[i + 1] = 'C'; });
      vibra(); renderLista(); atualizaSum(); autosave();
    } }, 'Marcar restantes como Conforme'),
    h('section', { class: 'card', style: 'margin-top:14px' }, h('h2', null, 'Próxima revisão'),
      h('label', null, 'Próxima revisão conf. KM'), iRev,
      ...OBS_FIXAS.map(t => h('div', { class: 'warn' }, 'Obs.: ' + t)), h('div', { class: 'crit' }, AVISO)),
    continuar());
  renderLista(); atualizaSum();

  /* 3 - Avarias e observação */
  const ta = h('textarea', { placeholder: 'Descreva problemas, avarias, ações...' }, cur.obs);
  ta.oninput = () => { cur.obs = ta.value; autosave(); };
  const pAvarias = h('div', { class: 'page' }, croquiCard(),
    h('section', { class: 'card' }, h('h2', null, 'Observação'), ta), continuar());

  /* 4 - Fotos */
  const pFotos = h('div', { class: 'page' }, fotosCard(), continuar());

  /* 5 - Finalizar */
  assinatura = sigPad('Assinatura Condutor Atual', 'condutor');
  const resumo = h('div', { class: 'resumo' });
  const atualizaResumo = () => {
    const linhas = [['Veículo / Placa', `${cur.veiculo || '—'} / ${cur.placa || '—'}`], ['Modelo', cur.modelo || '—'],
      ['Condutor atual', cur.condutor || '—'], ['Km', cur.km || '—'], ['Data', brData(cur.data)],
      ['Itens respondidos', `${respondidos()} de ${ITENS.length}`], ['Não conformes', String(ncCount(cur))],
      ['Avarias marcadas', String(cur.marks.length)], ['Fotos', String(cur.fotos.length)]];
    resumo.replaceChildren(...linhas.map(([a, b]) => h('div', null, h('span', null, a), h('b', null, b))));
  };
  const pFinal = h('div', { class: 'page' },
    h('section', { class: 'card' }, h('h2', null, 'Resumo'), resumo),
    h('section', { class: 'card' }, h('h2', null, 'Assinatura'), assinatura),
    h('button', { class: 'btn', onclick: () => finalizar(false) }, icon('pdf'), 'Concluir e gerar PDF'),
    h('button', { class: 'btn sec', onclick: () => finalizar(true) }, icon('share'), 'Concluir e compartilhar'),
    h('button', { class: 'btn sec', onclick: async () => { await flush(); toast('Rascunho salvo'); showList(); } }, 'Salvar rascunho e sair'));

  const paginas = [pDados, pItens, pAvarias, pFotos, pFinal];
  const nav = h('nav', { class: 'tabs' }, ETAPAS.map(([n, ic], i) => h('button', { type: 'button', onclick: () => go(i) }, icon(ic), h('span', null, n))));
  function go(i) {
    etapa = Math.max(0, Math.min(paginas.length - 1, i));
    paginas.forEach((p, k) => (p.hidden = k !== etapa));
    [...nav.children].forEach((b, k) => b.classList.toggle('on', k === etapa));
    if (etapa === 4) { atualizaResumo(); assinatura.fit(); }
    cab(); prog(); window.scrollTo(0, 0);
  }
  app.append(...paginas, nav);
  go(0);
}

/* ---------- Croqui de avarias ---------- */
const CROQUI_IMG = new Image();
CROQUI_IMG.src = typeof CROQUI_DATA === 'string' ? CROQUI_DATA : 'icons/croqui.jpg';
function desenharCroqui(ctx, marks) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CW, CH);
  if (CROQUI_IMG.complete && CROQUI_IMG.naturalWidth) ctx.drawImage(CROQUI_IMG, 0, 0, CW, CH);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  for (const mk of marks) {
    ctx.fillStyle = 'rgba(198,40,40,.92)'; ctx.beginPath(); ctx.arc(mk.x, mk.y, 26, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.fillText(mk.t, mk.x, mk.y + 1);
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
  const wrap = h('div', null, h('label', null, titulo), c,
    h('button', { class: 'btn small sec', type: 'button', style: 'margin-top:10px', onclick: () => {
      const r = c.getBoundingClientRect(); ctx.clearRect(0, 0, r.width, r.height); cur.assin[key] = ''; autosave();
    } }, 'Limpar assinatura'));
  wrap.fit = () => { if (!ajustado) ajustar(); };
  return wrap;
}

/* ---------- Finalizar ---------- */
async function finalizar(compartilhar) {
  const falta = [];
  if (!cur.veiculo.trim()) falta.push('Nº do veículo');
  if (!cur.placa.trim()) falta.push('Placa');
  if (!(cur.condutor || '').trim()) falta.push('Condutor atual');
  if (!cur.km) falta.push('Km');
  if (falta.length) { toast('Preencha: ' + falta.join(', ')); return; }
  const sem = ITENS.filter((_, i) => !cur.itens[i + 1]).length;
  if (sem && !confirm(`${sem} item(ns) sem resposta. Gerar o PDF mesmo assim?`)) return;
  cur.status = 'final'; await flush();
  await entregarPdf(cur, compartilhar);
}

const entregarPdf = (r, compartilhar) =>
  entregar(() => gerarPdf(r), `Checklist_${(r.placa || 'veiculo').replace(/[^A-Za-z0-9]/g, '')}_${r.data}.pdf`, compartilhar);

async function entregar(gerar, nome, compartilhar) {
  try {
    const blob = gerar().output('blob');
    const file = new File([blob], nome, { type: 'application/pdf' });
    if (compartilhar && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nome }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: nome });
    document.body.append(a); a.click(); a.remove();
    toast(compartilhar ? 'Compartilhamento indisponível – PDF baixado' : 'PDF salvo em Downloads');
  } catch (e) { console.error(e); toast('Erro ao gerar PDF: ' + (e && e.message || e)); }
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
  cell(M, y, 95, rh, 'Modelo:', r.modelo); cell(M + 95, y, 95, rh, 'Condutor atual:', r.condutor); y += rh;
  cell(M, y, 95, rh, 'Região:', r.regiao); cell(M + 95, y, 95, rh, 'Data da inspeção:', brData(r.data)); y += rh;
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
  try { doc.addImage(croquiImagem(r.marks), 'JPEG', M, y, W, ch); } catch (e) { console.error(e); txt('(croqui indisponível)', M + 2, y + 6, { s: 8 }); }
  doc.rect(M, y, W, ch); y += ch + 4;
  txt('Legenda', M, y, { b: 1, s: 8 }); y += 4;
  txt(AVARIAS.map(([k, n]) => `${k} - ${n}`).join('     '), M, y, { s: 8 }); y += 6;
  txt('Observação:', M, y, { b: 1 }); y += 2;
  const linhas = doc.splitTextToSize(r.obs || '', W - 4), boxH = Math.max(28, linhas.length * 4 + 4);
  doc.rect(M, y, W, boxH); doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(linhas, M + 2, y + 5); y += boxH + 5;
  OBS_FIXAS.forEach(t => { txt('Obs.: ' + t, M, y, { s: 8 }); y += 4.2; });
  y += 2; doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  const av = doc.splitTextToSize(AVISO, W); doc.text(av, M, y); y += av.length * 4 + 4;
  if (y > 225) { doc.addPage(); y = M; }
  const sw = 95;
  doc.rect(M, y, sw, 24);
  if (r.assin.condutor) doc.addImage(r.assin.condutor, 'PNG', M + 1, y + 1, sw - 2, 22);
  txt('Assinatura Condutor Atual' + (r.condutor ? ': ' + r.condutor : ''), M, y + 28, { b: 1, s: 8 });
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

/* ---------- Relatório mensal (todas as inspeções do mês de um veículo) ---------- */
async function showRelatorio() {
  cur = null; setTitle('Relatório do mês', true, 'Resumo único das inspeções do mês');
  const all = await dbAll();
  const app = $('#app'); app.replaceChildren(); window.scrollTo(0, 0);
  const ultimoDe = n => all.filter(r => r.veiculo === n).sort((a, b) => b.atualizado - a.atualizado)[0];
  const veics = [...new Set(all.map(r => r.veiculo).filter(Boolean))].sort((a, b) => a - b);
  const sel = h('select', null, veics.map(n => h('option', { value: n }, `${n} · ${ultimoDe(n).placa || ''} · ${ultimoDe(n).modelo || ''}`)));
  const iMes = h('input', { type: 'month', value: hoje().slice(0, 7) });
  const info = h('div', { class: 'warn' });
  const doMes = () => all.filter(r => r.veiculo === sel.value && (r.data || '').startsWith(iMes.value))
    .sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : a.atualizado - b.atualizado);
  const atualiza = () => {
    const regs = doMes(), dias = new Set(regs.map(r => r.data)).size;
    info.textContent = regs.length ? `${regs.length} inspeção(ões) em ${dias} dia(s) neste mês` : 'Nenhuma inspeção deste veículo neste mês.';
  };
  sel.onchange = atualiza; iMes.oninput = atualiza; atualiza();
  const gerar = compartilhar => {
    const regs = doMes();
    if (!regs.length) { toast('Nenhuma inspeção neste mês'); return; }
    entregar(() => gerarRelatorio(sel.value, iMes.value, regs),
      `Relatorio_${(regs[regs.length - 1].placa || sel.value).replace(/[^A-Za-z0-9]/g, '')}_${iMes.value}.pdf`, compartilhar);
  };
  if (!veics.length) { app.append(h('div', { class: 'empty' }, 'Nenhuma inspeção salva neste aparelho.')); return; }
  app.append(h('div', { class: 'page' },
    h('section', { class: 'card' }, h('h2', null, 'Período'),
      h('label', null, 'Veículo'), sel, h('label', null, 'Mês / ano'), iMes, info),
    h('button', { class: 'btn', onclick: () => gerar(false) }, icon('pdf'), 'Gerar relatório em PDF'),
    h('button', { class: 'btn sec', onclick: () => gerar(true) }, icon('share'), 'Gerar e compartilhar')));
}

function gerarRelatorio(veic, mes, regs) {
  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const M = 8, W = 281, PH = 210;
  const txt = (t, x, y, o = {}) => { doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.s || 9); doc.text(String(t ?? ''), x, y, o.a ? { align: o.a } : undefined); };
  const [ano, m] = mes.split('-').map(Number), nd = new Date(ano, m, 0).getDate();
  const porDia = {}; regs.forEach(r => (porDia[+r.data.slice(8, 10)] ||= []).push(r));
  // vários registros no mesmo dia: NC prevalece sobre C, que prevalece sobre N/A
  const valor = (d, n) => { const v = (porDia[d] || []).map(r => r.itens[n]); return v.includes('NC') ? 'NC' : v.includes('C') ? 'C' : v.includes('NA') ? 'NA' : ''; };
  const ult = regs[regs.length - 1];
  const condutores = [...new Set(regs.map(r => r.condutor).filter(Boolean))].join(', ');
  const kms = regs.map(r => +r.km).filter(k => k > 0);
  const diasInsp = Object.keys(porDia).length;
  let totalNc = 0;
  for (let d = 1; d <= nd; d++) ITENS.forEach((_, i) => { if (valor(d, i + 1) === 'NC') totalNc++; });

  // --- Página 1: grade itens x dias (igual à folha de papel)
  doc.setFillColor(22, 120, 60); doc.rect(M, M, W, 9, 'F');
  doc.setTextColor(255); txt('RELATÓRIO MENSAL - INSPEÇÃO CHECK-LIST DE VEÍCULOS', M + W / 2, M + 6.2, { b: 1, s: 12, a: 'center' }); doc.setTextColor(0);
  let y = M + 10; const ch = 6, cw = W / 4;
  const cell = (x, label, val) => {
    doc.setDrawColor(120); doc.setLineWidth(.2); doc.rect(x, y, cw, ch);
    txt(label, x + 1.5, y + 4.1, { b: 1, s: 8 }); const lw = doc.getTextWidth(label) + 2.5;
    txt(doc.splitTextToSize(String(val || ''), cw - lw - 2)[0] || '', x + lw, y + 4.1, { s: 8 });
  };
  cell(M, 'Nº Veículo:', veic); cell(M + cw, 'Placa:', ult.placa); cell(M + 2 * cw, 'Modelo:', ult.modelo); cell(M + 3 * cw, 'Mês/ano:', brMes(mes)); y += ch;
  cell(M, 'Região:', ult.regiao); cell(M + cw, 'Condutor(es):', condutores); cell(M + 2 * cw, 'Dias inspecionados:', `${diasInsp} de ${nd}`); cell(M + 3 * cw, 'Total de NC:', String(totalNc)); y += ch + 2;

  const c1 = 7, c2 = 56, dw = (W - c1 - c2) / 31, rh = 4.1, x0 = M + c1 + c2;
  doc.setFillColor(225, 232, 227); doc.rect(M, y, W, rh, 'F');
  txt('Nº', M + 1, y + 3, { b: 1, s: 6.5 }); txt('Ítem / Dias', M + c1 + 1, y + 3, { b: 1, s: 6.5 });
  for (let d = 1; d <= 31; d++) txt(d, x0 + (d - .5) * dw, y + 3, { b: 1, s: 6.5, a: 'center' });
  const grade = () => { doc.setDrawColor(150); doc.rect(M, y, c1, rh); doc.rect(M + c1, y, c2, rh); for (let d = 0; d < 31; d++) doc.rect(x0 + d * dw, y, dw, rh); };
  grade(); y += rh;
  ITENS.forEach((nome, i) => {
    for (let d = nd + 1; d <= 31; d++) { doc.setFillColor(215); doc.rect(x0 + (d - 1) * dw, y, dw, rh, 'F'); }
    txt(pad2(i + 1), M + 1, y + 3, { s: 6.5 }); txt(nome, M + c1 + 1, y + 3, { s: 6.5 });
    for (let d = 1; d <= nd; d++) {
      const v = valor(d, i + 1); if (!v) continue;
      const cx = x0 + (d - 1) * dw;
      if (v === 'NC') { doc.setFillColor(253, 214, 214); doc.rect(cx, y, dw, rh, 'F'); doc.setTextColor(198, 40, 40); }
      else if (v === 'NA') doc.setTextColor(120);
      txt(v === 'NA' ? 'N/A' : v, cx + dw / 2, y + 3, { b: 1, s: v === 'C' ? 6.5 : 5.5, a: 'center' }); doc.setTextColor(0);
    }
    grade(); y += rh;
  });
  txt('Km', M + 1, y + 3, { b: 1, s: 6.5 });
  for (let d = 1; d <= 31; d++) {
    if (d > nd) { doc.setFillColor(215); doc.rect(x0 + (d - 1) * dw, y, dw, rh, 'F'); continue; }
    const k = Math.max(0, ...(porDia[d] || []).map(r => +r.km || 0));
    if (k) txt(k, x0 + (d - .5) * dw, y + 2.9, { s: k > 99999 ? 3.6 : 4.3, a: 'center' });
  }
  grade(); y += rh + 3.5;
  txt('Legenda: C - Conforme / NC - Não conforme / N/A - Não se aplica · Dia em branco = sem inspeção · Cinza = dia inexistente no mês', M, y, { s: 7 });
  txt(REVISAO, M + W, PH - 4, { s: 7, a: 'right' });

  // --- Página 2: resumo
  doc.addPage(); y = M + 4;
  const novaLinha = (alt = 5) => { y += alt; if (y > PH - 14) { doc.addPage(); y = M + 4; } };
  const titulo = t => { novaLinha(3); txt(t, M, y, { b: 1, s: 11 }); doc.setDrawColor(22, 120, 60); doc.setLineWidth(.5); doc.line(M, y + 1.5, M + W, y + 1.5); doc.setLineWidth(.2); novaLinha(6); };
  const paragrafo = (t, s = 9) => doc.splitTextToSize(t, W - 4).forEach(l => { txt(l, M + 2, y, { s }); novaLinha(s * .45); });
  titulo(`Resumo do mês ${brMes(mes)} - Veículo ${veic} · ${ult.placa || ''}`);
  // no mês corrente, só conta como "sem inspeção" os dias que já passaram
  const ate = mes === hoje().slice(0, 7) ? +hoje().slice(8, 10) : nd;
  const semInsp = []; for (let d = 1; d <= ate; d++) if (!porDia[d]) semInsp.push(d);
  paragrafo(`Inspeções registradas: ${regs.length}   ·   Dias inspecionados: ${diasInsp} de ${nd}   ·   Itens não conformes: ${totalNc}`);
  paragrafo(`Dias sem inspeção: ${semInsp.length ? semInsp.join(', ') : 'nenhum'}`);
  if (kms.length) paragrafo(`Km inicial: ${Math.min(...kms)}   ·   Km final: ${Math.max(...kms)}   ·   Km rodados no mês: ${Math.max(...kms) - Math.min(...kms)}`);
  const revs = regs.map(r => r.proximaRevisao).filter(Boolean); if (revs.length) paragrafo(`Próxima revisão conf. KM: ${revs[revs.length - 1]}`);
  const oleo = regs.map(r => r.trocaOleo).filter(Boolean); if (oleo.length) paragrafo(`Data troca do óleo: ${brData(oleo[oleo.length - 1])}`);

  titulo('Itens não conformes');
  const ncs = []; regs.forEach(r => ITENS.forEach((nome, i) => { if (r.itens[i + 1] === 'NC') ncs.push([brData(r.data), `${pad2(i + 1)} - ${nome}`, r.condutor || '']); }));
  if (!ncs.length) paragrafo('Nenhum item não conforme no mês.');
  else {
    txt('Data', M + 2, y, { b: 1 }); txt('Item', M + 30, y, { b: 1 }); txt('Condutor', M + 120, y, { b: 1 }); novaLinha();
    ncs.forEach(([d, it, c]) => { doc.setTextColor(198, 40, 40); txt(d, M + 2, y); txt(it, M + 30, y); doc.setTextColor(0); txt(c, M + 120, y); novaLinha(4.5); });
  }

  titulo('Observações e avarias');
  const obs = regs.filter(r => (r.obs || '').trim() || r.marks.length || r.fotos.length);
  if (!obs.length) paragrafo('Nenhuma observação ou avaria registrada no mês.');
  obs.forEach(r => {
    const av = AVARIAS.map(([k, n]) => [n, r.marks.filter(mk => mk.t === k).length]).filter(a => a[1]).map(([n, q]) => `${q} ${n.toLowerCase()}`).join(', ');
    const extra = [av && 'Avarias: ' + av, r.fotos.length && `${r.fotos.length} foto(s)`].filter(Boolean).join(' · ');
    paragrafo(`${brData(r.data)}: ${(r.obs || '').trim() || '(sem texto)'}${extra ? '  [' + extra + ']' : ''}`);
  });

  if (y > PH - 40) { doc.addPage(); y = M + 4; }
  y = Math.max(y + 12, PH - 32);
  ['Assinatura Condutor', 'Assinatura Supervisor/Gerente', 'Assinatura Auditor'].forEach((t, i) => {
    const x = M + i * (W / 3); doc.setDrawColor(0); doc.line(x + 4, y, x + W / 3 - 8, y); txt(t, x + 4, y + 4, { b: 1, s: 8 });
  });
  txt(`Gerado em ${brData(hoje())} pelo app Checklist de Veículos`, M, PH - 4, { s: 7 });
  txt(REVISAO, M + W, PH - 4, { s: 7, a: 'right' });
  return doc;
}

/* ---------- Cadastro de veículos (veiculos.json, gerado de "Veículos inventário.xlsx") ---------- */
// Lista embutida (garante o funcionamento mesmo sem o arquivo); veiculos.json, se existir, a substitui.
const V = (modelo, placa, motorista, radio, regiao) => ({ modelo, placa, motorista, radio, regiao, area: 'Inventário Florestal' });
let VEICULOS = {
  '3': V('HILUX', 'JCK 9A28', 'Paulo Sérgio', 'Sim', 'Guaíba'),
  '9': V('HILUX', 'TRJ 4E49', 'Diulliane', 'Não', 'Vila Nova do Sul'),
  '16': V('RANGER', 'JAI 9J85', 'Micael', 'Sim', 'Guaíba'),
  '20': V('HILUX', 'JCV 3F17', 'Alexandre', 'Não', 'Pinheiro Machado'),
  '26': V('HILUX', 'JCP 7E26', 'Marcos Rodrigues', 'Não', 'Pinheiro Machado'),
  '30': V('RANGER', 'JBB 5I18', 'Marcos Bertó', 'Sim', 'Guaíba'),
  '32': V('RANGER', 'JCK 9A23', 'Fagner', 'Não', 'Guaíba'),
  '35': V('RANGER', 'JBG 5A79', 'Carlos Eduardo', 'Não', 'Guaíba'),
  '38': V('MONTANA', 'JCN 4J83', 'Carmen', 'Não', 'Guaíba'),
  '43': V('HILUX', 'TER 6J57', 'Gabriel', 'Não', 'Vila Nova do Sul'),
  '44': V('HILUX', 'TRJ 4E46', 'Reserva', 'Não', 'Guaíba'),
  '45': V('HILUX', 'JDE 5D 75', 'Robson', 'Sim', 'Guaíba'),
  '48': V('HILUX', 'TQR 2D48', 'Gilnei', 'Sim', 'Guaíba'),
  '49': V('HILUX', 'JBY 1E19', 'Lucas', 'Sim', 'Encruzilhada do Sul')
};
// aceita também o formato antigo { "18": "PLACA" }
fetch('veiculos.json').then(r => r.json()).then(j => {
  if (!j || !Object.keys(j).length) return;
  VEICULOS = {};
  for (const k in j) VEICULOS[k] = typeof j[k] === 'string' ? V('', j[k], '', '', '') : j[k];
}).catch(() => {});

/* ---------- Início ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
window.addEventListener('pagehide', flush);
showList();