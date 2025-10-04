const express = require('express');

const router = express.Router();

// Configura��es do bot
router.post('/config', (req, res) => {
  const { strategy, risk, symbols } = req.body;

  global.tradingConfig = { strategy, risk, symbols };

  res.json({ success: true, message: 'Configura��es salvas' });
});

// Status do bot
router.get('/status', (req, res) => {
  res.json({
    running: global.tradingEngine?.isRunning || false,
    positions: Array.from(global.tradingEngine?.positions || []),
    balance: 10000,
  });
});

// Controle do bot
router.post('/control', (req, res) => {
  const { action } = req.body;

  switch (action) {
    case 'start':
      global.tradingEngine.start();
      break;
    case 'stop':
      global.tradingEngine.stop();
      break;
    default:
      res.status(400).json({ success: false, message: 'A��o n�o reconhecida' });
      return;
  }

  res.json({ success: true, action });
});

module.exports = router;
