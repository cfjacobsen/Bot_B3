const logger = require('../../logging/logger');

class AiProvider {
  constructor(name) {
    this.name = name;
  }

  isEnabled() {
    return true;
  }

  async infer() {
    throw new Error('infer not implemented');
  }
}

class ChatGptProvider extends AiProvider {
  constructor({ apiKey, model = 'gpt-4o-mini-preview', temperature = 0.3 } = {}) {
    super('chatgpt');
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    try {
      this.client = apiKey ? new (require('openai'))({ apiKey }) : null;
    } catch (error) {
      logger.warn('openai SDK não encontrado. ChatGPT ficará desabilitado.');
      this.client = null;
    }
  }

  isEnabled() {
    return Boolean(this.client);
  }

  async infer(prompt, { json = true } = {}) {
    if (!this.client) {
      throw new Error('ChatGPT provider disabled (missing client)');
    }
    const messages = Array.isArray(prompt) ? prompt : [
      { role: 'system', content: 'Você é um analista financeiro especialista em mini índice B3.' },
      { role: 'user', content: prompt }
    ];
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      response_format: json ? { type: 'json_object' } : undefined,
      messages,
    });
    const content = response.choices[0]?.message?.content;
    return content;
  }
}

class DeepSeekProvider extends AiProvider {
  constructor({ apiKey, baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', model = 'deepseek-chat', temperature = 0.3 } = {}) {
    super('deepseek');
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    if (typeof fetch === 'function') {
      this.fetch = (...args) => fetch(...args);
    } else {
      this.fetch = null;
      logger.warn('fetch API indisponível neste ambiente. DeepSeek ficará desabilitado.');
    }
    this.baseURL = baseURL;
  }

  isEnabled() {
    return Boolean(this.fetch && this.apiKey);
  }

  async infer(prompt, { json = true } = {}) {
    if (!this.isEnabled()) {
      throw new Error('DeepSeek provider disabled (missing fetch or apiKey)');
    }
    const body = {
      model: this.model,
      messages: Array.isArray(prompt) ? prompt : [
        { role: 'system', content: 'Você é um analista financeiro especialista em mini índice B3.' },
        { role: 'user', content: prompt }
      ],
      temperature: this.temperature,
      response_format: json ? 'json' : 'text'
    };

    const response = await this.fetch(`${this.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return content;
  }
}

module.exports = {
  AiProvider,
  ChatGptProvider,
  DeepSeekProvider,
};
