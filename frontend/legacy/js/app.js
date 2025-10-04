/* global io */

class TradingBotApp {
  constructor() {
    this.socket = io();
    this.isConnected = false;
    this.marketWidgets = new Map();
    this.init();
  }

  init() {
    this.cacheMarketWidgets();
    this.bindEvents();
    this.connectSocket();
    this.loadData();
  }

  cacheMarketWidgets() {
    const widgets = document.querySelectorAll('[data-market-asset]');
    widgets.forEach((widget) => {
      const symbol = widget.getAttribute('data-market-asset');
      if (symbol) {
        this.marketWidgets.set(symbol.toUpperCase(), widget);
      }
    });
  }

  connectSocket() {
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.updateStatus(true);
      this.socket.emit('subscribe', { symbols: ['PETR4', 'VALE3', 'BBDC4'] });
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.updateStatus(false);
    });

    this.socket.on('market_data', (data) => {
      this.updateMarketData(data);
    });

    this.socket.on('order_update', (order) => {
      this.showNotification(`Ordem ${order.side} ${order.symbol} executada`);
    });
  }

  bindEvents() {
    const startButton = document.getElementById('btnStart');
    if (startButton) {
      startButton.addEventListener('click', () => {
        this.startBot();
      });
    }

    const stopButton = document.getElementById('btnStop');
    if (stopButton) {
      stopButton.addEventListener('click', () => {
        this.stopBot();
      });
    }
  }

  async startBot() {
    try {
      const response = await fetch('/api/trading/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });

      if (response.ok) {
        this.showNotification('Bot iniciado com sucesso!');
      }
    } catch (error) {
      console.error('Erro ao iniciar bot:', error);
    }
  }

  async stopBot() {
    try {
      const response = await fetch('/api/trading/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });

      if (response.ok) {
        this.showNotification('Bot parado!');
      }
    } catch (error) {
      console.error('Erro ao parar bot:', error);
    }
  }

  updateStatus(online) {
    const statusElement = document.getElementById('botStatus');
    if (!statusElement) {
      return;
    }

    const indicator = statusElement.querySelector('.status-indicator');
    if (indicator) {
      indicator.className = online ? 'status-indicator online' : 'status-indicator offline';
    }

    const label = statusElement.querySelector('span:last-child');
    if (label) {
      label.textContent = online ? 'Online' : 'Offline';
    }
  }

  updateMarketData(data) {
    // Atualizar interface com dados de mercado
    data.forEach((asset) => {
      // Atualizar preços, gráficos, etc.
    });
  }

  showNotification(message) {
    // Implementar notificações
    console.log('Notificação:', message);
  }

  async loadData() {
    try {
      const response = await fetch('/api/trading/status');
      const data = await response.json();
      this.updateDashboard(data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  }

  updateDashboard(data) {
    document.getElementById('balance').textContent = `R$ ${data.balance.toFixed(2)}`;
    document.getElementById('activeOrders').textContent = data.positions.length;
  }
}

// Inicializar aplicação quando DOM carregar
document.addEventListener('DOMContentLoaded', () => {
  const app = new TradingBotApp();
  window.tradingBotApp = app;
});
