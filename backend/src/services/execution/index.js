const EventEmitter = require('events');
const logger = require('../../logging/logger');
const config = require('../../config/env');
const { createDefaultRegistry } = require('../indicators');
const { FixGateway } = require('./fixGateway');
const { createOrderQueue } = require('./orderQueue');
const { createRiskManager } = require('../riskManager');
const { createStrategyEngine } = require('../strategy');
const { createAiStack } = require('../ai');

const envNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

class ExecutionService extends EventEmitter {
  constructor(options = {}) {
    super();

    const initialCapital = envNumber(process.env.TRADING_CAPITAL, 100000);
    const contractMultiplier = envNumber(process.env.CONTRACT_MULTIPLIER, 0.2);

    this.indicators = createDefaultRegistry();
    this.strategyEngine = createStrategyEngine({
      symbol: options.symbol || 'WIN',
      defaultQuantity: envNumber(process.env.DEFAULT_POSITION_SIZE, 1),
    });

    this.aiConfig = config.ai || {};
    const aiStack = this.aiConfig.enabled ? createAiStack(this.aiConfig) : { orchestrator: null, rlClient: null };
    this.aiService = aiStack.orchestrator && aiStack.orchestrator.providers.length ? aiStack.orchestrator : null;
    this.rlClient = aiStack.rlClient && aiStack.rlClient.isEnabled() ? aiStack.rlClient : null;

    this.aiLlmState = {
      enabled: Boolean(this.aiService),
      provider: null,
      lastConsensus: null,
      cached: false,
      timestamp: null,
      raw: null,
    };
    this.rlState = {
      enabled: Boolean(this.rlClient),
      lastAction: null,
      confidence: null,
      value: null,
      reason: null,
      timestamp: null,
    };
    this.aiLastUpdated = 0;
    this.aiPending = null;
    this.rlLastUpdated = 0;
    this.rlPending = null;

    this.riskManager = createRiskManager({
      initialCapital,
      contractMultiplier,
      dailyProfitTargetPct: envNumber(process.env.DAILY_TARGET_PCT, 0.02),
      dailyLossLimitPct: envNumber(process.env.DAILY_LOSS_LIMIT_PCT, 0.01),
      maxContractsPerOrder: envNumber(process.env.RISK_MAX_CONTRACTS_PER_ORDER, 2),
      maxNetExposure: envNumber(process.env.RISK_MAX_NET_EXPOSURE, 10),
      defaultQuantity: envNumber(process.env.DEFAULT_POSITION_SIZE, 1),
    });

    this.fixGateway = null;
    this.orderQueue = createOrderQueue({
      dispatchOrder: (order) => this.dispatchOrder(order),
      simulateExecution: (order) => this.simulateOrderExecution(order),
    });

    const riskStatus = this.riskManager.getStatus();

    this.state = {
      running: false,
      paused: false,
      lastStart: null,
      lastStop: null,
      meta: {
        autoTrade: Boolean(this.aiConfig.autoTrade),
      },
      goalSnapshot: riskStatus.goalSnapshot,
      metrics: {
        dailyPnl: 0,
        trades: 0,
        winRate: 0,
        updatedAt: new Date().toISOString(),
      },
      market: {
        symbol: options.symbol || 'WIN',
        candles: [],
        trades: [],
        lastUpdate: null,
      },
      indicators: {},
      risk: riskStatus,
      strategy: this.strategyEngine.getStatus(),
      ai: {
        llm: this.aiLlmState,
        rl: this.rlState,
      },
    };

    this.setupEventBridges();
  }

  setupEventBridges() {
    this.orderQueue.on('queued', (order) => {
      this.emit('order:queued', order);
    });

    this.orderQueue.on('execution', ({ order, execution }) => {
      this.onOrderExecution(order, execution);
    });

    this.orderQueue.on('error', ({ order, error }) => {
      logger.error('Erro na fila de ordens', { orderId: order.id, error: error.message || error });
      this.emit('order:error', { order, error });
    });

    this.riskManager.on('reset', (status) => {
      this.state.risk = status;
      this.state.goalSnapshot = status.goalSnapshot;
      this.state.metrics.dailyPnl = status.realizedPnl;
      this.state.metrics.trades = status.trades;
      this.state.metrics.winRate = Number(status.winRate.toFixed(2));
      this.state.metrics.updatedAt = new Date().toISOString();
    });

    this.riskManager.on('metrics', (status) => {
      this.state.metrics.dailyPnl = status.realizedPnl;
      this.state.metrics.trades = status.trades;
      this.state.metrics.winRate = Number(status.winRate.toFixed(2));
      this.state.metrics.updatedAt = new Date().toISOString();
      this.state.goalSnapshot = status.goalSnapshot;
      this.state.risk = status;
    });

    this.riskManager.on('breach', (status) => {
      if (this.state.running) {
        this.state.paused = true;
      }
      this.emit('risk:breach', status);
    });
  }

  attachFixGateway(configurationOrInstance) {
    if (configurationOrInstance instanceof FixGateway) {
      this.fixGateway = configurationOrInstance;
    } else {
      this.fixGateway = new FixGateway(configurationOrInstance);
    }

    this.fixGateway.on('execReport', (report) => {
      this.handleExecutionReport(report);
    });

    this.fixGateway.on('logon', (info) => {
      logger.info('FIX gateway conectado', { simulated: info.simulated });
      this.emit('fix:logon', info);
    });

    this.fixGateway.on('disconnect', (info) => {
      logger.warn('FIX gateway desconectado', info || {});
      this.emit('fix:disconnect', info);
    });

    this.fixGateway.on('error', (error) => {
      logger.error('Erro no FIX gateway', { error: error.message });
      this.emit('fix:error', error);
    });

    return this.fixGateway;
  }

  getLastPrice() {
    const candles = this.state.market.candles;
    if (!candles || !candles.length) return null;
    const last = candles[candles.length - 1];
    return Number(last.close);
  }

  updateMarketData(snapshot = {}) {
    this.state.market = {
      symbol: snapshot.symbol || this.state.market.symbol,
      candles: snapshot.candles || this.state.market.candles,
      trades: snapshot.trades || this.state.market.trades,
      lastUpdate: snapshot.lastUpdate || new Date().toISOString(),
    };

    try {
      this.state.indicators = this.indicators.computeAll({
        candles: this.state.market.candles,
        trades: this.state.market.trades,
      });
    } catch (error) {
      logger.error('Erro ao calcular indicadores', { error: error.message });
    }

    this.strategyEngine.updateMarket({
      market: this.state.market,
      indicators: this.state.indicators,
    });
    this.state.strategy = this.strategyEngine.getStatus();

    const lastPrice = this.getLastPrice();
    if (lastPrice) {
      this.riskManager.updateMarketPrice(lastPrice);
    }

    this.emit('market:update', {
      market: this.state.market,
      indicators: this.state.indicators,
    });

    if (this.aiLlmState.enabled) {
      this.scheduleAiConsensus();
    }
    if (this.rlState.enabled) {
      this.scheduleRlInference();
    }

    if (this.state.running && !this.state.paused) {
      this.evaluateStrategy();
    }
  }

  scheduleAiConsensus(force = false) {
    if (!this.aiService) return;
    const now = Date.now();
    const ttl = this.aiConfig.cacheTtlMs || 60000;
    if (!force && this.aiPending) return;
    if (!force && this.aiLastUpdated && (now - this.aiLastUpdated) < ttl / 2) return;

    const payload = {
      marketSnapshot: this.state.market,
      indicators: this.state.indicators,
      riskStatus: this.riskManager.getStatus(),
    };

    this.aiPending = this.aiService.getConsensusAnalysis(payload)
      .then((result) => {
        this.aiLastUpdated = Date.now();
        this.aiLlmState = {
          enabled: true,
          provider: result.provider,
          cached: Boolean(result.cached),
          lastConsensus: result.consensus,
          raw: result.raw,
          timestamp: new Date().toISOString(),
        };
        this.state.ai.llm = this.aiLlmState;
        this.emit('ai:consensus', this.aiLlmState);
      })
      .catch((error) => {
        logger.warn('Falha ao obter consenso IA', { error: error.message });
      })
      .finally(() => {
        this.aiPending = null;
      });
  }

  scheduleRlInference(force = false) {
    if (!this.rlClient) return;
    const now = Date.now();
    const ttl = this.aiConfig.rl?.cacheTtlMs || 30000;
    if (!force && this.rlPending) return;
    if (!force && this.rlLastUpdated && (now - this.rlLastUpdated) < ttl / 2) return;

    const payload = {
      market: this.state.market,
      indicators: this.state.indicators,
      risk: this.riskManager.getStatus(),
      lastSignal: this.strategyEngine.getStatus().lastSignal,
    };

    this.rlPending = this.rlClient.getAction(payload)
      .then((result) => {
        this.rlLastUpdated = Date.now();
        const normalized = {
          action: (result.action || 'HOLD').toUpperCase(),
          quantity: Number(result.quantity || 0) || null,
          confidence: result.confidence != null ? Number(result.confidence) : null,
          value: result.value != null ? Number(result.value) : null,
          reason: result.reason || '',
        };
        this.rlState = {
          enabled: true,
          lastAction: normalized,
          confidence: normalized.confidence,
          value: normalized.value,
          reason: normalized.reason,
          timestamp: new Date().toISOString(),
          raw: result,
        };
        this.state.ai.rl = this.rlState;
        this.emit('ai:rl', this.rlState);
      })
      .catch((error) => {
        logger.warn('Falha ao obter aÃ§Ã£o RL', { error: error.message });
      })
      .finally(() => {
        this.rlPending = null;
      });
  }

  async dispatchOrder(order) {
    if (!this.fixGateway || this.fixGateway.simulate) {
      if (this.fixGateway && !this.fixGateway.connected) {
        await this.fixGateway.connect();
      }
      const clOrdId = order.clientOrderId || `SIM-${Date.now()}${Math.floor(Math.random() * 1000)}`;
      order.clientOrderId = clOrdId;
      return clOrdId;
    }

    if (!this.fixGateway.connected) {
      await this.fixGateway.connect();
    }

    const clOrdId = await this.fixGateway.sendOrder(order);
    order.clientOrderId = clOrdId;
    return clOrdId;
  }

  simulateOrderExecution(order) {
    if (this.fixGateway && !this.fixGateway.simulate) {
      return;
    }
    const lastPrice = this.getLastPrice();
    const simulatedPrice = order.price || lastPrice;
    setTimeout(() => {
      this.handleExecutionReport({
        clientOrderId: order.clientOrderId,
        orderId: order.id,
        status: 'filled',
        price: simulatedPrice,
        quantity: order.quantity,
        side: order.side,
        simulated: true,
      });
    }, 200);
  }

  onOrderExecution(order, execution) {
    if (execution.quantity && execution.price != null) {
      this.riskManager.registerExecution({
        side: execution.side,
        quantity: execution.quantity,
        price: execution.price,
      });
    }
    this.emit('order:execution', { order, execution });
  }

  handleExecutionReport(report = {}) {
    const payload = {
      orderId: report.orderId,
      clientOrderId: report.clientOrderId || report.ClOrdID,
      status: report.status,
      price: report.price,
      quantity: report.quantity,
      leavesQuantity: report.leavesQuantity,
      side: report.side,
      timestamp: report.timestamp,
      simulated: report.simulated,
    };
    this.orderQueue.updateExecution(payload);
  }

  submitOrder(orderInput = {}) {
    const lastPrice = this.getLastPrice();
    const riskCheck = this.riskManager.evaluateOrder(orderInput, { price: lastPrice });
    if (!riskCheck.approved) {
      const error = new Error(riskCheck.reason || 'risk-rejected');
      error.code = 'RISK_REJECTED';
      throw error;
    }
    const order = this.orderQueue.submit({
      ...orderInput,
      side: riskCheck.side || orderInput.side,
      quantity: riskCheck.quantity || orderInput.quantity,
      metadata: {
        ...orderInput.metadata,
        risk: riskCheck,
      },
    });
    return order;
  }

  listOrders(limit = 50) {
    return this.orderQueue.list(limit);
  }

  evaluateStrategy() {
    const signal = this.strategyEngine.generateSignal();
    const aiConsensus = this.aiLlmState.enabled ? this.aiLlmState.lastConsensus : null;
    const rlSuggestion = this.rlState.enabled ? this.rlState.lastAction : null;

    if (aiConsensus && aiConsensus.recommendedAction) {
      if (aiConsensus.recommendedAction === signal.action && signal.action !== 'HOLD') {
        signal.confidence = Math.min(1, signal.confidence + (aiConsensus.confidence || 0) * 0.2);
        signal.reason = `${signal.reason} | AI LLM alinhado`;
      } else if (aiConsensus.recommendedAction !== 'HOLD' && aiConsensus.recommendedAction !== signal.action && (aiConsensus.confidence || 0) > 0.6) {
        signal.action = 'HOLD';
        signal.reason = `${signal.reason} | AI LLM conflito (HOLD)`;
      }
    }

    if (rlSuggestion && rlSuggestion.action) {
      if (rlSuggestion.action === signal.action && signal.action !== 'HOLD') {
        signal.confidence = Math.min(1, signal.confidence + (rlSuggestion.confidence || 0) * 0.25);
        if (rlSuggestion.quantity) {
          signal.quantity = rlSuggestion.quantity;
        }
        signal.reason = `${signal.reason} | RL alinhado`;
      } else if (rlSuggestion.action === 'HOLD' && (rlSuggestion.confidence || 0) > 0.6) {
        signal.action = 'HOLD';
        signal.reason = `${signal.reason} | RL sugere aguardar`;
      } else if (rlSuggestion.action !== signal.action && (rlSuggestion.confidence || 0) > 0.7) {
        signal.action = rlSuggestion.action;
        signal.quantity = rlSuggestion.quantity || signal.quantity;
        signal.reason = `${signal.reason} | RL override`; 
      }
    }

    this.emit('strategy:signal', signal);
    const strategyStatus = this.strategyEngine.getStatus();
    strategyStatus.lastSignal = signal;
    this.state.strategy = strategyStatus;

    if (signal.action === 'HOLD') {
      return;
    }

    const riskAssessment = this.riskManager.evaluateSignal(signal, {
      price: signal.price || this.getLastPrice(),
    });

    if (!riskAssessment.approved) {
      this.emit('strategy:blocked', { signal, risk: riskAssessment });
      return;
    }

    if (this.state.meta.autoTrade) {
      try {
        const order = this.submitOrder({
          symbol: signal.symbol || this.state.market.symbol,
          side: riskAssessment.side,
          type: 'MARKET',
          quantity: riskAssessment.quantity,
          metadata: {
            source: 'strategy',
            confidence: riskAssessment.confidence,
            reason: riskAssessment.reason,
            aiConsensus,
            rlSuggestion,
          },
        });
        this.emit('strategy:order', { signal, order, risk: riskAssessment });
      } catch (error) {
        this.emit('strategy:order-error', { signal, error });
      }
    }
  }

  async start(parameters = {}) {
    if (this.state.running) {
      logger.warn('Execution service already running');
      return;
    }
    this.state.running = true;
    this.state.paused = false;
    this.state.lastStart = new Date().toISOString();
    this.state.meta = {
      ...this.state.meta,
      ...parameters,
      autoTrade: Boolean(parameters.autoTrade ?? this.state.meta.autoTrade),
      lastAction: 'start',
    };
    this.riskManager.reset();
    this.scheduleAiConsensus(true);
    this.scheduleRlInference(true);
    logger.info('Execution service started', { parameters: this.state.meta });
    this.emit('started', { parameters: this.state.meta, at: this.state.lastStart });

    if (this.fixGateway && !this.fixGateway.simulate) {
      try {
        await this.fixGateway.connect();
      } catch (error) {
        logger.error('Erro ao conectar gateway FIX', { error: error.message });
        this.emit('fix:error', error);
      }
    }
  }

  async pause(parameters = {}) {
    if (!this.state.running) {
      logger.warn('Cannot pause because execution is not running');
      return;
    }
    this.state.paused = true;
    this.state.meta = { ...this.state.meta, ...parameters, lastAction: 'pause' };
    logger.info('Execution service paused', { parameters });
    this.emit('paused', { parameters, at: new Date().toISOString() });
  }

  async stop(parameters = {}) {
    if (!this.state.running) {
      logger.warn('Execution service already stopped');
      return;
    }
    this.state.running = false;
    this.state.paused = false;
    this.state.lastStop = new Date().toISOString();
    this.state.meta = { ...this.state.meta, ...parameters, lastAction: 'stop' };
    logger.info('Execution service stopped', { parameters });
    this.emit('stopped', { parameters, at: this.state.lastStop });

    if (this.fixGateway) {
      await this.fixGateway.disconnect().catch((error) => {
        logger.error('Erro ao desconectar gateway FIX', { error: error.message });
      });
    }
  }

  getStatus() {
    return {
      running: this.state.running,
      paused: this.state.paused,
      lastStart: this.state.lastStart,
      lastStop: this.state.lastStop,
      meta: this.state.meta,
      indicators: this.state.indicators,
      market: this.state.market,
      fix: this.fixGateway ? this.fixGateway.getStatus() : { connected: false, simulate: true },
      orders: this.listOrders(20),
      risk: this.riskManager.getStatus(),
      strategy: this.strategyEngine.getStatus(),
      ai: this.state.ai,
    };
  }

  getHeartbeat() {
    return {
      running: this.state.running,
      paused: this.state.paused,
      updatedAt: new Date().toISOString(),
    };
  }

  getGoalsSnapshot() {
    return this.state.goalSnapshot;
  }

  getMetrics() {
    const riskStatus = this.riskManager.getStatus();
    return {
      ...this.state.metrics,
      running: this.state.running,
      paused: this.state.paused,
      lastMarketUpdate: this.state.market.lastUpdate,
      ordersInQueue: this.orderQueue.size(),
      risk: {
        realizedPnl: riskStatus.realizedPnl,
        unrealizedPnl: riskStatus.unrealizedPnl,
        totalPnl: riskStatus.totalPnl,
        drawdown: riskStatus.drawdown,
        reachedTarget: riskStatus.reachedTarget,
        hitLossLimit: riskStatus.hitLossLimit,
      },
      ai: this.state.ai,
    };
  }
}

module.exports = {
  ExecutionService,
  createExecutionService: () => new ExecutionService(),
};


