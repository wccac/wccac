/* Three touch-first collection views, sharing the original portfolio artwork. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const views = [...document.querySelectorAll('[data-view]')];
  const titles = { home: '绣境异兽', garden: '蜀绣花园', beasts: '山海异兽' };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const art = JSON.parse($('#art-data').textContent);
  const artById = new Map(art.map(item => [item.id, item]));
  const menu = $('#site-menu'), viewer = $('#art-viewer'), stage = $('#viewer-stage');
  const video = $('#hero-video'), rail = $('#garden-rail');
  const cards = [...rail.children];
  const positions = { home: 0, garden: 0, beasts: 0 };
  let activeView = null, lock = null, viewerItem = null, viewerTrigger = null;
  let galleryIndex = 0, galleryFrame = 0, userPaused = reduced.matches;
  let railGesture = null, suppressClickUntil = 0, swipe = null;
  const behavior = () => reduced.matches ? 'instant' : 'smooth';
  const scrollY = () => lock ? lock.y : window.scrollY;
  const readRoute = () => {
    const [name, query = ''] = location.hash.slice(1).split('?');
    const view = Object.hasOwn(titles, name) ? name : 'home';
    const id = new URLSearchParams(query).get('art');
    return { view, id: artById.has(id) ? id : null };
  };
  const routeURL = (view, id) => `#${view}${id ? '?art=' + encodeURIComponent(id) : ''}`;
  const lockScroll = () => {
    if (lock) return;
    lock = { y: window.scrollY, style: document.body.getAttribute('style') };
    Object.assign(document.body.style, { position: 'fixed', top: `-${lock.y}px`, width: '100%', overflow: 'hidden' });
  };
  const unlockScroll = () => {
    if (!lock) return;
    const saved = lock;
    lock = null;
    if (saved.style === null) document.body.removeAttribute('style');
    else document.body.setAttribute('style', saved.style);
    window.scrollTo({ top: saved.y, behavior: 'instant' });
  };
  const updateVideoButtons = () => {
    $('#video-play').textContent = video.paused ? '播放' : '暂停';
    $('#video-play').setAttribute('aria-label', video.paused ? '播放视频' : '暂停视频');
    $('#video-sound').textContent = video.muted ? '开启声音' : '关闭声音';
    $('#video-sound').setAttribute('aria-pressed', String(!video.muted));
  };
  const videoAllowed = () => activeView === 'home' && !document.hidden && !menu.open && !viewer.open && !userPaused;
  const syncVideo = () => {
    if (videoAllowed()) {
      const attempt = video.play();
      if (attempt) attempt.then(() => { if (!videoAllowed()) video.pause(); updateVideoButtons(); }).catch(updateVideoButtons);
    } else video.pause();
    updateVideoButtons();
  };
  const closeMenu = (restoreFocus = true) => {
    if (!menu.open) return;
    menu.close();
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
    unlockScroll();
    if (restoreFocus) $('#menu-toggle').focus({ preventScroll: true });
    syncVideo();
  };
  const setZoom = zoomed => {
    stage.classList.toggle('is-zoomed', zoomed);
    stage.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    $('#viewer-zoom').setAttribute('aria-pressed', String(zoomed));
    $('#viewer-zoom').textContent = zoomed ? '查看全幅' : '放大细节';
  };
  const hideViewer = () => {
    if (!viewer.open) return;
    viewer.close();
    setZoom(false);
    viewerItem = null;
    unlockScroll();
    if (viewerTrigger?.isConnected && !viewerTrigger.closest('[hidden]')) viewerTrigger.focus({ preventScroll: true });
    viewerTrigger = null;
  };
  const showArt = id => {
    const item = artById.get(id);
    if (!item) return;
    closeMenu(false);
    viewerItem = item;
    const group = art.filter(other => other.group === item.group);
    const index = group.indexOf(item);
    $('#viewer-image').src = item.image;
    $('#viewer-image').alt = item.title;
    if (item.width) $('#viewer-image').width = item.width;
    if (item.height) $('#viewer-image').height = item.height;
    $('#viewer-title').textContent = item.title;
    $('#viewer-type').textContent = item.type;
    $('#viewer-description').textContent = item.description;
    $('#viewer-counter').textContent = `${String(index + 1).padStart(2, '0')} / ${String(group.length).padStart(2, '0')}`;
    $('#viewer-prev').disabled = index === 0;
    $('#viewer-next').disabled = index === group.length - 1;
    setZoom(false);
    if (!viewer.open) {
      lockScroll();
      viewer.showModal();
      $('#viewer-close').focus({ preventScroll: true });
    }
    syncVideo();
  };
  const syncRoute = () => {
    const route = readRoute();
    const changed = activeView !== route.view;
    if (activeView && changed) positions[activeView] = scrollY();
    closeMenu(false);
    if (!route.id || changed) hideViewer();
    activeView = route.view;
    views.forEach(view => { view.hidden = view.dataset.view !== activeView; });
    $('#page-title').textContent = titles[activeView];
    document.title = `${titles[activeView]}｜王淳·掌上绣境`;
    document.querySelectorAll('.bottom-nav [data-tab]').forEach(button => {
      if (button.dataset.tab === activeView) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (changed) window.scrollTo({ top: positions[activeView] || 0, behavior: 'instant' });
    if (route.id) showArt(route.id);
    syncVideo();
    requestAnimationFrame(updateGallery);
  };
  const navigate = view => {
    if (!Object.hasOwn(titles, view)) return;
    closeMenu(false);
    if (view === activeView && !viewer.open) {
      window.scrollTo({ top: 0, behavior: behavior() });
      return;
    }
    history.pushState({ mobileView: view }, '', routeURL(view));
    syncRoute();
  };
  const requestCloseViewer = () => {
    if (!viewer.open) return;
    if (history.state?.mobileViewerEntry) history.back();
    else {
      history.replaceState({ mobileView: activeView }, '', routeURL(activeView));
      syncRoute();
    }
  };
  const stepArt = direction => {
    if (!viewerItem) return;
    const group = art.filter(item => item.group === viewerItem.group);
    const next = group[group.indexOf(viewerItem) + direction];
    if (!next) return;
    history.replaceState({ ...history.state, mobileArt: next.id }, '', routeURL(activeView, next.id));
    showArt(next.id);
  };
  function updateGallery() {
    galleryFrame = 0;
    if (activeView !== 'garden' || !rail.clientWidth) return;
    const first = cards[0].offsetLeft;
    const max = rail.scrollWidth - rail.clientWidth;
    let distance = Infinity;
    cards.forEach((card, index) => {
      const delta = Math.abs(rail.scrollLeft - Math.min(max, card.offsetLeft - first));
      if (delta < distance) { galleryIndex = index; distance = delta; }
    });
    $('#gallery-count').textContent = `${String(galleryIndex + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
    $('#gallery-prev').disabled = galleryIndex === 0;
    $('#gallery-next').disabled = galleryIndex === cards.length - 1;
  }
  const stepGallery = direction => {
    const index = Math.max(0, Math.min(cards.length - 1, galleryIndex + direction));
    rail.scrollTo({ left: cards[index].offsetLeft - cards[0].offsetLeft, behavior: behavior() });
  };
  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { navigate(tab.dataset.tab); return; }
    if (event.target.closest('[data-about]')) {
      closeMenu(false);
      navigate('home');
      requestAnimationFrame(() => $('#creative-note').scrollIntoView({ behavior: behavior(), block: 'start' }));
      return;
    }
    const trigger = event.target.closest('[data-art]');
    if (!trigger || !artById.has(trigger.dataset.art)) return;
    viewerTrigger = trigger;
    history.pushState({ mobileView: activeView, mobileArt: trigger.dataset.art, mobileViewerEntry: true }, '', routeURL(activeView, trigger.dataset.art));
    showArt(trigger.dataset.art);
  });
  $('#menu-toggle').addEventListener('click', () => {
    lockScroll();
    menu.showModal();
    $('#menu-toggle').setAttribute('aria-expanded', 'true');
    syncVideo();
  });
  menu.querySelector('[data-close-menu]').addEventListener('click', () => closeMenu());
  menu.addEventListener('cancel', event => { event.preventDefault(); closeMenu(); });
  menu.addEventListener('click', event => {
    if (event.target !== menu) return;
    const rect = menu.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeMenu();
  });
  $('#viewer-close').addEventListener('click', requestCloseViewer);
  viewer.addEventListener('cancel', event => { event.preventDefault(); requestCloseViewer(); });
  viewer.addEventListener('click', event => { if (event.target === viewer) requestCloseViewer(); });
  $('#viewer-prev').addEventListener('click', () => stepArt(-1));
  $('#viewer-next').addEventListener('click', () => stepArt(1));
  $('#viewer-zoom').addEventListener('click', () => setZoom(!stage.classList.contains('is-zoomed')));
  viewer.addEventListener('keydown', event => {
    if (stage.classList.contains('is-zoomed')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); stepArt(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  stage.addEventListener('touchstart', event => {
    swipe = event.touches.length === 1 && !stage.classList.contains('is-zoomed') ? { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() } : null;
  }, { passive: true });
  stage.addEventListener('touchmove', event => { if (event.touches.length !== 1) swipe = null; }, { passive: true });
  stage.addEventListener('touchend', event => {
    if (!swipe || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - swipe.x, dy = event.changedTouches[0].clientY - swipe.y;
    if (Date.now() - swipe.time < 800 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) stepArt(dx < 0 ? 1 : -1);
    swipe = null;
  }, { passive: true });
  stage.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });
  rail.addEventListener('pointerdown', event => { railGesture = { x: event.clientX, y: event.clientY, moved: false }; suppressClickUntil = 0; }, { passive: true });
  rail.addEventListener('pointermove', event => {
    if (railGesture && Math.hypot(event.clientX - railGesture.x, event.clientY - railGesture.y) > 8) railGesture.moved = true;
  }, { passive: true });
  const endRailGesture = event => {
    if (railGesture?.moved || event.type === 'pointercancel') suppressClickUntil = Date.now() + 350;
    railGesture = null;
  };
  window.addEventListener('pointerup', endRailGesture, { passive: true });
  rail.addEventListener('pointercancel', endRailGesture, { passive: true });
  rail.addEventListener('click', event => {
    if (Date.now() < suppressClickUntil || railGesture?.moved) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  rail.addEventListener('scroll', () => { if (!galleryFrame) galleryFrame = requestAnimationFrame(updateGallery); }, { passive: true });
  new ResizeObserver(() => { if (!galleryFrame) galleryFrame = requestAnimationFrame(updateGallery); }).observe(rail);
  $('#gallery-prev').addEventListener('click', () => stepGallery(-1));
  $('#gallery-next').addEventListener('click', () => stepGallery(1));
  rail.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); stepGallery(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  $('#video-play').addEventListener('click', () => { userPaused = !video.paused; syncVideo(); });
  $('#video-sound').addEventListener('click', () => { video.muted = !video.muted; if (!video.muted) userPaused = false; syncVideo(); });
  ['play', 'pause', 'volumechange', 'loadeddata', 'error'].forEach(name => video.addEventListener(name, updateVideoButtons));
  document.addEventListener('visibilitychange', syncVideo);
  reduced.addEventListener('change', () => { if (reduced.matches) userPaused = true; syncVideo(); });
  window.addEventListener('popstate', syncRoute);
  window.addEventListener('hashchange', syncRoute);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const initial = readRoute();
  history.replaceState({ ...history.state, mobileView: initial.view, mobileViewerEntry: false }, '', routeURL(initial.view, initial.id));
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
  syncRoute();
})();
