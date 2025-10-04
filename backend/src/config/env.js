const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envCandidates = [
  process.env.BOT_B3_ENV_PATH,
  path.resolve(__dirname, '../../.env.local'),
  path.resolve(__dirname, '../../.env')
].filter(Boolean);

envCandidates.forEach((candidate) => {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: true });
  }
});

const parseList = (value = '') => value
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

module.exports = {
  environment: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3001),
  allowedOrigins: parseList(process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173'),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
    audience: process.env.JWT_AUDIENCE || 'trading_client',
    issuer: process.env.JWT_ISSUER || 'BotB3-Core'
  },
  fix: {
    enabled: process.env.FIX_ENABLED !== 'false',
    host: process.env.FIX_HOST || null,
    port: process.env.FIX_PORT ? Number(process.env.FIX_PORT) : null,
    senderCompId: process.env.FIX_SENDER_COMP_ID || null,
    targetCompId: process.env.FIX_TARGET_COMP_ID || null,
    heartBtInt: process.env.FIX_HEARTBTINT ? Number(process.env.FIX_HEARTBTINT) : 30,
    resetSeqNumFlag: process.env.FIX_RESET_SEQ === 'false' ? false : true,
    username: process.env.FIX_USERNAME || null,
    password: process.env.FIX_PASSWORD || null,
    account: process.env.FIX_ACCOUNT || null,
    reconnectIntervalMs: process.env.FIX_RECONNECT_INTERVAL_MS ? Number(process.env.FIX_RECONNECT_INTERVAL_MS) : 5000,
    simulate: process.env.FIX_SIMULATE === 'true',
  },
  ai: {
    enabled: process.env.AI_ENABLED !== 'false',
    autoTrade: process.env.AI_AUTOTRADE === 'true',
    cacheTtlMs: process.env.AI_CACHE_TTL_MS ? Number(process.env.AI_CACHE_TTL_MS) : 60000,
    chatgpt: {
      apiKey: process.env.CHATGPT_API_KEY || process.env.OPENAI_API_KEY || null,
      model: process.env.CHATGPT_MODEL || 'gpt-4o-mini-preview',
      temperature: process.env.CHATGPT_TEMPERATURE ? Number(process.env.CHATGPT_TEMPERATURE) : 0.3,
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || null,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: process.env.DEEPSEEK_TEMPERATURE ? Number(process.env.DEEPSEEK_TEMPERATURE) : 0.3,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    },
    rl: {
      enabled: process.env.RL_ENABLED === 'true',
      endpoint: process.env.RL_ENDPOINT || null,
      apiKey: process.env.RL_API_KEY || null,
      timeoutMs: process.env.RL_TIMEOUT_MS ? Number(process.env.RL_TIMEOUT_MS) : 2000,
      cacheTtlMs: process.env.RL_CACHE_TTL_MS ? Number(process.env.RL_CACHE_TTL_MS) : 30000,
    },
  },
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    token: process.env.METRICS_TOKEN || null,
  }
};
