class AdvancedRiskManager {
  constructor(getSystemState = () => ({}), customConfig = {}) {
    this.getSystemState = getSystemState;
    this.config = {
      maxDailyLossPercent: 3,
      maxPositionSizePercent: 15,
      maxTradeRisk: 1,
      maxConcurrentPositions: 5,
      ...customConfig,
    };
  }

  getCurrentState() {
    try {
      const state = this.getSystemState ? this.getSystemState() : {};
      return state || {};
    } catch (error) {
      return {};
    }
  }

  getAvailableCapital() {
    const state = this.getCurrentState();
    const { currentCapital, initialCapital } = state;
    if (Number.isFinite(currentCapital) && currentCapital > 0) {
      return currentCapital;
    }
    if (Number.isFinite(initialCapital) && initialCapital > 0) {
      return initialCapital;
    }
    return 0;
  }

  validateTrade(trade, marketData = {}) {
    const capital = this.getAvailableCapital();
    if (capital <= 0) {
      return {
        isValid: false,
        reason: 'Capital indisponível para validar a operação.',
      };
    }

    const exposure = Number(trade.price) * Number(trade.quantity);
    const positionPercent = exposure > 0 ? (exposure / capital) * 100 : 0;

    const stopLossDistance = Math.abs(Number(trade.price) - Number(trade.stopLoss));
    const riskValue = stopLossDistance * Number(trade.quantity);
    const riskPercent = riskValue > 0 ? (riskValue / capital) * 100 : 0;

    const state = this.getCurrentState();
    const dailyPnl = Number(state.dailyPnl) || 0;
    const dailyLossPercent = dailyPnl < 0 ? (Math.abs(dailyPnl) / capital) * 100 : 0;

    const breaches = [];

    if (positionPercent > this.config.maxPositionSizePercent) {
      breaches.push('Exposição de ' + positionPercent.toFixed(2) + '% excede o limite de ' + this.config.maxPositionSizePercent + '% por posição.');
    }

    if (riskPercent > this.config.maxTradeRisk) {
      breaches.push('Risco estimado de ' + riskPercent.toFixed(2) + '% excede o máximo de ' + this.config.maxTradeRisk + '% por trade.');
    }

    if (dailyLossPercent > this.config.maxDailyLossPercent) {
      breaches.push('Limite diário de perdas atingido. Recomenda-se encerrar as operações.');
    }

    const isValid = breaches.length === 0;

    return {
      isValid,
      reason: isValid ? undefined : breaches.join(' '),
      metrics: {
        capital,
        exposure,
        positionPercent,
        riskPercent,
        dailyLossPercent,
      },
      trade,
      marketData,
    };
  }
}

module.exports = AdvancedRiskManager;
