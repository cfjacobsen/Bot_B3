export interface Candle {
  id?: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  id?: string;
  timestamp: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  volume: number;
}

export interface MarketSnapshot {
  symbol: string | null;
  candles: Candle[];
  trades: Trade[];
  lastUpdate: string | null;
}

export interface IndicatorValue {
  value: number | null;
  status?: string;
  series?: number[];
  [key: string]: unknown;
}

export interface IndicatorSet {
  [key: string]: IndicatorValue | undefined;
}

export interface GoalSnapshot {
  targetDailyPnl: number;
  lossLimit: number;
  checkpoints: unknown[];
}

export interface RiskSnapshot {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  netExposure: number;
  avgPrice: number | null;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  reachedTarget: boolean;
  hitLossLimit: boolean;
  halted: boolean;
  goalSnapshot: GoalSnapshot;
  drawdown: number;
  peakPnl: number;
  lastUpdate: string | null;
}

export interface FixStatus {
  connected: boolean;
  simulate: boolean;
  lastHeartbeat: number | null;
  lastError: string | null;
  host?: string | null;
  port?: number | null;
  senderCompId?: string | null;
  targetCompId?: string | null;
}

export interface OrderExecution {
  id: string;
  timestamp: string;
  status: string;
  price: number | null;
  quantity: number | null;
  side: 'BUY' | 'SELL';
  simulated?: boolean;
}

export interface OrderSummary {
  id: string;
  clientOrderId: string;
  symbol: string | null;
  side: 'BUY' | 'SELL';
  type: string;
  quantity: number;
  price: number | null;
  status: string;
  createdAt: string;
  sentAt: string | null;
  executions: OrderExecution[];
  metadata?: Record<string, unknown>;
}

export interface StrategyStatus {
  symbol: string;
  defaultQuantity: number;
  lastSignal?: StrategySignal;
}

export interface StrategySignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  quantity?: number;
  symbol: string;
  timestamp: string;
  price?: number | null;
}

export interface AiConsensus {
  bias: string;
  confidence: number;
  rationale: string;
  keyLevels?: string[];
  recommendedAction: string;
  riskNotes?: string;
  context?: unknown;
  raw?: unknown;
}

export interface AiLlmState {
  enabled: boolean;
  provider: string | null;
  cached: boolean;
  timestamp: string | null;
  lastConsensus: AiConsensus | null;
  raw?: unknown;
}

export interface AiRlState {\n  confidence?: number | null;\n  value?: number | null;\n  reason?: string | null;
  enabled: boolean;
  lastAction: {
    action: string;
    quantity: number | null;
    confidence: number | null;
    value: number | null;
    reason: string | null;
  } | null;
  timestamp: string | null;
  raw?: unknown;
}

export interface AiState {
  llm: AiLlmState;
  rl: AiRlState;
}

export interface MetricsSummary {
  dailyPnl: number;
  trades: number;
  winRate: number;
  updatedAt: string;
  running: boolean;
  paused: boolean;
  lastMarketUpdate: string | null;
  ordersInQueue: number;
  risk: {
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    drawdown: number;
    reachedTarget: boolean;
    hitLossLimit: boolean;
  };
  ai?: AiState;
}

export interface SystemStatus {
  running: boolean;
  paused: boolean;
  lastStart: string | null;
  lastStop: string | null;
  meta: Record<string, unknown>;
  indicators: IndicatorSet;
  market: MarketSnapshot;
  fix: FixStatus;
  orders: OrderSummary[];
  risk: RiskSnapshot;
  strategy: StrategyStatus;
  ai: AiState;
}

export interface MarketResponse {
  symbol: string;
  candles: Candle[];
  lastUpdate: string | null;
}

export interface OrdersResponse {
  orders: OrderSummary[];
}

export interface DashboardData {
  status: SystemStatus | undefined;
  isLoading: boolean;
  refetch: () => void;
}
