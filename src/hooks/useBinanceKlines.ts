import { useEffect, useMemo, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";

type Candle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const BASE_WS_URL = "wss://stream.binance.com:9443/ws";

const isCertError = (error: unknown) => {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /cert|certificate|ssl|tls|ERR_CERT|ERR_SSL/i.test(message);
};

export const useBinanceKlines = (
  symbol: string,
  interval = "1m"
): { candles: Candle[]; certError: boolean } => {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [certError, setCertError] = useState(false);
  const lastCandleTime = useRef<UTCTimestamp | null>(null);

  const wsUrl = useMemo(() => {
    if (!symbol) return null;
    return `${BASE_WS_URL}/${symbol.toLowerCase()}@kline_${interval}`;
  }, [symbol, interval]);

  useEffect(() => {
    if (!symbol) return;
    let isActive = true;
    lastCandleTime.current = null;

    const loadSnapshot = async () => {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`
        );
        if (!response.ok) return;
        const data: [
          number,
          string,
          string,
          string,
          string,
          string,
          number,
          string,
          number,
          string,
          string,
          string,
        ][] = await response.json();

        if (!isActive) return;
        const snapshot = data.map((item) => ({
          time: Math.floor(item[0] / 1000) as UTCTimestamp,
          open: Number.parseFloat(item[1]),
          high: Number.parseFloat(item[2]),
          low: Number.parseFloat(item[3]),
          close: Number.parseFloat(item[4]),
          volume: Number.parseFloat(item[5]),
        }));
        lastCandleTime.current = snapshot.at(-1)?.time ?? null;
        setCandles(snapshot);
        setCertError(false);
      } catch (error) {
        if (isCertError(error)) {
          setCertError(true);
        }
        return;
      }
    };

    setCandles([]);
    setCertError(false);
    loadSnapshot();

    return () => {
      isActive = false;
    };
  }, [symbol, interval]);

  useEffect(() => {
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const kline = message?.k;
        if (!kline) return;

        const time = Math.floor(kline.t / 1000) as UTCTimestamp;
        const candle: Candle = {
          time,
          open: Number.parseFloat(kline.o),
          high: Number.parseFloat(kline.h),
          low: Number.parseFloat(kline.l),
          close: Number.parseFloat(kline.c),
          volume: Number.parseFloat(kline.v),
        };

        setCandles((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.time === time) {
            const next = [...prev];
            next[next.length - 1] = candle;
            return next;
          }

          if (last && time < last.time) {
            return prev;
          }

          lastCandleTime.current = time;
          const next = [...prev, candle];
          return next.slice(-200);
        });
      } catch {
        return;
      }
    };

    ws.onopen = () => {
      return;
    };

    return () => {
      ws.close(1000, "unmount");
    };
  }, [wsUrl]);

  return { candles, certError };
};

export type { Candle };
