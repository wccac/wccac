/* Original, self-hosted ambient music. Browser autoplay rules are respected. */
(() => {
  'use strict';
  const audio = document.querySelector('#site-music');
  const controls = [...document.querySelectorAll('[data-music-toggle]')];
  if (!audio || !controls.length) return;

  const preferenceKey = 'xiujing-music';
  const level = .6;
  let wanted = true, starting = false, needsGesture = false;
  let request = 0, fadeFrame = 0;
  try { wanted = localStorage.getItem(preferenceKey) !== 'off'; } catch (_) { /* Storage is optional. */ }
  audio.loop = true;
  audio.volume = 0;

  function render(state) {
    const labels = {
      playing: '正在播放', paused: '音乐已暂停', blocked: '轻触聆听',
      loading: '正在载入', error: '轻触重试'
    };
    controls.forEach(button => {
      button.dataset.state = state;
      button.setAttribute('aria-pressed', String(state === 'playing'));
      button.setAttribute('aria-label', `${state === 'playing' || state === 'loading' ? '暂停' : '播放'}背景音乐：绣境听风`);
      button.title = state === 'blocked' ? '轻触页面，即可聆听循环国风配乐' : '原创国风轻音乐 · 绣境听风';
      button.querySelector('[data-music-status]').textContent = labels[state];
    });
  }
  function cancelFade() { cancelAnimationFrame(fadeFrame); fadeFrame = 0; }
  function fadeIn() {
    cancelFade();
    const began = performance.now(), from = audio.volume;
    const step = now => {
      if (!wanted || audio.paused || document.hidden) return;
      const progress = Math.min(1, (now - began) / 1600);
      audio.volume = from + (level - from) * (1 - Math.pow(1 - progress, 2));
      if (progress < 1) fadeFrame = requestAnimationFrame(step);
    };
    fadeFrame = requestAnimationFrame(step);
  }
  function pause() {
    request++; starting = false; cancelFade();
    audio.pause(); audio.volume = 0;
    render('paused');
  }
  async function play() {
    if (!wanted || document.hidden || starting) return;
    if (!audio.paused) { render('playing'); return; }
    const current = ++request;
    starting = true; needsGesture = false;
    render('loading');
    try {
      if (audio.error) audio.load();
      await audio.play();
      if (current !== request) return;
      if (!wanted || document.hidden) { pause(); return; }
      starting = false;
      render('playing'); fadeIn();
    } catch (error) {
      if (current !== request) return;
      starting = false;
      needsGesture = error.name === 'NotAllowedError';
      render(needsGesture ? 'blocked' : error.name === 'AbortError' ? 'paused' : 'error');
    }
  }
  controls.forEach(button => button.addEventListener('click', () => {
    wanted = !(starting || !audio.paused);
    try { localStorage.setItem(preferenceKey, wanted ? 'on' : 'off'); } catch (_) { /* Private mode. */ }
    if (wanted) play(); else pause();
  }));

  // Start within a real activation event if the initial autoplay was blocked.
  function unlock(event) {
    if (!event.isTrusted || !wanted || !needsGesture || event.target.closest('[data-music-toggle]')) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    play();
  }
  document.addEventListener('click', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(); else if (wanted) play();
  });
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', () => { if (wanted) play(); });
  audio.addEventListener('playing', () => {
    if (!wanted || document.hidden) { pause(); return; }
    needsGesture = false; render('playing');
  });
  audio.addEventListener('pause', () => {
    cancelFade();
    if (!starting) render('paused');
  });
  audio.addEventListener('error', () => { request++; starting = false; cancelFade(); render('error'); });

  render(wanted ? 'loading' : 'paused');
  if (wanted) play();
})();
