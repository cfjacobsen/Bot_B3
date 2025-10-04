const express = require('express');
const createSystemRouter = require('./system');
const createMarketRouter = require('./market');
const createExecutionRouter = require('./execution');

module.exports = (dependencies = {}) => {
  const router = express.Router();

  router.use('/system', createSystemRouter(dependencies));
  router.use('/market', createMarketRouter(dependencies));
  router.use('/execution', createExecutionRouter(dependencies));

  return router;
};
