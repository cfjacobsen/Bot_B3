const client = require('prom-client');
const logger = require('../logging/logger');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'botb3_' });

const httpRequestDuration = new client.Histogram({
  name: 'botb3_http_request_duration_seconds',
  help: 'Histograma de duração das requisições HTTP',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

const httpRequestsTotal = new client.Counter({
  name: 'botb3_http_requests_total',
  help: 'Total de requisições HTTP processadas',
  labelNames: ['method', 'route', 'status']
});

const inflightRequests = new client.Gauge({
  name: 'botb3_http_requests_inflight',
  help: 'Requisições HTTP em andamento'
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(inflightRequests);

const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  const end = () => {
    inflightRequests.dec();
    res.removeListener('finish', end);
    res.removeListener('close', end);

    const route = res.locals.metricsRoute || req.path;
    const status = res.statusCode || 500;
    const labels = { method: req.method, route, status };
    const duration = Number(process.hrtime.bigint() - start) / 1e9;

    httpRequestDuration.observe(labels, duration);
    httpRequestsTotal.inc(labels);
  };

  inflightRequests.inc();
  res.on('finish', end);
  res.on('close', end);
  next();
};

const responseTimeDecorator = (route) => (req, res, next) => {
  res.locals.metricsRoute = route;
  next();
};

const exposeMetrics = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    logger.error('Erro ao coletar métricas', { error: error.message });
    res.status(500).send('Erro ao coletar métricas');
  }
};

module.exports = {
  register,
  metricsMiddleware,
  responseTimeDecorator,
  exposeMetrics,
};
