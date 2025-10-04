const finnhub = require('finnhub');

/**
 * @class PreMarketEngine
 * @description Coleta e analisa dados pré-mercado de múltiplas fontes para
 * gerar um viés de abertura (Bullish, Bearish, Neutral).
 */
class PreMarketEngine {
    /**
     * @param {string} apiKey - A chave da API da Finnhub.
     * @param {object} gptConsensus - A instância do motor de consenso de IA.
     */
    constructor(apiKey, gptConsensus) {
        if (!apiKey) {
            throw new Error('A chave da API da Finnhub é necessária para o PreMarketEngine.');
        }
        this.apiClient = new finnhub.DefaultApi();
        this.apiKey = apiKey;
        this.gptConsensus = gptConsensus;

        // Símbolos a serem monitorados. NOTA: Verifique os símbolos corretos para sua conta Finnhub.
        this.symbols = {
            sp500_etf: 'SPY',       // ETF que replica o S&P 500
            nasdaq_etf: 'QQQ',      // ETF que replica o Nasdaq 100
            petrobras_adr: 'PBR',   // ADR da Petrobras em NY
            vale_adr: 'VALE',       // ADR da Vale em NY
            vix_index: '^VIX',      // Índice de Volatilidade
            brent_oil: 'LCO',       // Preço do Petróleo Brent (pode variar)
        };
    }

    /**
     * Busca a cotação atual de um símbolo na Finnhub.
     * @private
     * @param {string} symbol - O símbolo a ser buscado.
     * @returns {Promise<object|null>} - Os dados da cotação ou null em caso de erro.
     */
    async _fetchQuote(symbol) {
        return new Promise((resolve) => {
            this.apiClient.quote(symbol, this.apiKey, (error, data) => {
                if (error || !data) {
                    console.error(`[PreMarketEngine] Erro ao buscar cotação para ${symbol}:`, error);
                    resolve(null);
                } else {
                    resolve({
                        symbol,
                        price: data.c,
                        change: data.d,
                        percentChange: data.dp,
                        previousClose: data.pc
                    });
                }
            });
        });
    }

    /**
     * Coleta todos os dados pré-mercado de forma concorrente.
     * @private
     * @returns {Promise<object>} - Um objeto consolidado com todos os dados coletados.
     */
    async _gatherAllData() {
        const dataPromises = {
            sp500: this._fetchQuote(this.symbols.sp500_etf),
            nasdaq: this._fetchQuote(this.symbols.nasdaq_etf),
            petrobras: this._fetchQuote(this.symbols.petrobras_adr),
            vale: this._fetchQuote(this.symbols.vale_adr),
            vix: this._fetchQuote(this.symbols.vix_index),
            oil: this._fetchQuote(this.symbols.brent_oil),
            // TODO: Adicionar busca por Minério de Ferro e Dólar Futuro (pode exigir outra fonte)
        };

        const results = await Promise.all(Object.values(dataPromises));
        const keys = Object.keys(dataPromises);

        const collectedData = {};
        keys.forEach((key, index) => {
            collectedData[key] = results[index];
        });

        return collectedData;
    }

    /**
     * Constrói o prompt para a análise da IA com base nos dados coletados.
     * @private
     * @param {object} data - Os dados pré-mercado.
     * @returns {string} - O prompt formatado para a IA.
     */
    _buildAnalysisPrompt(data) {
        const formatChange = (item) => {
            if (!item) return 'Dados indisponíveis';
            const sign = item.percentChange > 0 ? '+' : '';
            return `${sign}${item.percentChange.toFixed(2)}%`;
        };

        return `
        **Análise Pré-Mercado para o Ibovespa**

        Analise os seguintes indicadores financeiros globais e seus impactos prováveis na abertura do mercado brasileiro (Ibovespa).

        **Dados Coletados:**
        - **S&P 500 (SPY):** ${formatChange(data.sp500)}
        - **Nasdaq 100 (QQQ):** ${formatChange(data.nasdaq)}
        - **ADR Petrobras (PBR):** ${formatChange(data.petrobras)}
        - **ADR Vale (VALE):** ${formatChange(data.vale)}
        - **Índice de Volatilidade (VIX):** ${formatChange(data.vix)}
        - **Petróleo Brent (LCO):** ${formatChange(data.oil)}

        **Sua Tarefa:**
        Com base nesses dados, forneça uma análise concisa em formato JSON.
        1.  **bias**: Qual o viés mais provável para a abertura do Ibovespa? Responda com "BULLISH", "BEARISH" ou "NEUTRAL".
        2.  **confidence**: Qual seu nível de confiança nessa análise? Um número entre 0.0 e 1.0.
        3.  **key_factors**: Liste os 2 ou 3 principais fatores que influenciaram sua decisão (ex: "Forte alta nos futuros americanos e no ADR da Petrobras").
        4.  **summary**: Um resumo de uma frase explicando o racional.

        Responda apenas com o objeto JSON.
        `;
    }

    /**
     * Orquestra a coleta de dados e a análise da IA para determinar o viés de abertura.
     * @returns {Promise<object>} - O resultado da análise.
     */
    async getOpeningBias() {
        console.log('[PreMarketEngine] Iniciando coleta de dados pré-mercado...');
        const marketData = await this._gatherAllData();
        console.log('[PreMarketEngine] Dados coletados:', marketData);

        if (!this.gptConsensus) {
            console.warn('[PreMarketEngine] GPTConsensus não fornecido. Análise de IA pulada.');
            return { bias: 'NEUTRAL', confidence: 0.5, reason: 'Análise de IA não configurada.' };
        }

        const prompt = this._buildAnalysisPrompt(marketData);
        
        try {
            console.log('[PreMarketEngine] Solicitando análise de consenso da IA...');
            const analysis = await this.gptConsensus.getAnalysis(prompt, { isJson: true });
            
            return {
                bias: analysis.bias || 'NEUTRAL',
                confidence: analysis.confidence || 0.5,
                reason: analysis.summary || 'Análise da IA incompleta.',
                keyFactors: analysis.key_factors || [],
                influencers: marketData
            };
        } catch (error) {
            console.error('[PreMarketEngine] Falha ao obter análise da IA:', error);
            return { bias: 'NEUTRAL', confidence: 0.5, reason: 'Erro na comunicação com a IA.', error };
        }
    }
}

module.exports = PreMarketEngine;