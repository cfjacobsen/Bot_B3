// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Importar componentes do sistema (verifique os caminhos e exportaÃ§Ãµes)
const AdvancedRiskManager = require('../core/trading/riskManager.js');
const { AdvancedAuthentication } = require('../core/security/authentication.js'); // Corrigido
const GPTConsensus = require('../core/ai/gptConsensus.js');
const OperatorManager = require('../core/trading/operators/operatorManager.js');
const SmartGoalEngine = require('../core/trading/goalEngine.js');

// Garantir pasta de logs
if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true });

// Configurar logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() }),
  ],
});

class TradingBotEnterpriseServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
        methods: ['GET', 'POST'],
      },
    });
    this.authenticatedSockets = new Set();

    // Estado do sistema
    this.systemState = {
      isRunning: false,
      activeUsers: new Map(),
      currentCapital: Number(process.env.TRADING_CAPITAL) || 50000,
      dailyGoals: null,
      performance: { dailyPnl: 0, trades: 0, winRate: 0 },
      lastUpdate: new Date(),
      tradingSymbol: process.env.DEFAULT_TRADING_SYMBOL || 'PETR4.SA',
    };

    // Inicializar componentes principais
    // âœ… AGORA DEVE FUNCIONAR: AdvancedAuthentication Ã© uma classe
    this.riskManager = new AdvancedRiskManager(() => ({
      currentCapital: this.systemState.currentCapital,
      initialCapital: Number(process.env.TRADING_CAPITAL) || 50000,
      dailyPnl: this.systemState.performance.dailyPnl,
    }));
    this.auth = new AdvancedAuthentication(); // InstanciaÃ§Ã£o correta
    this.gptConsensus = new GPTConsensus();
    this.operatorManager = new OperatorManager(this.gptConsensus, this.riskManager);
    this.goalEngine = new SmartGoalEngine(this.gptConsensus, this.operatorManager, this.riskManager);

    this.tradingLoopInterval = Number(process.env.TRADING_LOOP_INTERVAL_MS) || 15000;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.startSystem();
  }

  setupMiddleware() {
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'http:', 'https:', 'ws:', 'wss:'],
          },
        },
      }),
    );

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'Muitas requisiÃ§Ãµes deste IP, tente novamente em 15 minutos.',
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use('/api/', limiter);
    this.app.use(compression());
    this.app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','), credentials: true }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static(path.join(__dirname, 'frontend')));

    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });
  }

  setupRoutes() {
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'frontend/index.html'));
    });

    // === ROTAS DE AUTENTICAÃ‡ÃƒO ===
    this.app.post('/api/auth/login', async (req, res) => {
      try {
        const { email, password, totpToken } = req.body;
        const result = await this.auth.authenticateUser({
          email,
          password,
          totpToken,
          ip: req.ip,
          deviceFingerprint: req.get('X-Device-Fingerprint') || 'unknown',
        });
        res.json(result);
      } catch (error) {
        logger.error('Login failed', { error: error.message });
        res.status(401).json({ error: error.message });
      }
    });

    this.app.post('/api/auth/generate-2fa', this.auth.authenticateToken(['MANAGE_USERS']), async (req, res) => {
      try {
        const { userId } = req.body;
        const secret = this.auth.generateTOTPSecret(userId);
        res.json(secret);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === ROTAS DO SISTEMA DE TRADING ===
    this.app.get('/api/system/status', this.auth.authenticateToken(['VIEW_SYSTEM']), (req, res) => {
      res.json({
        ...this.systemState,
        currentGoals: this.goalEngine.getCurrentGoals(),
        operators: this.operatorManager.getActiveOperators(),
        timestamp: new Date(),
      });
    });

    this.app.post('/api/system/control', this.auth.authenticateToken(['MANAGE_SYSTEM']), async (req, res) => {
      try {
        const { action, parameters } = req.body;
        switch (action) {
          case 'start':
            await this.startTradingSystem(parameters);
            break;
          case 'stop':
            await this.stopTradingSystem();
            break;
          case 'pause':
            await this.pauseTradingSystem();
            break;
          default:
            throw new Error(`AÃ§Ã£o desconhecida: ${action}`);
        }
        res.json({ success: true, action, systemState: this.systemState });
      } catch (error) {
        logger.error('System control failed', { error: error.message, user: req.user?.userId });
        res.status(500).json({ error: error.message });
      }
    });

    // ... (outras rotas para metas, operadores, health check)
  }

  setupWebSocket() {
    const wsAuthAttempts = new Map();

    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);
      const key = socket.handshake.address;
      if (!wsAuthAttempts.has(key)) wsAuthAttempts.set(key, 0);

      socket.on('authenticate', (token) => {
        try {
          // VerificaÃ§Ã£o robusta do JWT :cite[1]:cite[5]
          const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
            algorithms: ['HS256'], // Importante: especificar o algoritmo
            issuer: 'TradingBot_B3', // Verificar o emissor
            audience: 'trading_client', // Verificar a audiÃªncia
          });
          socket.userId = decoded.userId;
          socket.authenticated = true;
          this.systemState.activeUsers.set(socket.id, {
            userId: decoded.userId,
            connectedAt: new Date(),
            lastActivity: new Date(),
          });
          socket.emit('authenticated', { success: true });
          socket.emit('system_status', this.systemState);
        } catch (error) {
          logger.warn(`Falha na autenticaÃ§Ã£o WebSocket para ${socket.id}: ${error.message}`);
          socket.emit('authentication_failed', { error: 'Token invÃ¡lido' });
          socket.disconnect(true);
        }
      });

      socket.on('subscribe_to_updates', () => {
        if (socket.authenticated) socket.join('trading_updates');
      });

      socket.on('request_market_data', () => {
        if (socket.authenticated) socket.emit('market_data', this.generateMockMarketData());
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
        this.systemState.activeUsers.delete(socket.id);
      });
    });

    setInterval(() => {
      if (this.systemState.isRunning) {
        this.io.to('trading_updates').emit('market_data', this.generateMockMarketData());
        this.io.to('trading_updates').emit('system_status', this.systemState);
      }
    }, 5000);
  }

  async startTradingSystem(parameters = {}) {
    logger.info('ðŸš€ Iniciando sistema de trading avanÃ§ado...');
    try {
      const marketData = this.generateMockMarketData(this.systemState.tradingSymbol);
      const goals = await this.goalEngine.calculateDailyGoals(
        marketData,
        parameters.capital || this.systemState.currentCapital,
        this.systemState.performance,
      );
      const operatorSelection = await this.operatorManager.selectBestOperator(marketData, parameters.goalType || 'MODERATE');
      const consensus = await this.gptConsensus.getMarketConsensus(marketData);

      this.systemState.isRunning = true;
      this.systemState.dailyGoals = goals;
      this.systemState.selectedOperator = operatorSelection;
      this.systemState.gptConsensus = consensus;
      this.systemState.lastUpdate = new Date();

      this.tradingTick();

      this.io.to('trading_updates').emit('trading_started', {
        goals, operator: operatorSelection, consensus, timestamp: new Date(),
      });
    } catch (error) {
      logger.error('âŒ Erro ao iniciar sistema de trading', { error: error.message });
      throw error;
    }
  }

  async stopTradingSystem() {
    logger.info('ðŸ›‘ Parando sistema de trading...');
    this.systemState.isRunning = false;
    this.systemState.lastUpdate = new Date();
    this.io.to('trading_updates').emit('trading_stopped', { finalState: this.systemState, timestamp: new Date() });
  }

  async pauseTradingSystem() {
    logger.info('â¸ï¸ Pausando sistema de trading...');
    this.io.to('trading_updates').emit('trading_paused', { timestamp: new Date() });
  }

  async tradingTick() {
    if (!this.systemState.isRunning) return;
    try {
      const marketData = this.generateMockMarketData(this.systemState.tradingSymbol);
      const { operator } = await this.operatorManager.selectBestOperator(marketData, this.systemState.dailyGoals?.type || 'MODERATE');

      if (operator) {
        const signal = await operator.generateSignal(marketData);

        if (signal && signal.signal !== 'HOLD') {
          const trade = this.buildTradeFromSignal(signal, operator, marketData);
          const validation = this.riskManager.validateTrade(trade, marketData);
          if (validation.isValid) {
            await this.executeTrade(trade);
          }
        }
      }
    } catch (error) {
      logger.error('Erro no tradingTick', { error: error.message });
    } finally {
      if (this.systemState.isRunning) {
        setTimeout(() => this.tradingTick(), this.tradingLoopInterval);
      }
    }
  }

  buildTradeFromSignal(signal, operator, marketData) {
    const currentPrice = marketData.prices.current;
    const riskConfig = operator.config;

    const stopLossPrice = signal.signal === 'BUY'
      ? currentPrice * (1 - riskConfig.stopLoss / 100)
      : currentPrice * (1 + riskConfig.stopLoss / 100);

    const takeProfitPrice = signal.signal === 'BUY'
      ? currentPrice * (1 + riskConfig.takeProfit / 100)
      : currentPrice * (1 - riskConfig.takeProfit / 100);

    const riskAmount = this.systemState.currentCapital * (this.riskManager.config.maxTradeRisk / 100);
    const riskPerShare = Math.abs(currentPrice - stopLossPrice);
    const quantity = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;

    return {
      symbol: marketData.symbol,
      side: signal.signal,
      quantity,
      price: currentPrice,
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice,
      reason: signal.reason,
      operator: operator.type,
    };
  }

  async executeTrade(trade) {
    // TODO: Integrar com a API real da corretora
    logger.info('EXECUTANDO TRADE (SIMULADO)', { trade });
    this.io.to('trading_updates').emit('new_trade', trade);
  }

  generateMockMarketData(symbol = this.systemState.tradingSymbol) {
    return {
      symbol,
      prices: {
        current: 25.5 + (Math.random() - 0.5) * 2,
        open: 25.3,
        high: 26.1,
        low: 24.8,
        change: (Math.random() - 0.5) * 4,
      },
      indicators: { rsi: 30 + Math.random() * 40 },
      volume: { current: Math.random() * 200000 + 100000, average: 150000 },
      timestamp: new Date(),
    };
  }

  startSystem() {
    const PORT = process.env.PORT || 3000;
    const HOST = process.env.HOST || '127.0.0.1';
    this.server.listen(PORT, HOST, () => {
      logger.info(`ðŸš€ Trading Bot B3 Enterprise Server iniciado em http://${HOST}:${PORT}`);
    });

    process.on('SIGTERM', () => {
      logger.info('Recebido SIGTERM, encerrando graciosamente...');
      this.io.close();
      this.server.close(() => {
        logger.info('Servidor HTTP encerrado.');
        process.exit(0);
      });
    });
  }
}

new TradingBotEnterpriseServer();
