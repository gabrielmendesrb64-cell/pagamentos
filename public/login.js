const form = document.getElementById('loginForm');
const errorEl = document.getElementById('loginError');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const btn = form.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.username.value, password: form.password.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível entrar.');
    location.href = '/';
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar no painel';
  }
});
