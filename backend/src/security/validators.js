const sanitizeString = (value, maxLength = 255) => {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]/g, ' ').trim().slice(0, maxLength);
};

const ensureNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const ALLOWED_SIDES = new Set(['BUY', 'SELL']);
const ALLOWED_TYPES = new Set(['MARKET', 'LIMIT']);
const ALLOWED_TIME_IN_FORCE = new Set(['DAY', 'GTC', 'IOC', 'FOK']);
const ALLOWED_ACTIONS = new Set(['start', 'pause', 'stop']);

function validateOrderPayload(payload = {}) {
  const errors = [];
  const side = sanitizeString(payload.side || 'BUY').toUpperCase();
  const type = sanitizeString(payload.type || 'MARKET').toUpperCase();
  const timeInForce = payload.timeInForce ? sanitizeString(payload.timeInForce).toUpperCase() : 'DAY';
  const quantity = ensureNumber(payload.quantity);
  const price = payload.price != null ? ensureNumber(payload.price) : null;

  if (!ALLOWED_SIDES.has(side)) {
    errors.push('side');
  }
  if (!ALLOWED_TYPES.has(type)) {
    errors.push('type');
  }
  if (!ALLOWED_TIME_IN_FORCE.has(timeInForce)) {
    errors.push('timeInForce');
  }
  if (!quantity || quantity <= 0) {
    errors.push('quantity');
  }
  if (type === 'LIMIT' && (price == null || price <= 0)) {
    errors.push('price');
  }

  return {
    valid: errors.length === 0,
    normalized: {
      symbol: sanitizeString(payload.symbol || ''),
      side,
      type,
      timeInForce,
      quantity: quantity || 0,
      price,
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    },
    errors,
  };
}

function validateControlPayload(payload = {}) {
  const action = sanitizeString(payload.action || '').toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) {
    return { valid: false, error: 'action' };
  }
  return {
    valid: true,
    normalized: {
      action,
      parameters: typeof payload.parameters === 'object' && payload.parameters ? payload.parameters : {},
    },
  };
}

module.exports = {
  validateOrderPayload,
  validateControlPayload,
};
