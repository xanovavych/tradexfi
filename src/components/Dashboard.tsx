'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import CandleChart from '@/components/CandleChart';
import { useBinanceKlines } from '@/hooks/useBinanceKlines';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import useStore, {
  calculatePnl,
  SUPPORTED_SYMBOLS,
  type Position,
  type PositionSide,
  type SymbolKey,
} from '@/store/useStore';

const SYMBOL_META: Record<SymbolKey, { label: string; name: string }> = {
  BTCUSDT: { label: 'BTC', name: 'Bitcoin' },
  ETHUSDT: { label: 'ETH', name: 'Ethereum' },
  SOLUSDT: { label: 'SOL', name: 'Solana' },
  DOGEUSDT: { label: 'DOGE', name: 'Dogecoin' },
  ADAUSDT: { label: 'ADA', name: 'Cardano' },
};

const formatUsd = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatCoin = (value: number) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });

const formatPrice = (value?: number) => (value ? formatUsd(value) : '--');

const formatPriceInput = (value: number) => {
  if (!Number.isFinite(value)) return '';
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(6);
};

const getLiquidationPrice = (position: Position) => {
  const base = position.entryPrice;
  const move = base / position.leverage;
  return position.side === 'LONG' ? base - move : base + move;
};

type FlashState = Record<SymbolKey, 'up' | 'down' | null>;

const createFlashState = (): FlashState => ({
  BTCUSDT: null,
  ETHUSDT: null,
  SOLUSDT: null,
  DOGEUSDT: null,
  ADAUSDT: null,
});

export default function Dashboard() {
  const [activeSymbol, setActiveSymbol] = useState<SymbolKey>('BTCUSDT');
  const [side, setSide] = useState<PositionSide>('LONG');
  const [amountMode, setAmountMode] = useState<'MARGIN' | 'QTY'>('MARGIN');
  const [amount, setAmount] = useState('');
  const [leverage, setLeverage] = useState(10);
  const [stopLossInput, setStopLossInput] = useState('');
  const [takeProfitInput, setTakeProfitInput] = useState('');
  const [riskPercent, setRiskPercent] = useState(1);
  const [riskReward, setRiskReward] = useState(2);
  const [snapToCandle, setSnapToCandle] = useState(true);
  const [interval, setInterval] = useState<'1m' | '5m' | '30m' | '1h'>('1m');
  const [error, setError] = useState<string | null>(null);
  const [flashState, setFlashState] = useState<FlashState>(createFlashState());

  const balance = useStore((state) => state.balance);
  const positions = useStore((state) => state.positions);
  const transactions = useStore((state) => state.transactions);
  const openPosition = useStore((state) => state.openPosition);
  const closePosition = useStore((state) => state.closePosition);
  const updateRisk = useStore((state) => state.updateRisk);
  const resetAccount = useStore((state) => state.resetAccount);

  const prices = useBinanceWebSocket(SUPPORTED_SYMBOLS);
  const { candles, certError } = useBinanceKlines(activeSymbol, interval);

  const priceLookup = useMemo(
    () =>
      SUPPORTED_SYMBOLS.reduce(
        (acc, symbol) => {
          acc[symbol] = prices[symbol];
          return acc;
        },
        {} as Record<SymbolKey, number | undefined>,
      ),
    [prices],
  );

  const previousPrices = useRef<Record<SymbolKey, number | undefined>>({
    BTCUSDT: undefined,
    ETHUSDT: undefined,
    SOLUSDT: undefined,
    DOGEUSDT: undefined,
    ADAUSDT: undefined,
  });

  const flashTimeouts = useRef<
    Record<SymbolKey, ReturnType<typeof setTimeout> | null>
  >({
    BTCUSDT: null,
    ETHUSDT: null,
    SOLUSDT: null,
    DOGEUSDT: null,
    ADAUSDT: null,
  });

  useEffect(() => {
    SUPPORTED_SYMBOLS.forEach((symbol) => {
      const latest = priceLookup[symbol];
      const previous = previousPrices.current[symbol];
      if (latest && previous && latest !== previous) {
        const direction = latest > previous ? 'up' : 'down';
        setFlashState((current) => ({
          ...current,
          [symbol]: direction,
        }));
        if (flashTimeouts.current[symbol]) {
          clearTimeout(flashTimeouts.current[symbol]);
        }
        flashTimeouts.current[symbol] = setTimeout(() => {
          setFlashState((current) => ({
            ...current,
            [symbol]: null,
          }));
        }, 450);
      }
      if (latest) {
        previousPrices.current[symbol] = latest;
      }
    });

    return () => {
      SUPPORTED_SYMBOLS.forEach((symbol) => {
        if (flashTimeouts.current[symbol]) {
          clearTimeout(flashTimeouts.current[symbol]);
        }
      });
    };
  }, [priceLookup]);

  const { equity, totalPnl, usedMargin } = useMemo(() => {
    let pnlTotal = 0;
    let marginTotal = 0;
    SUPPORTED_SYMBOLS.forEach((symbol) => {
      const position = positions[symbol];
      const price = priceLookup[symbol] ?? 0;
      if (!position || !price) return;
      pnlTotal += calculatePnl(position, price);
      marginTotal += position.margin;
    });
    return {
      equity: balance + marginTotal + pnlTotal,
      totalPnl: pnlTotal,
      usedMargin: marginTotal,
    };
  }, [balance, positions, priceLookup]);

  useEffect(() => {
    setError(null);
  }, [
    activeSymbol,
    side,
    amountMode,
    amount,
    leverage,
    stopLossInput,
    takeProfitInput,
  ]);

  useEffect(() => {
    const position = positions[activeSymbol];
    if (position) {
      setSide(position.side);
      setLeverage(position.leverage);
      setStopLossInput(position.stopLoss ? String(position.stopLoss) : '');
      setTakeProfitInput(
        position.takeProfit ? String(position.takeProfit) : '',
      );
    } else {
      setStopLossInput('');
      setTakeProfitInput('');
    }
    setAmount('');
  }, [activeSymbol, positions]);

  useEffect(() => {
    SUPPORTED_SYMBOLS.forEach((symbol) => {
      const position = positions[symbol];
      const price = priceLookup[symbol];
      if (!position || !price) return;

      const liquidation = getLiquidationPrice(position);
      if (position.side === 'LONG') {
        if (position.stopLoss && price <= position.stopLoss) {
          closePosition({ symbol, price, reason: 'STOP_LOSS' });
          return;
        }
        if (position.takeProfit && price >= position.takeProfit) {
          closePosition({ symbol, price, reason: 'TAKE_PROFIT' });
          return;
        }
        if (price <= liquidation) {
          closePosition({ symbol, price, reason: 'LIQUIDATION' });
        }
      } else {
        if (position.stopLoss && price >= position.stopLoss) {
          closePosition({ symbol, price, reason: 'STOP_LOSS' });
          return;
        }
        if (position.takeProfit && price <= position.takeProfit) {
          closePosition({ symbol, price, reason: 'TAKE_PROFIT' });
          return;
        }
        if (price >= liquidation) {
          closePosition({ symbol, price, reason: 'LIQUIDATION' });
        }
      }
    });
  }, [positions, priceLookup, closePosition]);

  const activePrice = priceLookup[activeSymbol] ?? 0;
  const activePosition = positions[activeSymbol];
  const anchorPrice = activePosition?.entryPrice ?? activePrice;
  const activePnl = useMemo(() => {
    if (!activePosition || !activePrice) return 0;
    return calculatePnl(activePosition, activePrice);
  }, [activePosition, activePrice]);
  const parsedAmount = Number.parseFloat(amount);
  const parsedStopLoss = Number.parseFloat(stopLossInput);
  const parsedTakeProfit = Number.parseFloat(takeProfitInput);

  const { quantity, margin, notional } = useMemo(() => {
    if (!activePrice || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return { quantity: 0, margin: 0, notional: 0 };
    }

    if (amountMode === 'MARGIN') {
      const qty = (parsedAmount * leverage) / activePrice;
      return {
        quantity: qty,
        margin: parsedAmount,
        notional: qty * activePrice,
      };
    }

    const marginValue = (parsedAmount * activePrice) / leverage;
    return {
      quantity: parsedAmount,
      margin: marginValue,
      notional: parsedAmount * activePrice,
    };
  }, [activePrice, amountMode, leverage, parsedAmount]);

  const submitTrade = () => {
    if (!activePrice) {
      setError('Live price unavailable.');
      return;
    }
    if (!quantity || !margin) {
      setError('Enter a valid amount.');
      return;
    }
    if (margin > balance) {
      setError('Insufficient Funds');
      return;
    }
    if (activePosition) {
      setError('Close the existing position first.');
      return;
    }

    if (
      stopLossInput &&
      (!Number.isFinite(parsedStopLoss) || parsedStopLoss <= 0)
    ) {
      setError('Stop-loss must be a valid price.');
      return;
    }
    if (
      takeProfitInput &&
      (!Number.isFinite(parsedTakeProfit) || parsedTakeProfit <= 0)
    ) {
      setError('Take-profit must be a valid price.');
      return;
    }

    const stopLoss = Number.isFinite(parsedStopLoss)
      ? parsedStopLoss
      : undefined;
    const takeProfit = Number.isFinite(parsedTakeProfit)
      ? parsedTakeProfit
      : undefined;

    const result = openPosition({
      symbol: activeSymbol,
      side,
      margin,
      leverage,
      price: activePrice,
      stopLoss,
      takeProfit,
    });

    if (!result.success) {
      setError(result.error ?? 'Trade failed.');
      return;
    }

    setAmount('');
  };

  const handleUpdateRisk = () => {
    if (
      stopLossInput &&
      (!Number.isFinite(parsedStopLoss) || parsedStopLoss <= 0)
    ) {
      setError('Stop-loss must be a valid price.');
      return;
    }
    if (
      takeProfitInput &&
      (!Number.isFinite(parsedTakeProfit) || parsedTakeProfit <= 0)
    ) {
      setError('Take-profit must be a valid price.');
      return;
    }

    const stopLoss = stopLossInput ? parsedStopLoss : undefined;
    const takeProfit = takeProfitInput ? parsedTakeProfit : undefined;
    updateRisk({ symbol: activeSymbol, stopLoss, takeProfit });
  };

  const snapToNearestCandle = (price: number) => {
    if (!snapToCandle || !candles.length) return price;
    let closest = price;
    let minDiff = Number.POSITIVE_INFINITY;
    candles.forEach((candle) => {
      const diffHigh = Math.abs(candle.high - price);
      if (diffHigh < minDiff) {
        minDiff = diffHigh;
        closest = candle.high;
      }
      const diffLow = Math.abs(candle.low - price);
      if (diffLow < minDiff) {
        minDiff = diffLow;
        closest = candle.low;
      }
    });
    return closest;
  };

  const applyRiskPreset = (nextRisk: number, nextReward = riskReward) => {
    if (!anchorPrice) return;
    const risk = nextRisk / 100;
    const reward = nextReward;
    const stopLoss =
      side === 'LONG' ? anchorPrice * (1 - risk) : anchorPrice * (1 + risk);
    const takeProfit =
      side === 'LONG'
        ? anchorPrice * (1 + risk * reward)
        : anchorPrice * (1 - risk * reward);

    setRiskPercent(nextRisk);
    setRiskReward(nextReward);
    setStopLossInput(formatPriceInput(snapToNearestCandle(stopLoss)));
    setTakeProfitInput(formatPriceInput(snapToNearestCandle(takeProfit)));
  };

  const handleStopLossFromChart = (price: number) => {
    setStopLossInput(formatPriceInput(snapToNearestCandle(price)));
  };

  const handleTakeProfitFromChart = (price: number) => {
    setTakeProfitInput(formatPriceInput(snapToNearestCandle(price)));
  };

  const snapInputsToCandle = () => {
    if (stopLossInput) {
      const sl = Number.parseFloat(stopLossInput);
      if (Number.isFinite(sl)) {
        setStopLossInput(formatPriceInput(snapToNearestCandle(sl)));
      }
    }
    if (takeProfitInput) {
      const tp = Number.parseFloat(takeProfitInput);
      if (Number.isFinite(tp)) {
        setTakeProfitInput(formatPriceInput(snapToNearestCandle(tp)));
      }
    }
  };

  return (
    <div className='relative min-h-screen overflow-hidden bg-slate-950 text-slate-100'>
      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_circle_at_15%_10%,rgba(16,185,129,0.18),transparent_50%),radial-gradient(900px_circle_at_85%_20%,rgba(56,189,248,0.12),transparent_45%),linear-gradient(135deg,#0b1220,#05070d)]' />
      <div className='relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:px-8'>
        <header className='flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.55)]'>
          <div className='flex items-center gap-3'>
            <div className='flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400'>
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className='text-2xl font-semibold text-slate-50'>TRADEXFI</h1>
              <p className='text-xs uppercase tracking-[0.35em] text-emerald-300/70'>
                Crypto Perps Paper Trading
              </p>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-3 text-sm'>
            <div className='rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-emerald-200'>
              Equity {formatUsd(equity)}
            </div>
            <div className='rounded-full border border-slate-700 bg-slate-900/80 px-4 py-2 text-slate-300'>
              Used Margin {formatUsd(usedMargin)}
            </div>
            <button
              type='button'
              onClick={resetAccount}
              className='flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-4 py-2 text-slate-200 transition hover:border-slate-500 hover:text-white'
            >
              <RefreshCcw size={16} />
              Reset Account
            </button>
          </div>
        </header>

        <section className='grid gap-6 lg:grid-cols-[1.3fr_0.7fr]'>
          <div className='flex flex-col gap-6'>
            {certError ? (
              <div className='rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200'>
                Market data blocked by your network. Try Edge or Brave.
              </div>
            ) : null}
            <CandleChart
              symbol={activeSymbol}
              symbolLabel={`${SYMBOL_META[activeSymbol].label}/USDT`}
              candles={candles}
              interval={interval}
              onIntervalChange={setInterval}
              unrealizedPnl={activePnl}
              stopLoss={
                stopLossInput ? Number.parseFloat(stopLossInput) : undefined
              }
              takeProfit={
                takeProfitInput ? Number.parseFloat(takeProfitInput) : undefined
              }
              onStopLossChange={handleStopLossFromChart}
              onTakeProfitChange={handleTakeProfitFromChart}
            />
            <MarketView
              activeSymbol={activeSymbol}
              flashState={flashState}
              positions={positions}
              prices={priceLookup}
              onSelect={setActiveSymbol}
            />
          </div>
          <div className='flex flex-col gap-6'>
            <TradeWidget
              activeSymbol={activeSymbol}
              amount={amount}
              amountMode={amountMode}
              balance={balance}
              error={error}
              leverage={leverage}
              margin={margin}
              notional={notional}
              onApplyRiskPreset={applyRiskPreset}
              onAmountChange={setAmount}
              onAmountModeChange={setAmountMode}
              onClose={(symbol) =>
                closePosition({
                  symbol,
                  price: priceLookup[symbol] ?? 0,
                  reason: 'MANUAL',
                })
              }
              onLeverageChange={setLeverage}
              onSelectSymbol={setActiveSymbol}
              onSideChange={setSide}
              onSubmit={submitTrade}
              onUpdateRisk={handleUpdateRisk}
              price={activePrice}
              quantity={quantity}
              side={side}
              stopLossInput={stopLossInput}
              takeProfitInput={takeProfitInput}
              onStopLossChange={setStopLossInput}
              onTakeProfitChange={setTakeProfitInput}
              riskPercent={riskPercent}
              riskReward={riskReward}
              onRiskPercentChange={setRiskPercent}
              onRiskRewardChange={setRiskReward}
              snapToCandle={snapToCandle}
              onSnapToggle={setSnapToCandle}
              onSnapInputs={snapInputsToCandle}
              anchorPrice={anchorPrice}
              positions={positions}
            />
            <PortfolioSummary
              balance={balance}
              positions={positions}
              prices={priceLookup}
              totalPnl={totalPnl}
            />
          </div>
        </section>
        <HistoryLog transactions={transactions} />
      </div>
    </div>
  );
}

type MarketViewProps = {
  activeSymbol: SymbolKey;
  prices: Record<SymbolKey, number | undefined>;
  flashState: FlashState;
  positions: Record<SymbolKey, Position | null>;
  onSelect: (symbol: SymbolKey) => void;
};

const MarketView = ({
  activeSymbol,
  prices,
  flashState,
  positions,
  onSelect,
}: MarketViewProps) => {
  return (
    <div className='rounded-2xl border border-slate-800 bg-slate-950/70 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <p className='text-xs uppercase tracking-[0.3em] text-slate-400'>
            Market View
          </p>
          <h2 className='text-lg font-semibold text-slate-100'>
            Perp Watchlist
          </h2>
        </div>
        {/* <div className="text-xs text-slate-400">Binance WebSocket</div> */}
      </div>
      <div className='mt-5 overflow-hidden rounded-xl border border-slate-800'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-900/70 text-xs uppercase tracking-[0.2em] text-slate-500'>
            <tr>
              <th className='px-4 py-3 text-left'>Asset</th>
              <th className='px-4 py-3 text-right'>Last Price</th>
              <th className='px-4 py-3 text-right'>Position</th>
            </tr>
          </thead>
          <tbody>
            {SUPPORTED_SYMBOLS.map((symbol) => {
              const flash = flashState[symbol];
              const isActive = symbol === activeSymbol;
              const position = positions[symbol];
              const flashClass =
                flash === 'up'
                  ? 'bg-emerald-500/10 text-emerald-200'
                  : flash === 'down'
                    ? 'bg-rose-500/10 text-rose-200'
                    : '';
              return (
                <tr
                  key={symbol}
                  onClick={() => onSelect(symbol)}
                  className={`cursor-pointer border-t border-slate-800 transition-colors hover:bg-slate-900/60 ${
                    isActive ? 'bg-slate-900/70' : ''
                  } ${flashClass}`}
                >
                  <td className='px-4 py-4'>
                    <div className='flex items-center gap-3'>
                      <div
                        className={`h-10 w-10 rounded-xl border border-slate-800 bg-slate-900/80 text-center text-xs font-semibold leading-10 ${
                          isActive ? 'text-emerald-200' : 'text-slate-300'
                        }`}
                      >
                        {SYMBOL_META[symbol].label}
                      </div>
                      <div>
                        <p className='text-sm font-semibold text-slate-100'>
                          {SYMBOL_META[symbol].label}/USDT
                        </p>
                        <p className='text-xs text-slate-500'>
                          {SYMBOL_META[symbol].name}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className='px-4 py-4 text-right font-semibold'>
                    {formatPrice(prices[symbol])}
                  </td>
                  <td className='px-4 py-4 text-right text-slate-400'>
                    {position ? (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          position.side === 'LONG'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : 'bg-rose-500/20 text-rose-200'
                        }`}
                      >
                        {position.side} {formatCoin(position.quantity)}
                      </span>
                    ) : (
                      '--'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

type TradeWidgetProps = {
  activeSymbol: SymbolKey;
  amount: string;
  amountMode: 'MARGIN' | 'QTY';
  balance: number;
  error: string | null;
  leverage: number;
  margin: number;
  notional: number;
  onApplyRiskPreset: (risk: number, reward?: number) => void;
  onAmountChange: (value: string) => void;
  onAmountModeChange: (value: 'MARGIN' | 'QTY') => void;
  onClose: (symbol: SymbolKey) => void;
  onLeverageChange: (value: number) => void;
  onSelectSymbol: (symbol: SymbolKey) => void;
  onSideChange: (value: PositionSide) => void;
  onSubmit: () => void;
  onUpdateRisk: () => void;
  price: number;
  quantity: number;
  side: PositionSide;
  stopLossInput: string;
  takeProfitInput: string;
  onStopLossChange: (value: string) => void;
  onTakeProfitChange: (value: string) => void;
  riskPercent: number;
  riskReward: number;
  onRiskPercentChange: (value: number) => void;
  onRiskRewardChange: (value: number) => void;
  snapToCandle: boolean;
  onSnapToggle: (value: boolean) => void;
  onSnapInputs: () => void;
  anchorPrice: number;
  positions: Record<SymbolKey, Position | null>;
};

const TradeWidget = ({
  activeSymbol,
  amount,
  amountMode,
  balance,
  error,
  leverage,
  margin,
  notional,
  onApplyRiskPreset,
  onAmountChange,
  onAmountModeChange,
  onClose,
  onLeverageChange,
  onSelectSymbol,
  onSideChange,
  onSubmit,
  onUpdateRisk,
  price,
  quantity,
  side,
  stopLossInput,
  takeProfitInput,
  onStopLossChange,
  onTakeProfitChange,
  riskPercent,
  riskReward,
  onRiskPercentChange,
  onRiskRewardChange,
  snapToCandle,
  onSnapToggle,
  onSnapInputs,
  anchorPrice,
  positions,
}: TradeWidgetProps) => {
  const insufficientFunds = margin > balance;
  const isDisabled = !quantity || !margin || !price || insufficientFunds;
  const canClose = Boolean(price);
  const position = positions[activeSymbol];

  return (
    <div className='rounded-2xl border border-slate-800 bg-slate-950/70 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <p className='text-xs uppercase tracking-[0.3em] text-slate-400'>
            Trade Widget
          </p>
          <h2 className='text-lg font-semibold text-slate-100'>Perp Order</h2>
        </div>
        <div className='flex gap-2'>
          <button
            type='button'
            onClick={() => onSideChange('LONG')}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              side === 'LONG'
                ? 'bg-emerald-500 text-emerald-950'
                : 'border border-slate-700 text-slate-300 hover:border-emerald-500/50'
            }`}
          >
            Long
          </button>
          <button
            type='button'
            onClick={() => onSideChange('SHORT')}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              side === 'SHORT'
                ? 'bg-rose-500 text-rose-950'
                : 'border border-slate-700 text-slate-300 hover:border-rose-500/50'
            }`}
          >
            Short
          </button>
        </div>
      </div>

      <div className='mt-5 grid gap-4'>
        <div>
          <label className='text-xs uppercase tracking-[0.2em] text-slate-500'>
            Amount
          </label>
          <div className='mt-2 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2'>
            <input
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder={amountMode === 'MARGIN' ? '0.00' : '0.000000'}
              className='w-full bg-transparent text-sm text-slate-100 outline-none'
            />
            <div className='flex rounded-full border border-slate-700 bg-slate-900/90 p-1 text-xs'>
              <button
                type='button'
                onClick={() => onAmountModeChange('MARGIN')}
                className={`rounded-full px-3 py-1 transition ${
                  amountMode === 'MARGIN'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-400'
                }`}
              >
                Margin
              </button>
              <button
                type='button'
                onClick={() => onAmountModeChange('QTY')}
                className={`rounded-full px-3 py-1 transition ${
                  amountMode === 'QTY'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-400'
                }`}
              >
                Qty
              </button>
            </div>
          </div>
          <div className='mt-2 flex justify-between text-xs text-slate-500'>
            <span>Live Price</span>
            <span>{formatPrice(price)}</span>
          </div>
        </div>

        <div className='grid gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-4'>
          <div className='flex items-center gap-2 text-xs text-slate-400'>
            <ShieldCheck size={14} />
            <span>Risk Controls</span>
          </div>
          <div className='grid gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3'>
            <div className='flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-500'>
              <span>Risk Presets</span>
              <span>Anchor {formatPrice(anchorPrice)}</span>
            </div>
            <div className='flex flex-wrap gap-2 text-xs'>
              {[0.5, 1, 2].map((value) => (
                <button
                  key={value}
                  type='button'
                  onClick={() => onApplyRiskPreset(value, riskReward)}
                  className={`rounded-full border px-3 py-1 transition ${
                    riskPercent === value
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                      : 'border-slate-700 text-slate-300 hover:border-emerald-500/40'
                  }`}
                >
                  {value}%
                </button>
              ))}
            </div>
            <div className='flex flex-wrap items-center gap-2 text-xs'>
              {[1.5, 2, 3].map((value) => (
                <button
                  key={value}
                  type='button'
                  onClick={() => onApplyRiskPreset(riskPercent, value)}
                  className={`rounded-full border px-3 py-1 transition ${
                    riskReward === value
                      ? 'border-sky-400/60 bg-sky-400/10 text-sky-200'
                      : 'border-slate-700 text-slate-300 hover:border-sky-400/40'
                  }`}
                >
                  {value}R
                </button>
              ))}
              <button
                type='button'
                onClick={() => onApplyRiskPreset(riskPercent, riskReward)}
                className='rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-400'
              >
                Apply
              </button>
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <input
                type='number'
                min={0.1}
                step={0.1}
                value={riskPercent}
                onChange={(event) =>
                  onRiskPercentChange(Number(event.target.value))
                }
                className='w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-200'
                placeholder='Risk %'
              />
              <input
                type='number'
                min={0.5}
                step={0.5}
                value={riskReward}
                onChange={(event) =>
                  onRiskRewardChange(Number(event.target.value))
                }
                className='w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-200'
                placeholder='R:R'
              />
            </div>
            <div className='flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300'>
              <label className='flex items-center gap-2'>
                <input
                  type='checkbox'
                  checked={snapToCandle}
                  onChange={(event) => onSnapToggle(event.target.checked)}
                />
                Snap SL/TP to candle
              </label>
              <button
                type='button'
                onClick={onSnapInputs}
                className='rounded-full border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300'
              >
                Snap Now
              </button>
            </div>
          </div>
          <div className='grid gap-2'>
            <input
              value={stopLossInput}
              onChange={(event) => onStopLossChange(event.target.value)}
              placeholder='Stop-loss price'
              className='w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-200'
            />
            <input
              value={takeProfitInput}
              onChange={(event) => onTakeProfitChange(event.target.value)}
              placeholder='Take-profit price'
              className='w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-200'
            />
          </div>
        </div>

        <div>
          <label className='text-xs uppercase tracking-[0.2em] text-slate-500'>
            Asset
          </label>
          <select
            value={activeSymbol}
            onChange={(event) =>
              onSelectSymbol(event.target.value as SymbolKey)
            }
            className='mt-2 w-full rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-200'
          >
            {SUPPORTED_SYMBOLS.map((symbol) => (
              <option key={symbol} value={symbol}>
                {SYMBOL_META[symbol].label}/USDT
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className='text-xs uppercase tracking-[0.2em] text-slate-500'>
            Leverage
          </label>
          <div className='mt-2 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3'>
            <input
              type='range'
              min={1}
              max={50}
              value={leverage}
              onChange={(event) =>
                onLeverageChange(Number.parseInt(event.target.value, 10))
              }
              className='w-full'
            />
            <div className='rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs text-slate-100'>
              {leverage}x
            </div>
          </div>
        </div>

        <div className='rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs text-slate-400'>
          <div className='flex items-center justify-between'>
            <span>Est. Quantity</span>
            <span>{formatCoin(quantity)}</span>
          </div>
          <div className='mt-2 flex items-center justify-between'>
            <span>Est. Margin</span>
            <span>{formatUsd(margin)}</span>
          </div>
          <div className='mt-2 flex items-center justify-between'>
            <span>Notional</span>
            <span>{formatUsd(notional)}</span>
          </div>
        </div>

        {(error || insufficientFunds) && (
          <div className='rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200'>
            {error ?? 'Insufficient Funds'}
          </div>
        )}

        {!position && (
          <button
            type='button'
            onClick={onSubmit}
            disabled={isDisabled}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              side === 'LONG'
                ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                : 'bg-rose-500 text-rose-950 hover:bg-rose-400'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {side === 'LONG' ? (
              <ArrowUpRight size={16} />
            ) : (
              <ArrowDownRight size={16} />
            )}
            {side === 'LONG' ? 'Open Long' : 'Open Short'}
          </button>
        )}

        {position && (
          <div className='grid gap-3'>
            <button
              type='button'
              onClick={onUpdateRisk}
              className='rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-emerald-500/50'
            >
              Update SL / TP
            </button>
            <button
              type='button'
              onClick={() => onClose(activeSymbol)}
              disabled={!canClose}
              className='rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-60'
            >
              Close Position
            </button>
          </div>
        )}

        <div className='grid gap-2 text-xs text-slate-500'>
          <div className='flex justify-between'>
            <span>Available USD</span>
            <span>{formatUsd(balance)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

type PortfolioSummaryProps = {
  balance: number;
  positions: Record<SymbolKey, Position | null>;
  prices: Record<SymbolKey, number | undefined>;
  totalPnl: number;
};

const PortfolioSummary = ({
  balance,
  positions,
  prices,
  totalPnl,
}: PortfolioSummaryProps) => {
  return (
    <div className='rounded-2xl border border-slate-800 bg-slate-950/70 p-6'>
      <div>
        <p className='text-xs uppercase tracking-[0.3em] text-slate-400'>
          Portfolio
        </p>
        <h2 className='text-lg font-semibold text-slate-100'>Positions</h2>
      </div>
      <div className='mt-4 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3'>
        <div className='text-xs uppercase tracking-[0.2em] text-slate-500'>
          Cash Balance
        </div>
        <div className='mt-1 text-2xl font-semibold text-slate-50'>
          {formatUsd(balance)}
        </div>
      </div>
      <div className='mt-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3'>
        <div className='text-xs uppercase tracking-[0.2em] text-slate-500'>
          Unrealized PnL
        </div>
        <div
          className={`mt-1 text-xl font-semibold ${
            totalPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'
          }`}
        >
          {formatUsd(totalPnl)}
        </div>
      </div>
      <div className='mt-4 grid gap-3'>
        {SUPPORTED_SYMBOLS.map((symbol) => {
          const position = positions[symbol];
          const price = prices[symbol] ?? 0;
          if (!position) {
            return (
              <div
                key={symbol}
                className='flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3'
              >
                <div className='text-xs uppercase tracking-[0.2em] text-slate-500'>
                  {SYMBOL_META[symbol].label}
                </div>
                <div className='text-xs text-slate-500'>No position</div>
              </div>
            );
          }

          const pnl = price ? calculatePnl(position, price) : 0;
          const liquidation = getLiquidationPrice(position);
          return (
            <div
              key={symbol}
              className='rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3'
            >
              <div className='flex items-center justify-between'>
                <div className='text-xs uppercase tracking-[0.2em] text-slate-500'>
                  {SYMBOL_META[symbol].label} {position.side}
                </div>
                <div
                  className={`text-xs font-semibold ${
                    position.side === 'LONG'
                      ? 'text-emerald-300'
                      : 'text-rose-300'
                  }`}
                >
                  {position.leverage}x
                </div>
              </div>
              <div className='mt-2 grid gap-2 text-xs text-slate-300'>
                <div className='flex justify-between'>
                  <span>Entry</span>
                  <span>{formatUsd(position.entryPrice)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Size</span>
                  <span>{formatCoin(position.quantity)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Margin</span>
                  <span>{formatUsd(position.margin)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Unrealized</span>
                  <span
                    className={pnl >= 0 ? 'text-emerald-200' : 'text-rose-200'}
                  >
                    {formatUsd(pnl)}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span>Liquidation</span>
                  <span className='text-amber-200'>
                    {formatUsd(liquidation)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

type HistoryLogProps = {
  transactions: ReturnType<typeof useStore.getState>['transactions'];
};

const HistoryLog = ({ transactions }: HistoryLogProps) => {
  return (
    <div className='rounded-2xl border border-slate-800 bg-slate-950/70 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <p className='text-xs uppercase tracking-[0.3em] text-slate-400'>
            History Log
          </p>
          <h2 className='text-lg font-semibold text-slate-100'>
            Recent Trades
          </h2>
        </div>
        <div className='text-xs text-slate-500'>
          {transactions.length} total
        </div>
      </div>
      <div className='mt-5 overflow-hidden rounded-xl border border-slate-800'>
        <table className='w-full text-sm'>
          <thead className='bg-slate-900/70 text-xs uppercase tracking-[0.2em] text-slate-500'>
            <tr>
              <th className='px-4 py-3 text-left'>Type</th>
              <th className='px-4 py-3 text-left'>Coin</th>
              <th className='px-4 py-3 text-right'>Price</th>
              <th className='px-4 py-3 text-right'>Qty</th>
              <th className='px-4 py-3 text-right'>PnL</th>
              <th className='px-4 py-3 text-right'>Reason</th>
              <th className='px-4 py-3 text-right'>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className='border-t border-slate-800 px-4 py-6 text-center text-sm text-slate-500'
                >
                  No trades yet. Open a position to populate the log.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className='border-t border-slate-800'>
                  <td className='px-4 py-3'>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        tx.type === 'OPEN_LONG'
                          ? 'bg-emerald-500/15 text-emerald-200'
                          : tx.type === 'OPEN_SHORT'
                            ? 'bg-rose-500/15 text-rose-200'
                            : 'bg-slate-500/20 text-slate-200'
                      }`}
                    >
                      {tx.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-slate-200'>
                    {SYMBOL_META[tx.symbol].label}/USDT
                  </td>
                  <td className='px-4 py-3 text-right text-slate-200'>
                    {formatUsd(tx.price)}
                  </td>
                  <td className='px-4 py-3 text-right text-slate-200'>
                    {formatCoin(tx.quantity)}
                  </td>
                  <td className='px-4 py-3 text-right text-xs text-slate-400'>
                    {typeof tx.pnl === 'number' ? formatUsd(tx.pnl) : '--'}
                  </td>
                  <td className='px-4 py-3 text-right text-xs text-slate-400'>
                    {tx.reason ?? '--'}
                  </td>
                  <td className='px-4 py-3 text-right text-xs text-slate-400'>
                    {new Date(tx.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
