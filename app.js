import { AUTO_REFRESH_MS, periods, loadPeriod, signIn, signOut, getSession, profile, authChange, client } from './supabase.js';
import { renderDashboard } from './dashboard.js';
import { renderLog } from './log_manutencao.js';
import { renderTnps } from './tnps.js';
import { renderManifestos } from './manifestos.js';
import { renderFca } from './fca.js';

export const state = {
  session: null, profile: null, periods: [], period: null,
  data: { log: [], tnps: [], manifestos: [], files: [] },
  page: 'dashboard', charts: [], tables: []
};

export const $ = selector => document.querySelector(selector);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
export const val = (row, ...keys) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && String(row[key]).trim() !== '') return row[key];
  }
  return '';
};
export const uniq = (rows, key) => [...new Set(rows.map(row => val(row, key)).filter(Boolean))]
  .sort((a,b) => String(a).localeCompare(String(b), 'pt-BR'));
export const count = (rows, key) => rows.reduce((result, row) => {
  const value = val(row, key) || 'Não informado';
  result[value] = (result[value] || 0) + 1;
  return result;
}, {});
export const fmt = (value, digits = 0) => new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: digits, minimumFractionDigits: digits
}).format(Number(value) || 0);
export const opts = values => '<option value="">Todos</option>' + values
  .map(value => `<option>${esc(value)}</option>`).join('');

export function chart(element, config) {
  const instance = new Chart(element, config);
  state.charts.push(instance);
  return instance;
}
export function dataTable(selector, options = {}) {
  const instance = new DataTable(selector, {
    pageLength: 15,
    deferRender: true,
    language: { url: 'https://cdn.datatables.net/plug-ins/2.3.4/i18n/pt-BR.json' },
    layout: {
      topStart: { buttons: ['excelHtml5', 'csvHtml5', 'pdfHtml5'] },
      topEnd: 'search', bottomStart: 'info', bottomEnd: 'paging'
    },
    ...options
  });
  state.tables.push(instance);
  return instance;
}
export function filters() {
  document.querySelector('.filter-toggle')?.addEventListener('click', () =>
    document.querySelector('.filters')?.classList.toggle('open'));
}
export function notice(message, type = '') {
  const element = document.createElement('div');
  element.className = `notice ${type}`;
  element.textContent = message;
  $('#alertArea')?.replaceChildren(element);
}
function busy(show, text = 'Carregando...') {
  $('#loadingText').textContent = text;
  $('#loadingOverlay').classList.toggle('d-none', !show);
}

function ensureLoginDiagnosticBox() {
  let box = document.getElementById('loginDiagnostic');
  if (!box) {
    box = document.createElement('div');
    box.id = 'loginDiagnostic';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'display:none;margin-top:14px;padding:13px;border-radius:10px;border:1px solid #ddd;background:#f8f9fa;text-align:left;font-size:13px;white-space:normal';
    document.getElementById('loginMessage').after(box);
  }
  return box;
}

function showLoginError(title, message, action, technical = '') {
  const box = ensureLoginDiagnosticBox();
  box.style.display = 'block';
  box.style.background = '#fff1f1';
  box.style.borderColor = '#f1aeb5';
  box.style.color = '#842029';
  box.innerHTML = `
    <strong style="display:block;font-size:14px;margin-bottom:5px">${esc(title)}</strong>
    <div>${esc(message)}</div>
    <div style="margin-top:7px"><b>Como corrigir:</b> ${esc(action)}</div>
    ${technical ? `<details style="margin-top:8px"><summary>Detalhes técnicos</summary><code style="display:block;margin-top:5px;word-break:break-word">${esc(technical)}</code></details>` : ''}`;
}

function showLoginSuccess(message) {
  const box = ensureLoginDiagnosticBox();
  box.style.display = 'block';
  box.style.background = '#edf9f1';
  box.style.borderColor = '#a3cfbb';
  box.style.color = '#0f5132';
  box.innerHTML = `<strong>Conexão confirmada</strong><div>${esc(message)}</div>`;
}

function classifyError(error, stage = 'login') {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  const status = Number(error?.status || 0);
  const technical = `Etapa: ${stage} | Código: ${code || 'não informado'} | HTTP: ${status || 'não informado'} | Mensagem: ${error?.message || error}`;

  if (message.includes('configure url') || message.includes('seu_url') || message.includes('sua_chave')) {
    return ['Supabase não configurado', 'A URL ou a chave pública ainda está com o valor de exemplo.', 'Abra supabase.js e coloque a Project URL e a Publishable Key do mesmo projeto Supabase.', technical];
  }
  if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('load failed')) {
    return ['Não foi possível acessar o Supabase', 'O navegador não conseguiu chegar ao endereço configurado.', 'Confira a internet e a URL em supabase.js. A URL deve começar com https:// e terminar em .supabase.co, sem espaços.', technical];
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return ['E-mail ou senha incorretos', 'O Supabase não reconheceu a combinação informada.', 'Confirme o e-mail em Authentication > Users e redefina a senha. Por segurança, o Supabase não informa qual dos dois está incorreto.', technical];
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return ['E-mail ainda não confirmado', 'O usuário existe, mas a confirmação está pendente.', 'No Supabase, abra Authentication > Users e confirme o usuário ou reenvie o e-mail de confirmação.', technical];
  }
  if (status === 429 || code.includes('rate_limit') || message.includes('too many requests')) {
    return ['Muitas tentativas de acesso', 'O limite temporário de autenticação foi atingido.', 'Interrompa novas tentativas e revise e-mail e senha antes do próximo acesso.', technical];
  }
  if (status === 401 || message.includes('invalid api key') || message.includes('apikey')) {
    return ['Chave pública inválida', 'A chave configurada não pertence ao projeto ou foi copiada incorretamente.', 'Copie novamente a Publishable Key em Project Settings > API e substitua em supabase.js. Não use service_role.', technical];
  }
  if (status === 404 || message.includes('not found')) {
    return ['Endereço do projeto incorreto', 'O recurso solicitado não foi encontrado.', 'Compare a Project URL do Supabase com a URL escrita em supabase.js.', technical];
  }
  if (stage === 'profile' && (status === 403 || message.includes('permission denied') || message.includes('row-level security'))) {
    return ['Login aceito, mas o perfil foi bloqueado', 'A senha está correta, porém a tabela profiles ou as políticas RLS impediram a leitura do perfil.', 'Execute novamente o supabase.sql e confirme em Table Editor > profiles que o usuário possui uma linha com role admin ou viewer.', technical];
  }
  if (stage === 'profile' && (message.includes('relation') || message.includes('profiles') || status === 404)) {
    return ['Login aceito, mas a tabela profiles está ausente', 'A autenticação funcionou, porém o sistema não conseguiu carregar o perfil.', 'Execute o arquivo supabase.sql no SQL Editor e confirme que a tabela public.profiles foi criada.', technical];
  }
  if (status >= 500) {
    return ['Erro interno do Supabase', 'O servidor de autenticação ou uma função do banco devolveu erro interno.', 'Abra os detalhes técnicos abaixo. Confira triggers e funções executados pelo supabase.sql.', technical];
  }
  return ['Não foi possível concluir o acesso', 'Foi recebido um erro não mapeado.', 'Abra os detalhes técnicos abaixo e use o código, HTTP e mensagem para localizar a etapa que falhou.', technical];
}

async function validateConnection() {
  // Teste leve: valida se o cliente consegue consultar a sessão.
  const { error } = await client().auth.getSession();
  if (error) throw error;
}

async function enterApplication(session) {
  state.session = session;
  if (!session) {
    $('#loginView').classList.remove('d-none');
    $('#appView').classList.add('d-none');
    return;
  }

  busy(true, 'Validando perfil e permissões...');
  try {
    showLoginSuccess('Senha aceita. Carregando perfil e permissões...');
    state.profile = await profile(session.user.id);
    $('#roleLabel').textContent = state.profile.role === 'admin' ? 'Administrador' : 'Visualizador';
    $('#loginView').classList.add('d-none');
    $('#appView').classList.remove('d-none');
    await refresh();
  } catch (error) {
    console.error('Falha após autenticação:', error);
    const [title, message, action, technical] = classifyError(error, 'profile');
    showLoginError(title, message, action, technical);
    $('#loginView').classList.remove('d-none');
    $('#appView').classList.add('d-none');
  } finally {
    busy(false);
  }
}

async function refresh() {
  busy(true, 'Sincronizando dados...');
  try {
    state.periods = await periods();
    const previous = state.period?.id;
    state.period = state.periods.find(item => item.id === previous) || state.periods[0];
    $('#periodSelect').innerHTML = state.periods.map(item =>
      `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('');
    $('#periodSelect').value = state.period.id;
    state.data = await loadPeriod(state.period);
    $('#periodOrigin').textContent = state.period.origin === 'mes_atual' ? 'Mês atual • automático' : 'Histórico';
    $('#lastUpdate').textContent = new Date().toLocaleString('pt-BR');
    $('#syncStatus').textContent = 'Sincronizado';
    if (state.data.missing.length) notice(`Arquivos não encontrados: ${state.data.missing.join(', ')}`);
    render();
  } catch (error) {
    console.error('Erro de sincronização:', error);
    notice(`Erro ao carregar dados: ${error.message || error}`, 'error');
  } finally {
    busy(false);
  }
}

function render() {
  state.charts.forEach(item => item.destroy());
  state.tables.forEach(item => item.destroy());
  state.charts = [];
  state.tables = [];
  const root = $('#pageContent');
  if (state.page === 'dashboard') renderDashboard(root, state.data);
  else if (state.page === 'log') renderLog(root, state.data.log);
  else if (state.page === 'tnps') renderTnps(root, state.data.tnps);
  else if (state.page === 'manifestos') renderManifestos(root, state.data.manifestos);
  else if (state.page === 'fca') renderFca(root, { ...state, notice });
  else renderDashboard(root, state.data, true, state.period);
}

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('#email').value.trim();
  const password = $('#password').value;
  $('#loginMessage').textContent = '';
  ensureLoginDiagnosticBox().style.display = 'none';

  if (!email) return showLoginError('E-mail não informado', 'O campo e-mail está vazio.', 'Digite o mesmo e-mail cadastrado em Authentication > Users.');
  if (!email.includes('@')) return showLoginError('Formato de e-mail inválido', 'O endereço não contém @.', 'Digite um endereço no formato nome@dominio.com.');
  if (!password) return showLoginError('Senha não informada', 'O campo senha está vazio.', 'Digite a senha cadastrada para o usuário.');

  busy(true, 'Testando conexão com o Supabase...');
  try {
    await validateConnection();
    showLoginSuccess('Endereço e chave pública respondendo. Validando e-mail e senha...');
    const result = await signIn(email, password);
    if (!result?.session) throw Object.assign(new Error('O Supabase aceitou a chamada, mas não devolveu uma sessão.'), { code: 'session_missing' });
    await enterApplication(result.session);
  } catch (error) {
    console.error('Falha no login:', error);
    const [title, message, action, technical] = classifyError(error, 'login');
    showLoginError(title, message, action, technical);
  } finally {
    busy(false);
  }
});

$('#logoutButton').onclick = signOut;
$('#refreshButton').onclick = refresh;
$('#periodSelect').onchange = async event => {
  state.period = state.periods.find(item => item.id === event.target.value);
  busy(true);
  try { state.data = await loadPeriod(state.period); render(); }
  catch (error) { notice(error.message || String(error), 'error'); }
  finally { busy(false); }
};
$('#menuToggle').onclick = () => $('#sidebar').classList.toggle('open');
$('#mainNav').onclick = event => {
  const button = event.target.closest('[data-page]');
  if (!button) return;
  document.querySelectorAll('nav button').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  state.page = button.dataset.page;
  $('#sidebar').classList.remove('open');
  render();
};

(async () => {
  try {
    ensureLoginDiagnosticBox();
    const session = await getSession();
    await enterApplication(session);
    authChange(sessionValue => {
      if (sessionValue?.user?.id !== state.session?.user?.id) enterApplication(sessionValue);
    });
  } catch (error) {
    console.error('Falha na inicialização:', error);
    const [title, message, action, technical] = classifyError(error, 'initialization');
    showLoginError(title, message, action, technical);
  }
  setInterval(() => state.session && refresh(), AUTO_REFRESH_MS);
})();
