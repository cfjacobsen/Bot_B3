const axios = require('axios');
const OpenAI = require('openai');

class GPTConsensus {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.consensusHistory = [];
    this.marketContext = new Map();
    this.confidenceThreshold = 0.7;
  }

  // Análise de consenso com ChatGPT para decisões de trading
  async getMarketConsensus(marketData) {
    try {
      const analysis = await this.analyzeMarketWithGPT(marketData);
      const internalAnalysis = await this.getInternalAnalysis(marketData);

      const consensus = this.calculateConsensus(analysis, internalAnalysis);
      this.storeConsensusHistory(consensus);

      return consensus;
    } catch (error) {
      console.error('Erro ao obter consenso GPT:', error);
      return this.getFallbackAnalysis(marketData);
    }
  }

  // Enviar dados para ChatGPT com prompt especializado
  async analyzeMarketWithGPT(marketData) {
    const marketPrompt = this.buildMarketAnalysisPrompt(marketData);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em análise técnica e fundamental do mercado brasileiro B3. 
                    Analise os dados fornecidos e forneça uma recomendação estruturada.
                    Seja objetivo e baseie-se em dados técnicos sólidos.
                    Considere sempre o gerenciamento de risco.`,
        },
        {
          role: 'user',
          content: marketPrompt,
        },
      ],
      temperature: 0.3, // Menos criatividade, mais precisão
      max_tokens: 1500,
    });

    return this.parseGPTResponse(response.choices[0].message.content);
  }

  // Construir prompt detalhado para análise de mercado
  buildMarketAnalysisPrompt(marketData) {
    const {
      prices, indicators, volume, volatility, fundamentals,
    } = marketData;

    return `
        ANÁLISE SOLICITADA - MERCADO B3
        
        === DADOS DE PREÇO ===
        Ativo: ${marketData.symbol}
        Preço Atual: R$ ${prices.current}
        Preço Abertura: R$ ${prices.open}
        Máxima: R$ ${prices.high}
        Mínima: R$ ${prices.low}
        Volume: ${volume.current}
        Variação %: ${prices.change}%
        
        === INDICADORES TÉCNICOS ===
        RSI (14): ${indicators.rsi}
        MACD: ${indicators.macd.value} | Signal: ${indicators.macd.signal}
        Bollinger Bands: Superior ${indicators.bollinger.upper} | Inferior ${indicators.bollinger.lower}
        EMA 20: ${indicators.ema20}
        EMA 50: ${indicators.ema50}
        Volume Médio: ${volume.average}
        
        === ANÁLISE DE VOLATILIDADE ===
        ATR: ${volatility.atr}
        Volatilidade Histórica: ${volatility.historical}%
        
        === FUNDAMENTOS (se disponível) ===
        P/E: ${fundamentals?.pe || 'N/A'}
        P/B: ${fundamentals?.pb || 'N/A'}
        
        === HISTÓRICO RECENTE ===
        Últimas 5 sessões: ${marketData.recent5Days?.join(', ')}
        
        POR FAVOR ANALISE E FORNEÇA:
        1. TENDÊNCIA (ALTA/BAIXA/LATERAL)
        2. FORÇA DA TENDÊNCIA (1-10)
        3. PROBABILIDADE DE REVERSÃO (%)
        4. RECOMENDAÇÃO (COMPRAR/VENDER/MANTER)
        5. STOP LOSS sugerido
        6. TAKE PROFIT sugerido
        7. NÍVEL DE CONFIANÇA (1-10)
        8. PRINCIPAIS RISCOS
        9. TIMEFRAME recomendado
        10. COMENTÁRIOS ADICIONAIS
        
        Formato sua resposta como JSON válido.
        `;
  }

  // Parse da resposta do GPT
  parseGPTResponse(gptResponse) {
    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = gptResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Se não encontrar JSON, fazer parse manual
      return this.parseTextResponse(gptResponse);
    } catch (error) {
      console.error('Erro ao fazer parse da resposta GPT:', error);
      return this.getDefaultGPTResponse();
    }
  }

  // Parse manual de resposta em texto
  parseTextResponse(text) {
    const response = {
      tendencia: this.extractValue(text, ['TENDÊNCIA', 'TREND']),
      forca: this.extractNumberValue(text, ['FORÇA', 'STRENGTH']),
      reversao: this.extractNumberValue(text, ['REVERSÃO', 'REVERSAL']),
      recomendacao: this.extractValue(text, ['RECOMENDAÇÃO', 'RECOMMENDATION']),
      stopLoss: this.extractNumberValue(text, ['STOP LOSS', 'SL']),
      takeProfit: this.extractNumberValue(text, ['TAKE PROFIT', 'TP']),
      confianca: this.extractNumberValue(text, ['CONFIANÇA', 'CONFIDENCE']),
      riscos: this.extractValue(text, ['RISCOS', 'RISKS']),
      timeframe: this.extractValue(text, ['TIMEFRAME', 'PRAZO']),
      comentarios: this.extractValue(text, ['COMENTÁRIOS', 'COMMENTS']),
    };

    return response;
  }

  // Análise interna do bot
  async getInternalAnalysis(marketData) {
    // Simular análise técnica interna
    return {
      tendencia: this.calculateTrend(marketData),
      momentum: this.calculateMomentum(marketData),
      volatilidade: this.calculateVolatility(marketData),
      volume: this.analyzeVolume(marketData),
      recomendacao: this.getInternalRecommendation(marketData),
      confianca: 0.75,
    };
  }

  // Calcular consenso entre GPT e análise interna
  calculateConsensus(gptAnalysis, internalAnalysis) {
    const gptWeight = 0.6; // 60% peso para GPT
    const internalWeight = 0.4; // 40% peso para análise interna

    // Converter recomendações para valores numéricos
    const gptScore = this.convertRecommendationToScore(gptAnalysis.recomendacao);
    const internalScore = this.convertRecommendationToScore(internalAnalysis.recomendacao);

    const consensusScore = (gptScore * gptWeight) + (internalScore * internalWeight);
    const finalRecommendation = this.convertScoreToRecommendation(consensusScore);

    const consensus = {
      recomendacao: finalRecommendation,
      confianca: Math.min(gptAnalysis.confianca || 0.5, internalAnalysis.confianca) * 0.9,
      gptAnalysis,
      internalAnalysis,
      consensusScore,
      timestamp: new Date(),
      isActionable: this.isActionable(consensusScore, gptAnalysis.confianca || 0.5),
    };

    return consensus;
  }

  // Validar se o consenso é acionável para metas agressivas
  async validateAggressiveStrategy(marketData, currentGoal) {
    const consensus = await this.getMarketConsensus(marketData);

    if (!consensus.isActionable) {
      return {
        approved: false,
        reason: 'Consenso não acionável - confiança baixa',
      };
    }

    // Consultar GPT especificamente sobre estratégia agressiva
    const aggressiveAnalysis = await this.analyzeAggressiveStrategy(marketData, currentGoal);

    return {
      approved: aggressiveAnalysis.approved,
      reason: aggressiveAnalysis.reason,
      suggestedRisk: aggressiveAnalysis.riskLevel,
      timeframe: aggressiveAnalysis.timeframe,
      consensus,
    };
  }

  // Análise específica para estratégias agressivas
  async analyzeAggressiveStrategy(marketData, goal) {
    const prompt = `
        ANÁLISE DE ESTRATÉGIA AGRESSIVA - B3
        
        Meta diária: ${goal.target}%
        Capital disponível: R$ ${goal.capital}
        Risco atual: ${goal.currentRisk}%
        
        Dados de mercado: ${JSON.stringify(marketData, null, 2)}
        
        AVALIE:
        1. É seguro aplicar estratégia agressiva agora?
        2. Qual o nível de risco recomendado (1-10)?
        3. Timeframe ideal para operações?
        4. Probabilidade de atingir a meta (0-100%)?
        5. Principais alertas de risco?
        
        Responda apenas SIM ou NÃO para estratégia agressiva, seguido de justificativa breve.
        `;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'Você é um gestor de risco experiente. Seja conservador e preciso.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1, // Muito baixa para decisões de risco
        max_tokens: 500,
      });

      const analysis = response.choices[0].message.content;
      const approved = analysis.toLowerCase().includes('sim');

      return {
        approved,
        reason: analysis,
        riskLevel: this.extractNumberValue(analysis, ['risco', 'risk']) || 5,
        timeframe: this.extractValue(analysis, ['timeframe', 'prazo']) || '5m',
        probability: this.extractNumberValue(analysis, ['probabilidade', 'probability']) || 50,
      };
    } catch (error) {
      return {
        approved: false,
        reason: 'Erro na análise - estratégia não aprovada por segurança',
        riskLevel: 2,
      };
    }
  }

  // Helpers
  extractValue(text, keywords) {
    for (const keyword of keywords) {
      const regex = new RegExp(`${keyword}[:\\s]+([^\\n]+)`, 'i');
      const match = text.match(regex);
      if (match) return match[1].trim();
    }
    return 'N/A';
  }

  extractNumberValue(text, keywords) {
    for (const keyword of keywords) {
      const regex = new RegExp(`${keyword}[:\\s]+([0-9.]+)`, 'i');
      const match = text.match(regex);
      if (match) return parseFloat(match[1]);
    }
    return null;
  }

  convertRecommendationToScore(rec) {
    if (!rec) return 0;
    const r = rec.toLowerCase();
    if (r.includes('comprar') || r.includes('buy')) return 1;
    if (r.includes('vender') || r.includes('sell')) return -1;
    return 0; // manter/hold
  }

  convertScoreToRecommendation(score) {
    if (score > 0.3) return 'COMPRAR';
    if (score < -0.3) return 'VENDER';
    return 'MANTER';
  }

  isActionable(score, confidence) {
    return Math.abs(score) > 0.3 && confidence > this.confidenceThreshold;
  }

  calculateTrend(data) { return 'ALTA'; }

  calculateMomentum(data) { return 0.6; }

  calculateVolatility(data) { return 0.4; }

  analyzeVolume(data) { return 'NORMAL'; }

  getInternalRecommendation(data) { return 'COMPRAR'; }

  getDefaultGPTResponse() {
    return {
      tendencia: 'LATERAL',
      recomendacao: 'MANTER',
      confianca: 0.5,
      comentarios: 'Análise não disponível',
    };
  }

  getFallbackAnalysis(marketData) {
    return {
      recomendacao: 'MANTER',
      confianca: 0.3,
      isActionable: false,
      reason: 'Análise GPT indisponível',
    };
  }

  storeConsensusHistory(consensus) {
    this.consensusHistory.push(consensus);
    if (this.consensusHistory.length > 100) {
      this.consensusHistory.shift(); // Manter apenas últimas 100
    }
  }
}

module.exports = GPTConsensus;
