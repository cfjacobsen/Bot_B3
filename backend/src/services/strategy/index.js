class StrategyEngine {
  constructor({ symbol = 'WIN', defaultQuantity = 1 } = {}) {
    this.symbol = symbol;
    this.defaultQuantity = defaultQuantity;
    this.market = null;
    this.indicators = null;
    this.lastSignal = null;
  }

  updateMarket({ market, indicators } = {}) {
    this.market = market || this.market;
    this.indicators = indicators || this.indicators;
  }

  getLastPrice() {
    if (!this.market || !Array.isArray(this.market.candles)) return null;
    const last = this.market.candles[this.market.candles.length - 1];
    return last ? Number(last.close) : null;
  }

  generateSignal() {
    if (!this.market || !this.indicators) {
      return { action: 'HOLD', reason: 'missing-data' };
    }
    const price = this.getLastPrice();
    if (!price) {
      return { action: 'HOLD', reason: 'no-price' };
    }

    const mme20 = this.indicators.mme20?.value;
    const mme9 = this.indicators.mme9?.value;
    const mme200 = this.indicators.mme200?.value;
    const rsi = this.indicators.rsi?.value;
    const vwap = this.indicators.vwap?.value;
    const bollinger = this.indicators.bollinger;
    const macd = this.indicators.macd;

    let action = 'HOLD';
    let confidence = 0;
    const notes = [];

    if (mme20 && mme9 && mme200 && vwap && rsi != null) {
      const trendBullish = price > mme20 && mme20 > mme200;
      const trendBearish = price < mme20 && mme20 < mme200;
      const priceAboveVWAP = price > vwap;
      const priceBelowVWAP = price < vwap;
      const momentumBullish = rsi < 70 && (macd?.macd || 0) > (macd?.signal || 0);
      const momentumBearish = rsi > 30 && (macd?.macd || 0) < (macd?.signal || 0);
      const volatilityLow = bollinger && bollinger.upper && bollinger.lower
        ? (bollinger.upper - bollinger.lower) / price < 0.02
        : false;

      if (trendBullish && priceAboveVWAP && momentumBullish) {
        action = 'BUY';
        confidence = 0.6;
        notes.push('Trend bullish (MME20>MME200)', 'Price above VWAP', 'MACD positive');
        if (rsi < 60) confidence += 0.1;
        if (volatilityLow) confidence += 0.05;
      } else if (trendBearish && priceBelowVWAP && momentumBearish) {
        action = 'SELL';
        confidence = 0.6;
        notes.push('Trend bearish (MME20<MME200)', 'Price below VWAP', 'MACD negative');
        if (rsi > 40) confidence += 0.1;
      }
    }

    if (action === 'HOLD') {
      if (bollinger?.upper && price >= bollinger.upper && rsi > 70) {
        action = 'SELL';
        confidence = 0.55;
        notes.push('Price at Bollinger upper band with RSI > 70');
      } else if (bollinger?.lower && price <= bollinger.lower && rsi < 30) {
        action = 'BUY';
        confidence = 0.55;
        notes.push('Price at Bollinger lower band with RSI < 30');
      }
    }

    if (confidence > 0.8) confidence = 0.8;

    const signal = {
      action,
      confidence,
      reason: notes.join(' | ') || 'no-edge',
      symbol: this.symbol,
      timestamp: new Date().toISOString(),
      quantity: this.defaultQuantity,
      price,
    };
    this.lastSignal = signal;
    return signal;
  }

  getStatus() {
    return {
      symbol: this.symbol,
      lastSignal: this.lastSignal,
      defaultQuantity: this.defaultQuantity,
    };
  }
}

const createStrategyEngine = (options) => new StrategyEngine(options);

module.exports = {
  StrategyEngine,
  createStrategyEngine,
};
