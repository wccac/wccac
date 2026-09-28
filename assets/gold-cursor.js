/* A silk thread attached to the arrow's tail, with tangent-continuous bends. */
(() => {
  const cursor = document.querySelector('.cursor');
  const svg = document.querySelector('#gold-trail');
  if (!cursor || !svg) return;
  const ns = 'http://www.w3.org/2000/svg';
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const count = 12;
  const nodes = Array.from({ length: count }, () => ({ x: 0, y: 0 }));
  const anchor = { x: 0, y: 0 };
  const stem = { x: .462, y: .887 };
  let active = false, frame = 0, previousTime = 0, opacity = 0;
  let cursorWidth = 15, cursorHeight = 21;

  // Small, overlapping rounded strokes taper along the curve itself, even on U-turns.
  const layers = ['trail-glow', 'trail-thread'].map(className => {
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', className);
    const paths = Array.from({ length: count + 1 }, (_, i) => {
      const path = document.createElementNS(ns, 'path');
      const remaining = 1 - i / (count + 1);
      path.setAttribute('stroke-width', String(.15 + 2.1 * remaining));
      path.setAttribute('opacity', String(remaining * remaining));
      group.append(path);
      return path;
    });
    svg.append(group);
    return paths;
  });
  const resetNodes = () => nodes.forEach(node => { node.x = anchor.x; node.y = anchor.y; });
  const clearThread = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    opacity = 0;
    active = false;
    svg.style.opacity = '0';
    resetNodes();
  };
  const leave = () => { clearThread(); cursor.classList.remove('is-visible', 'on'); };
  const resize = () => {
    svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    cursorWidth = cursor.offsetWidth || 15;
    cursorHeight = cursor.offsetHeight || 21;
    clearThread();
  };
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const point = p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

  const paint = now => {
    frame = 0;
    if (!active || !finePointer.matches || reducedMotion.matches || document.hidden || document.body.classList.contains('lens-mode')) {
      clearThread();
      return;
    }
    const dt = Math.min(previousTime ? now - previousTime : 16.67, 32);
    previousTime = now;
    // Substeps keep the same soft response at both 60 Hz and high refresh rates.
    const steps = Math.ceil(dt / 8);
    const alpha = 1 - Math.exp(-(dt / steps) / 22);
    for (let step = 0; step < steps; step++) {
      let leader = anchor;
      for (const node of nodes) {
        node.x += (leader.x - node.x) * alpha;
        node.y += (leader.y - node.y) * alpha;
        const dx = node.x - leader.x, dy = node.y - leader.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 13) {
          node.x = leader.x + dx * 13 / distance;
          node.y = leader.y + dy * 13 / distance;
        }
        leader = node;
      }
    }
    let length = 0, previous = anchor;
    nodes.forEach(node => { length += Math.hypot(node.x - previous.x, node.y - previous.y); previous = node; });
    const strength = Math.min(1, length / 34);
    opacity += (strength - opacity) * (1 - Math.exp(-dt / (strength > opacity ? 35 : 75)));
    // The first control point always leaves in the direction of the arrow's stem.
    const neck = Math.min(8, length * .16);
    const controls = [{ x: anchor.x + stem.x * neck, y: anchor.y + stem.y * neck }, ...nodes];
    let start = anchor;
    controls.forEach((control, i) => {
      const end = i + 1 < controls.length ? midpoint(control, controls[i + 1]) : control;
      const d = `M ${point(start)} Q ${point(control)} ${point(end)}`;
      layers.forEach(paths => paths[i].setAttribute('d', d));
      start = end;
    });
    svg.style.opacity = opacity.toFixed(3);
    if (length < .08 && opacity < .006) {
      svg.style.opacity = '0';
      previousTime = 0;
      resetNodes();
      return;
    }
    frame = requestAnimationFrame(paint);
  };

  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !finePointer.matches) { leave(); return; }
    cursor.style.translate = `${event.clientX}px ${event.clientY}px`;
    cursor.classList.add('is-visible');
    // CSS pins hover scaling to this same point, so the joint never separates.
    anchor.x = event.clientX + cursorWidth * (.485 - .5) - stem.x * .4;
    anchor.y = event.clientY + cursorHeight * (.965 - .5) - stem.y * .4;
    if (reducedMotion.matches || document.body.classList.contains('lens-mode')) { clearThread(); return; }
    if (!active) { resetNodes(); active = true; }
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
  window.addEventListener('resize', resize, { passive: true });
  finePointer.addEventListener('change', leave);
  reducedMotion.addEventListener('change', clearThread);
  new MutationObserver(() => { if (document.body.classList.contains('lens-mode')) clearThread(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  resize();
})();
