const EventEmitter = require('events');
const net = require('net');
const logger = require('../../logging/logger');

const DEFAULT_CONFIG = {
  description: 'B3 FIX Connector',
  application: 'bot-b3-execution',
  type: 'initiator',
  fixVersion: 'FIX.4.4',
  heartBtInt: 30,
  resetSeqNumFlag: true,
  reconnectIntervalMs: 5000,
  simulate: true,
};

class FixGateway extends EventEmitter {
  constructor(configuration = {}) {
    super();
    this.configuration = { ...DEFAULT_CONFIG, ...configuration };
    this.session = null;
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.connectPromise = null;
    this.reconnectTimer = null;
    this.lastHeartbeat = null;
    this.lastError = null;
    this.sequence = 1;
    this.simulate = this.configuration.simulate || !this.isConfigured();
  }

  isConfigured() {
    const { host, port, senderCompId, targetCompId } = this.configuration;
    return Boolean(host && port && senderCompId && targetCompId);
  }

  async connect() {
    if (this.simulate) {
      if (!this.connected) {
        this.connected = true;
        this.lastHeartbeat = Date.now();
        logger.warn('FIX gateway running in simulation mode. No real orders will be sent.');
        process.nextTick(() => this.emit('logon', { simulated: true }));
      }
      return null;
    }

    if (!this.isConfigured()) {
      throw new Error('Configuração FIX incompleta. Verifique host, porta, senderCompId e targetCompId.');
    }

    if (this.connected) {
      return this.session;
    }
    if (this.connecting && this.connectPromise) {
      return this.connectPromise;
    }

    this.connecting = true;
    this.connectPromise = new Promise((resolve, reject) => {
      let resolved = false;
      let rejected = false;
      const finishResolve = (value) => {
        if (!resolved && !rejected) {
          resolved = true;
          resolve(value);
        }
      };
      const finishReject = (error) => {
        this.connecting = false;
        if (!resolved && !rejected) {
          rejected = true;
          reject(error);
        }
      };

      let pureFix;
      try {
        pureFix = require('jspurefix');
      } catch (error) {
        this.simulate = true;
        logger.warn('jspurefix não encontrado. Executando em modo simulado.');
        this.connected = true;
        this.lastHeartbeat = Date.now();
        this.connecting = false;
        finishResolve(null);
        this.emit('logon', { simulated: true });
        return;
      }

      const { SessionLauncher } = pureFix;
      const cfg = {
        description: this.configuration.description,
        application: this.configuration.application,
        type: this.configuration.type,
        fixVersion: this.configuration.fixVersion,
        host: this.configuration.host,
        port: this.configuration.port,
        senderCompId: this.configuration.senderCompId,
        targetCompId: this.configuration.targetCompId,
        heartBtInt: this.configuration.heartBtInt,
        resetSeqNumFlag: this.configuration.resetSeqNumFlag,
        username: this.configuration.username,
        password: this.configuration.password,
      };

      this.socket = net.createConnection({ host: cfg.host, port: cfg.port });
      this.socket.on('error', (error) => {
        logger.error('FIX socket error', { error: error.message });
        this.lastError = error;
      });

      const launcher = new SessionLauncher(cfg);
      this.session = launcher.launch(this.socket);

      this.session.on('logon', () => {
        this.connected = true;
        this.connecting = false;
        this.lastHeartbeat = Date.now();
        logger.info('FIX gateway logon concluído');
        this.emit('logon', { simulated: false });
        finishResolve(this.session);
      });

      this.session.on('msg', (message, session, type) => {
        this.lastHeartbeat = Date.now();
        this.emit('message', { message, type });
      });

      this.session.on('error', (error) => {
        logger.error('FIX session error', { error: error.message });
        this.lastError = error;
        this.emit('error', error);
        if (!this.connected) {
          finishReject(error);
        }
      });

      this.session.on('end', () => {
        logger.warn('FIX gateway disconnected');
        this.connected = false;
        this.connecting = false;
        this.emit('disconnect');
        this.scheduleReconnect();
      });
    });

    return this.connectPromise;
  }

  scheduleReconnect() {
    if (this.simulate || this.configuration.reconnectIntervalMs <= 0) {
      return;
    }
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        logger.error('Erro ao reconectar FIX', { error: error.message });
        this.scheduleReconnect();
      });
    }, this.configuration.reconnectIntervalMs);
  }

  async disconnect(reason = 'logout') {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.simulate && this.connected) {
      this.connected = false;
      this.emit('disconnect', { simulated: true });
      return;
    }

    if (this.session && this.connected) {
      try {
        await this.session.done(reason);
      } catch (error) {
        logger.error('Erro ao encerrar sessão FIX', { error: error.message });
      }
    }
    this.connected = false;
  }

  generateClientOrderId() {
    this.sequence += 1;
    return CL;
  }

  buildNewOrderSingle(order = {}) {
    const typeMap = { MARKET: '1', LIMIT: '2' };
    const sideMap = { BUY: '1', SELL: '2' };
    const timeInForceMap = { DAY: '0', GTC: '1', IOC: '3', FOK: '4' };

    const clOrdId = order.clientOrderId || this.generateClientOrderId();
    const message = {
      StandardHeader: { MsgType: 'D' },
      ClOrdID: clOrdId,
      Account: order.account || this.configuration.account || undefined,
      Symbol: order.symbol || this.configuration.symbol || 'WIN',
      Side: sideMap[order.side] || '1',
      TransactTime: new Date(),
      OrderQtyData: { OrderQty: order.quantity },
      OrdType: typeMap[order.type] || '1',
      TimeInForce: timeInForceMap[order.timeInForce] || '0',
    };

    if (message.OrdType === '2') {
      message.Price = order.price;
    }

    if (order.stopPrice) {
      message.StopPx = order.stopPrice;
    }

    return { clOrdId, message };
  }

  async sendOrder(order) {
    if (this.simulate || !this.connected) {
      const clOrdId = order.clientOrderId || this.generateClientOrderId();
      const simulatedReport = {
        clientOrderId: clOrdId,
        status: 'filled',
        price: order.price || null,
        quantity: order.quantity,
        side: order.side,
        simulated: true,
      };
      setTimeout(() => {
        this.emit('execReport', simulatedReport);
      }, 150);
      return clOrdId;
    }

    if (!this.session) {
      throw new Error('Sessão FIX indisponível.');
    }

    const { clOrdId, message } = this.buildNewOrderSingle(order);
    this.session.send(message);
    this.emit('order:sent', { clOrdId, order });
    return clOrdId;
  }

  getStatus() {
    return {
      connected: this.connected,
      simulate: this.simulate,
      lastHeartbeat: this.lastHeartbeat,
      lastError: this.lastError ? this.lastError.message : null,
      host: this.configuration.host,
      port: this.configuration.port,
      senderCompId: this.configuration.senderCompId,
      targetCompId: this.configuration.targetCompId,
    };
  }
}

module.exports = { FixGateway };


