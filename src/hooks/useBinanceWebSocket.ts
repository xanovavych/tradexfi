import { useEffect, useMemo, useState } from "react";

type PriceMap = Record<string, number>;

const BASE_WS_URL = "wss://stream.binance.com:9443/ws";
const BASE_STREAM_URL = "wss://stream.binance.com:9443/stream?streams=";

export const useBinanceWebSocket = (symbols: readonly string[]) => {
  const [prices, setPrices] = useState<PriceMap>({});

  const wsUrl = useMemo(() => {
    const streams = symbols
      .map((symbol) => symbol.toLowerCase())
      .map((symbol) => `${symbol}@trade`)
      .join("/");

    if (!streams.length) return null;

    if (symbols.length === 1) {
      return `${BASE_WS_URL}/${streams}`;
    }

    return `${BASE_STREAM_URL}${streams}`;
  }, [symbols]);

  useEffect(() => {
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const payload = message?.data ?? message;
        const symbol = payload?.s?.toUpperCase();
        const price = Number.parseFloat(payload?.p);

        if (!symbol || !Number.isFinite(price)) return;

        setPrices((prev) => ({
          ...prev,
          [symbol]: price,
        }));
      } catch {
        return;
      }
    };

    return () => {
      ws.close(1000, "unmount");
    };
  }, [wsUrl]);

  return prices;
};
