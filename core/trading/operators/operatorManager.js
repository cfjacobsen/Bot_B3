// eslint-disable-next-line linebreak-style
const fs = require('fs');
const path = require('path');

// As configurações foram movidas para um objeto mais completo, incluindo SCALPER e OPENING_BELL
const OPERATOR_CONFIGS = {
    SCALPER: {
        timeframe: '1m',
        indicators: ['RSI', 'MACD', 'VWAP'],
        riskLevel: 0.5,
        maxPositions: 10,
        stopLoss: 0.2, // Stop em %
        takeProfit: 0.3, // Alvo em %
        trailingStopPercent: 0.1
    },
    DAY_TRADER: {
        timeframe: '5m',
        indicators: ['EMA', 'RSI', 'VWAP'], // Indicadores comuns para Day Trade
        riskLevel: 1.2, // Um pouco mais de risco
        maxPositions: 2, // Focar em menos posições de qualidade
        stopLoss: 0.4, // Stop em % (ex: 0.4% do preço do ativo)
        takeProfit: 0.8, // Alvo de 0.8%
        trailingStopPercent: 0.2
    },
    SWING_TRADER: {
        timeframe: '1h',
        indicators: ['EMA', 'MACD', 'Ichimoku'],
        riskLevel: 1.5,
        maxPositions: 3,
        stopLoss: 2.0, // Stop em %
        takeProfit: 5.0, // Alvo em %
        trailingStopPercent: 1.5
    },
    OPENING_BELL: {
        timeframe: '1m',
        indicators: ['Volume'],
        riskLevel: 1.2,
        maxPositions: 1, // Apenas uma operação de abertura
        stopLoss: 0.8,
        takeProfit: 1.2,
        trailingStopPercent: 0.5
    }
};

class OperatorManager {
    constructor(gptConsensus, riskManager) {
        this.gptConsensus = gptConsensus;
        this.riskManager = riskManager;
        this.operators = new Map();
        this.loadOperators();
    }

    /**
     * Carrega dinamicamente todos os arquivos de operadores do diretório atual,
     * exceto BaseOperator.js e o próprio operatorManager.js.
     */
    loadOperators() {
        const currentFile = path.basename(__filename);
        const operatorFiles = fs.readdirSync(__dirname)
            .filter(file => 
                file.endsWith('Operator.js') && file !== 'BaseOperator.js' && file !== currentFile
            );

        for (const file of operatorFiles) {
            try {
                const OperatorClass = require(path.join(__dirname, file));
                const operatorType = file.replace('Operator.js', '').toUpperCase();

                if (OPERATOR_CONFIGS[operatorType]) {
                    const config = OPERATOR_CONFIGS[operatorType];
                    const operatorInstance = new OperatorClass(config, this.gptConsensus, this.riskManager);
                    this.operators.set(operatorType, operatorInstance);
                    console.log(`info: Operador [${operatorType}] carregado com sucesso.`);
                } else {
                    console.warn(`warn: Configuração para o operador ${operatorType} não encontrada. Operador não carregado.`);
                }
            } catch (error) {
                console.error(`error: Falha ao carregar o operador do arquivo ${file}:`, error);
            }
        }
    }

    /**
     * Seleciona o melhor operador com base nas condições de mercado e no tipo de meta.
     * @param {object} marketData - Dados atuais do mercado.
     * @param {string} goalType - Tipo de meta ('CONSERVATIVE', 'MODERATE', 'AGGRESSIVE').
     * @returns {Promise<object>} - O operador selecionado e sua pontuação.
     */
    async selectBestOperator(marketData, goalType = 'MODERATE') {
        let bestOperator = null;
        let highestScore = -1;

        for (const [type, operator] of this.operators.entries()) {
            const score = await operator.suitabilityScore(marketData);

            // Lógica de ajuste de score baseado no tipo de meta
            let adjustedScore = score;
            if (goalType === 'AGGRESSIVE' && type === 'SCALPER') adjustedScore *= 1.2;
            if (goalType === 'CONSERVATIVE' && type === 'SWING_TRADER') adjustedScore *= 1.2;

            if (adjustedScore > highestScore) {
                highestScore = adjustedScore;
                bestOperator = operator;
            }
        }

        if (!bestOperator) {
            console.warn('warn: Nenhum operador adequado encontrado. Usando DAY_TRADER como fallback.');
            return { type: 'DAY_TRADER', operator: this.operators.get('DAY_TRADER'), score: 0.5 };
        }

        return { type: bestOperator.type, operator: bestOperator, score: highestScore };
    }

    /**
     * Retorna uma lista dos tipos de operadores ativos.
     * @returns {string[]}
     */
    getActiveOperators() {
        return Array.from(this.operators.keys());
    }

    /**
     * Retorna as métricas de todos os operadores.
     * @returns {object}
     */
    getAllMetrics() {
        const allMetrics = {};
        for (const [type, operator] of this.operators.entries()) {
            allMetrics[type] = operator.getMetrics();
        }
        return allMetrics;
    }
}

module.exports = OperatorManager;