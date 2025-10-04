const { ChatGptProvider, DeepSeekProvider } = require('./providers');
const { AiOrchestrator } = require('./orchestrator');
const { RlClient } = require('./rlClient');

const buildProviders = (config = {}) => {
  const providers = [];
  if (config.chatgpt?.apiKey) {
    providers.push(new ChatGptProvider({
      apiKey: config.chatgpt.apiKey,
      model: config.chatgpt.model,
      temperature: config.chatgpt.temperature,
    }));
  }
  if (config.deepseek?.apiKey) {
    providers.push(new DeepSeekProvider({
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseURL,
      model: config.deepseek.model,
      temperature: config.deepseek.temperature,
    }));
  }
  return providers;
};

const createAiStack = (config = {}) => {
  const orchestrator = config.enabled
    ? new AiOrchestrator({
        providers: buildProviders(config),
        cacheTtlMs: config.cacheTtlMs,
      })
    : null;

  const rlClient = config.rl?.enabled ? new RlClient(config.rl) : null;

  return {
    orchestrator,
    rlClient,
  };
};

module.exports = {
  createAiStack,
};
