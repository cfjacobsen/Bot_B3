const logger = require('../../logging/logger');

class RlClient {
  constructor({ endpoint, apiKey, timeoutMs = 2000 } = {}) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  isEnabled() {
    return Boolean(this.endpoint);
  }

  async getAction(payload) {
    if (!this.isEnabled()) {
      throw new Error('RL client disabled');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`RL HTTP ${response.status}: ${errText}`);
      }
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = {
  RlClient,
};
