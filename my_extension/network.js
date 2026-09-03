// Shared animated "network" background (moving nodes connected by lines).
// Exposes window.TrustableNetwork.start(canvas, options) -> { setAccent, stop }.
(function () {
  function start(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext("2d");
    const density = opts.density || 0.00016; // nodes per px^2
    const minNodes = opts.minNodes || 12;
    const maxNodes = opts.maxNodes || 60;
    const maxDist = opts.maxDist || 118;
    const speed = opts.speed || 0.32;
    const dotColor = opts.dotColor || "rgba(255,255,255,0.7)";
    let lineRGB = opts.lineRGB || "255,255,255";
    let accentRGB = opts.accentRGB || "34,197,94";

    let W = 0,
      H = 0,
      dpr = 1;
    let pts = [];
    let raf = null;
    let running = true;

    function targetCount() {
      return Math.max(minNodes, Math.min(maxNodes, Math.round(W * H * density)));
    }

    function makePoints() {
      const n = targetCount();
      pts = [];
      for (let i = 0; i < n; i++) {
        pts.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * speed,
          vy: (Math.random() - 0.5) * speed,
          r: Math.random() < 0.25 ? 2.2 : 1.4,
          accent: Math.random() < 0.22,
        });
      }
    }

    function resize() {
      dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!pts.length || Math.abs(pts.length - targetCount()) > 8) makePoints();
    }

    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);

      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x <= 0 || p.x >= W) p.vx *= -1;
        if (p.y <= 0 || p.y >= H) p.vy *= -1;
        p.x = Math.max(0, Math.min(W, p.x));
        p.y = Math.max(0, Math.min(H, p.y));
      }

      // connecting lines
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < maxDist) {
            const o = (1 - d / maxDist) * 0.55;
            const acc = pts[i].accent || pts[j].accent;
            ctx.strokeStyle = `rgba(${acc ? accentRGB : lineRGB},${o.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }

      // nodes
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.accent ? `rgba(${accentRGB},0.9)` : dotColor;
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }
    frame();

    return {
      setAccent(rgb) {
        if (rgb) accentRGB = rgb;
      },
      stop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
      },
    };
  }

  if (typeof window !== "undefined") {
    window.TrustableNetwork = { start };
  }
})();
