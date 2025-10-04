class MetaConsensus {
  async getMetaConsensus(signals = []) {
    if (!Array.isArray(signals) || signals.length === 0) {
      return {
        bias: 'NEUTRAL',
        confidence: 0.5,
        sources: [],
      };
    }

    const buySignals = signals.filter((signal) => signal.bias === 'BULLISH').length;
    const sellSignals = signals.filter((signal) => signal.bias === 'BEARISH').length;
    const neutralSignals = signals.length - buySignals - sellSignals;

    const confidence = Math.min(1, (Math.max(buySignals, sellSignals) + neutralSignals * 0.25) / signals.length);

    let bias = 'NEUTRAL';
    if (buySignals > sellSignals) {
      bias = 'BULLISH';
    } else if (sellSignals > buySignals) {
      bias = 'BEARISH';
    }

    return {
      bias,
      confidence,
      sources: signals,
    };
  }
}

module.exports = MetaConsensus;
