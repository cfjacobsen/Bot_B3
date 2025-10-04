const express = require('express');
const { responseTimeDecorator } = require('../../observability/metrics');
const { validateOrderPayload } = require('../../security/validators');

module.exports = ({ executionService } = {}) => {
  if (!executionService) {
    throw new Error('executionService dependency is required for execution routes');
  }

  const router = express.Router();

  router.post(
    '/orders',
    responseTimeDecorator('/api/execution/orders'),
    (req, res, next) => {
      try {
        const validation = validateOrderPayload(req.body);
        if (!validation.valid) {
          return res.status(400).json({ error: 'Payload inválido', fields: validation.errors });
        }

        const normalized = validation.normalized;
        if (!normalized.symbol) {
          normalized.symbol = executionService.state.market.symbol || 'WIN';
        }

        const order = executionService.submitOrder(normalized);
        res.status(202).json(order);
      } catch (error) {
        if (error.code === 'RISK_REJECTED') {
          return res.status(409).json({ error: error.message || 'Ordem rejeitada pelas regras de risco.' });
        }
        next(error);
      }
    },
  );

  router.get(
    '/orders',
    responseTimeDecorator('/api/execution/orders'),
    (req, res) => {
      const limit = Number(req.query?.limit ?? 50);
      res.json({ orders: executionService.listOrders(Number.isFinite(limit) ? limit : 50) });
    },
  );

  return router;
};
