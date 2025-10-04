const EventEmitter = require('events');
const logger = require('../../logging/logger');
const { createMockFeed } = require('./mockFeed');

class MarketDataService extends EventEmitter {
  constructor({ symbol = 'WINQ25', mock = true } = {}) {
    super();
    this.symbol = symbol;
    this.mock = mock;
    this.feed = null;
    this.state = {
      symbol,
      candles: [],
      trades: [],
      lastUpdate: null,
    };
  }

  start() {
    if (this.mock) {
      this.setupMockFeed();
    }
    logger.info(`Market data service started for ${this.symbol}`);
  }

  stop() {
    if (this.feed && this.feed.stop) {
      this.feed.stop();
    }
    logger.info('Market data service stopped');
  }

  setupMockFeed() {
    this.feed = createMockFeed({ symbol: this.symbol });
    this.feed.start(({ candle, trade, candles, trades }) => {
      this.state = {
        symbol: this.symbol,
        candles,
        trades,
        lastUpdate: new Date().toISOString(),
      };
      this.emit('update', this.state);
    });
  }

  getSnapshot() {
    return { ...this.state };
  }
}

const createMarketDataService = (options) => new MarketDataService(options);

module.exports = {
  MarketDataService,
  createMarketDataService,
};
