const jwt = require('jsonwebtoken'); 
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const crypto = require('crypto');

class AdvancedAuthentication {
  constructor(options = {}) {
    // Configurações com valores padrão
    this.maxFailedAttempts = options.maxFailedAttempts || 5;
    this.lockoutTime = options.lockoutTime || 15 * 60 * 1000;
    this.accessTokenExpiry = options.accessTokenExpiry || '15m';
    this.refreshTokenExpiry = options.refreshTokenExpiry || '7d';
    this.otpWindow = options.otpWindow || 2;

    // Stores
    this.sessionStore = new Map();
    this.failedAttempts = new Map();
    this.trustedDevices = new Map();
    this.revokedTokens = new Map();

    // Dependências de repositório
    this.userRepository = options.userRepository;
    this.securityLogRepository = options.securityLogRepository;
  }

  // ========== MÉTODOS PRINCIPAIS DE AUTENTICAÇÃO ==========

  /**
   * Login multi-fator completo
   */
  async authenticateUser(credentials) {
    const {
      email, password, totpToken, ip, deviceFingerprint, userAgent
        } = credentials;

    try {
      // 1. Verificar bloqueio por tentativas
      const blockCheck = this.checkFailedAttempts(email);
      if (blockCheck.blocked) {
        throw new Error(`Conta bloqueada. Tente novamente em ${Math.ceil(blockCheck.remainingTime / 60000)} minutos`);
      }

      // 2. Validar usuário e senha
      const user = await this.getUserByEmail(email);
      if (!user) {
        this.recordFailedAttempt(email);
        throw new Error('Credenciais inválidas');
      }

      // 3. Verificar status da conta
      if (user.accountStatus !== 'ACTIVE') {
        throw new Error(`Conta ${user.accountStatus.toLowerCase()}. Contate o suporte.`);
      }

      // 4. Validar senha
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        this.recordFailedAttempt(email);
        await this.logSecurityEvent('INVALID_PASSWORD', {
          userId: user.id,
          email,
          ip,
          timestamp: new Date()
        });
        throw new Error('Credenciais inválidas');
      }

      // 5. Validar 2FA
      const isTotpValid = this.validateTOTP(totpToken, user.totpSecret);
      if (!isTotpValid) {
        this.recordFailedAttempt(email);
        await this.logSecurityEvent('INVALID_2FA', {
          userId: user.id,
          email,
          ip,
          timestamp: new Date()
        });
        throw new Error('Token 2FA inválido');
      }

      // 6. Gerar tokens JWT
      const tokens = await this.generateTokens(user);

      // 7. Registrar sessão
      await this.registerSession(user.id, tokens.accessToken, { 
        ip, 
        device: deviceFingerprint,
        userAgent,
        lastActivity: new Date()
      });

      // 8. Limpar tentativas falhas
      this.clearFailedAttempts(email);

      // 9. Log de acesso bem-sucedido
      await this.logSecurityEvent('LOGIN_SUCCESS', {
        userId: user.id,
        email,
        ip,
        deviceFingerprint,
        timestamp: new Date()
      });

      const result = {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
        },
        tokens,
        requiresPasswordChange: Boolean(user.requiresPasswordChange)
      };

      return result;

    } catch (error) {
      await this.logSecurityEvent('LOGIN_FAILED', {
        email,
        ip,
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Middleware de autenticação avançado
   */
  authenticateToken(requiredPermissions = []) {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
          res.status(401).json({ 
            error: 'Token de acesso requerido',
            code: 'MISSING_TOKEN'
          });
          return;
        }

        // Verificar se token foi revogado
        if (this.isTokenRevoked(token)) {
          res.status(401).json({ 
            error: 'Token revogado',
            code: 'TOKEN_REVOKED'
          });
          return;
        }

        // Verificar token JWT
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
          algorithms: ['HS256'],
          issuer: 'TradingBot_B3',
          audience: 'trading_client'
        });

        // Verificar validade da sessão 
        const session = this.sessionStore.get(decoded.sessionId);
        if (!session) {
          res.status(401).json({ 
            error: 'Sessão inválida ou expirada',
            code: 'INVALID_SESSION'
          });
          return;
        }

        // Verificar se sessão expirou por inatividade (30 minutos)
        const inactivityTime = Date.now() - session.lastActivity;
        if (inactivityTime > 30 * 60 * 1000) {
          this.sessionStore.delete(decoded.sessionId);
          res.status(401).json({ 
            error: 'Sessão expirada por inatividade',
            code: 'SESSION_EXPIRED'
          });
          return;
        }

        // Atualizar última atividade
        session.lastActivity = Date.now();

        // Verificar permissões se necessário
        if (requiredPermissions.length > 0) {
          const hasPermission = requiredPermissions.every(permission => 
            decoded.permissions.includes(permission)
          );
          if (!hasPermission) {
            res.status(403).json({ 
              error: 'Permissão insuficiente',
              code: 'INSUFFICIENT_PERMISSIONS'
            });
            return;
          }
        }

        req.user = decoded;
        req.session = session;
        next();

      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          res.status(401).json({ 
            error: 'Token expirado',
            code: 'TOKEN_EXPIRED'
          });
        } else if (error.name === 'JsonWebTokenError') {
          res.status(403).json({ 
            error: 'Token inválido',
            code: 'INVALID_TOKEN'
          });
        } else {
          res.status(500).json({ 
            error: 'Erro de autenticação',
            code: 'AUTH_ERROR'
          });
        }
      }
    };
  }

  // ========== GERENCIAMENTO DE TENTATIVAS E BLOQUEIOS ==========

  /**
   * Registrar tentativa falha
   */
  recordFailedAttempt(identifier) {
    const attempts = this.failedAttempts.get(identifier) || { 
      count: 0, 
      lastAttempt: 0,
      firstAttempt: Date.now()
    };
    
    attempts.count += 1;
    attempts.lastAttempt = Date.now();
    this.failedAttempts.set(identifier, attempts);

    // Log automático após múltiplas tentativas
    if (attempts.count >= 3) {
      this.logSecurityEvent('MULTIPLE_FAILED_ATTEMPTS', {
        identifier,
        attemptCount: attempts.count,
        timestamp: new Date()
      });
    }
  }

  // ========== 2FA E BACKUP CODES ==========

  /**
   * Geração de códigos de backup seguros
   */
  generateBackupCodes() {
    const codes = Array.from({ length: 10 }, () => {
      const code = crypto.randomBytes(6).toString('hex').toUpperCase();
      return code.match(/.{1,4}/g).join('-');
    });
    return codes;
  }

  // ========== GERADORES DE TOKENS ==========

  /**
   * Geração segura de tokens JWT
   */
  async generateTokens(user) {
    return new Promise((resolve, reject) => {
      const sessionId = crypto.randomUUID();
      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        sessionId,
      };

      // Access Token
      jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
        expiresIn: this.accessTokenExpiry,
        issuer: 'TradingBot_B3',
        audience: 'trading_client',
        algorithm: 'HS256'
      }, (err, accessToken) => {
        if (err) {
          reject(err);
          return;
        }

        // Refresh Token
        const refreshPayload = { 
          userId: user.id, 
          sessionId,
          tokenType: 'refresh'
        };

        jwt.sign(refreshPayload, process.env.JWT_REFRESH_SECRET, {
          expiresIn: this.refreshTokenExpiry,
          issuer: 'TradingBot_B3',
          audience: 'trading_client',
          algorithm: 'HS256'
        }, (err, refreshToken) => {
          if (err) {
            reject(err);
            return;
          }

          const result = { 
            accessToken, 
            refreshToken,
            expiresIn: 15 * 60 * 1000,
            tokenType: 'Bearer'
          };
          resolve(result);
        });
      });
    });
  }

  // ========== VALIDAÇÕES DE SEGURANÇA ==========

  /**
   * Validar força da senha
   */
  validatePasswordStrength(password) {
    if (!password || password.length < 8) {
      throw new Error('A senha deve ter pelo menos 8 caracteres');
    }

    const requirements = [
      { regex: /[A-Z]/, message: 'Pelo menos uma letra maiúscula' },
      { regex: /[a-z]/, message: 'Pelo menos uma letra minúscula' },
      { regex: /[0-9]/, message: 'Pelo menos um número' },
      { regex: /[^A-Za-z0-9]/, message: 'Pelo menos um caractere especial' }
    ];

    const failedRequirements = requirements.filter(req => !req.regex.test(password));
    
    if (failedRequirements.length > 0) {
      const messages = failedRequirements.map(req => req.message).join(', ');
      throw new Error(`Senha fraca. Requisitos: ${messages}`);
    }

    // Verificar senhas comuns (lista básica)
    const commonPasswords = ['12345678', 'password', 'senha123', 'admin123'];
    if (commonPasswords.includes(password.toLowerCase())) {
      throw new Error('Senha muito comum. Escolha uma senha mais segura.');
    }
  }

  // ========== MÉTODOS AUXILIARES ========== 
 
  /** 
   * Log de eventos de segurança
   */
  async logSecurityEvent(event, data) {
    const logEntry = {
      event,
      data,
      timestamp: new Date(),
      level: this.getLogLevel(event)
    };

    // Em produção, salvar no banco/ELK/Sentry
    if (this.securityLogRepository) {
      await this.securityLogRepository.save(logEntry);
    }
    
    // Removido console.log para evitar warning
  }

  /**
   * Determinar nível do log baseado no evento
   */
  getLogLevel(event) {
    const criticalEvents = ['LOGIN_FAILED', 'MULTIPLE_FAILED_ATTEMPTS', 'TOKEN_REVOKED'];
    const warningEvents = ['INVALID_2FA', 'INVALID_PASSWORD'];
    
    if (criticalEvents.includes(event)) return 'error';
    if (warningEvents.includes(event)) return 'warn';
    return 'info';
  }

  // ========== MÉTODOS RESTANTES MANTIDOS ========== 
 
  checkFailedAttempts(identifier) {
    const attempts = this.failedAttempts.get(identifier);
    if (!attempts) return { blocked: false };

    if (attempts.count >= this.maxFailedAttempts) {
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
      if (timeSinceLastAttempt < this.lockoutTime) {
        return {
          blocked: true,
          remainingTime: this.lockoutTime - timeSinceLastAttempt,
          failedAttempts: attempts.count
        };
      }
      this.failedAttempts.delete(identifier);
    }
    return { blocked: false };
  }

  clearFailedAttempts(identifier) {
    this.failedAttempts.delete(identifier);
  }

  generateTOTPSecret(userIdentifier) {
    const secret = speakeasy.generateSecret({
      name: `TradingBot_B3_${userIdentifier}`,
      issuer: 'TradingBot B3 Enterprise',
      length: 32,
    });

    return {
      secret: secret.base32,
      qrCode: secret.otpauth_url,
      backupCodes: this.generateBackupCodes(),
    };
  }

  validateTOTP(token, secret) { 
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: this.otpWindow,
    });
  }

  isTokenRevoked(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return this.revokedTokens.has(tokenHash);
  }

  isSessionValid(sessionId) {
    const session = this.sessionStore.get(sessionId);
    return session && !this.isSessionExpired(session);
  }

  isSessionExpired(session) {
    const maxSessionAge = 24 * 60 * 60 * 1000;
    return Date.now() - session.createdAt > maxSessionAge;
  }

  async registerSession(userId, token, metadata) {
    const decoded = jwt.decode(token);
    
    const session = {
      userId,
      sessionId: decoded.sessionId,
      metadata: {
        ip: metadata.ip,
        device: metadata.device,
        userAgent: metadata.userAgent,
      },
      createdAt: Date.now(),
      lastActivity: Date.now(),
      active: true
    };

    this.sessionStore.set(decoded.sessionId, session);
    return session;
  }

  // ========== MÉTODOS ABSTRATOS ==========

  async getUserByEmail(email) {
    throw new Error('Método getUserByEmail não implementado');
  }

  async getUserById(userId) {
    throw new Error('Método getUserById não implementado');
  }
}

/**
 * Middleware de rate limiting
 */
function createRateLimitMiddleware(limits = {}) {
  const requests = new Map();
  
  return (req, res, next) => {
    const identifier = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = limits.windowMs || 15 * 60 * 1000;
    const max = limits.max || 100;

    if (!requests.has(identifier)) {
      requests.set(identifier, []);
    }

    const userRequests = requests.get(identifier);
    const windowStart = now - windowMs;

    // Limpar requisições antigas
    while (userRequests.length > 0 && userRequests[0] < windowStart) {
      userRequests.shift();
    }

    // Verificar limite
    if (userRequests.length >= max) {
      res.status(429).json({
        error: 'Muitas requisições',
        retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000)
      });
      return;
    }

    // Registrar nova requisição
    userRequests.push(now);
    next();
  };
}

/**
 * Middleware de headers de segurança
 */
function securityHeadersMiddleware(req, res, next) {
  // Prevenir clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevenir XSS 
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Política de segurança de conteúdo
  res.setHeader('Content-Security-Policy', "default-src 'self'");

  // Referrer Policy 
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS (em produção com SSL)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

module.exports = {
  AdvancedAuthentication,
  createRateLimitMiddleware,
  securityHeadersMiddleware
};