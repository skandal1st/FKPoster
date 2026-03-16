const { io } = require('socket.io-client');
const axios = require('axios');

class SocketManager {
  constructor({ serverUrl, deviceToken, onPrintJob, onStatusChange }) {
    this.serverUrl = serverUrl;
    this.deviceToken = deviceToken;
    this.onPrintJob = onPrintJob || (async () => {});
    this.onStatusChange = onStatusChange || (() => {});
    this.socket = null;
    this._connected = false;
    this._heartbeatInterval = null;
  }

  connect() {
    if (this.socket) this.destroy();

    this.socket = io(this.serverUrl, {
      auth: { token: this.deviceToken },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('[SOCKET] Подключено к серверу');
      this._connected = true;
      this.onStatusChange();
      this._startHeartbeat();
      this._pullPendingJobs();
    });

    this.socket.on('disconnect', () => {
      console.log('[SOCKET] Отключено от сервера');
      this._connected = false;
      this.onStatusChange();
      this._stopHeartbeat();
    });

    this.socket.on('fiscal:print', async (job) => {
      console.log('[SOCKET] Получено задание fiscal:print', job.queue_id);
      await this.onPrintJob(job);
    });
  }

  isConnected() {
    return this._connected;
  }

  destroy() {
    this._stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    // Отправляем heartbeat каждые 30 секунд чтобы сервер знал что мы живы
    this._heartbeatInterval = setInterval(async () => {
      try {
        await axios.post(`${this.serverUrl}/api/fiscal-devices/heartbeat`, {}, {
          headers: { Authorization: `Bearer ${this.deviceToken}` },
          timeout: 5000
        });
      } catch (err) {
        console.error('[HEARTBEAT] Ошибка:', err.message);
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  // Забрать нераспечатанные чеки, которые могли накопиться пока мы были офлайн
  async _pullPendingJobs() {
    try {
      const resp = await axios.get(`${this.serverUrl}/api/fiscal-devices/pending`, {
        headers: { Authorization: `Bearer ${this.deviceToken}` }
      });
      const jobs = resp.data || [];
      if (jobs.length > 0) {
        console.log(`[PULL] Получено ${jobs.length} отложенных заданий`);
        for (const job of jobs) {
           await this.onPrintJob({
             queue_id: job.id,
             receipt_type: job.receipt_type,
             receipt_data: job.receipt_data
           });
        }
      }
    } catch (err) {
      console.error('[PULL] Ошибка запроса pending jobs:', err.message);
    }
  }

  async confirmReceipt(queueId, data) {
    try {
      await axios.patch(`${this.serverUrl}/api/fiscal-devices/queue/${queueId}/confirm`, data, {
        headers: { Authorization: `Bearer ${this.deviceToken}` }
      });
    } catch (err) {
      console.error(`[CONFIRM] Ошибка подтверждения #${queueId}:`, err.message);
    }
  }

  async reportError(queueId, errorMessage) {
    try {
      await axios.patch(`${this.serverUrl}/api/fiscal-devices/queue/${queueId}/error`, {
        error_message: errorMessage
      }, {
        headers: { Authorization: `Bearer ${this.deviceToken}` }
      });
    } catch (err) {
      console.error(`[ERROR] Ошибка репорта ошибки #${queueId}:`, err.message);
    }
  }
}

module.exports = SocketManager;
