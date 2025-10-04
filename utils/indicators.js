function sanitizeValues(values) {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function calculateEMA(values, period) {
  const numericValues = sanitizeValues(values);
  if (numericValues.length < period || period <= 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  let previousEma = numericValues.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const emaSeries = [previousEma];

  for (let i = period; i < numericValues.length; i += 1) {
    const current = numericValues[i];
    previousEma = (current - previousEma) * multiplier + previousEma;
    emaSeries.push(previousEma);
  }

  return emaSeries;
}

function calculateRSI(values, period) {
  const numericValues = sanitizeValues(values);
  if (numericValues.length <= period || period <= 0) {
    return [];
  }

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = numericValues[i] - numericValues[i - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  const rsiSeries = [];

  for (let i = period + 1; i < numericValues.length; i += 1) {
    const change = numericValues[i] - numericValues[i - 1];
    if (change >= 0) {
      averageGain = ((averageGain * (period - 1)) + change) / period;
      averageLoss = (averageLoss * (period - 1)) / period;
    } else {
      averageGain = (averageGain * (period - 1)) / period;
      averageLoss = ((averageLoss * (period - 1)) + Math.abs(change)) / period;
    }

    if (averageLoss === 0) {
      rsiSeries.push(100);
    } else {
      const relativeStrength = averageGain / averageLoss;
      rsiSeries.push(100 - (100 / (1 + relativeStrength)));
    }
  }

  return rsiSeries;
}

module.exports = {
  EMA: {
    calculate: ({ values, period }) => calculateEMA(values, period),
  },
  RSI: {
    calculate: ({ values, period }) => calculateRSI(values, period),
  },
};
