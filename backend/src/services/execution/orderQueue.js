const EventEmitter = require('events');
const { randomUUID } = require('crypto');

class OrderQueue extends EventEmitter {
  constructor({ dispatchOrder, simulateExecution } = {}) {
    super();
    this.dispatchOrder = dispatchOrder;
    this.simulateExecution = simulateExecution;
    this.queue = [];
    this.orders = new Map();
    this.processing = false;
  }

  submit(orderInput = {}) {
    const order = {
      id: randomUUID(),
      clientOrderId: orderInput.clientOrderId || this.generateClientOrderId(),
      symbol: orderInput.symbol || null,
      side: (orderInput.side || 'BUY').toUpperCase(),
      type: (orderInput.type || 'MARKET').toUpperCase(),
      quantity: Number(orderInput.quantity || 0),
      price: orderInput.price != null ? Number(orderInput.price) : null,
      timeInForce: (orderInput.timeInForce || 'DAY').toUpperCase(),
      status: 'queued',
      error: null,
      createdAt: new Date().toISOString(),
      sentAt: null,
      executions: [],
      metadata: orderInput.metadata || {},
    };

    this.queue.push(order);
    this.orders.set(order.id, order);
    this.emit('queued', order);
    this.process();
    return order;
  }

  async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length) {
      const order = this.queue.shift();
      try {
        order.status = 'sending';
        this.emit('sending', order);
        if (typeof this.dispatchOrder === 'function') {
          await this.dispatchOrder(order);
        }
        order.status = 'sent';
        order.sentAt = new Date().toISOString();
        this.emit('sent', order);
      } catch (error) {
        order.status = 'error';
        order.error = error.message;
        order.errorAt = new Date().toISOString();
        this.emit('error', { order, error });
      }

      if (order.status === 'error') {
        continue;
      }

      if (typeof this.simulateExecution === 'function') {
        this.simulateExecution(order);
      }
    }

    this.processing = false;
  }

  updateExecution(report = {}) {
    const order = this.findOrder(report.orderId, report.clientOrderId);
    if (!order) {
      return;
    }

    if (report.status) {
      order.status = report.status;
    }
    const execution = {
      id: report.executionId || randomUUID(),
      timestamp: report.timestamp || new Date().toISOString(),
      status: report.status || 'filled',
      price: report.price != null ? Number(report.price) : null,
      quantity: report.quantity != null ? Number(report.quantity) : null,
      leavesQuantity: report.leavesQuantity != null ? Number(report.leavesQuantity) : null,
      side: report.side || order.side,
      text: report.text || null,
      simulated: report.simulated || false,
    };
    order.executions.push(execution);
    this.emit('execution', { order, execution, report });
  }

  findOrder(id, clientOrderId) {
    if (id && this.orders.has(id)) {
      return this.orders.get(id);
    }
    if (clientOrderId) {
      return Array.from(this.orders.values()).find((ord) => ord.clientOrderId === clientOrderId);
    }
    return null;
  }

  list(limit = 50) {
    return Array.from(this.orders.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  generateClientOrderId() {
    return `CL${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }
}

const createOrderQueue = (options) => new OrderQueue(options);

module.exports = {
  OrderQueue,
  createOrderQueue,
};




