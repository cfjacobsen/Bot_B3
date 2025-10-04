const EventEmitter = require('events');

const DEFAULT_CONFIG = {
  initialCapital: 100000,
  contractMultiplier: 0.2,
  dailyProfitTargetPct: 0.02,
  dailyLossLimitPct: 0.01,
  maxContractsPerOrder: 2,
  maxNetExposure: 10,
  maxTradesPerDay: 300,
  defaultQuantity: 1,
  hourlyTargetPct: 0.0025,
};

class RiskManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.configure(config);
    this.reset();
  }

  configure(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.profitTargetAbsolute = this.config.initialCapital * this.config.dailyProfitTargetPct;
    this.lossLimitAbsolute = this.config.initialCapital * this.config.dailyLossLimitPct;
  }

  reset() {
    this.state = {
      startCapital: this.config.initialCapital,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalPnl: 0,
      netExposure: 0,
      avgPrice: null,
      trades: 0,
      wins: 0,
      losses: 0,
      hourlyCheckpoints: [],
      reachedTarget: false,
      hitLossLimit: false,
      halted: false,
      lastUpdate: new Date().toISOString(),
      peakPnl: 0,
      drawdown: 0,
    };
    this.emit('reset', this.getStatus());
  }

  updateMarketPrice(price) {
    if (!price || !Number.isFinite(Number(price))) {
      this.state.unrealizedPnl = 0;
    } else if (this.state.netExposure !== 0 && this.state.avgPrice != null) {
      const qty = Math.abs(this.state.netExposure);
      if (this.state.netExposure > 0) {
        this.state.unrealizedPnl = (price - this.state.avgPrice) * qty * this.config.contractMultiplier;
      } else {
        this.state.unrealizedPnl = (this.state.avgPrice - price) * qty * this.config.contractMultiplier;
      }
    } else {
      this.state.unrealizedPnl = 0;
    }
    this.state.totalPnl = this.state.realizedPnl + this.state.unrealizedPnl;
    this.updateDrawdown();
    this.emit('metrics', this.getStatus());
  }

  evaluateOrder(order = {}, context = {}) {
    const qty = Number(order.quantity || this.config.defaultQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { approved: false, reason: 'quantity-invalid' };
    }
    if (qty > this.config.maxContractsPerOrder) {
      return { approved: false, reason: 'max-contracts-per-order' };
    }
    if (this.state.trades >= this.config.maxTradesPerDay) {
      return { approved: false, reason: 'max-trades-reached' };
    }
    const side = (order.side || 'BUY').toUpperCase();
    const signedQty = side === 'SELL' ? -qty : qty;
    const projectedExposure = Math.abs(this.state.netExposure + signedQty);
    if (projectedExposure > this.config.maxNetExposure) {
      return { approved: false, reason: 'max-net-exposure' };
    }
    if (this.shouldHalt()) {
      return { approved: false, reason: 'risk-halted' };
    }
    return {
      approved: true,
      quantity: qty,
      side,
      reason: 'risk-approved',
    };
  }

  evaluateSignal(signal = {}, context = {}) {
    if (!signal || signal.action === 'HOLD') {
      return { approved: false, reason: 'signal-hold' };
    }
    const order = {
      side: signal.action,
      quantity: signal.quantity || this.config.defaultQuantity,
      price: context.price,
    };
    const evaluation = this.evaluateOrder(order, context);
    if (!evaluation.approved) {
      return evaluation;
    }
    return {
      ...evaluation,
      confidence: signal.confidence || 0,
      reason: signal.reason || evaluation.reason,
    };
  }

  registerExecution(execution = {}) {
    const qty = Number(execution.quantity || 0);
    if (!qty) {
      return;
    }
    const side = (execution.side || 'BUY').toUpperCase();
    const price = Number(execution.price || 0);
    const signedQty = side === 'SELL' ? -qty : qty;
    let net = this.state.netExposure;
    let remaining = signedQty;
    const previousNet = net;
    const previousRealized = this.state.realizedPnl;

    if (net !== 0 && Math.sign(net) !== Math.sign(remaining)) {
      const closingQty = Math.min(Math.abs(net), Math.abs(remaining));
      if (closingQty > 0 && this.state.avgPrice != null) {
        const pnlPerContract = net > 0
          ? (price - this.state.avgPrice)
          : (this.state.avgPrice - price);
        this.state.realizedPnl += pnlPerContract * closingQty * this.config.contractMultiplier;
      }
      net += Math.sign(net) * -closingQty;
      remaining += Math.sign(remaining) * -closingQty;
    }

    if (net === 0) {
      if (remaining !== 0) {
        this.state.avgPrice = price;
        net = remaining;
      } else {
        this.state.avgPrice = null;
      }
    } else if (remaining !== 0 && Math.sign(net) === Math.sign(remaining)) {
      const newQty = Math.abs(net) + Math.abs(remaining);
      this.state.avgPrice = ((this.state.avgPrice * Math.abs(net)) + (price * Math.abs(remaining))) / newQty;
      net += remaining;
    }

    this.state.netExposure = net;
    this.state.trades += 1;

    const pnlDelta = this.state.realizedPnl - previousRealized;
    if (pnlDelta > 0) this.state.wins += 1;
    else if (pnlDelta < 0) this.state.losses += 1;

    this.updateMarketPrice(price);
    this.checkLimits();
    this.state.lastUpdate = new Date().toISOString();
    this.emit('metrics', this.getStatus());
    if (this.state.halted || this.state.hitLossLimit || this.state.reachedTarget) {
      this.emit('breach', this.getStatus());
    }
  }

  checkLimits() {
    if (this.state.realizedPnl <= -this.lossLimitAbsolute) {
      this.state.hitLossLimit = true;
      this.state.halted = true;
    }
    if (this.state.realizedPnl >= this.profitTargetAbsolute) {
      this.state.reachedTarget = true;
      this.state.halted = true;
    }
  }

  shouldHalt() {
    return Boolean(this.state.halted || this.state.hitLossLimit || this.state.reachedTarget);
  }

  updateDrawdown() {
    if (this.state.totalPnl > this.state.peakPnl) {
      this.state.peakPnl = this.state.totalPnl;
    }
    this.state.drawdown = this.state.peakPnl - this.state.totalPnl;
  }

  getStatus() {
    const winRate = this.state.trades ? (this.state.wins / this.state.trades) * 100 : 0;
    return {
      config: this.config,
      realizedPnl: this.state.realizedPnl,
      unrealizedPnl: this.state.unrealizedPnl,
      totalPnl: this.state.totalPnl,
      netExposure: this.state.netExposure,
      avgPrice: this.state.avgPrice,
      trades: this.state.trades,
      wins: this.state.wins,
      losses: this.state.losses,
      winRate,
      reachedTarget: this.state.reachedTarget,
      hitLossLimit: this.state.hitLossLimit,
      halted: this.state.halted,
      goalSnapshot: {
        targetDailyPnl: this.profitTargetAbsolute,
        lossLimit: -this.lossLimitAbsolute,
        checkpoints: this.state.hourlyCheckpoints,
      },
      drawdown: this.state.drawdown,
      peakPnl: this.state.peakPnl,
      lastUpdate: this.state.lastUpdate,
    };
  }
}

const createRiskManager = (config) => new RiskManager(config);

module.exports = {
  RiskManager,
  createRiskManager,
};

