import { useEffect } from 'react';

export function useAnimatedFavicon(isConnected: boolean, isStreaming: boolean = true) {
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }

    // Modern browsers support animated SVG favicon directly
    link.type = 'image/svg+xml';
    link.href = '/favicon.svg';

    // Optional canvas-based pulse indicator for tab favicon
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let animId: number;

    const render = () => {
      ctx.clearRect(0, 0, 32, 32);

      // Background rounded square
      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.roundRect(0, 0, 32, 32, 7);
      ctx.fill();

      // Border gradient simulation
      ctx.strokeStyle = isConnected ? '#06b6d4' : '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pulse ring animation
      if (isConnected && isStreaming) {
        const pulseRadius = 5 + (frame % 30) * 0.35;
        const opacity = Math.max(0, 1 - (frame % 30) / 30);
        ctx.strokeStyle = `rgba(6, 182, 212, ${opacity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(16, 16, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Outer Hexagon Points
      const points = [
        [16, 4],
        [26, 10],
        [26, 22],
        [16, 28],
        [6, 22],
        [6, 10],
      ];

      ctx.strokeStyle = isConnected ? '#6366f1' : '#64748b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      points.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      // Peripheral Nodes
      const nodeColors = ['#06b6d4', '#6366f1', '#10b981', '#06b6d4', '#6366f1', '#10b981'];
      points.forEach(([x, y], i) => {
        ctx.fillStyle = isConnected ? nodeColors[i] : '#475569';
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });

      // Center glowing core
      const corePulse = isConnected ? 1 + Math.sin(frame * 0.15) * 0.2 : 1;
      ctx.fillStyle = isConnected ? '#10b981' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(16, 16, 3.5 * corePulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(16, 16, 1.5, 0, Math.PI * 2);
      ctx.fill();

      frame++;
      // Update link href every 3 frames for smoothness
      if (frame % 4 === 0 && link) {
        link.href = canvas.toDataURL('image/png');
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      if (link) {
        link.href = '/favicon.svg';
      }
    };
  }, [isConnected, isStreaming]);
}
