const BaseOperator = require('./BaseOperator');

/**
 * @class OpeningBellOperator
 * @description Operador especialista que atua apenas nos primeiros minutos do pregão
 * para capturar o impulso inicial, baseado em uma análise pré-mercado.
 */
class OpeningBellOperator extends BaseOperator {
    constructor(config, gptConsensus, riskManager) {
        super('OPENING_BELL', config, gptConsensus, riskManager);
        this.tradeExecuted = false;
    }

    /**
     * Este operador só é adequado nos primeiros 5 minutos do pregão.
     * @param {object} marketData - Dados atuais do mercado.
     * @returns {Promise<number>} - Pontuação de adequação (0 a 1).
     */
    async suitabilityScore(marketData) {
        const now = new Date(marketData.timestamp);
        const marketOpen = new Date(now).setHours(10, 0, 0, 0);
        const fiveMinutesAfterOpen = new Date(now).setHours(10, 5, 0, 0);

        // Só é elegível se estiver nos primeiros 5 minutos e ainda não tiver operado.
        if (!this.tradeExecuted && now >= marketOpen && now <= fiveMinutesAfterOpen) {
            return 1.0; // Prioridade máxima
        }

        return 0; // Inelegível fora da janela de abertura.
    }

    /**
     * Gera um sinal único baseado no viés pré-mercado.
     * @param {object} marketData - Dados atuais do mercado.
     * @returns {Promise<object>} - Um objeto de sinal.
     */
    async generateSignal(marketData) {
        if (this.tradeExecuted) {
            return { signal: 'HOLD', confidence: 1.0, reason: 'Operação de abertura já executada.' };
        }

        // TODO: Substituir esta lógica pela análise do PreMarketEngine.
        // Lógica simulada: se o preço de abertura for maior que o fechamento anterior, compra.
        const openingGap = marketData.prices.open - marketData.prices.previousClose;

        this.tradeExecuted = true; // Garante que opere apenas uma vez.

        if (openingGap > 0.1) { // Gap de alta de 0.1%
            return { signal: 'BUY', confidence: 0.8, reason: 'Gap de alta na abertura.' };
        }

        return { signal: 'HOLD', confidence: 0.5, reason: 'Sem viés claro na abertura.' };
    }
}

module.exports = OpeningBellOperator;