import { esc, val, opts, chart, dataTable, filters, state } from './app.js';

let source = [];
let filtered = [];
let table = null;

const columns = [
  ['CD_CONTRATO', 'Contrato'],
  ['MOTIVO', 'Motivo'],
  ['DS_CAUSA_PROBLEMA', 'Causa'],
  ['WO_MANIFESTO', 'Manifesto'],
  ['NM_TIPO_ORDEM_SERVICO', 'Tipo Serviço'],
  ['NM_TP_FECHMTO_ORDEM_SERVICO', 'Fechamento'],
  ['CD_BAIXA_ORDEM_SERVICO', 'Código Baixa'],
  ['LOGIN_TECNICO', 'Login'],
  ['SUB_CAUSA', 'Motivo Ouvidoria'],
  ['CAUSA_N1', 'N1'],
  ['CAUSA_N2', 'N2'],
  ['CAUSA_N3', 'N3'],
  ['CAUSA_N4', 'N4'],
  ['CAUSA_N5', 'N5']
];

// O arquivo MANIF RRS usa CIDADE, não MUNICIPIO.
const aliases = {
  MUNICIPIO: ['CIDADE', 'MUNICIPIO', 'MUNICÍPIO', 'NM_MUNICIPIO'],
  CIDADE: ['CIDADE', 'MUNICIPIO', 'MUNICÍPIO', 'NM_MUNICIPIO'],
  LOGIN_TECNICO: ['LOGIN_TECNICO', 'LOGIN_TEC_CON', 'LOGIN'],
  MOTIVO: ['MOTIVO'],
  NM_TIPO_ORDEM_SERVICO: ['NM_TIPO_ORDEM_SERVICO', 'TIPO_SERVICO', 'TIPO SERVICO'],
  CD_CONTRATO: ['CD_CONTRATO', 'CONTRATO'],
  WO_MANIFESTO: ['WO_MANIFESTO', 'MANIFESTO'],
  DS_CAUSA_PROBLEMA: ['DS_CAUSA_PROBLEMA', 'CAUSA'],
  NM_TP_FECHMTO_ORDEM_SERVICO: ['NM_TP_FECHMTO_ORDEM_SERVICO', 'FECHAMENTO'],
  CD_BAIXA_ORDEM_SERVICO: ['CD_BAIXA_ORDEM_SERVICO', 'CODIGO_BAIXA', 'CÓDIGO BAIXA'],
  SUB_CAUSA: ['SUB_CAUSA', 'MOTIVO_OUVIDORIA'],
  CAUSA_N1: ['CAUSA_N1', 'N1'],
  CAUSA_N2: ['CAUSA_N2', 'N2'],
  CAUSA_N3: ['CAUSA_N3', 'N3'],
  CAUSA_N4: ['CAUSA_N4', 'N4'],
  CAUSA_N5: ['CAUSA_N5', 'N5']
};

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\[?\$?analiticos\]?\.\[?/i, '')
    .replace(/[\[\]]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function fieldValue(row, requested) {
  if (!row) return '';
  const candidates = aliases[requested] || [requested];
  const normalizedCandidates = candidates.map(normalizeHeader);

  // Primeiro tenta as formas exatas mais comuns.
  for (const candidate of candidates) {
    const direct = val(row, candidate, `[$analiticos].[${candidate}]`);
    if (direct !== '') return direct;
  }

  // Depois procura dinamicamente, ignorando prefixos, acentos, espaços e pontuação.
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const normalizedKey = normalizeHeader(key);
    if (normalizedCandidates.includes(normalizedKey)) return value;
  }
  return '';
}

function unique(rows, key) {
  return [...new Set(rows.map(row => fieldValue(row, key)).filter(value => String(value).trim() !== ''))]
    .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
}

export function renderManifestos(root, rows) {
  source = (rows || []).filter(row => Object.values(row || {}).some(value => String(value ?? '').trim() !== ''));
  filtered = [...source];
  table = null;

  const cities = unique(source, 'CIDADE');
  const technicians = unique(source, 'LOGIN_TECNICO');
  const reasons = unique(source, 'MOTIVO');
  const serviceTypes = unique(source, 'NM_TIPO_ORDEM_SERVICO');

  root.innerHTML = `
    <div class="heading">
      <div>
        <h1>Manifestos RRS</h1>
        <small>${source.length} caso(s) carregado(s)</small>
      </div>
      <button class="btn filter-toggle">Filtros</button>
    </div>

    <section class="panel filter-panel">
      <div class="filters">
        ${select('manifestCity', 'Município', cities)}
        ${select('manifestTechnician', 'Login Técnico', technicians)}
        ${select('manifestReason', 'Motivo', reasons)}
        ${select('manifestService', 'Tipo Serviço', serviceTypes)}
      </div>
    </section>

    ${source.length === 0 ? '<div class="notice error">O arquivo foi localizado, mas nenhuma linha de dados foi lida.</div>' : ''}
    ${source.length > 0 && cities.length === 0 ? `<div class="notice error">Foram lidas ${source.length} linhas, mas a coluna CIDADE não foi reconhecida. Cabeçalhos encontrados: ${esc(Object.keys(source[0]).join(' | '))}</div>` : ''}

    <div class="charts">
      ${chartCard('Quantidade por Tipo de Serviço', 'manifestServiceChart')}
      ${chartCard('Quantidade por Motivo', 'manifestReasonChart')}
      ${chartCard('Quantidade por Código de Baixa', 'manifestCodeChart')}
      ${chartCard('Quantidade por Login Técnico', 'manifestTechnicianChart')}
      ${[1,2,3,4,5].map((level, index) => chartCard(`Top causas N${level}`, `manifestN${level}Chart`, index === 4 ? 'full' : '')).join('')}
    </div>

    <section class="panel table-panel">
      <table id="manifestTable" class="table cards">
        <thead><tr>${columns.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
      </table>
    </section>`;

  filters();

  table = dataTable('#manifestTable', {
    data: mapRows(filtered),
    columns: columns.map(([, label], index) => ({ title: label, data: index })),
    pageLength: 10,
    order: [[3, 'desc']],
    rowCallback: row => [...row.cells].forEach((cell, index) => cell.dataset.label = columns[index][1])
  });

  ['manifestCity', 'manifestTechnician', 'manifestReason', 'manifestService']
    .forEach(id => document.getElementById(id).addEventListener('change', applyFilters));

  drawCharts();
}

function select(id, label, values) {
  return `<div><label for="${id}">${label}</label><select id="${id}" class="form-select">${opts(values)}</select></div>`;
}

function chartCard(title, id, extraClass = '') {
  return `<article class="chart-card ${extraClass}"><h2>${title}</h2><div class="chart-wrap"><canvas id="${id}"></canvas></div></article>`;
}

function applyFilters() {
  const city = document.getElementById('manifestCity').value;
  const technician = document.getElementById('manifestTechnician').value;
  const reason = document.getElementById('manifestReason').value;
  const service = document.getElementById('manifestService').value;

  filtered = source.filter(row =>
    (!city || String(fieldValue(row, 'CIDADE')) === city) &&
    (!technician || String(fieldValue(row, 'LOGIN_TECNICO')) === technician) &&
    (!reason || String(fieldValue(row, 'MOTIVO')) === reason) &&
    (!service || String(fieldValue(row, 'NM_TIPO_ORDEM_SERVICO')) === service)
  );

  table.clear().rows.add(mapRows(filtered)).draw();
  drawCharts();
}

function mapRows(rows) {
  return rows.map(row => columns.map(([key]) => esc(fieldValue(row, key))));
}

function groupedCount(key) {
  return filtered.reduce((result, row) => {
    const value = String(fieldValue(row, key) || 'Não informado');
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

function drawCharts() {
  state.charts.forEach(item => item.destroy());
  state.charts = [];

  plot('manifestServiceChart', 'NM_TIPO_ORDEM_SERVICO');
  plot('manifestReasonChart', 'MOTIVO');
  plot('manifestCodeChart', 'CD_BAIXA_ORDEM_SERVICO');
  plot('manifestTechnicianChart', 'LOGIN_TECNICO');
  [1,2,3,4,5].forEach(level => plot(`manifestN${level}Chart`, `CAUSA_N${level}`));
}

function plot(canvasId, key) {
  const pairs = Object.entries(groupedCount(key)).sort((a, b) => b[1] - a[1]).slice(0, 15);
  chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels: pairs.map(item => item[0]),
      datasets: [{
        data: pairs.map(item => item[1]),
        backgroundColor: '#0077c8',
        hoverBackgroundColor: '#d71920',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: pairs.length > 7 ? 'y' : 'x',
      plugins: { legend: { display: false } },
      onClick: (_event, elements) => {
        if (!elements.length) return;
        const selectedValue = pairs[elements[0].index][0];
        showCases(key, selectedValue);
      }
    }
  });
}

function showCases(key, selectedValue) {
  const related = filtered.filter(row => String(fieldValue(row, key) || 'Não informado') === String(selectedValue));
  document.getElementById('detailModalTitle').textContent = `${selectedValue} — ${related.length} caso(s)`;
  document.getElementById('detailModalBody').innerHTML = `
    <div class="table-responsive">
      <table class="table table-striped">
        <thead><tr>${columns.slice(0, 9).map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
        <tbody>${related.map(row => `<tr>${columns.slice(0, 9).map(([field]) => `<td>${esc(fieldValue(row, field))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('detailModal')).show();
}
