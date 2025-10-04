const express = require('express');
const { responseTimeDecorator } = require('../../observability/metrics');
const { validateControlPayload } = require('../../security/validators');

module.exports = ({ executionService } = {}) => {
  if (!executionService) {
    throw new Error('executionService dependency is required for system routes');
  }

  const router = express.Router();

  router.get(
    '/status',
    responseTimeDecorator('/api/system/status'),
    (req, res) => {
      res.json({
        status: executionService.getStatus(),
        heartbeat: executionService.getHeartbeat(),
        goals: executionService.getGoalsSnapshot(),
        timestamp: new Date().toISOString(),
      });
    },
  );

  router.post(
    '/control',
    responseTimeDecorator('/api/system/control'),
    async (req, res, next) => {
      try {
        const validation = validateControlPayload(req.body);
        if (!validation.valid) {
          return res.status(400).json({ error: 'Ação inválida', field: validation.error });
        }

        const { action, parameters } = validation.normalized;
        switch (action) {
          case 'start':
            await executionService.start(parameters);
            break;
          case 'pause':
            await executionService.pause(parameters);
            break;
          case 'stop':
            await executionService.stop(parameters);
            break;
          default:
            return res.status(400).json({ error: 'Ação inválida ou não suportada.' });
        }
        res.json({ success: true, action, timestamp: new Date().toISOString() });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/metrics',
    responseTimeDecorator('/api/system/metrics'),
    (req, res) => {
      res.json(executionService.getMetrics());
    },
  );

  return router;
};
