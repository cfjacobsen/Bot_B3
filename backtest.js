const fs = require('fs');
const path = require('path');
const technicalindicators = require('./utils/indicators.js');
require('dotenv').config();
const { parseCsv } = require('./utils/csv.js');

// Importar os mesmos componentes do servidor principal para uma simulação fiel
const OperatorManager = require('./core/trading/operators/operatorManager.js');
const AdvancedRiskManager = require('./core/trading/riskManager.js');
const MetaConsensus = require('./core/ai/metaConsensus.js');

class Backtester {
  constructor(config) {
    this.config = {
      capitalInicial: config.capitalInicial || 50000,
      arquivoDados: config.arquivoDados,
      meta: config.meta || 'MODERATE',
      symbol: config.symbol || 'PETR4',
    };

    // Estado da simulação
    this.state = {
      capital: this.config.capitalInicial,
      posicoesAbertas: [],
      historicoTrades: [],
      pnl: 0,
      capitalHistory: [this.config.capitalInicial],
    };

    // Instanciar componentes do bot
    this.riskManager = new AdvancedRiskManager(() => ({
      currentCapital: this.state.capital,
      initialCapital: this.config.capitalInicial,
    }));
    this.metaConsensus = new MetaConsensus();
    this.operatorManager = new OperatorManager(null, this.riskManager); // GPT não é usado no backtest para economizar custos

    console.log('🚀 Backtester Inicializado');
    console.log(`Capital Inicial: R$ ${this.config.capitalInicial.toFixed(2)}`);
    console.log(`Ativo: ${this.config.symbol}`);
    console.log(`Estratégia de Meta: ${this.config.meta}`);
  }

  /**
     * Carrega e prepara os dados históricos do arquivo CSV.
     */
  loadData() {
    console.log(`Carregando dados de ${this.config.arquivoDados}...`);
    const csvPath = path.resolve(__dirname, this.config.arquivoDados);
    const fileContent = fs.readFileSync(csvPath, { encoding: 'utf-8' });
    this.historicalData = parseCsv(fileContent);
    console.log(`✅ ${this.historicalData.length} registros carregados.`);
  }

  /**
     * Executa a simulação de backtesting.
     */
  async run() {
    this.loadData();
    console.log(`\n--- INICIANDO SIMULAÇÃO [${this.config.symbol} - ${this.config.meta}] ---`);

    for (let i = 50; i < this.historicalData.length; i++) { // Começa com dados suficientes para indicadores
      const currentCandle = this.historicalData[i];
      const dataSlice = this.historicalData.slice(0, i + 1);

      // 1. Atualiza posições abertas (verifica stop/take)
      this.updateOpenPositions(currentCandle);

      // 2. Constrói o objeto marketData para o tick atual
      const marketData = this.buildMarketData(dataSlice);

      // 3. Executa a lógica de trading (similar ao tradingTick)
      await this.simulationTick(marketData);
    }

    console.log('--- SIMULAÇÃO CONCLUÍDA ---');
    const reportData = this.generateReport();
    return reportData;
  }

  /**
     * Lógica de decisão para cada "tick" da simulação.
     */
  async simulationTick(marketData) {
    // Seleciona o operador
    const { operator } = await this.operatorManager.selectBestOperator(marketData, this.config.meta);
    if (!operator) return;

    // Gera o sinal
    const signal = await operator.generateSignal(marketData);

    if (signal.signal !== 'HOLD') {
      // Constrói o trade
      const trade = this.buildTradeFromSignal(signal, operator, marketData);
      if (trade.quantity === 0) return; // Ignora se a quantidade for zero

      // Valida com o Risk Manager
      const validation = this.riskManager.validateTrade(trade, marketData);

      if (validation.isValid) {
        this.openPosition(trade, marketData.timestamp);
      }
    }
  }

  /**
     * Verifica se posições abertas atingiram stop loss ou take profit.
     */
  updateOpenPositions(candle) {
    const openPositions = [...this.state.posicoesAbertas];
    for (const pos of openPositions) {
      if (pos.side === 'BUY') {
        // Lógica do Trailing Stop para COMPRA
        // Se o preço máximo sobe, o stop sobe junto
        const newTrailingStop = candle.High * (1 - pos.trailingStopPercent / 100);
        if (newTrailingStop > pos.stopLoss) {
          pos.stopLoss = newTrailingStop;
        }

        // Verifica se o stop ou o take profit foi atingido
        if (candle.Low <= pos.stopLoss) {
          this.closePosition(pos, pos.stopLoss, 'TRAILING_STOP', candle.Date);
        } else if (candle.High >= pos.takeProfit) {
          this.closePosition(pos, pos.takeProfit, 'TAKE_PROFIT', candle.Date);
        }
      } else { // SELL
        // Lógica do Trailing Stop para VENDA
        // Se o preço mínimo desce, o stop desce junto
        const newTrailingStop = candle.Low * (1 + pos.trailingStopPercent / 100);
        if (newTrailingStop < pos.stopLoss) {
          pos.stopLoss = newTrailingStop;
        }

        // Verifica se o stop ou o take profit foi atingido
        if (candle.High >= pos.stopLoss) {
          this.closePosition(pos, pos.stopLoss, 'TRAILING_STOP', candle.Date);
        } else if (candle.Low <= pos.takeProfit) {
          this.closePosition(pos, pos.takeProfit, 'TAKE_PROFIT', candle.Date);
        }
      }
    }
  }

  openPosition(trade, timestamp) {
    const position = { ...trade, entryTimestamp: timestamp, id: Date.now() + Math.random() };
    this.state.posicoesAbertas.push(position);
    console.log(`[${timestamp}] 🟢 ABRIR POSIÇÃO: ${trade.side} ${trade.quantity} ${trade.symbol} @ ${trade.price.toFixed(2)}`);
  }

  closePosition(position, closePrice, reason, timestamp) {
    const pnl = (closePrice - position.price) * position.quantity * (position.side === 'BUY' ? 1 : -1);
    this.state.capital += pnl;
    this.state.pnl += pnl;

    const tradeResult = {
      ...position, closePrice, pnl, reason, exitTimestamp: timestamp,
    };
    this.state.historicoTrades.push(tradeResult);

    this.state.posicoesAbertas = this.state.posicoesAbertas.filter((p) => p.id !== position.id);
    this.state.capitalHistory.push(this.state.capital);

    const resultEmoji = pnl > 0 ? '✅' : '❌';
    console.log(`[${timestamp}] ${resultEmoji} FECHAR POSIÇÃO: ${reason}. P&L: R$ ${pnl.toFixed(2)}. Capital: R$ ${this.state.capital.toFixed(2)}`);
  }

  /**
     * Constrói o objeto marketData com indicadores calculados.
     */
  buildMarketData(dataSlice) {
    const currentCandle = dataSlice[dataSlice.length - 1];
    const closePrices = dataSlice.map((c) => c.Close);

    const rsi = technicalindicators.RSI.calculate({ values: closePrices, period: 14 });
    const ema20 = technicalindicators.EMA.calculate({ values: closePrices, period: 20 });
    const ema50 = technicalindicators.EMA.calculate({ values: closePrices, period: 50 });

    return {
      symbol: this.config.symbol,
      timestamp: currentCandle.Date,
      prices: {
        current: currentCandle.Close,
        open: currentCandle.Open,
        high: currentCandle.High,
        low: currentCandle.Low,
        change: ((currentCandle.Close - dataSlice[dataSlice.length - 2].Close) / dataSlice[dataSlice.length - 2].Close) * 100,
      },
      indicators: {
        rsi: rsi[rsi.length - 1] || 50,
        ema20: ema20[ema20.length - 1] || currentCandle.Close,
        ema50: ema50[ema50.length - 1] || currentCandle.Close,
      },
      volume: {
        current: currentCandle.Volume,
        liquidity: 'HIGH', // Simulado
        breakoutPotential: 'LOW', // Simulado
      },
      volatility: {
        atr: 0, // Simulado
        opportunity: 'MEDIUM', // Simulado
      },
      trend: {
        strength: 0, // Simulado
      },
      timing: {
        optimal: true, // Simulado
      },
    };
  }

  /**
     * Constrói um objeto de trade a partir de um sinal.
     * Idêntico ao do server.js para consistência.
     */
  buildTradeFromSignal(signal, operator, marketData) {
    const currentPrice = marketData.prices.current;
    const riskPerTrade = (this.state.capital * this.riskManager.config.maxTradeRisk) / 100;
    const stopLossPrice = signal.signal === 'BUY' ? currentPrice * (1 - operator.config.stopLoss / 100) : currentPrice * (1 + operator.config.stopLoss / 100);
    const riskPerShare = Math.abs(currentPrice - stopLossPrice);

    if (riskPerShare === 0) return { quantity: 0 };

    const quantity = Math.floor(riskPerTrade / riskPerShare);

    return {
      symbol: marketData.symbol,
      side: signal.signal,
      quantity,
      price: currentPrice,
      stopLoss: stopLossPrice,
      takeProfit: signal.signal === 'BUY' ? currentPrice * (1 + operator.config.takeProfit / 100) : currentPrice * (1 - operator.config.takeProfit / 100),
      reason: signal.reason,
      trailingStopPercent: operator.config.trailingStopPercent || 0.5, // Pega o valor do config
    };
  }

  /**
     * Gera e exibe o relatório final de performance.
     */
  generateReport() {
    const trades = this.state.historicoTrades;
    if (trades.length === 0) {
      console.log('\nNenhum trade foi executado.');
      return;
    }

    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl <= 0);

    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    const totalPnl = this.state.pnl;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;

    // Cálculo do Drawdown Máximo
    let maxDrawdown = 0;
    let peak = -Infinity;
    for (const capitalValue of this.state.capitalHistory) {
      if (capitalValue > peak) {
        peak = capitalValue;
      }
      const drawdown = ((peak - capitalValue) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Cálculo do Sharpe Ratio
    const tradeReturns = trades.map((t) => t.pnl / (t.price * t.quantity));
    const meanReturn = tradeReturns.reduce((sum, r) => sum + r, 0) / (tradeReturns.length || 1);
    const stdDev = Math.sqrt(tradeReturns.map((r) => (r - meanReturn) ** 2).reduce((sum, v) => sum + v, 0) / (tradeReturns.length || 1));

    // Assumindo uma taxa livre de risco de 0 para simplificar.
    const riskFreeRate = 0;
    const sharpeRatio = stdDev > 0 ? (meanReturn - riskFreeRate) / stdDev : 0;

    // Anualizar o Sharpe Ratio
    const firstDate = new Date(this.historicalData[0].Date);
    const lastDate = new Date(this.historicalData[this.historicalData.length - 1].Date);
    const days = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
    const tradesPerDay = trades.length / (days || 1);
    const tradingDaysPerYear = 252;
    const annualizedSharpeRatio = sharpeRatio * Math.sqrt(tradesPerDay * tradingDaysPerYear);

    console.log('\n--- 📊 RELATÓRIO DE BACKTESTING ---');
    console.log('======================================');
    console.log(`Período Analisado: ${this.historicalData[0].Date} a ${this.historicalData[this.historicalData.length - 1].Date}`);
    console.log(`Resultado Final: R$ ${totalPnl.toFixed(2)}`);
    console.log(`Capital Final: R$ ${this.state.capital.toFixed(2)}`);
    console.log(`Performance: ${((this.state.capital / this.config.capitalInicial - 1) * 100).toFixed(2)}%`);
    console.log('--------------------------------------');
    console.log(`Total de Trades: ${trades.length}`);
    console.log(`Trades Vencedores: ${wins.length}`);
    console.log(`Trades Perdedores: ${losses.length}`);
    console.log(`Taxa de Acerto (Win Rate): ${((wins.length / trades.length) * 100).toFixed(2)}%`);
    console.log('--------------------------------------');
    console.log(`Média de Ganho: R$ ${(grossProfit / (wins.length || 1)).toFixed(2)}`);
    console.log(`Média de Perda: R$ ${(grossLoss / (losses.length || 1)).toFixed(2)}`);
    console.log(`Profit Factor: ${profitFactor.toFixed(2)}`);
    console.log(`Sharpe Ratio (Anualizado): ${annualizedSharpeRatio.toFixed(2)}`);
    console.log(`Drawdown Máximo: ${maxDrawdown.toFixed(2)}%`);
    console.log('======================================\n');

    // Gerar e salvar o relatório HTML
    const reportData = {
      symbol: this.config.symbol,
      meta: this.config.meta,
      startDate: this.historicalData[0].Date,
      endDate: this.historicalData[this.historicalData.length - 1].Date,
      totalPnl,
      finalCapital: this.state.capital,
      initialCapital: this.config.capitalInicial,
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: (wins.length / trades.length) * 100,
      avgWin: grossProfit / (wins.length || 1),
      avgLoss: grossLoss / (losses.length || 1),
      profitFactor,
      maxDrawdown,
      sharpeRatio: annualizedSharpeRatio,
      trades,
      capitalHistory: this.state.capitalHistory,
    };

    this.saveHtmlReport(reportData);
    return reportData;
  }

  /**
     * Salva o relatório de performance em um arquivo HTML.
     * @param {object} reportData - Os dados para o relatório.
     */
  saveHtmlReport(reportData) {
    const reportFilename = `backtest_report_${reportData.symbol}_${reportData.meta}.html`;
    const tradesHtml = reportData.trades.map((trade) => `
            <tr class="${trade.pnl > 0 ? 'win' : 'loss'}">
                <td>${new Date(trade.entryTimestamp).toLocaleString('pt-BR')}</td>
                <td>${new Date(trade.exitTimestamp).toLocaleString('pt-BR')}</td>
                <td>${trade.symbol}</td>
                <td class="side-${trade.side.toLowerCase()}">${trade.side}</td>
                <td>${trade.quantity}</td>
                <td>R$ ${trade.price.toFixed(2)}</td>
                <td>R$ ${trade.closePrice.toFixed(2)}</td>
                <td>R$ ${trade.pnl.toFixed(2)}</td>
                <td>${trade.reason}</td>
            </tr>
        `).join('');

    const htmlContent = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Relatório de Backtesting - ${this.config.symbol}</title>
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7fa; color: #333; margin: 0; padding: 20px; }
                    .container { max-width: 1200px; margin: auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
                    h1, h2 { color: #2c3e50; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; margin-bottom: 20px; }
                    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
                    .metric { background: #ecf0f1; padding: 15px; border-radius: 5px; text-align: center; }
                    .chart-container { position: relative; height: 400px; width: 100%; margin: 40px 0; }
                    .metric h3 { margin: 0 0 5px 0; font-size: 16px; color: #7f8c8d; }
                    .metric p { margin: 0; font-size: 24px; font-weight: bold; }
                    .pnl-positive { color: #27ae60; }
                    .pnl-negative { color: #c0392b; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background-color: #34495e; color: white; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                    .win { color: #27ae60; }
                    .loss { color: #c0392b; }
                    .side-buy { font-weight: bold; color: #2980b9; }
                    .side-sell { font-weight: bold; color: #e74c3c; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📊 Relatório de Backtesting</h1>
                    <div class="summary">
                        <div class="metric"><h3>Resultado Final</h3><p class="${reportData.totalPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">R$ ${reportData.totalPnl.toFixed(2)}</p></div>
                        <div class="metric"><h3>Performance</h3><p class="${reportData.totalPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">${((reportData.finalCapital / reportData.initialCapital - 1) * 100).toFixed(2)}%</p></div>
                        <div class="metric"><h3>Taxa de Acerto</h3><p>${reportData.winRate.toFixed(2)}%</p></div>
                        <div class="metric"><h3>Profit Factor</h3><p>${reportData.profitFactor.toFixed(2)}</p></div>
                        <div class="metric"><h3>Total de Trades</h3><p>${reportData.totalTrades}</p></div>
                        <div class="metric"><h3>Sharpe Ratio</h3><p>${reportData.sharpeRatio.toFixed(2)}</p></div>
                        <div class="metric"><h3>Drawdown Máximo</h3><p class="pnl-negative">${reportData.maxDrawdown.toFixed(2)}%</p></div>
                    </div>
                    <h2>Curva de Capital</h2>
                    <div class="chart-container">
                        <canvas id="capitalCurveChart"></canvas>
                    </div>
                    <h2>Histórico de Trades</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Abertura</th><th>Fechamento</th><th>Ativo</th><th>Lado</th><th>Qtd.</th><th>Preço Entrada</th><th>Preço Saída</th><th>Resultado</th><th>Motivo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tradesHtml}
                        </tbody>
                    </table>
                </div>
                <script>
                    const ctx = document.getElementById('capitalCurveChart').getContext('2d');
                    const capitalHistory = ${JSON.stringify(reportData.capitalHistory)};
                    const labels = capitalHistory.map((_, i) => i === 0 ? 'Inicial' : \`Trade \${i}\`);

                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'Curva de Capital (R$)',
                                data: capitalHistory,
                                borderColor: '#3498db',
                                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                                fill: true,
                                tension: 0.1
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                y: {
                                    ticks: { callback: (value) => 'R$ ' + value.toLocaleString('pt-BR') }
                                }
                            }
                        }
                    });
                </script>
            </body>
            </html>
        `;

    const reportPath = path.resolve(__dirname, reportFilename);
    fs.writeFileSync(reportPath, htmlContent);
    console.log(`\n✅ Relatório individual salvo em: ${reportPath}`);
  }
}

// --- Como Executar o Backtest ---
// Esta parte só será executada se o script for chamado diretamente
if (require.main === module) {
  (async () => {
    const backtestConfig = {
      capitalInicial: 50000,
      arquivoDados: 'data/PETR4_5m_historico.csv',
      symbol: 'PETR4',
      meta: 'AGGRESSIVE', // Pode ser 'CONSERVATIVE', 'MODERATE', ou 'AGGRESSIVE'
    };

    const backtester = new Backtester(backtestConfig);
    await backtester.run();
  })();
}

module.exports = Backtester;
