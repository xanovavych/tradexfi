import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const SUPPORTED_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "DOGEUSDT",
  "ADAUSDT",
] as const;

export type SymbolKey = (typeof SUPPORTED_SYMBOLS)[number];

export type PositionSide = "LONG" | "SHORT";

export type Position = {
  symbol: SymbolKey;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  leverage: number;
  margin: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: string;
};

export type Transaction = {
  id: string;
  type: "OPEN_LONG" | "OPEN_SHORT" | "CLOSE";
  symbol: SymbolKey;
  price: number;
  quantity: number;
  leverage?: number;
  margin?: number;
  pnl?: number;
  reason?: "MANUAL" | "STOP_LOSS" | "TAKE_PROFIT" | "LIQUIDATION";
  timestamp: string;
};

type StoreState = {
  balance: number;
  positions: Record<SymbolKey, Position | null>;
  transactions: Transaction[];
  openPosition: (input: {
    symbol: SymbolKey;
    side: PositionSide;
    margin: number;
    leverage: number;
    price: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => { success: boolean; error?: string };
  closePosition: (input: {
    symbol: SymbolKey;
    price: number;
    reason?: Transaction["reason"];
  }) => { success: boolean; error?: string };
  updateRisk: (input: {
    symbol: SymbolKey;
    stopLoss?: number;
    takeProfit?: number;
  }) => void;
  resetAccount: () => void;
};

const INITIAL_BALANCE = 50_000;

const createInitialPositions = (): Record<SymbolKey, Position | null> => ({
  BTCUSDT: null,
  ETHUSDT: null,
  SOLUSDT: null,
  DOGEUSDT: null,
  ADAUSDT: null,
});

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const calculatePnl = (position: Position, price: number) => {
  const delta =
    position.side === "LONG"
      ? price - position.entryPrice
      : position.entryPrice - price;
  return delta * position.quantity;
};

const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      balance: INITIAL_BALANCE,
      positions: createInitialPositions(),
      transactions: [],
      openPosition: ({ symbol, side, margin, leverage, price, stopLoss, takeProfit }) => {
        if (!Number.isFinite(margin) || margin <= 0) {
          return { success: false, error: "Enter a valid margin." };
        }
        if (!Number.isFinite(price) || price <= 0) {
          return { success: false, error: "Live price unavailable." };
        }
        if (!Number.isFinite(leverage) || leverage < 1 || leverage > 50) {
          return { success: false, error: "Leverage must be between 1x and 50x." };
        }

        const { balance, positions, transactions } = get();
        if (positions[symbol]) {
          return { success: false, error: "Close the existing position first." };
        }
        if (margin > balance) {
          return { success: false, error: "Insufficient Funds" };
        }

        const quantity = (margin * leverage) / price;

        set({
          balance: balance - margin,
          positions: {
            ...positions,
            [symbol]: {
              symbol,
              side,
              quantity,
              entryPrice: price,
              leverage,
              margin,
              stopLoss,
              takeProfit,
              openedAt: new Date().toISOString(),
            },
          },
          transactions: [
            {
              id: createId(),
              type: side === "LONG" ? "OPEN_LONG" : "OPEN_SHORT",
              symbol,
              price,
              quantity,
              leverage,
              margin,
              timestamp: new Date().toISOString(),
            },
            ...transactions,
          ],
        });

        return { success: true };
      },
      closePosition: ({ symbol, price, reason = "MANUAL" }) => {
        if (!Number.isFinite(price) || price <= 0) {
          return { success: false, error: "Live price unavailable." };
        }

        const { balance, positions, transactions } = get();
        const position = positions[symbol];
        if (!position) {
          return { success: false, error: "No open position." };
        }

        const pnl = calculatePnl(position, price);
        const released = position.margin + pnl;

        set({
          balance: balance + released,
          positions: {
            ...positions,
            [symbol]: null,
          },
          transactions: [
            {
              id: createId(),
              type: "CLOSE",
              symbol,
              price,
              quantity: position.quantity,
              pnl,
              reason,
              timestamp: new Date().toISOString(),
            },
            ...transactions,
          ],
        });

        return { success: true };
      },
      updateRisk: ({ symbol, stopLoss, takeProfit }) => {
        const { positions } = get();
        const position = positions[symbol];
        if (!position) return;

        set({
          positions: {
            ...positions,
            [symbol]: {
              ...position,
              stopLoss,
              takeProfit,
            },
          },
        });
      },
      resetAccount: () => {
        set({
          balance: INITIAL_BALANCE,
          positions: createInitialPositions(),
          transactions: [],
        });
      },
    }),
    {
      name: "paper-trading-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export { calculatePnl };
export default useStore;
