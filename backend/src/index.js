const http = require('http');
const createApp = require('./http/app');
const config = require('./config/env');
const logger = require('./logging/logger');
const { createExecutionService } = require('./services/execution');
const { createMarketDataService } = require('./services/marketData');

const bootstrap = () => {
  const executionService = createExecutionService();
  const marketDataService = createMarketDataService();

  let fixGateway = null;
  if (config.fix && config.fix.enabled) {
    fixGateway = executionService.attachFixGateway(config.fix);
    if (!fixGateway || fixGateway.simulate || !fixGateway.isConfigured()) {
      logger.warn('FIX gateway configurado em modo simulado ou com parâmetros incompletos.');
    }
  }

  marketDataService.on('update', (snapshot) => {
    executionService.updateMarketData(snapshot);
  });
  marketDataService.start();

  const app = createApp({ executionService, marketDataService });
  const server = http.createServer(app);

  server.listen(config.port, config.host, () => {
    const listenAddress = `http://${config.host}:${config.port}`;
    logger.info(`Backend HTTP gateway listening on ${listenAddress}`, { env: config.environment });
  });

  server.on('error', (error) => {
    logger.error('HTTP server error', { error });
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    marketDataService.stop();
    if (fixGateway) {
      fixGateway.disconnect().catch((err) => logger.error('Erro ao encerrar FIX', { error: err.message }));
    }
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });

  return { server, executionService, marketDataService, fixGateway };
};

if (require.main === module) {
  bootstrap();
}

module.exports = { bootstrap };
