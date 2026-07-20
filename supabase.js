import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const NEXT_PUBLIC_SUPABASE_URL='https://xgygohmfhyllgfcrgtyu.supabase.co';
export const NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_Ijcmwt2ZdPa1REDkZrISLA_Rf28weNi';
export const STORAGE_BUCKET = 'dados-operacionais';
export const AUTO_REFRESH_MS = 5 * 60 * 1000;
const cache = new Map();
let db;

export function client() {
  if (db) return db;
  if (NEXT_PUBLIC_SUPABASE_URL.startsWith('SEU_')) {
    throw new Error('Configure URL e chave pública em supabase.js.');
  }
  db = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return db;
}

export async function signIn(email, password) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export const signOut = () => client().auth.signOut();
export const getSession = async () => (await client().auth.getSession()).data.session;
export const authChange = fn => client().auth.onAuthStateChange((_event, session) => fn(session));

export async function profile(id) {
  const { data, error } = await client().from('profiles').select('id,nome,role').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || { id, nome: 'Usuário', role: 'viewer' };
}

async function list(prefix, depth = 0) {
  if (depth > 4) return [];
  const { data, error } = await client().storage.from(STORAGE_BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' }
  });
  if (error) throw error;
  let output = [];
  for (const item of data || []) {
    const path = `${prefix}/${item.name}`;
    if (item.id || /\.[a-z0-9]{2,6}$/i.test(item.name)) output.push({ ...item, path });
    else output.push(...await list(path, depth + 1));
  }
  return output;
}

function periodOf(file) {
  const relative = file.path.replace(/^historico\//, '');
  const folder = relative.split('/')[0];
  if (folder !== file.name) return folder;
  const match = file.name.match(/(20\d{2})[-_. ]?(0?[1-9]|1[0-2])/);
  return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}` : 'Histórico';
}

export async function periods() {
  const [current, history] = await Promise.all([list('mes_atual'), list('historico')]);
  const groups = {};
  history.forEach(file => (groups[periodOf(file)] ??= []).push(file));
  return [
    { id: 'current', label: 'Mês atual', origin: 'mes_atual', files: current },
    ...Object.entries(groups).sort((a,b) => b[0].localeCompare(a[0])).map(([key, files]) => ({
      id: `history:${key}`, label: key, origin: 'historico', files
    }))
  ];
}

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
async function download(path) {
  const { data, error } = await client().storage.from(STORAGE_BUCKET).download(path);
  if (error) throw error;
  return data;
}

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^\[?\$?analiticos\]?\.\[?/i, '')
    .replace(/[\[\]]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function scoreHeaderRow(row) {
  const values = (row || []).map(normalizeHeader);
  const expected = ['CD_CONTRATO','CIDADE','MOTIVO','WO_MANIFESTO','LOGIN_TECNICO','CAUSA_N1'];
  return expected.reduce((score, field) => score + (values.includes(field) ? 1 : 0), 0);
}

function parseWorkbook(buffer, fileName) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  let selectedSheet = null;
  let selectedMatrix = null;
  let bestHeaderRow = -1;
  let bestScore = -1;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
    const limit = Math.min(matrix.length, 30);
    for (let index = 0; index < limit; index++) {
      const score = scoreHeaderRow(matrix[index]);
      if (score > bestScore) {
        bestScore = score;
        bestHeaderRow = index;
        selectedSheet = sheet;
        selectedMatrix = matrix;
      }
    }
  }

  if (!selectedSheet || bestScore < 2) {
    const first = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(first, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
  }

  const rawHeaders = selectedMatrix[bestHeaderRow];
  const headers = rawHeaders.map((header, index) => normalizeHeader(header) || `COLUNA_${index + 1}`);
  const seen = {};
  const uniqueHeaders = headers.map(header => {
    seen[header] = (seen[header] || 0) + 1;
    return seen[header] === 1 ? header : `${header}_${seen[header]}`;
  });

  return selectedMatrix
    .slice(bestHeaderRow + 1)
    .filter(row => row.some(value => String(value ?? '').trim() !== ''))
    .map(row => Object.fromEntries(uniqueHeaders.map((header, index) => [header, row[index] ?? ''])))
    .filter(row => String(row.CD_CONTRATO || row.CONTRATO || '').trim() !== '');
}

async function parse(blob, name) {
  if (/\.csv$/i.test(name)) {
    const text = await blob.text();
    return await new Promise((resolve, reject) => Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: result => resolve(result.data),
      error: reject
    }));
  }
  return parseWorkbook(await blob.arrayBuffer(), name);
}

export async function loadPeriod(period) {
  const key = period.id + ':' + period.files.map(file => file.path + ':' + (file.updated_at || '')).join('|');
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 300000) return cached.data;

  const definitions = {
    log: ['LOG_MANUTENCAO', 'LOG MANUTENCAO'],
    tnps: ['tnps', 'ANL_TNPS'],
    manifestos: ['MANIF_RRS', 'MANIF RRS']
  };
  const output = { log: [], tnps: [], manifestos: [], files: period.files, missing: [] };

  await Promise.all(Object.entries(definitions).map(async ([keyName, aliases]) => {
    const file = period.files.find(item => aliases.some(alias => normalize(item.name).includes(normalize(alias))));
    if (!file) {
      output.missing.push(aliases[0]);
      return;
    }
    output[keyName] = await parse(await download(file.path), file.name);
  }));

  cache.set(key, { time: Date.now(), data: output });
  return output;
}

export async function listFca(filters = {}) {
  let query = client().from('fca_manifestos').select('*').order('data_criacao', { ascending: false });
  if (filters.contrato) query = query.ilike('contrato', `%${filters.contrato}%`);
  if (filters.manifesto) query = query.ilike('manifesto', `%${filters.manifesto}%`);
  if (filters.mes_referencia) query = query.eq('mes_referencia', filters.mes_referencia);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
export async function createFca(payload) { const { error } = await client().from('fca_manifestos').insert(payload); if (error) throw error; }
export async function updateFca(id, payload) { const { error } = await client().from('fca_manifestos').update(payload).eq('id', id); if (error) throw error; }
export async function deleteFca(id) { const { error } = await client().from('fca_manifestos').delete().eq('id', id); if (error) throw error; }
