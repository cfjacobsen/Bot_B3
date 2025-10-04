const GPTConsensus = require('../ai/gptConsensus');

class SmartGoalEngine {
  constructor(gptConsensus, operatorManager, riskManager) {
    this.gptConsensus = gptConsensus;
    this.operatorManager = operatorManager;
    this.riskManager = riskManager;

    this.currentGoals = new Map();
    this.goalHistory = [];
    this.performanceMetrics = {
      dailySuccess: [],
      weeklySuccess: [],
      monthlySuccess: [],
    };

    this.adaptiveSettings = {
      baseConservativeGoal: 1.5, // 1.5% por dia
      baseModerateGoal: 3.0, // 3.0% por dia
      baseAggressiveGoal: 6.0, // 6.0% por dia
      maxAggressiveGoal: 15.0, // 15% limite máximo
      adaptationFactor: 0.1, // 10% de adaptação baseada em performance
      confidenceThreshold: 0.75, // Mínimo para metas agressivas
      marketVolatilityFactor: 1.2, // Multiplicador baseado em volatilidade
    };
  }

  // Sistema principal de cálculo de metas adaptativas
  async calculateDailyGoals(marketData, capital, currentPerformance) {
    try {
      // Análise completa do mercado
      const marketAnalysis = await this.analyzeMarketOpportunities(marketData);

      // Consenso GPT sobre condições
      const gptConsensus = await this.gptConsensus.getMarketConsensus(marketData);

      // Análise de performance histórica
      const performanceAnalysis = this.analyzePerformanceHistory();

      // Calcular metas base
      const baseGoals = this.calculateBaseGoals(capital, marketAnalysis);

      // Aplicar adaptações inteligentes
      const adaptedGoals = this.applyIntelligentAdaptations(
        baseGoals,
        marketAnalysis,
        gptConsensus,
        performanceAnalysis,
      );

      // Validar metas agressivas com GPT
      const validatedGoals = await this.validateAggressiveGoals(
        adaptedGoals,
        marketData,
        gptConsensus,
      );

      // Armazenar metas atuais
      this.currentGoals.set('daily', {
        goals: validatedGoals,
        timestamp: new Date(),
        marketConditions: marketAnalysis,
        gptConsensus,
        capital,
      });

      return validatedGoals;
    } catch (error) {
      console.error('Erro ao calcular metas diárias:', error);
      return this.getFallbackGoals(capital);
    }
  }

  // Análise de oportunidades de mercado
  async analyzeMarketOpportunities(marketData) {
    const volatility = this.calculateMarketVolatility(marketData);
    const trend = this.analyzeTrendStrength(marketData);
    const volume = this.analyzeVolumeProfile(marketData);
    const timeOfDay = this.getOptimalTradingTime();

    // Identificar setores em movimento
    const sectorAnalysis = await this.analyzeSectorMovement(marketData);

    // Análise de correlações
    const correlationAnalysis = this.analyzeAssetCorrelations(marketData);

    return {
      volatility: {
        level: volatility,
        opportunity: volatility > 0.04 ? 'HIGH' : volatility > 0.02 ? 'MEDIUM' : 'LOW',
        multiplier: Math.min(volatility * 20, 2.0), // Máximo 2x
      },
      trend: {
        strength: trend,
        direction: this.getTrendDirection(trend),
        reliability: this.calculateTrendReliability(marketData),
      },
      volume: {
        profile: volume,
        liquidity: this.assessLiquidity(volume),
        breakoutPotential: this.calculateBreakoutPotential(volume, marketData),
      },
      timing: {
        current: timeOfDay,
        optimal: this.isOptimalTradingTime(timeOfDay),
        hoursRemaining: this.getHoursUntilClose(),
      },
      sectors: sectorAnalysis,
      correlations: correlationAnalysis,
      overallOpportunity: this.calculateOverallOpportunity(volatility, trend, volume),
    };
  }

  // Calcular metas base conservadoras, moderadas e agressivas
  calculateBaseGoals(capital, marketAnalysis) {
    const {
      volatility, trend, volume, overallOpportunity,
    } = marketAnalysis;

    // Ajustar metas baseado no capital disponível
    const capitalMultiplier = this.calculateCapitalMultiplier(capital);

    const conservative = {
      target: this.adaptiveSettings.baseConservativeGoal * capitalMultiplier,
      risk: 0.5,
      maxDrawdown: 2.0,
      expectedTrades: 3,
      timeframe: '1h',
    };

    const moderate = {
      target: this.adaptiveSettings.baseModerateGoal * capitalMultiplier * volatility.multiplier,
      risk: 1.0,
      maxDrawdown: 3.5,
      expectedTrades: 8,
      timeframe: '15m',
    };

    const aggressive = {
      target: this.adaptiveSettings.baseAggressiveGoal * capitalMultiplier * volatility.multiplier * overallOpportunity,
      risk: 2.0,
      maxDrawdown: 5.0,
      expectedTrades: 15,
      timeframe: '5m',
    };

    return { conservative, moderate, aggressive };
  }

  // Aplicar adaptações inteligentes baseadas em IA e performance
  applyIntelligentAdaptations(baseGoals, marketAnalysis, gptConsensus, performanceHistory) {
    const adaptedGoals = JSON.parse(JSON.stringify(baseGoals)); // Deep copy

    // Adaptação baseada no consenso GPT
    if (gptConsensus.confianca > 0.8) {
      adaptedGoals.aggressive.target *= 1.3;
      adaptedGoals.moderate.target *= 1.2;
    } else if (gptConsensus.confianca < 0.5) {
      adaptedGoals.aggressive.target *= 0.7;
      adaptedGoals.moderate.target *= 0.8;
    }

    // Adaptação baseada em performance histórica
    if (performanceHistory.recentSuccessRate > 0.7) {
      adaptedGoals.aggressive.target *= 1.2;
    } else if (performanceHistory.recentSuccessRate < 0.4) {
      adaptedGoals.aggressive.target *= 0.8;
      adaptedGoals.aggressive.risk *= 0.7;
    }

    // Adaptação baseada em condições de mercado
    if (marketAnalysis.overallOpportunity > 1.5) {
      adaptedGoals.aggressive.target = Math.min(
        adaptedGoals.aggressive.target * 1.4,
        this.adaptiveSettings.maxAggressiveGoal,
      );
    }

    // Adaptação baseada no horário
    if (!marketAnalysis.timing.optimal) {
      adaptedGoals.aggressive.target *= 0.8;
      adaptedGoals.moderate.target *= 0.9;
    }

    return adaptedGoals;
  }

  // Validação de metas agressivas com ChatGPT
  async validateAggressiveGoals(adaptedGoals, marketData, gptConsensus) {
    const { aggressive } = adaptedGoals;

    // Se a meta agressiva é muito alta, validar com GPT
    if (aggressive.target > 8.0) {
      const validation = await this.gptConsensus.validateAggressiveStrategy(marketData, {
        target: aggressive.target,
        capital: this.currentGoals.get('daily')?.capital || 10000,
        currentRisk: aggressive.risk,
      });

      if (!validation.approved) {
        // Reduzir meta se GPT não aprovou
        aggressive.target = Math.min(aggressive.target * 0.7, 8.0);
        aggressive.risk = Math.min(aggressive.risk * 0.8, 1.5);
        aggressive.reasoning = validation.reason;
      } else {
        aggressive.gptApproved = true;
        aggressive.gptConfidence = validation.consensus?.confianca || 0.7;
        aggressive.suggestedTimeframe = validation.timeframe || '5m';
      }
    }

    // Adicionar estratégia recomendada para cada meta
    adaptedGoals.conservative.recommendedOperator = 'SWING_TRADER';
    adaptedGoals.moderate.recommendedOperator = 'DAY_TRADER';
    adaptedGoals.aggressive.recommendedOperator = aggressive.target > 10 ? 'SCALPER' : 'DAY_TRADER';

    // Adicionar plano de execução
    adaptedGoals.executionPlan = await this.createExecutionPlan(adaptedGoals, marketData);

    return adaptedGoals;
  }

  // Criar plano de execução para as metas
  async createExecutionPlan(goals, marketData) {
    const plan = {
      phases: [],
      totalDuration: this.getHoursUntilClose(),
      checkpoints: [],
    };

    // Fase conservadora (primeiras 2 horas)
    plan.phases.push({
      name: 'Fase Conservadora',
      duration: 2,
      goal: goals.conservative,
      strategy: 'Estabelecer base sólida',
      riskLevel: 'LOW',
    });

    // Fase moderada (próximas 3-4 horas)
    plan.phases.push({
      name: 'Fase Moderada',
      duration: 3,
      goal: goals.moderate,
      strategy: 'Aproveitar oportunidades claras',
      riskLevel: 'MEDIUM',
    });

    // Fase agressiva (se aprovada e condições ideais)
    if (goals.aggressive.gptApproved || goals.aggressive.target <= 8.0) {
      plan.phases.push({
        name: 'Fase Agressiva',
        duration: 2,
        goal: goals.aggressive,
        strategy: 'Maximizar retornos em oportunidades de alta confiança',
        riskLevel: 'HIGH',
      });
    }

    // Checkpoints de avaliação
    plan.checkpoints = [
      { time: '11:00', action: 'Avaliar progresso conservador' },
      { time: '13:00', action: 'Decidir sobre fase moderada' },
      { time: '15:00', action: 'Avaliar fase agressiva' },
      { time: '16:30', action: 'Preparar fechamento seguro' },
    ];

    return plan;
  }

  // Monitoramento e ajuste em tempo real
  async adjustGoalsRealTime(currentProgress, marketData) {
    const currentGoal = this.currentGoals.get('daily');
    if (!currentGoal) return null;

    const timeElapsed = (Date.now() - currentGoal.timestamp.getTime()) / (1000 * 60 * 60); // horas
    const expectedProgress = this.calculateExpectedProgress(timeElapsed);
    const actualProgress = currentProgress.percentage;

    // Se está muito acima ou abaixo da meta, ajustar
    if (actualProgress < expectedProgress * 0.7) {
      // Atrás da meta - considerar estratégia mais agressiva
      return await this.adjustForUnderperformance(currentGoal, marketData);
    } if (actualProgress > expectedProgress * 1.5) {
      // Muito à frente - considerar estratégia mais conservadora
      return await this.adjustForOverperformance(currentGoal, marketData);
    }

    return null; // Sem ajustes necessários
  }

  // Análise de performance histórica
  analyzePerformanceHistory() {
    const recent7Days = this.performanceMetrics.dailySuccess.slice(-7);
    const recent30Days = this.performanceMetrics.dailySuccess.slice(-30);

    return {
      recentSuccessRate: recent7Days.length > 0
        ? recent7Days.filter((day) => day.success).length / recent7Days.length : 0.5,
      monthlySuccessRate: recent30Days.length > 0
        ? recent30Days.filter((day) => day.success).length / recent30Days.length : 0.5,
      avgDailyReturn: recent7Days.length > 0
        ? recent7Days.reduce((sum, day) => sum + day.return, 0) / recent7Days.length : 0,
      maxDrawdown: this.calculateMaxDrawdown(recent30Days),
      consistency: this.calculateConsistency(recent7Days),
    };
  }

  // Helpers e cálculos auxiliares
  calculateMarketVolatility(data) {
    // Simulação - em produção, calcular volatilidade real
    return Math.random() * 0.08 + 0.01; // 1% a 9%
  }

  analyzeTrendStrength(data) {
    return Math.random() * 0.6 - 0.3; // -30% a +30%
  }

  analyzeVolumeProfile(data) {
    return {
      current: Math.random() * 200000 + 50000,
      average: 100000,
      profile: 'NORMAL',
    };
  }

  getOptimalTradingTime() {
    const hour = new Date().getHours();
    return {
      current: hour,
      phase: hour < 11 ? 'OPENING' : hour < 15 ? 'MIDDAY' : 'CLOSING',
    };
  }

  calculateOverallOpportunity(volatility, trend, volume) {
    return (volatility * 10 + Math.abs(trend) * 5 + (volume.current / volume.average)) / 3;
  }

  calculateCapitalMultiplier(capital) {
    // Ajustar metas baseado no capital
    if (capital > 100000) return 1.2;
    if (capital > 50000) return 1.1;
    if (capital < 10000) return 0.8;
    return 1.0;
  }

  isOptimalTradingTime(timing) {
    return timing.phase === 'MIDDAY'; // 11h-15h é o melhor período
  }

  getHoursUntilClose() {
    const now = new Date();
    const closeTime = new Date(now);
    closeTime.setHours(17, 0, 0, 0); // 17:00

    if (now > closeTime) return 0;
    return (closeTime - now) / (1000 * 60 * 60);
  }

  getFallbackGoals(capital) {
    return {
      conservative: { target: 1.0, risk: 0.3, expectedTrades: 2 },
      moderate: { target: 2.0, risk: 0.7, expectedTrades: 5 },
      aggressive: { target: 3.5, risk: 1.2, expectedTrades: 8 },
      fallback: true,
      reason: 'Erro na análise - metas conservadoras aplicadas',
    };
  }

  // Métodos públicos
  getCurrentGoals() {
    return this.currentGoals.get('daily');
  }

  getGoalHistory() {
    return this.goalHistory.slice(-30); // Últimos 30 dias
  }

  recordDailyResult(result) {
    this.performanceMetrics.dailySuccess.push({
      date: new Date(),
      success: result.targetAchieved,
      return: result.dailyReturn,
      goal: result.targetGoal,
      trades: result.totalTrades,
    });

    // Manter apenas últimos 90 dias
    if (this.performanceMetrics.dailySuccess.length > 90) {
      this.performanceMetrics.dailySuccess.shift();
    }
  }

  async analyzeSectorMovement(marketData) {
    // Simulação de análise setorial
    return {
      banking: { momentum: 0.8, opportunity: 'HIGH' },
      energy: { momentum: -0.3, opportunity: 'LOW' },
      tech: { momentum: 0.5, opportunity: 'MEDIUM' },
    };
  }

  analyzeAssetCorrelations(marketData) {
    return {
      summary: 'Correlações normais detectadas',
      riskLevel: 'MEDIUM',
    };
  }

  getTrendDirection(trend) {
    return trend > 0.1 ? 'UP' : trend < -0.1 ? 'DOWN' : 'SIDEWAYS';
  }

  calculateTrendReliability(data) {
    return Math.random() * 0.4 + 0.6; // 60-100%
  }

  assessLiquidity(volume) {
    return volume.current > volume.average * 1.2 ? 'HIGH' : 'NORMAL';
  }

  calculateBreakoutPotential(volume, data) {
    return volume.current > volume.average * 1.5 ? 'HIGH' : 'LOW';
  }

  calculateExpectedProgress(timeElapsed) {
    // Progresso linear baseado no tempo
    const totalTradingHours = 8; // 9h-17h
    return (timeElapsed / totalTradingHours) * 100;
  }

  async adjustForUnderperformance(currentGoal, marketData) {
    console.log('🎯 Ajustando estratégia - Performance abaixo da meta');
    // Lógica para ser mais agressivo
    return {
      adjustment: 'MORE_AGGRESSIVE',
      newRisk: Math.min(currentGoal.goals.moderate.risk * 1.3, 2.0),
      reason: 'Performance abaixo da esperada',
    };
  }

  async adjustForOverperformance(currentGoal, marketData) {
    console.log('🎯 Ajustando estratégia - Performance acima da meta');
    // Lógica para ser mais conservador
    return {
      adjustment: 'MORE_CONSERVATIVE',
      newRisk: currentGoal.goals.moderate.risk * 0.8,
      reason: 'Meta já atingida - preservar ganhos',
    };
  }

  calculateMaxDrawdown(data) {
    if (!data.length) return 0;
    // Calcular drawdown máximo dos dados
    return Math.random() * 3.0; // Simulação
  }

  calculateConsistency(data) {
    if (!data.length) return 0.5;
    // Calcular consistência dos retornos
    return Math.random() * 0.4 + 0.6; // 60-100%
  }
}

module.exports = SmartGoalEngine;
