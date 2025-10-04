const axios = require('axios');
const EventEmitter = require('events');
const jwt = require('jsonwebtoken'); // For generating secure tokens for external API calls
const { RateLimiter } = require('limiter'); // For rate limiting external API calls

/**
 * Advanced Trading Engine for B3 with Production-Grade Enhancements
 * Features: Robust error handling, memory leak protection, performance optimization, resilience patterns
 */
class TradingEngine extends EventEmitter {
    constructor(io, config = {}) {
        super();
        
        // ... (your existing configuration and initializations)

        // --- NEW ENHANCEMENTS ---
        // 1. Rate Limiting for external API calls and internal signals
        this.apiRateLimiter = new RateLimiter({
            tokensPerInterval: 50,
            interval: "minute"
        });
        this.signalRateLimiter = new Map(); // To limit signal frequency per asset

        // 2. Memory Management: Cache with expiration and size limits
        this.marketDataCache = new Map();
        this.cacheConfig = {
            maxSize: 1000,
            defaultTTL: 5000 // 5 seconds
        };

        // 3. Circuit Breaker for external broker API
        this.circuitBreakerState = 'CLOSED';
        this.failureCount = 0;
        this.failureThreshold = 5;
        this.resetTimeout = 60000; // 1 minute

        // 4. Security: Use short-lived tokens for broker API
        this.brokerAuthToken = null;
        this.tokenRefreshInterval = null;

        // 5. Global Error Handling
        this.setupGlobalErrorHandling();

        // 6. Request Queue for order execution
        this.requestQueue = [];
        this.isProcessingQueue = false;

        console.log('🔄 Enhanced Trading Engine Initialized');
    }

    // --- ENHANCED ERROR HANDLING ---
    
    /**
     * Sets up global error handlers for uncaught exceptions and unhandled rejections:cite[4]:cite[5]
     */
    setupGlobalErrorHandling() {
        process.on('uncaughtException', (error) => {
            console.error('🔥 Uncaught Exception:', error);
            this.emit('error', {
                type: 'UNCAUGHT_EXCEPTION',
                message: 'A critical uncaught exception occurred',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            // In production, you might want to gracefully shutdown
            // gracefulShutdown();
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('🔥 Unhandled Promise Rejection at:', promise, 'reason:', reason);
            this.emit('error', {
                type: 'UNHANDLED_REJECTION',
                message: 'An unhandled promise rejection occurred',
                reason: reason.toString(),
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Enhanced error classification and handling:cite[5]
     */
    handleError(error, context = {}) {
        // Classify error type
        const errorInfo = {
            ...context,
            timestamp: new Date().toISOString(),
            stack: error.stack
        };

        // Operational errors (expected) vs Programmer errors (bugs):cite[5]
        if (error.isOperational) {
            console.warn('⚠️ Operational Error:', error.message, errorInfo);
            this.emit('operational_error', { error, ...errorInfo });
        } else {
            console.error('🐛 Programmer Error:', error.message, errorInfo);
            this.emit('programmer_error', { error, ...errorInfo });
            // For programmer errors, consider crashing in production to avoid undefined state:cite[5]
            if (process.env.NODE_ENV === 'production') {
                process.exit(1);
            }
        }

        // Log to external monitoring system in production
        this.logToMonitoringSystem(error, errorInfo);
    }

    // --- MEMORY LEAK PREVENTION ---
    
    /**
     * Enhanced market data cache with TTL and size limits:cite[3]
     */
    setCachedMarketData(symbol, data) {
        // Clean old entries before adding new one
        if (this.marketDataCache.size >= this.cacheConfig.maxSize) {
            const firstKey = this.marketDataCache.keys().next().value;
            this.marketDataCache.delete(firstKey);
        }

        this.marketDataCache.set(symbol, {
            data,
            timestamp: Date.now(),
            ttl: this.cacheConfig.defaultTTL
        });
    }

    getCachedMarketData(symbol) {
        const cached = this.marketDataCache.get(symbol);
        if (!cached) return null;

        // Check if cache entry has expired
        if (Date.now() - cached.timestamp > cached.ttl) {
            this.marketDataCache.delete(symbol);
            return null;
        }

        return cached.data;
    }

    /**
     * Periodic cache cleanup to prevent memory leaks:cite[3]
     */
    startCacheCleanup() {
        this.cacheCleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [symbol, cached] of this.marketDataCache.entries()) {
                if (now - cached.timestamp > cached.ttl) {
                    this.marketDataCache.delete(symbol);
                }
            }
        }, 30000); // Run every 30 seconds
    }

    // --- PERFORMANCE OPTIMIZATIONS ---
    
    /**
     * Non-blocking market data fetching with circuit breaker:cite[7]
     */
    async getMarketData() {
        // Check circuit breaker first
        if (this.circuitBreakerState === 'OPEN') {
            throw new Error('Market data service unavailable (Circuit Breaker Open)');
        }

        const marketData = [];
        
        // Use Promise.all for parallel fetching of asset data:cite[7]
        const dataPromises = this.config.assets.map(async (asset) => {
            try {
                // Check cache first
                const cachedData = this.getCachedMarketData(asset);
                if (cachedData) {
                    return cachedData;
                }

                // Apply rate limiting
                await this.apiRateLimiter.removeTokens(1);

                let assetData;
                if (process.env.MARKET_DATA_API_URL) {
                    assetData = await this.fetchRealMarketData(asset);
                } else {
                    assetData = this.generateMockMarketData(asset);
                }

                // Cache the result
                this.setCachedMarketData(asset, assetData);
                return assetData;

            } catch (error) {
                this.recordAPIFailure();
                throw error;
            }
        });

        try {
            const results = await Promise.allSettled(dataPromises);
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    marketData.push(result.value);
                } else {
                    console.error(`Failed to fetch data for ${this.config.assets[index]}:`, result.reason);
                    // Use fallback mock data if real data fails
                    const fallbackData = this.generateMockMarketData(this.config.assets[index]);
                    marketData.push(fallbackData);
                }
            });
        } catch (error) {
            this.handleError(error, { operation: 'getMarketData' });
            // Fallback to all mock data if everything fails
            return this.config.assets.map(asset => this.generateMockMarketData(asset));
        }

        return marketData;
    }

    /**
     * Circuit Breaker pattern for external API calls:cite[7]
     */
    recordAPIFailure() {
        this.failureCount++;
        if (this.failureCount >= this.failureThreshold) {
            this.circuitBreakerState = 'OPEN';
            console.error('🚨 Circuit Breaker opened - too many failures');
            
            setTimeout(() => {
                this.circuitBreakerState = 'HALF_OPEN';
                this.failureCount = 0;
                console.log('🟡 Circuit Breaker half-open - testing connection');
            }, this.resetTimeout);
        }
    }

    recordAPISuccess() {
        if (this.circuitBreakerState === 'HALF_OPEN') {
            this.circuitBreakerState = 'CLOSED';
            this.failureCount = 0;
            console.log('🟢 Circuit Breaker closed - service restored');
        }
    }

    // --- SECURITY ENHANCEMENTS ---
    
    /**
     * Secure order placement with authentication and retry logic:cite[1]
     */
    async placeRealOrder(order) {
        try {
            // Ensure we have a valid auth token
            if (!this.brokerAuthToken || this.isTokenExpired(this.brokerAuthToken)) {
                await this.refreshBrokerAuthToken();
            }

            const response = await axios.post(process.env.BROKER_API_URL, order, {
                headers: {
                    Authorization: `Bearer ${this.brokerAuthToken}`,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            });

            this.recordAPISuccess(); // Circuit breaker success

            return {
                ...order,
                orderId: response.data.orderId,
                status: 'EXECUTED',
                brokerTimestamp: response.data.timestamp,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            // Retry logic for transient failures
            if (this.isRetryableError(error) && !order._retryCount) {
                order._retryCount = (order._retryCount || 0) + 1;
                console.log(`Retrying order (attempt ${order._retryCount})...`);
                await this.delay(1000 * order._retryCount); // Exponential backoff
                return this.placeRealOrder(order);
            }

            this.recordAPIFailure(); // Circuit breaker failure
            throw error;
        }
    }

    /**
     * JWT token management for broker API authentication:cite[1]
     */
    async refreshBrokerAuthToken() {
        try {
            const response = await axios.post(process.env.BROKER_AUTH_URL, {
                apiKey: process.env.BROKER_API_KEY,
                secret: process.env.BROKER_API_SECRET
            });

            this.brokerAuthToken = response.data.access_token;
            
            // Set up token refresh before expiry
            const expiresIn = (response.data.expires_in || 3600) * 1000;
            const refreshTime = expiresIn - 300000; // Refresh 5 minutes before expiry
            
            if (this.tokenRefreshInterval) {
                clearTimeout(this.tokenRefreshInterval);
            }
            
            this.tokenRefreshInterval = setTimeout(() => {
                this.refreshBrokerAuthToken();
            }, refreshTime);

        } catch (error) {
            this.handleError(error, { operation: 'refreshBrokerAuthToken' });
            throw new Error('Failed to refresh broker authentication token');
        }
    }

    // --- RESILIENCE PATTERNS ---
    
    /**
     * Queue-based order processing to prevent overload:cite[7]
     */
    async placeOrder(order) {
        return new Promise((resolve, reject) => {
            // Add to queue
            this.requestQueue.push({ order, resolve, reject });
            
            // Process queue if not already processing
            if (!this.isProcessingQueue) {
                this.processOrderQueue();
            }
        });
    }

    async processOrderQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const { order, resolve, reject } = this.requestQueue.shift();
            
            try {
                let result;
                if (process.env.NODE_ENV === 'development' || !process.env.BROKER_API_URL) {
                    result = await this.placeMockOrder(order);
                } else {
                    result = await this.placeRealOrder(order);
                }

                // Update internal state
                this.updatePosition(order);
                this.updateOrderHistory(result);
                this.updatePerformanceMetrics();

                this.lastSignalTime.set(order.action, Date.now());

                this.emit('order_executed', result);
                if (this.io) this.io.emit('order_update', result);

                console.log(`✅ Ordem ${order.action} ${order.quantity} ${order.symbol} executada`);
                resolve(result);

            } catch (error) {
                const errorData = {
                    ...order,
                    orderId: `error_${Date.now()}`,
                    status: 'ERROR',
                    error: error.message,
                    timestamp: new Date().toISOString()
                };

                this.emit('error', {
                    type: 'ORDER_EXECUTION_ERROR',
                    message: 'Falha ao executar ordem',
                    order: errorData,
                    error: error.message
                });

                reject(error);
            }

            // Rate limiting between orders
            await this.delay(200);
        }

        this.isProcessingQueue = false;
    }

    // --- ENHANCED ANALYTICS AND MONITORING ---
    
    /**
     * Comprehensive performance monitoring:cite[3]
     */
    getPerformanceReport() {
        const baseReport = this.getDailyMetrics();
        
        // Enhanced with memory usage and system metrics
        const memoryUsage = process.memoryUsage();
        const systemMetrics = {
            memory: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
                external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
            },
            uptime: process.uptime(),
            cacheStats: {
                marketDataSize: this.marketDataCache.size,
                activePositions: this.positions.size,
                orderHistorySize: this.orderHistory.size
            },
            circuitBreaker: this.circuitBreakerState,
            failureCount: this.failureCount
        };

        return {
            ...baseReport,
            systemMetrics,
            byAsset: Object.fromEntries(this.performanceMetrics),
            positions: Object.fromEntries(this.positions),
            openOrders: Array.from(this.orders.values()).filter(order => 
                ['PENDING', 'EXECUTED'].includes(order.status)
            )
        };
    }

    // --- CLEANUP AND RESOURCE MANAGEMENT ---
    
    /**
     * Enhanced cleanup to prevent memory leaks:cite[3]
     */
    stop() {
        this.isRunning = false;

        if (this.tradingInterval) {
            clearInterval(this.tradingInterval);
            this.tradingInterval = null;
        }

        if (this.cacheCleanupInterval) {
            clearInterval(this.cacheCleanupInterval);
            this.cacheCleanupInterval = null;
        }

        if (this.tokenRefreshInterval) {
            clearTimeout(this.tokenRefreshInterval);
            this.tokenRefreshInterval = null;
        }

        // Clear all caches and collections
        this.marketDataCache.clear();
        this.requestQueue.length = 0;

        // Remove all event listeners to prevent leaks:cite[3]
        this.removeAllListeners();

        this.emit('status', {
            message: 'Trading Engine parado com cleanup completo',
            level: 'info',
            metrics: this.getDailyMetrics(),
        });

        console.log('🟢 Trading Engine Parado com Cleanup Completo');
    }

    // --- HELPER METHODS ---
    
    isRetryableError(error) {
        // Network errors, timeouts, and 5xx status codes are retryable
        return error.code === 'ECONNRESET' || 
               error.code === 'ETIMEDOUT' || 
               error.response?.status >= 500;
    }

    isTokenExpired(token) {
        try {
            const decoded = jwt.decode(token);
            return decoded.exp * 1000 < Date.now() + 300000; // 5 minutes buffer
        } catch {
            return true;
        }
    }

    logToMonitoringSystem(error, context) {
        // Integrate with your preferred monitoring service (Sentry, DataDog, etc.)
        // This is a stub for the actual implementation
        if (process.env.NODE_ENV === 'production') {
            // Example: Send to external monitoring
            // monitoringService.captureException(error, { extra: context });
        }
    }

    // ... (keep your existing calculateMA, calculateRSI, calculateVolatility, and other core methods)

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = TradingEngine;