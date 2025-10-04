const { randomUUID } = require('crypto');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildCandle = ({
  symbol,
  basePrice,
  volatility,
  previous,
  timestamp,
}) => {
  const open = previous ? previous.close : basePrice;
  const change = (Math.random() - 0.5) * volatility;
  const close = clamp(open + change, basePrice * 0.9, basePrice * 1.1);
  const high = Math.max(open, close) + Math.random() * volatility * 0.5;
  const low = Math.min(open, close) - Math.random() * volatility * 0.5;
  const volume = Math.max(1, Math.abs(Math.round((Math.random() + 0.1) * 500)));

  return {
    id: randomUUID(),
    symbol,
    open,
    close,
    high,
    low,
    volume,
    timestamp,
  };
};

const buildTrade = ({ symbol, price, side }) => ({
  id: randomUUID(),
  symbol,
  price,
  side,
  volume: Math.max(1, Math.round(Math.random() * 10)),
  timestamp: new Date().toISOString(),
});

const createMockFeed = ({
  symbol = 'WINQ25',
  intervalMs = 1000,
  basePrice = 120000,
  volatility = 150,
  maxCandles = 200,
} = {}) => {
  let previousCandle = null;
  let candles = [];
  let trades = [];
  let timer = null;

  const generate = () => {
    const candle = buildCandle({
      symbol,
      basePrice,
      volatility,
      previous: previousCandle,
      timestamp: new Date().toISOString(),
    });

    previousCandle = candle;
    candles = [...candles.slice(-maxCandles + 1), candle];

    const tradeSide = Math.random() > 0.5 ? 'buy' : 'sell';
    const trade = buildTrade({ symbol, price: candle.close, side: tradeSide });
    trades = [...trades.slice(-maxCandles + 1), trade];

    return { candle, trade, candles, trades };
  };

  return {
    start(callback) {
      if (timer) return;
      const emit = () => {
        const payload = generate();
        callback(payload);
      };
      emit();
      timer = setInterval(emit, intervalMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    getState() {
      return { candles, trades };
    },
  };
};

module.exports = { createMockFeed };
