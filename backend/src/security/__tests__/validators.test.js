const { validateOrderPayload, validateControlPayload } = require('../validators');

describe('validateOrderPayload', () => {
  it('approves a valid market order', () => {
    const result = validateOrderPayload({
      symbol: 'WINQ25',
      side: 'buy',
      type: 'market',
      quantity: 2,
    });
    expect(result.valid).toBe(true);
    expect(result.normalized.quantity).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid fields', () => {
    const result = validateOrderPayload({ side: 'hold', quantity: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['side', 'quantity']));
  });
});

describe('validateControlPayload', () => {
  it('rejects unknown action', () => {
    const result = validateControlPayload({ action: 'dance' });
    expect(result.valid).toBe(false);
  });

  it('normalizes parameters', () => {
    const result = validateControlPayload({ action: 'START', parameters: { autoTrade: true } });
    expect(result.valid).toBe(true);
    expect(result.normalized.action).toBe('start');
    expect(result.normalized.parameters).toEqual({ autoTrade: true });
  });
});
