/**
 * Live pressure-vs-time trace at the valve, drawn on a 2D canvas from
 * TransientRunner.history in a requestAnimationFrame loop (no React re-render
 * per frame). Reference lines mark the reservoir head and the Joukowsky
 * surge/down-surge envelope so the surge magnitude reads at a glance.
 */

import { useEffect, useRef } from 'react';
import { transientRunner } from '../transient/runner';

const W = 300;
const H = 150;

export function PressureChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    const draw = () => {
      const frame = transientRunner.latestFrame;
      const hist = transientRunner.history;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#11151b';
      ctx.fillRect(0, 0, W, H);

      if (frame && hist.length > 1) {
        const ref = frame.reservoirHead;
        const jouk = frame.joukowsky;
        const yMin = ref - jouk * 1.4;
        const yMax = ref + jouk * 1.4;
        const t0 = hist[0].t;
        const tMax = hist[hist.length - 1].t;
        const tSpan = Math.max(tMax - t0, 1e-6);

        const px = (t: number) => ((t - t0) / tSpan) * (W - 8) + 4;
        const py = (h: number) => H - 4 - ((h - yMin) / (yMax - yMin)) * (H - 8);

        // Reference lines.
        const refLine = (h: number, color: string, dash: number[]) => {
          ctx.strokeStyle = color;
          ctx.setLineDash(dash);
          ctx.beginPath();
          ctx.moveTo(0, py(h));
          ctx.lineTo(W, py(h));
          ctx.stroke();
          ctx.setLineDash([]);
        };
        refLine(ref, '#5a6472', [3, 3]);
        refLine(ref + jouk, '#ff5a4d', [2, 4]);
        refLine(ref - jouk, '#3a9bdc', [2, 4]);

        // Trace.
        ctx.strokeStyle = '#e6e9ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < hist.length; i++) {
          const x = px(hist[i].t);
          const y = py(hist[i].valveHead);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="chart">
      <div className="chart-title">Valve pressure head vs time</div>
      <canvas ref={canvasRef} width={W} height={H} />
      <div className="chart-legend">
        <span className="dot surge" /> Joukowsky surge
        <span className="dot ref" /> reservoir
        <span className="dot drop" /> down-surge
      </div>
    </div>
  );
}
