"use client";

import { useEffect, useRef } from "react";
import type { UTCTimestamp } from "lightweight-charts";

// Hex approximations of the design's oklch tokens for canvas compatibility
const C = {
  buy:     "#609f74",  // oklch(68% 0.11 152) — sage green
  sell:    "#bf6245",  // oklch(61% 0.14 25)  — terracotta
  grid:    "#2c2a27",  // oklch(20% 0.009 65) — border
  text:    "#75706a",  // oklch(52% 0.009 68) — fg-muted
  labelBg: "#252320",  // oklch(16% 0.011 65) — bg-surface
} as const;

export function XRPChart() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    let removeChart: (() => void) | undefined;

    (async () => {
      if (!containerRef.current || !mounted) return;

      const { createChart, CandlestickSeries, ColorType, CrosshairMode, LineStyle } =
        await import("lightweight-charts");

      if (!mounted || !containerRef.current) return;

      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: C.text,
          fontSize: 11,
          fontFamily: "Outfit, system-ui, sans-serif",
        },
        grid: {
          vertLines: { color: C.grid, style: LineStyle.Solid },
          horzLines: { color: C.grid, style: LineStyle.Solid },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: C.text, width: 1, style: LineStyle.Dashed, labelBackgroundColor: C.labelBg },
          horzLine: { color: C.text, width: 1, style: LineStyle.Dashed, labelBackgroundColor: C.labelBg },
        },
        rightPriceScale: { borderColor: C.grid },
        timeScale: {
          borderColor: C.grid,
          timeVisible: true,
          secondsVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
        },
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor:         C.buy,
        downColor:       C.sell,
        borderUpColor:   C.buy,
        borderDownColor: C.sell,
        wickUpColor:     C.buy,
        wickDownColor:   C.sell,
      });

      try {
        const res = await fetch(
          "https://api.binance.com/api/v3/klines?symbol=XRPUSDT&interval=1h&limit=168",
        );
        const raw: [number, string, string, string, string, ...unknown[]][] = await res.json();

        if (mounted) {
          series.setData(
            raw.map((k) => ({
              time:  (Math.floor(k[0] / 1000) as UTCTimestamp),
              open:  parseFloat(k[1]),
              high:  parseFloat(k[2]),
              low:   parseFloat(k[3]),
              close: parseFloat(k[4]),
            })),
          );
          chart.timeScale().fitContent();
        }
      } catch {
        // non-critical — chart stays empty
      }

      removeChart = () => chart.remove();
    })();

    return () => {
      mounted = false;
      removeChart?.();
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "360px" }} />;
}
