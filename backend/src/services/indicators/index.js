const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getCloses = (candles = []) => candles.map((candle) => toNumber(candle.close));
const getVolumes = (candles = []) => candles.map((candle) => toNumber(candle.volume));
const getTypicalPrices = (candles = []) => candles.map((candle) => {
  const high = toNumber(candle.high);
  const low = toNumber(candle.low);
  const close = toNumber(candle.close);
  return (high + low + close) / 3;
});

const avg = (values = []) => {
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
};

const stdDev = (values = []) => {
  if (values.length < 2) return 0;
  const mean = avg(values);
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const ema = (values = [], period = 14) => {
  if (!values.length || period <= 0) return [];
  const multiplier = 2 / (period + 1);
  const emaValues = [];
  values.forEach((value, index) => {
    if (index === 0) {
      emaValues.push(value);
      return;
    }
    const previous = emaValues[index - 1];
    emaValues.push((value - previous) * multiplier + previous);
  });
  return emaValues;
};

const computeVWAP = (candles = []) => {
  const typicalPrices = getTypicalPrices(candles);
  const volumes = getVolumes(candles);

  let cumulativePV = 0;
  let cumulativeVolume = 0;
  const vwapSeries = typicalPrices.map((price, index) => {
    const volume = volumes[index];
    cumulativePV += price * volume;
    cumulativeVolume += volume;
    return cumulativeVolume ? cumulativePV / cumulativeVolume : price;
  });

  const latest = vwapSeries[vwapSeries.length - 1] ?? null;
  return {
    value: latest,
    series: vwapSeries,
    status: latest !== null ? 'ok' : 'insufficient-data'
  };
};

const computeEMA = (candles, period) => {
  const closes = getCloses(candles);
  const emaSeries = ema(closes, period);
  const latest = emaSeries[emaSeries.length - 1] ?? null;
  return {
    value: latest,
    series: emaSeries,
    status: latest !== null ? 'ok' : 'insufficient-data'
  };
};

const computeRSI = (candles = [], period = 14) => {
  const closes = getCloses(candles);
  if (closes.length <= period) {
    return { value: null, status: 'insufficient-data' };
  }

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta; else losses -= delta;
  }
  gains /= period;
  losses /= period;

  const rsiSeries = [losses === 0 ? 100 : 100 - (100 / (1 + gains / losses))];
  for (let i = period + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    gains = ((gains * (period - 1)) + (delta > 0 ? delta : 0)) / period;
    losses = ((losses * (period - 1)) + (delta < 0 ? -delta : 0)) / period;
    const rs = losses === 0 ? Number.POSITIVE_INFINITY : gains / losses;
    const currentRsi = losses === 0 ? 100 : 100 - (100 / (1 + rs));
    rsiSeries.push(currentRsi);
  }

  const latest = rsiSeries[rsiSeries.length - 1] ?? null;
  return {
    value: latest,
    series: rsiSeries,
    status: latest !== null ? 'ok' : 'insufficient-data'
  };
};

const computeBollinger = (candles = [], period = 20, deviations = 2) => {
  const closes = getCloses(candles);
  if (closes.length < period) {
    return { status: 'insufficient-data', upper: null, middle: null, lower: null };
  }

  const bands = closes.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = closes.slice(index + 1 - period, index + 1);
    const middle = avg(slice);
    const deviation = stdDev(slice);
    return {
      upper: middle + deviations * deviation,
      middle,
      lower: middle - deviations * deviation
    };
  }).filter(Boolean);

  const latest = bands[bands.length - 1] ?? null;
  return {
    ...latest,
    series: bands,
    status: latest ? 'ok' : 'insufficient-data'
  };
};

const computeMACD = (candles = [], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  const closes = getCloses(candles);
  if (closes.length < slowPeriod) {
    return { status: 'insufficient-data', macd: null, signal: null, histogram: null };
  }

  const fastEMA = ema(closes, fastPeriod);
  const slowEMA = ema(closes, slowPeriod);
  const macdSeries = fastEMA.map((value, index) => value - slowEMA[index]);
  const signalSeries = ema(macdSeries.slice(slowPeriod - 1), signalPeriod);
  const histogram = macdSeries.slice(slowPeriod - 1).map((value, index) => value - signalSeries[index]);

  const latest = {
    macd: macdSeries[macdSeries.length - 1] ?? null,
    signal: signalSeries[signalSeries.length - 1] ?? null,
    histogram: histogram[histogram.length - 1] ?? null
  };

  return {
    ...latest,
    series: {
      macd: macdSeries,
      signal: signalSeries,
      histogram
    },
    status: latest.macd !== null ? 'ok' : 'insufficient-data'
  };
};

const computeOrderFlow = ({ trades = [] } = {}) => {
  if (!Array.isArray(trades) || !trades.length) {
    return { status: 'insufficient-data', imbalance: null, buyVolume: 0, sellVolume: 0 };
  }

  let buyVolume = 0;
  let sellVolume = 0;
  trades.forEach((trade) => {
    const volume = toNumber(trade.volume, 0);
    if (trade.side === 'buy') buyVolume += volume;
    else if (trade.side === 'sell') sellVolume += volume;
  });

  const total = buyVolume + sellVolume;
  const imbalance = total ? (buyVolume - sellVolume) / total : 0;

  return {
    buyVolume,
    sellVolume,
    imbalance,
    status: 'ok'
  };
};

const computePriceAction = ({ candles = [] } = {}) => {
  if (!candles.length) {
    return { status: 'insufficient-data', support: null, resistance: null };
  }

  const highs = candles.map((candle) => toNumber(candle.high));
  const lows = candles.map((candle) => toNumber(candle.low));

  const resistance = Math.max(...highs);
  const support = Math.min(...lows);

  return {
    support,
    resistance,
    range: resistance - support,
    status: 'ok'
  };
};

class IndicatorRegistry {
  constructor() {
    this.registry = new Map();
  }

  register(name, handler) {
    if (!name || typeof handler !== 'function') {
      throw new Error('Indicator registration requer nome e função válida');
    }
    this.registry.set(name.toLowerCase(), handler);
  }

  get(name) {
    return this.registry.get(name.toLowerCase());
  }

  list() {
    return Array.from(this.registry.keys());
  }

  compute(name, context) {
    const handler = this.get(name);
    if (!handler) {
      throw new Error(`Indicador ${name} não registrado`);
    }
    return handler(context);
  }

  computeAll(context = {}) {
    const results = {};
    this.registry.forEach((handler, name) => {
      try {
        results[name] = handler(context);
      } catch (error) {
        results[name] = { status: 'error', error: error.message };
      }
    });
    return results;
  }
}

const createDefaultRegistry = () => {
  const registry = new IndicatorRegistry();
  registry.register('vwap', ({ candles }) => computeVWAP(candles));
  registry.register('mme9', ({ candles }) => computeEMA(candles, 9));
  registry.register('mme20', ({ candles }) => computeEMA(candles, 20));
  registry.register('mme200', ({ candles }) => computeEMA(candles, 200));
  registry.register('rsi', ({ candles }) => computeRSI(candles, 14));
  registry.register('bollinger', ({ candles }) => computeBollinger(candles, 20, 2));
  registry.register('macd', ({ candles }) => computeMACD(candles));
  registry.register('fluxo', (context) => computeOrderFlow(context));
  registry.register('priceaction', (context) => computePriceAction(context));
  return registry;
};

module.exports = {
  IndicatorRegistry,
  createDefaultRegistry,
  computeVWAP,
  computeEMA,
  computeRSI,
  computeBollinger,
  computeMACD,
  computeOrderFlow,
  computePriceAction,
};
