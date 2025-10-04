const crypto = require('crypto');
const logger = require('../../logging/logger');

class AiOrchestrator {
  constructor({ providers = [], cacheTtlMs = 60_000 } = {}) {
    this.providers = providers.filter((provider) => provider?.isEnabled());
    this.cacheTtlMs = cacheTtlMs;
    this.cache = new Map();
  }

  addProvider(provider) {
    if (provider?.isEnabled()) {
      this.providers.push(provider);
    }
  }

  buildCacheKey(prompt, options) {
    const raw = JSON.stringify({ prompt, options });
    return crypto.createHash('sha1').update(raw).digest('hex');
  }

  tryGetCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  setCache(key, value) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  async infer(prompt, options = {}) {
    if (!this.providers.length) {
      throw new Error('Nenhum provedor de IA habilitado. Configure CHATGPT_API_KEY ou DEEPSEEK_API_KEY.');
    }
    const cacheKey = this.buildCacheKey(prompt, options);
    const cached = this.tryGetCache(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    for (const provider of this.providers) {
      try {
        const result = await provider.infer(prompt, options);
        const parsed = this.parseResult(result, options);
        const response = { provider: provider.name, raw: result, parsed };
        this.setCache(cacheKey, response);
        return response;
      } catch (error) {
        logger.warn(`Provider ${provider.name} falhou: ${error.message}`);
      }
    }

    throw new Error('Todos os provedores de IA falharam.');
  }

  parseResult(result, options) {
    if (!result) return null;
    if (options.json !== false) {
      try {
        return typeof result === 'string' ? JSON.parse(result) : result;
      } catch (error) {
        logger.warn('Falha ao fazer parse do JSON retornado pela IA, devolvendo texto puro');
        return { text: result };
      }
    }
    return { text: result };
  }

  async getConsensusAnalysis({ marketSnapshot, indicators, riskStatus }) {
    const prompt = this.buildConsensusPrompt({ marketSnapshot, indicators, riskStatus });
    const response = await this.infer(prompt, { json: true });
    return {
      ...response,
      consensus: this.buildConsensusObject(response.parsed, { marketSnapshot, indicators, riskStatus }),
    };
  }

  buildConsensusPrompt({ marketSnapshot, indicators, riskStatus }) {
    const last = marketSnapshot?.candles?.[marketSnapshot.candles.length - 1];
    const price = last ? Number(last.close).toFixed(2) : 'N/D';
    const rsi = indicators?.rsi?.value != null ? indicators.rsi.value.toFixed(2) : 'N/D';
    const macd = indicators?.macd?.macd != null ? indicators.macd.macd.toFixed(2) : 'N/D';
    const vwap = indicators?.vwap?.value != null ? indicators.vwap.value.toFixed(2) : 'N/D';

    return `Sou um bot que opera mini índice B3 (WIN). Avalie mercado atual e forneça plano resumido.
Ultimo preço: ${price}
RSI: ${rsi}
MACD: ${macd}
VWAP: ${vwap}
Lucro realizado do dia: ${riskStatus?.realizedPnl ?? 0}
Pares chave: Sinal de tendência, suporte/resistência e fator de risco.

Responda em JSON com:
{
  "bias": "BULLISH|BEARISH|NEUTRAL",
  "confidence": 0-1,
  "rationale": "texto curto",
  "key_levels": ["..."],
  "recommended_action": "BUY|SELL|HOLD",
  "risk_notes": "..."
}`;
  }

  buildConsensusObject(parsed, context) {
    if (!parsed || typeof parsed !== 'object') {
      return { bias: 'UNKNOWN', confidence: 0, rationale: 'Resposta inválida', raw: parsed };
    }
    return {
      bias: parsed.bias || 'UNKNOWN',
      confidence: Number(parsed.confidence || 0),
      rationale: parsed.rationale || '',
      keyLevels: parsed.key_levels || [],
      recommendedAction: parsed.recommended_action || 'HOLD',
      riskNotes: parsed.risk_notes || '',
      raw: parsed,
      context,
    };
  }
}

const createAiOrchestrator = (options) => new AiOrchestrator(options);

module.exports = {
  AiOrchestrator,
  createAiOrchestrator,
};
