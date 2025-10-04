const express = require('express');
const { responseTimeDecorator } = require('../../observability/metrics');

module.exports = ({ marketDataService } = {}) => {
  if (!marketDataService) {
    throw new Error('marketDataService dependency is required for market routes');
  }

  const router = express.Router();

  router.get(
    '/snapshot',
    responseTimeDecorator('/api/market/snapshot'),
    (req, res) => {
      res.json(marketDataService.getSnapshot());
    },
  );

  router.get(
    '/candles',
    responseTimeDecorator('/api/market/candles'),
    (req, res) => {
      const limit = Number(req.query?.limit ?? 100);
      const snapshot = marketDataService.getSnapshot();
      const candles = snapshot.candles || [];
      res.json({
        symbol: snapshot.symbol,
        candles: candles.slice(-1 * (Number.isFinite(limit) ? limit : 100)),
        lastUpdate: snapshot.lastUpdate,
      });
    },
  );

  router.get(
    '/trades',
    responseTimeDecorator('/api/market/trades'),
    (req, res) => {
      const limit = Number(req.query?.limit ?? 100);
      const snapshot = marketDataService.getSnapshot();
      const trades = snapshot.trades || [];
      res.json({
        symbol: snapshot.symbol,
        trades: trades.slice(-1 * (Number.isFinite(limit) ? limit : 100)),
        lastUpdate: snapshot.lastUpdate,
      });
    },
  );

  return router;
};
