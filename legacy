document.addEventListener('DOMContentLoaded', () => {
    // Mapeamento de Elementos da UI
    const ui = {
        statusLight: document.querySelector('.status-light'),
        statusText: document.getElementById('system-status-text'),
        dailyPnl: document.getElementById('daily-pnl'),
        currentCapital: document.getElementById('current-capital'),
        winRate: document.getElementById('win-rate'),
        tradeCount: document.getElementById('trade-count'),
        btnStart: document.getElementById('btn-start'),
        btnPause: document.getElementById('btn-pause'),
        btnStop: document.getElementById('btn-stop'),
        goalSelect: document.getElementById('goal-select'),
        activeOperator: document.getElementById('active-operator'),
        operatorReason: document.getElementById('operator-reason'),
        aiBias: document.getElementById('ai-bias'),
        aiReason: document.getElementById('ai-reason'),
        chartTitle: document.getElementById('chart-title'),
        currentPrice: document.getElementById('current-price'),
        priceChange: document.getElementById('price-change'),
        logsContainer: document.getElementById('logs-container'),
        loginModal: document.getElementById('login-modal'),
        loginForm: document.getElementById('login-form'),
        tokenInput: document.getElementById('token-input'),
    };

    let priceChart;
    const socket = io(window.location.origin);

    // --- LÓGICA DE AUTENTICAÇÃO ---
    const token = localStorage.getItem('jwt_token');
    if (token) {
        ui.loginModal.style.display = 'none';
        socket.emit('authenticate', token);
    }

    ui.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userToken = ui.tokenInput.value;
        if (userToken) {
            localStorage.setItem('jwt_token', userToken);
            socket.emit('authenticate', userToken);
        }
    });

    // --- FUNÇÕES DE ATUALIZAÇÃO DA UI ---

    const updateValue = (element, value, isCurrency = false, isPercent = false) => {
        if (isCurrency) {
            element.textContent = `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else if (isPercent) {
            element.textContent = `${value.toFixed(2)}%`;
        } else {
            element.textContent = value;
        }
    };

    const updateColoredValue = (element, value, isCurrency = false, isPercent = false) => {
        updateValue(element, value, isCurrency, isPercent);
        element.className = '';
        if (value > 0) element.classList.add('positive-value');
        else if (value < 0) element.classList.add('negative-value');
        else element.classList.add('neutral-value');
    };

    const addLog = (message, type = 'info') => {
        const logItem = document.createElement('div');
        logItem.className = `log-item ${type}`;
        logItem.innerHTML = `<span>[${new Date().toLocaleTimeString()}]</span> ${message}`;
        ui.logsContainer.prepend(logItem);
        if (ui.logsContainer.children.length > 100) {
            ui.logsContainer.lastChild.remove();
        }
    };

    const updateSystemStatus = (state) => {
        // Garante que o estado não seja nulo ou indefinido
        if (!state) return;

        ui.statusLight.className = 'status-light';
        if (state?.isRunning) {
            ui.statusLight.classList.add('connected');
            ui.statusText.textContent = 'EM EXECUÇÃO';
            ui.btnStart.disabled = true;
            ui.btnPause.disabled = false;
            ui.btnStop.disabled = false;
            ui.goalSelect.disabled = true;
        } else if (state?.isPaused) { // Adicionado para um estado de "pausado"
            ui.statusLight.classList.add('paused');
            ui.statusText.textContent = 'PAUSADO';
            ui.btnStart.disabled = true;
            ui.btnPause.disabled = false; // Pode querer reativar
            ui.btnStop.disabled = false;
            ui.goalSelect.disabled = true;
        } else {
            ui.statusLight.classList.add('disconnected');
            ui.statusText.textContent = 'PARADO';
            ui.btnStart.disabled = false;
            ui.btnPause.disabled = true;
            ui.btnStop.disabled = true;
            ui.goalSelect.disabled = false;
        }

        // Atualizações de UI mais seguras com valores padrão
        updateColoredValue(ui.dailyPnl, state.performance?.dailyPnl ?? 0, true);
        updateValue(ui.currentCapital, state.currentCapital ?? 0, true);
        updateValue(ui.winRate, state.performance?.winRate ?? 0, false, true);
        updateValue(ui.tradeCount, state.performance?.trades ?? 0);

        ui.activeOperator.textContent = state.selectedOperator?.type || 'N/A';
        ui.operatorReason.textContent = state.selectedOperator?.score ? `Score: ${state.selectedOperator.score.toFixed(2)}` : 'Aguardando seleção...';

        // Corrigido para usar os valores corretos do PreMarketEngine (BULLISH/BEARISH)
        const bias = state.preMarketAnalysis?.bias || 'NEUTRAL';
        ui.aiBias.textContent = bias;
        ui.aiReason.textContent = state.preMarketAnalysis?.reason || 'Análise pendente.';
        ui.aiBias.className = ''; // Limpa classes antigas
        if (bias === 'BULLISH') ui.aiBias.classList.add('positive-value');
        else if (bias === 'BEARISH') ui.aiBias.classList.add('negative-value');
        else ui.aiBias.classList.add('neutral-value');
    };

    const initializeChart = () => {
        // Resolve o problema da cor do gráfico lendo a variável CSS
        const style = getComputedStyle(document.body);
        const accentBlue = style.getPropertyValue('--accent-blue').trim();

        const ctx = document.getElementById('price-chart').getContext('2d');
        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Preço',
                    data: [],
                    borderColor: accentBlue || '#3498db', // Usa a cor lida ou um fallback
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { display: false },
                    y: { 
                        ticks: { color: style.getPropertyValue('--text-secondary').trim() || '#a0a0a0' },
                        grid: { color: style.getPropertyValue('--border-color').trim() || '#333747' }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    };

    const updateChart = (marketData) => {
        if (!priceChart) return;

        const now = new Date(marketData.timestamp).toLocaleTimeString();
        const currentPrice = marketData.prices?.current ?? 0;
        const changePercent = marketData.prices?.change ?? 0;

        priceChart.data.labels.push(now);
        priceChart.data.datasets[0].data.push(currentPrice);

        if (priceChart.data.labels.length > 50) {
            priceChart.data.labels.shift();
            priceChart.data.datasets[0].data.shift();
        }
        priceChart.update('none'); // 'none' para uma atualização mais performática

        ui.chartTitle.textContent = marketData.symbol;
        updateValue(ui.currentPrice, currentPrice, false);
        updateColoredValue(ui.priceChange, changePercent, false, true);
    };

    // --- EVENTOS DE CONTROLE ---
    const sendControlAction = async (action) => {
        try {
            const response = await fetch('/api/system/control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
                },
                body: JSON.stringify({
                    action,
                    parameters: { goalType: ui.goalSelect.value }
                })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Falha ao enviar comando.');
            }
            addLog(`Comando '${action}' enviado com sucesso.`, 'success');
        } catch (error) {
            addLog(`Erro ao enviar comando '${action}': ${error.message}`, 'error');
        }
    };

    ui.btnStart.addEventListener('click', () => sendControlAction('start'));
    ui.btnPause.addEventListener('click', () => sendControlAction('pause'));
    ui.btnStop.addEventListener('click', () => sendControlAction('stop'));

    // --- EVENTOS DO SOCKET.IO ---
    socket.on('connect', () => addLog('Conectado ao servidor.', 'success'));
    socket.on('disconnect', () => addLog('Desconectado do servidor.', 'error'));

    socket.on('authenticated', () => {
        ui.loginModal.style.display = 'none';
        addLog('Autenticação bem-sucedida.', 'success');
    });

    socket.on('authentication_failed', (data) => {
        localStorage.removeItem('jwt_token');
        ui.loginModal.style.display = 'flex';
        addLog(`Falha na autenticação: ${data.error}`, 'error');
    });

    socket.on('system_status', updateSystemStatus);
    socket.on('market_data', updateChart);
    socket.on('new_trade', (trade) => addLog(`NOVO TRADE: ${trade.side} ${trade.quantity} de ${trade.symbol} @ ${trade.price.toFixed(2)}`, 'trade'));
    socket.on('trading_started', (data) => addLog(`Sistema iniciado com meta ${data.goals.type}. Operador: ${data.operator.type}.`, 'success'));
    socket.on('trading_stopped', () => addLog('Sistema parado.', 'info'));

    // --- INICIALIZAÇÃO ---
    initializeChart();
    addLog('Dashboard inicializado. Aguardando conexão...');
});