let csrfToken = '';
let dashboardData = null;
let currentDebtor = null;
let currentView = 'dashboard';
let sessionData = null;

const $ = (id) => document.getElementById(id);
const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function formatDate(value) {
  if (!value) return 'Data não informada';
  const datePart = String(value).slice(0, 10);
  const parts = datePart.split('-');
  if (parts.length !== 3) return datePart;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
function formatDateTime(value) {
  if (!value) return 'Ainda não registrado';
  const raw = String(value).replace(' ', 'T');
  const d = new Date(raw.endsWith('Z') ? raw : `${raw}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(d);
}

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function percentPaid(d) {
  if (!d.original_amount_cents) return 0;
  return Math.max(0, Math.min(100, Math.round((d.paid_cents / d.original_amount_cents) * 100)));
}
function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0,2).map(x => x[0]?.toUpperCase()).join('');
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (csrfToken && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) headers.set('x-csrf-token', csrfToken);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) { location.href = '/'; throw new Error('Sessão expirada.'); }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || 'Não foi possível concluir a operação.');
  return data;
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 2800);
}

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

async function init() {
  try {
    sessionData = await api('/api/session');
    csrfToken = sessionData.csrfToken;
    $('accountSidebarName').textContent = sessionData.user || 'Administrador';
    await loadDashboard();
    bindEvents();
  } catch (_e) {
    location.href = '/';
  }
}

async function loadDashboard() {
  dashboardData = await api('/api/dashboard');
  renderDashboard();
  renderPeople();
}

function renderDashboard() {
  const { totals, debtors, recent } = dashboardData;
  $('statRemaining').textContent = money(totals.remaining_cents);
  $('heroRemaining').textContent = money(totals.remaining_cents);
  $('statPaid').textContent = money(totals.paid_cents);
  $('statOriginal').textContent = money(totals.original_cents);
  $('statPeople').textContent = totals.debtors_count;
  const pct = totals.original_cents ? Math.round((totals.paid_cents / totals.original_cents) * 100) : 0;
  $('statPaidPct').textContent = `${pct}% do valor total`;
  $('overallProgressBar').style.width = `${Math.max(0, Math.min(100, pct))}%`;
  $('overallProgressLabel').textContent = `${pct}% do valor total já recebido`;

  $('debtorCards').innerHTML = debtors.length ? debtors.map(d => {
    const pct = percentPaid(d);
    const paid = d.remaining_cents <= 0;
    return `<article class="debtor-card" data-debtor-id="${d.id}">
      <div class="debtor-top"><div class="avatar">${escapeHtml(initials(d.name))}</div><span class="status-pill ${paid ? 'paid' : ''}">${paid ? 'QUITADO' : 'PENDENTE'}</span></div>
      <h3>${escapeHtml(d.name)}</h3>
      <div class="balance-label">Saldo restante</div>
      <div class="balance-value">${money(d.remaining_cents)}</div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="progress-meta"><span>${money(d.paid_cents)} recebido</span><span>${pct}% pago</span></div>
      <div class="card-footer"><span>${d.payments_count} pagamento(s)</span><span class="card-open">Abrir ficha →</span></div>
    </article>`;
  }).join('') : `<div class="empty-state">Nenhuma pessoa cadastrada.</div>`;

  $('recentList').innerHTML = recent.length ? recent.map(p => transactionRow(p, false)).join('') : `<div class="empty-state">Nenhum pagamento registrado ainda.</div>`;

  document.querySelectorAll('[data-debtor-id]').forEach(el => el.addEventListener('click', () => openPerson(el.dataset.debtorId)));
}

function transactionRow(p, detailed = false) {
  const hasReceipt = !!p.receipt_original_name;
  return `<div class="transaction-row">
    <div class="tx-icon">R$</div>
    <div class="tx-main">
      <strong>${escapeHtml(p.debtor_name || currentDebtor?.debtor?.name || 'Pagamento')}</strong>
      <span>${formatDate(p.payment_date)}${p.method ? ` • ${escapeHtml(p.method)}` : ''}${p.note ? ` • ${escapeHtml(p.note)}` : ''}</span>
      ${detailed ? `<div class="payment-actions">
        <button class="mini-btn" data-receipt-action="${p.id}" data-has-receipt="${hasReceipt ? '1':'0'}">${hasReceipt ? 'Ver comprovante' : 'Anexar comprovante'}</button>
        ${hasReceipt ? `<button class="mini-btn" data-replace-receipt="${p.id}">Trocar arquivo</button><button class="mini-btn danger" data-delete-receipt="${p.id}">Remover comprovante</button>` : ''}
        <button class="mini-btn danger" data-delete-payment="${p.id}">Excluir pagamento</button>
      </div>` : ''}
    </div>
    <div class="tx-value">+ ${money(p.amount_cents)}<small>${hasReceipt ? '📎 comprovante' : 'sem comprovante'}</small></div>
  </div>`;
}

function renderPeople(filter = '') {
  if (!dashboardData) return;
  const normalized = filter.trim().toLocaleLowerCase('pt-BR');
  const list = dashboardData.debtors.filter(d => d.name.toLocaleLowerCase('pt-BR').includes(normalized));
  $('peopleTable').innerHTML = list.length ? list.map(d => `<div class="person-row">
    <div class="name-cell"><div class="avatar">${escapeHtml(initials(d.name))}</div><div><strong>${escapeHtml(d.name)}</strong><div class="muted" style="font-size:11px;margin-top:3px">${d.payments_count} pagamento(s)</div></div></div>
    <div><span class="cell-label">Dívida original</span><strong>${money(d.original_amount_cents)}</strong></div>
    <div><span class="cell-label">Já pago</span><strong>${money(d.paid_cents)}</strong></div>
    <div><span class="cell-label">Restante</span><strong>${money(d.remaining_cents)}</strong></div>
    <button class="btn btn-secondary" data-open-person="${d.id}">Abrir ficha</button>
  </div>`).join('') : `<div class="empty-state">Nenhuma pessoa encontrada.</div>`;
  document.querySelectorAll('[data-open-person]').forEach(btn => btn.addEventListener('click', () => openPerson(btn.dataset.openPerson)));
}

async function loadReceipts() {
  const { receipts } = await api('/api/receipts');
  $('receiptGrid').innerHTML = receipts.length ? receipts.map(r => {
    const isPdf = r.receipt_mimetype === 'application/pdf';
    return `<article class="receipt-card">
      <div class="receipt-thumb ${isPdf ? 'pdf' : ''}" data-preview-receipt="${r.payment_id}" data-mime="${escapeHtml(r.receipt_mimetype || '')}">
        ${isPdf ? 'PDF' : `<img src="/api/receipts/${r.payment_id}" alt="Comprovante de ${escapeHtml(r.debtor_name)}">`}
      </div>
      <h3>${escapeHtml(r.debtor_name)}</h3>
      <p>${formatDate(r.payment_date)} • ${escapeHtml(r.receipt_original_name || 'Comprovante')}</p>
      <div class="receipt-value">${money(r.amount_cents)}</div>
    </article>`;
  }).join('') : `<div class="empty-state">Você ainda não anexou nenhum comprovante.</div>`;
  document.querySelectorAll('[data-preview-receipt]').forEach(el => el.addEventListener('click', () => previewReceipt(el.dataset.previewReceipt, el.dataset.mime)));
}

async function loadAccount() {
  try {
    const account = await api('/api/account');
    $('accountDisplayName').textContent = account.username;
    $('accountCurrentUsername').textContent = account.username;
    $('accountLastLogin').textContent = formatDateTime(account.lastLoginAt);
    $('accountPasswordChanged').textContent = formatDateTime(account.passwordChangedAt);
    $('newUsername').value = account.username;
    $('accountSidebarName').textContent = account.username;
    if (sessionData) sessionData.user = account.username;
  } catch (err) {
    toast(err.message);
  }
}

async function openPerson(id) {
  currentDebtor = await api(`/api/debtors/${id}`);
  const d = currentDebtor.debtor;
  $('personName').textContent = d.name;
  $('personAvatar').textContent = initials(d.name);
  $('personStatus').textContent = d.remaining_cents <= 0 ? 'QUITADO' : 'PENDENTE';
  $('personStatus').classList.toggle('paid', d.remaining_cents <= 0);
  $('personNotes').textContent = d.notes || 'Sem observações cadastradas.';
  $('personOriginal').textContent = money(d.original_amount_cents);
  $('personPaid').textContent = money(d.paid_cents);
  $('personRemaining').textContent = money(d.remaining_cents);
  $('personProgress').textContent = `${percentPaid(d)}%`;
  $('paymentHistory').innerHTML = currentDebtor.payments.length ? currentDebtor.payments.map(p => transactionRow(p, true)).join('') : `<div class="empty-state">Nenhum pagamento registrado.</div>`;
  bindPaymentActions();
  switchView('person', d.name);
}

function bindPaymentActions() {
  document.querySelectorAll('[data-receipt-action]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.hasReceipt === '1') previewReceipt(btn.dataset.receiptAction, currentDebtor.payments.find(p => p.id == btn.dataset.receiptAction)?.receipt_mimetype);
    else chooseReceipt(btn.dataset.receiptAction);
  }));
  document.querySelectorAll('[data-replace-receipt]').forEach(btn => btn.addEventListener('click', () => chooseReceipt(btn.dataset.replaceReceipt)));
  document.querySelectorAll('[data-delete-receipt]').forEach(btn => btn.addEventListener('click', () => deleteReceipt(btn.dataset.deleteReceipt)));
  document.querySelectorAll('[data-delete-payment]').forEach(btn => btn.addEventListener('click', () => deletePayment(btn.dataset.deletePayment)));
}

function previewReceipt(paymentId, mime) {
  const url = `/api/receipts/${paymentId}`;
  $('receiptPreview').innerHTML = mime === 'application/pdf'
    ? `<iframe src="${url}" title="Comprovante PDF"></iframe>`
    : `<img src="${url}" alt="Comprovante de pagamento">`;
  openModal('receiptModal');
}

function chooseReceipt(paymentId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,application/pdf';
  input.addEventListener('change', async () => {
    if (!input.files?.[0]) return;
    const fd = new FormData();
    fd.append('receipt', input.files[0]);
    try {
      await api(`/api/payments/${paymentId}/receipt`, { method: 'POST', body: fd });
      toast('Comprovante anexado.');
      await openPerson(currentDebtor.debtor.id);
      await loadDashboard();
    } catch (err) { toast(err.message); }
  });
  input.click();
}

async function deleteReceipt(paymentId) {
  if (!confirm('Remover somente o comprovante deste pagamento? O pagamento continuará salvo.')) return;
  try {
    await api(`/api/payments/${paymentId}/receipt`, { method: 'DELETE' });
    toast('Comprovante removido.');
    await openPerson(currentDebtor.debtor.id);
  } catch (err) { toast(err.message); }
}

async function deletePayment(paymentId) {
  if (!confirm('Excluir este pagamento? O saldo da dívida aumentará novamente.')) return;
  try {
    await api(`/api/payments/${paymentId}`, { method: 'DELETE' });
    toast('Pagamento excluído.');
    const id = currentDebtor.debtor.id;
    await loadDashboard();
    await openPerson(id);
  } catch (err) { toast(err.message); }
}

function switchView(view, personName = '') {
  currentView = view;
  document.querySelectorAll('.view-section').forEach(x => x.classList.add('hidden'));
  document.querySelectorAll('.nav-item[data-view]').forEach(x => x.classList.toggle('active', x.dataset.view === view));
  const map = {
    dashboard: ['RESUMO FINANCEIRO','Visão geral'],
    people: ['CADASTROS','Pessoas'],
    receipts: ['ARQUIVOS','Comprovantes'],
    account: ['CONFIGURAÇÕES','Minha conta'],
    person: ['DETALHES', personName || 'Pessoa']
  };
  $('viewEyebrow').textContent = map[view][0];
  $('viewTitle').textContent = map[view][1];
  $('view' + view[0].toUpperCase() + view.slice(1)).classList.remove('hidden');
  $('newPersonBtn').classList.toggle('hidden', view === 'account');
  if (view === 'receipts') loadReceipts();
  if (view === 'account') loadAccount();
  $('sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openNewPerson() {
  $('personId').value = '';
  $('personModalTitle').textContent = 'Nova pessoa';
  $('personFormName').value = '';
  $('personFormAmount').value = '';
  $('personFormNotes').value = '';
  $('personFormError').textContent = '';
  openModal('personModal');
}

function openEditPerson() {
  if (!currentDebtor) return;
  const d = currentDebtor.debtor;
  $('personId').value = d.id;
  $('personModalTitle').textContent = 'Editar dívida';
  $('personFormName').value = d.name;
  $('personFormAmount').value = (d.original_amount_cents / 100).toFixed(2);
  $('personFormNotes').value = d.notes || '';
  $('personFormError').textContent = '';
  openModal('personModal');
}

function openPayment() {
  if (!currentDebtor) return;
  const d = currentDebtor.debtor;
  $('paymentForm').reset();
  $('paymentDate').value = localToday();
  $('paymentMethod').value = 'PIX';
  $('receiptFileName').textContent = 'JPG, PNG, WEBP ou PDF • até 8 MB';
  $('paymentBalanceHint').textContent = `${d.name} ainda deve ${money(d.remaining_cents)}.`;
  $('paymentAmount').max = (d.remaining_cents / 100).toFixed(2);
  $('paymentFormError').textContent = '';
  openModal('paymentModal');
}

function bindEvents() {
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  document.querySelectorAll('.modal-backdrop').forEach(bg => bg.addEventListener('click', (e) => { if (e.target === bg) bg.classList.add('hidden'); }));
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  $('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('newPersonBtn').addEventListener('click', openNewPerson);
  $('editPersonBtn').addEventListener('click', openEditPerson);
  $('addPaymentBtn').addEventListener('click', openPayment);
  $('backBtn').addEventListener('click', () => switchView('dashboard'));
  $('peopleSearch').addEventListener('input', (e) => renderPeople(e.target.value));
  $('receiptInput').addEventListener('change', () => {
    $('receiptFileName').textContent = $('receiptInput').files?.[0]?.name || 'JPG, PNG, WEBP ou PDF • até 8 MB';
  });

  $('personForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('personFormError').textContent = '';
    const id = $('personId').value;
    const payload = JSON.stringify({ name: $('personFormName').value, originalAmount: $('personFormAmount').value, notes: $('personFormNotes').value });
    try {
      await api(id ? `/api/debtors/${id}` : '/api/debtors', { method: id ? 'PUT' : 'POST', body: payload });
      closeModal('personModal');
      toast(id ? 'Cadastro atualizado.' : 'Pessoa cadastrada.');
      await loadDashboard();
      if (id) await openPerson(id);
    } catch (err) { $('personFormError').textContent = err.message; }
  });

  $('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('paymentFormError').textContent = '';
    const btn = $('paymentForm').querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      const fd = new FormData($('paymentForm'));
      await api(`/api/debtors/${currentDebtor.debtor.id}/payments`, { method: 'POST', body: fd });
      closeModal('paymentModal');
      toast('Pagamento registrado com sucesso.');
      const id = currentDebtor.debtor.id;
      await loadDashboard();
      await openPerson(id);
    } catch (err) { $('paymentFormError').textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'Confirmar pagamento'; }
  });

  $('usernameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('usernameFormError').textContent = '';
    const btn = $('usernameForm').querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      const data = await api('/api/account/username', {
        method: 'PUT',
        body: JSON.stringify({
          username: $('newUsername').value,
          currentPassword: $('usernameCurrentPassword').value
        })
      });
      $('usernameCurrentPassword').value = '';
      $('accountSidebarName').textContent = data.username;
      toast('Usuário de acesso alterado com sucesso.');
      await loadAccount();
    } catch (err) {
      $('usernameFormError').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar novo usuário';
    }
  });

  $('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('passwordFormError').textContent = '';
    const newPassword = $('passwordNew').value;
    const confirmPassword = $('passwordConfirm').value;
    if (newPassword !== confirmPassword) {
      $('passwordFormError').textContent = 'A confirmação da nova senha não confere.';
      return;
    }
    const btn = $('passwordForm').querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Atualizando...';
    try {
      await api('/api/account/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: $('passwordCurrent').value,
          newPassword,
          confirmPassword
        })
      });
      $('passwordForm').reset();
      toast('Senha alterada. Outras sessões foram encerradas.');
      await loadAccount();
    } catch (err) {
      $('passwordFormError').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Atualizar senha';
    }
  });

  $('logoutOthersForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('logoutOthersError').textContent = '';
    const btn = $('logoutOthersForm').querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Encerrando...';
    try {
      const result = await api('/api/account/logout-others', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: $('logoutOthersPassword').value })
      });
      $('logoutOthersForm').reset();
      toast(result.closedSessions ? `${result.closedSessions} outra(s) sessão(ões) encerrada(s).` : 'Não havia outras sessões abertas.');
    } catch (err) {
      $('logoutOthersError').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Encerrar outras sessões';
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } finally { location.href = '/'; }
  });
  $('backupBtn').addEventListener('click', () => { window.location.href = '/api/backup'; });
}

init();
