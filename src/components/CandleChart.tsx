"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { Candle } from "@/hooks/useBinanceKlines";

type CandleChartProps = {
  symbol: string;
  symbolLabel: string;
  candles: Candle[];
  interval: "1m" | "5m" | "30m" | "1h";
  onIntervalChange: (interval: "1m" | "5m" | "30m" | "1h") => void;
  unrealizedPnl?: number;
  stopLoss?: number;
  takeProfit?: number;
  onStopLossChange?: (price: number) => void;
  onTakeProfitChange?: (price: number) => void;
};

type MaConfig = {
  enabled: boolean;
  period: number;
};

type MaSettings = {
  sma: MaConfig;
  ema: MaConfig;
  vwma: MaConfig;
  hma: MaConfig;
};

type ChartTime = Candle["time"];

const DEFAULT_MA_SETTINGS: MaSettings = {
  sma: { enabled: true, period: 20 },
  ema: { enabled: true, period: 20 },
  vwma: { enabled: false, period: 20 },
  hma: { enabled: false, period: 55 },
};

export default function CandleChart({
  symbol,
  symbolLabel,
  candles,
  interval,
  onIntervalChange,
  unrealizedPnl = 0,
  stopLoss,
  takeProfit,
  onStopLossChange,
  onTakeProfitChange,
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const slLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(
    null
  );
  const tpLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(
    null
  );
  const maSeriesRef = useRef<
    Record<keyof MaSettings, ISeriesApi<"Line"> | null>
  >({
    sma: null,
    ema: null,
    vwma: null,
    hma: null,
  });
  const hasFitRef = useRef(false);
  const dragState = useRef<"sl" | "tp" | null>(null);

  const [maSettings, setMaSettings] = useState<MaSettings>(DEFAULT_MA_SETTINGS);

  const formatUsd = (value: number) =>
    value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const chartData = useMemo(
    () =>
      candles.map((candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [candles]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0f17" },
        textColor: "#94a3b8",
        fontFamily: "var(--font-sans)",
      },
      grid: {
        vertLines: { color: "rgba(30,41,59,0.5)" },
        horzLines: { color: "rgba(30,41,59,0.5)" },
      },
      rightPriceScale: {
        borderColor: "rgba(30,41,59,0.8)",
      },
      timeScale: {
        borderColor: "rgba(30,41,59,0.8)",
      },
      crosshair: {
        mode: 0,
      },
      height: 360,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
      borderVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({
          width: entry.contentRect.width,
          height: 360,
        });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!symbol) return;
    const stored = localStorage.getItem(`ma-settings-${symbol}`);
    if (!stored) {
      setMaSettings(DEFAULT_MA_SETTINGS);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as MaSettings;
      setMaSettings({
        sma: { ...DEFAULT_MA_SETTINGS.sma, ...parsed.sma },
        ema: { ...DEFAULT_MA_SETTINGS.ema, ...parsed.ema },
        vwma: { ...DEFAULT_MA_SETTINGS.vwma, ...parsed.vwma },
        hma: { ...DEFAULT_MA_SETTINGS.hma, ...parsed.hma },
      });
    } catch {
      setMaSettings(DEFAULT_MA_SETTINGS);
    }
  }, [symbol]);

  useEffect(() => {
    hasFitRef.current = false;
    const chart = chartRef.current;
    if (!chart) return;
    chart.timeScale().resetTimeScale();
    chart.applyOptions({
      timeScale: {
        barSpacing: interval === "1m" ? 12 : 8,
      },
    });
  }, [symbol, interval]);

  useEffect(() => {
    if (!symbol) return;
    localStorage.setItem(`ma-settings-${symbol}`, JSON.stringify(maSettings));
  }, [symbol, maSettings]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (!chartData.length) return;
    seriesRef.current.setData(chartData);
    const chart = chartRef.current;
    if (!chart) return;
    if (!hasFitRef.current) {
      chart.timeScale().fitContent();
      hasFitRef.current = true;
      return;
    }
    chart.timeScale().scrollToRealTime();
  }, [chartData]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (stopLoss && stopLoss > 0) {
      if (!slLineRef.current) {
        slLineRef.current = seriesRef.current.createPriceLine({
          price: stopLoss,
          color: "#f43f5e",
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "SL",
        });
      } else {
        slLineRef.current.applyOptions({ price: stopLoss });
      }
    } else if (slLineRef.current) {
      seriesRef.current.removePriceLine(slLineRef.current);
      slLineRef.current = null;
    }
  }, [stopLoss]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (takeProfit && takeProfit > 0) {
      if (!tpLineRef.current) {
        tpLineRef.current = seriesRef.current.createPriceLine({
          price: takeProfit,
          color: "#10b981",
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "TP",
        });
      } else {
        tpLineRef.current.applyOptions({ price: takeProfit });
      }
    } else if (tpLineRef.current) {
      seriesRef.current.removePriceLine(tpLineRef.current);
      tpLineRef.current = null;
    }
  }, [takeProfit]);

  const computeSma = (data: Candle[], period: number) => {
    const result: { time: ChartTime; value: number }[] = [];
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      sum += data[i].close;
      if (i >= period) {
        sum -= data[i - period].close;
      }
      if (i >= period - 1) {
        result.push({ time: data[i].time, value: sum / period });
      }
    }
    return result;
  };

  const computeEma = (data: Candle[], period: number) => {
    const result: { time: ChartTime; value: number }[] = [];
    const multiplier = 2 / (period + 1);
    let ema = 0;
    for (let i = 0; i < data.length; i += 1) {
      const close = data[i].close;
      if (i === 0) {
        ema = close;
      } else {
        ema = close * multiplier + ema * (1 - multiplier);
      }
      if (i >= period - 1) {
        result.push({ time: data[i].time, value: ema });
      }
    }
    return result;
  };

  const computeVwma = (data: Candle[], period: number) => {
    const result: { time: ChartTime; value: number }[] = [];
    let sumPV = 0;
    let sumV = 0;
    for (let i = 0; i < data.length; i += 1) {
      sumPV += data[i].close * data[i].volume;
      sumV += data[i].volume;
      if (i >= period) {
        sumPV -= data[i - period].close * data[i - period].volume;
        sumV -= data[i - period].volume;
      }
      if (i >= period - 1 && sumV) {
        result.push({ time: data[i].time, value: sumPV / sumV });
      }
    }
    return result;
  };

  const computeWma = (data: number[], period: number) => {
    const result: number[] = [];
    const denominator = (period * (period + 1)) / 2;
    for (let i = 0; i < data.length; i += 1) {
      if (i < period - 1) {
        result.push(Number.NaN);
        continue;
      }
      let weighted = 0;
      for (let p = 0; p < period; p += 1) {
        weighted += data[i - p] * (period - p);
      }
      result.push(weighted / denominator);
    }
    return result;
  };

  const computeHma = (data: Candle[], period: number) => {
    const closeSeries = data.map((candle) => candle.close);
    const half = Math.max(1, Math.floor(period / 2));
    const sqrt = Math.max(1, Math.floor(Math.sqrt(period)));
    const wmaHalf = computeWma(closeSeries, half);
    const wmaFull = computeWma(closeSeries, period);
    const diff = wmaHalf.map((value, index) => value * 2 - wmaFull[index]);
    const hmaSeries = computeWma(diff, sqrt);
    return hmaSeries
      .map((value, index) => ({ time: data[index].time, value }))
      .filter((point) => Number.isFinite(point.value));
  };

  const maData = useMemo(() => {
    const data = candles;
    return {
      sma: computeSma(data, maSettings.sma.period),
      ema: computeEma(data, maSettings.ema.period),
      vwma: computeVwma(data, maSettings.vwma.period),
      hma: computeHma(data, maSettings.hma.period),
    };
  }, [candles, maSettings]);

  useEffect(() => {
    if (!chartRef.current) return;

    const ensureSeries = (key: keyof MaSettings, color: string) => {
      if (!maSeriesRef.current[key]) {
        maSeriesRef.current[key] = chartRef.current?.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        }) as ISeriesApi<"Line">;
      }
    };

    ensureSeries("sma", "#38bdf8");
    ensureSeries("ema", "#f59e0b");
    ensureSeries("vwma", "#a855f7");
    ensureSeries("hma", "#22c55e");
  }, []);

  useEffect(() => {
    if (!maSeriesRef.current.sma) return;
    (Object.keys(maSettings) as (keyof MaSettings)[]).forEach((key) => {
      const series = maSeriesRef.current[key];
      if (!series) return;
      const enabled = maSettings[key].enabled;
      series.applyOptions({ visible: enabled });
      if (enabled) {
        series.setData(maData[key]);
      }
    });
  }, [maSettings, maData]);

  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!container || !chart || !series) return;

    const pickPrice = (y: number) => {
      const price = series.coordinateToPrice(y);
      return price ?? null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = container.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const price = pickPrice(y);
      if (!price) return;

      const checkPriceLine = (
        targetPrice: number | undefined,
        type: "sl" | "tp"
      ) => {
        if (!targetPrice) return false;
        const lineY = series.priceToCoordinate(targetPrice);
        if (lineY == null) return false;
        if (Math.abs(lineY - y) <= 8) {
          dragState.current = type;
          return true;
        }
        return false;
      };

      if (checkPriceLine(stopLoss, "sl")) return;
      if (checkPriceLine(takeProfit, "tp")) return;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragState.current) return;
      const rect = container.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const price = pickPrice(y);
      if (!price) return;

      if (dragState.current === "sl") {
        onStopLossChange?.(price);
        return;
      }
      if (dragState.current === "tp") {
        onTakeProfitChange?.(price);
      }
    };

    const handlePointerUp = () => {
      dragState.current = null;
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [stopLoss, takeProfit, onStopLossChange, onTakeProfitChange]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Market Chart</p>
          <h2 className="text-lg font-semibold text-slate-100">{symbolLabel} Perp</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/80 px-2 py-1">
            {([
              { label: "1M", value: "1m" },
              { label: "5M", value: "5m" },
              { label: "30M", value: "30m" },
              { label: "1H", value: "1h" },
            ] as const).map((frame) => (
              <button
                key={frame.value}
                type="button"
                onClick={() => onIntervalChange(frame.value)}
                className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition ${
                  interval === frame.value
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "text-slate-300"
                }`}
              >
                {frame.label}
              </button>
            ))}
          </div>
          <div
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${
              unrealizedPnl >= 0
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            Unrealized {formatUsd(unrealizedPnl)}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-slate-800 bg-slate-950/80 px-3 py-1">
            {([
              { key: "sma", label: "SMA", color: "text-sky-200" },
              { key: "ema", label: "EMA", color: "text-amber-200" },
              { key: "vwma", label: "VWMA", color: "text-fuchsia-200" },
              { key: "hma", label: "HMA", color: "text-emerald-200" },
            ] as const).map((item) => (
              <div key={item.key} className="flex items-center gap-2">
                <label className={`flex items-center gap-1 text-[11px] uppercase ${item.color}`}>
                  <input
                    type="checkbox"
                    checked={maSettings[item.key].enabled}
                    onChange={(event) =>
                      setMaSettings((prev) => ({
                        ...prev,
                        [item.key]: {
                          ...prev[item.key],
                          enabled: event.target.checked,
                        },
                      }))
                    }
                  />
                  {item.label}
                </label>
                <input
                  type="number"
                  min={2}
                  value={maSettings[item.key].period}
                  onChange={(event) =>
                    setMaSettings((prev) => ({
                      ...prev,
                      [item.key]: {
                        ...prev[item.key],
                        period: Number(event.target.value),
                      },
                    }))
                  }
                  className="w-14 rounded-full border border-slate-700 bg-slate-950/80 px-2 py-1 text-[11px] text-slate-200"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        <div ref={containerRef} className="h-[360px] w-full" />
      </div>
    </div>
  );
}
