document.addEventListener('DOMContentLoaded', async () => {
  const api = window.api;

  // Elements
  const deviceIdEl = document.getElementById('deviceIdEl');
  const serverStatusBadge = document.getElementById('serverStatusBadge');
  const atolStatusBadge = document.getElementById('atolStatusBadge');
  const serverUrlInput = document.getElementById('serverUrlInput');
  const pairingInput = document.getElementById('pairingInput');
  const pairBtn = document.getElementById('pairBtn');
  const atolLoginInput = document.getElementById('atolLoginInput');
  const atolPasswordInput = document.getElementById('atolPasswordInput');
  const saveAtolBtn = document.getElementById('saveAtolBtn');
  const testAtolBtn = document.getElementById('testAtolBtn');
  const autostartCheckbox = document.getElementById('autostartCheckbox');
  const messageBox = document.getElementById('messageBox');

  function showMessage(msg, isError = false) {
    messageBox.textContent = msg;
    messageBox.className = isError ? 'msg-error' : 'msg-success';
    messageBox.style.display = 'block';
    setTimeout(() => { messageBox.style.display = 'none'; }, 5000);
  }

  // Load initial config and status
  async function loadData() {
    const config = await api.getConfig();
    const status = await api.getStatus();
    const autostart = await api.getAutostart();

    deviceIdEl.textContent = `ID: ${status.device_id || 'Не привязан'}`;
    
    serverUrlInput.value = config.server_url || '';
    atolLoginInput.value = config.atol_login || 'Admin';
    if (config.atol_password) atolPasswordInput.value = config.atol_password;
    
    autostartCheckbox.checked = autostart;

    if (config.server_url && config.device_token) {
      pairingInput.placeholder = 'Устройство уже привязано (вставьте новую ссылку для смены)';
      if (status.server_connected) {
        serverStatusBadge.textContent = 'Онлайн';
        serverStatusBadge.className = 'status-badge online';
      } else {
        serverStatusBadge.textContent = 'Офлайн';
        serverStatusBadge.className = 'status-badge error';
      }
    } else {
      serverStatusBadge.textContent = 'Не привязан';
      serverStatusBadge.className = 'status-badge error';
    }

    if (status.kkt_ready) {
      atolStatusBadge.textContent = 'Готов (Подключено)';
      atolStatusBadge.className = 'status-badge online';
    } else {
      atolStatusBadge.textContent = 'Нет связи';
      atolStatusBadge.className = 'status-badge error';
    }
  }

  // Poll status every 3 seconds
  setInterval(loadData, 3000);
  loadData();

  // Handlers
  pairBtn.addEventListener('click', async () => {
    const val = pairingInput.value.trim();
    if (!val) return showMessage('Введите ссылку или токен', true);
    
    pairBtn.disabled = true;
    pairBtn.textContent = 'Привязка...';
    
    const res = await api.pairDevice(val);
    if (res.ok) {
      pairingInput.value = '';
      showMessage('Устройство успешно привязано!');
      loadData();
    } else {
      showMessage(`Ошибка: ${res.error}`, true);
    }
    
    pairBtn.disabled = false;
    pairBtn.textContent = 'Привязать устройство';
  });

  saveAtolBtn.addEventListener('click', async () => {
    await api.saveConfig({
      atol_login: atolLoginInput.value.trim(),
      atol_password: atolPasswordInput.value.trim()
    });
    showMessage('Настройки АТОЛ сохранены');
  });

  testAtolBtn.addEventListener('click', async () => {
    testAtolBtn.disabled = true;
    testAtolBtn.textContent = 'Проверка...';
    const res = await api.testAtol();
    if (res.ok) {
      showMessage(`ККТ готова. Аппарат: ${res.status.deviceInfo?.modelName || 'Неизвестно'}`, false);
    } else {
      showMessage(`Ошибка ККТ: ${res.error}`, true);
    }
    testAtolBtn.disabled = false;
    testAtolBtn.textContent = 'Тест ККТ';
    loadData();
  });

  autostartCheckbox.addEventListener('change', async (e) => {
    const res = await api.setAutostart(e.target.checked);
    if (!res.ok) {
      e.target.checked = !e.target.checked;
      showMessage(`Ошибка автозапуска: ${res.error}`, true);
    }
  });

  // IPC Events
  api.onPrintSuccess((data) => {
    showMessage(`Чек #${data.queue_id} успешно распечатан!`);
    loadData();
  });

  api.onPrintError((data) => {
    showMessage(`Ошибка печати #${data.queue_id}: ${data.error}`, true);
    loadData();
  });

});
