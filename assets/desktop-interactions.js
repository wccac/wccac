/* Desktop artwork browsing. The hero film, route illustration and gold cursor remain independent. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rail = $('#silk-rail');
  const modal = $('#modal'), modalImage = $('#modal-img'), modalTitle = $('#modal-title');
  const modalInner = modal?.querySelector('.modal-inner');
  const modalClose = modal?.querySelector('.close');
  const modalReady = !!(modal && modalImage && modalTitle && modalInner);
  const cursor = $('.cursor');
  const artTriggers = [...document.querySelectorAll('[data-title]')].filter(element =>
    !element.closest('#modal,[aria-hidden="true"]') && element.querySelector('img'));
  const works = artTriggers.map(element => ({
    element, image: element.querySelector('img'), title: element.dataset.title || '',
    type: element.dataset.type || '', description: element.dataset.desc || ''
  }));
  const workIndex = new WeakMap();
  const modalIsOpen = () => modalReady && modal.classList.contains('open');
  let activeWork = -1, returnFocus = null, bodySnapshot = null, inertSnapshot = [];
  let ignoreRailClickUntil = 0;

  const prepareTrigger = (element, index, copy = false) => {
    workIndex.set(element, index);
    if (!element.matches('button,a[href],input,select,textarea')) {
      element.setAttribute('role', 'button');
      element.tabIndex = copy ? -1 : 0;
    } else if (copy) element.tabIndex = -1;
    element.setAttribute('aria-haspopup', 'dialog');
    if (!element.hasAttribute('aria-label')) element.setAttribute('aria-label', `查看${works[index].title}大图和作品说明`);
    element.querySelectorAll('img').forEach(image => { image.draggable = false; });
  };
  works.forEach((work, index) => prepareTrigger(work.element, index));
  const resolveWork = trigger => {
    const known = workIndex.get(trigger);
    if (known !== undefined) return known;
    const image = trigger?.querySelector('img');
    return works.findIndex(work => work.title === trigger?.dataset.title && (!image || work.image.src === image.src));
  };

  // Three identical runs keep drag movement continuous in either direction.
  const originalCards = rail ? [...rail.children].filter(card => card.classList.contains('work')) : [];
  const lensToggle = $('#lens-toggle');
  let lensEnabled = false, activeLens = null;
  originalCards.forEach(card => {
    card.classList.add('magnify');
    const lens = document.createElement('i');
    lens.className = 'lens'; lens.setAttribute('aria-hidden', 'true');
    card.appendChild(lens);
  });
  let leadingCards = [], trailingCards = [];
  const copyCard = original => {
    const copy = original.cloneNode(true);
    copy.dataset.galleryCopy = 'true';
    copy.setAttribute('aria-hidden', 'true');
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    copy.querySelectorAll('a,button,[tabindex]').forEach(element => { element.tabIndex = -1; });
    const index = resolveWork(original);
    if (index >= 0) prepareTrigger(copy, index, true);
    // aria-hidden copies remain pointer targets; keyboard users visit only the originals.
    copy.addEventListener('pointerenter', () => cursor?.classList.add('on'));
    copy.addEventListener('pointerleave', () => cursor?.classList.remove('on'));
    return copy;
  };
  if (rail && originalCards.length > 1) {
    leadingCards = originalCards.map(copyCard);
    trailingCards = originalCards.map(copyCard);
    rail.prepend(...leadingCards); rail.append(...trailingCards);
  }
  let railPosition = 0, railBase = 0, railLoop = 0, railOffsets = [];
  let railVisible = false, railPaused = reduced.matches, railFrame = 0, railLastTime = 0;
  let railResumeAt = 0, railDrag = null, railTween = null, lastWrittenLeft = 0;
  let railIndex = 0, railLayoutReady = false;
  const railSpeed = 76;
  const mod = (value, divisor) => divisor ? ((value % divisor) + divisor) % divisor : 0;
  const normalizePosition = value => railLoop ? railBase + mod(value - railBase, railLoop) : value;
  const railCanRun = () => !!(rail && railLoop && railVisible && !document.hidden && !modalIsOpen() && !railDrag && !activeLens && (!railPaused || railTween));
  const updateRailControls = () => {
    const pause = $('#gallery-pause');
    if (pause) {
      pause.textContent = railPaused ? '播放轮播' : '暂停轮播';
      pause.setAttribute('aria-pressed', String(!railPaused));
      pause.setAttribute('aria-label', pause.textContent);
    }
    const count = $('#gallery-count');
    if (count) count.textContent = `${String(railIndex + 1).padStart(2, '0')} / ${String(originalCards.length).padStart(2, '0')}`;
    ['#gallery-prev', '#gallery-next'].forEach(selector => {
      const button = $(selector);
      if (button) button.disabled = originalCards.length < 2;
    });
  };
  const updateRailIndex = () => {
    const relative = mod(railPosition - railBase, railLoop);
    let distance = Infinity;
    railOffsets.forEach((offset, index) => {
      const delta = Math.abs(relative - offset);
      if (delta < distance) { railIndex = index; distance = delta; }
    });
    updateRailControls();
  };
  const writeRail = position => {
    if (!rail) return;
    railPosition = normalizePosition(position);
    rail.scrollLeft = railPosition;
    lastWrittenLeft = rail.scrollLeft;
    updateRailIndex();
  };
  const measureRail = () => {
    if (!rail || !originalCards.length || !rail.clientWidth) return;
    hideLens();
    const oldFraction = railLayoutReady && railLoop ? mod(railPosition - railBase, railLoop) / railLoop : 0;
    const first = rail.firstElementChild;
    railBase = originalCards[0].offsetLeft - first.offsetLeft;
    railLoop = leadingCards.length ? originalCards[0].offsetLeft - leadingCards[0].offsetLeft : 0;
    railOffsets = originalCards.map(card => card.offsetLeft - originalCards[0].offsetLeft);
    railLayoutReady = true;
    railTween = null;
    writeRail(railBase + oldFraction * railLoop);
    syncRail();
  };
  const holdRail = (milliseconds = 2600) => { railResumeAt = performance.now() + milliseconds; };
  const paintRail = now => {
    railFrame = 0;
    if (!railCanRun()) { railLastTime = 0; return; }
    const dt = railLastTime ? Math.min(48, Math.max(0, now - railLastTime)) : 0;
    railLastTime = now;
    if (railTween) {
      if (railTween.start === null) railTween.start = now;
      const progress = Math.min(1, Math.max(0, (now - railTween.start) / railTween.duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      writeRail(railTween.from + (railTween.to - railTween.from) * eased);
      if (progress === 1) { railTween = null; holdRail(); }
    } else if (now >= railResumeAt) writeRail(railPosition + railSpeed * dt / 1000);
    if (railCanRun()) railFrame = requestAnimationFrame(paintRail);
  };
  function syncRail() {
    updateRailControls();
    if (!railCanRun()) {
      cancelAnimationFrame(railFrame); railFrame = 0; railLastTime = 0;
    } else if (!railFrame) railFrame = requestAnimationFrame(paintRail);
  }
  function hideLens() {
    if (!activeLens) return;
    activeLens.classList.remove('is-visible'); activeLens = null;
    document.body.classList.remove('lens-mode');
    holdRail(350); syncRail();
  }
  const moveLens = event => {
    const card = event.target.closest('.work');
    if (!lensEnabled || event.pointerType === 'touch' || railDrag || modalIsOpen() || !card || !rail?.contains(card)) {
      hideLens(); return;
    }
    const image = card.querySelector('img'), lens = card.querySelector('.lens');
    if (!image?.naturalWidth || !lens) { hideLens(); return; }
    const box = image.getBoundingClientRect(), cardBox = card.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    if (!box.width || !box.height || x < 0 || y < 0 || x > box.width || y > box.height) { hideLens(); return; }
    if (activeLens !== lens) {
      hideLens(); activeLens = lens; railTween = null;
      lens.classList.add('is-visible'); document.body.classList.add('lens-mode'); syncRail();
    }
    // Match the visible cover crop before magnifying, including portrait artwork.
    const zoom = 2.7, radius = lens.offsetWidth / 2;
    const scale = Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    const centerX = Math.max(radius, Math.min(box.width - radius, x));
    const centerY = Math.max(radius, Math.min(box.height - radius, y));
    Object.assign(lens.style, {
      left: `${box.left - cardBox.left + centerX - radius}px`,
      top: `${box.top - cardBox.top + centerY - radius}px`,
      backgroundImage: `url(${JSON.stringify(image.currentSrc || image.src)})`,
      backgroundSize: `${width * zoom}px ${height * zoom}px`,
      backgroundPosition: `${radius - (x + (width - box.width) / 2) * zoom}px ${radius - (y + (height - box.height) / 2) * zoom}px`
    });
  };
  lensToggle?.addEventListener('click', () => {
    lensEnabled = !lensEnabled;
    rail?.closest('.gallery')?.classList.toggle('lens-enabled', lensEnabled);
    lensToggle.classList.toggle('is-on', lensEnabled);
    lensToggle.setAttribute('aria-pressed', String(lensEnabled));
    lensToggle.querySelector('span').textContent = lensEnabled ? '关闭刺绣放大镜' : '开启刺绣放大镜';
    const hint = $('#gallery-hint');
    if (hint) hint.textContent = lensEnabled ? '移入绣面，细看针脚。点击作品，查看完整画面。' : '绣卷缓行，花木相逢。拖动浏览，或轻触一幅作品。';
    if (!lensEnabled) hideLens();
  });
  const stepRail = direction => {
    if (!rail || !railLoop || originalCards.length < 2) return;
    hideLens();
    railTween = null;
    const relative = mod(railPosition - railBase, railLoop);
    let target;
    if (direction > 0) target = railOffsets.find(offset => offset > relative + 3) ?? railLoop;
    else target = [...railOffsets].reverse().find(offset => offset < relative - 3) ?? railOffsets[railOffsets.length - 1] - railLoop;
    holdRail();
    const destination = railPosition + target - relative;
    if (reduced.matches) writeRail(destination);
    else railTween = { from: railPosition, to: destination, start: null, duration: 520 };
    syncRail();
  };
  if (rail) {
    rail.style.scrollBehavior = 'auto';
    rail.style.touchAction = 'pan-y pinch-zoom';
    rail.addEventListener('dragstart', event => event.preventDefault());
    rail.addEventListener('pointerdown', event => {
      if (railDrag || event.button !== 0 || originalCards.length < 2) return;
      hideLens();
      railTween = null; holdRail();
      railDrag = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, moved: false };
      const capture = event.target.closest('.work') || rail;
      capture.setPointerCapture(event.pointerId);
      railDrag.capture = capture;
      rail.classList.add('dragging'); syncRail();
    });
    rail.addEventListener('pointermove', event => {
      if (!railDrag || event.pointerId !== railDrag.id) return;
      if (Math.abs(event.clientX - railDrag.startX) > 6) railDrag.moved = true;
      if (railDrag.moved) {
        writeRail(railPosition - (event.clientX - railDrag.lastX) * 1.1);
        event.preventDefault();
      }
      railDrag.lastX = event.clientX;
    });
    rail.addEventListener('pointermove', moveLens);
    rail.addEventListener('pointerleave', hideLens);
    window.addEventListener('scroll', hideLens, { passive: true });
    window.addEventListener('blur', hideLens);
    const endDrag = event => {
      if (!railDrag || event.pointerId !== railDrag.id) return;
      const previous = railDrag;
      railDrag = null;
      if (previous.moved || event.type === 'pointercancel') ignoreRailClickUntil = performance.now() + 300;
      if (previous.capture.hasPointerCapture?.(previous.id)) previous.capture.releasePointerCapture(previous.id);
      rail.classList.remove('dragging'); holdRail(); syncRail();
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => rail.addEventListener(name, endDrag));
    window.addEventListener('pointerup', endDrag);
    rail.addEventListener('click', event => {
      if (performance.now() < ignoreRailClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    rail.addEventListener('wheel', event => {
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
      if (!horizontal || !railLoop) return;
      hideLens();
      event.preventDefault(); railTween = null; holdRail();
      writeRail(railPosition + (event.deltaX || event.deltaY)); syncRail();
    }, { passive: false });
    rail.addEventListener('scroll', () => {
      if (!railLayoutReady || Math.abs(rail.scrollLeft - lastWrittenLeft) < 1) return;
      railTween = null; holdRail(); writeRail(rail.scrollLeft); syncRail();
    }, { passive: true });
    $('#gallery-prev')?.addEventListener('click', () => stepRail(-1));
    $('#gallery-next')?.addEventListener('click', () => stepRail(1));
    $('#gallery-pause')?.addEventListener('click', () => {
      railPaused = !railPaused; railResumeAt = 0; syncRail();
    });
    rail.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); stepRail(event.key === 'ArrowLeft' ? -1 : 1);
    });
    new ResizeObserver(measureRail).observe(rail);
    new IntersectionObserver(entries => { railVisible = entries[0].isIntersecting; syncRail(); }, { threshold: .12 }).observe(rail);
    measureRail();
  }

  // Repeated panels overlap softly; all copies open the same complete work.
  const scrollScene = $('#lingjing-scroll');
  const scrollTrack = scrollScene?.querySelector('.scroll-track');
  const scrollPanels = scrollScene ? [...scrollScene.querySelectorAll('.scroll-panel')] : [];
  let scrollVisible = false, scrollPaused = reduced.matches;
  const sourcePanel = scrollPanels.find(panel => panel.hasAttribute('data-title'));
  if (sourcePanel) {
    const sourceIndex = resolveWork(sourcePanel);
    scrollPanels.forEach(panel => {
      if (sourceIndex < 0) return;
      panel.dataset.title = works[sourceIndex].title;
      panel.dataset.type = works[sourceIndex].type;
      panel.dataset.desc = works[sourceIndex].description;
      prepareTrigger(panel, sourceIndex, panel !== sourcePanel);
    });
  }
  function syncScroll() {
    if (!scrollScene) return;
    const inactive = !scrollVisible || document.hidden || modalIsOpen();
    scrollScene.dataset.offscreen = String(inactive);
    scrollScene.classList.toggle('is-paused', scrollPaused);
    if (scrollTrack) scrollTrack.style.animationPlayState = scrollPaused || inactive ? 'paused' : 'running';
    const button = $('#scroll-pause');
    if (button) {
      button.textContent = scrollPaused ? '播放长卷' : '暂停长卷';
      button.setAttribute('aria-pressed', String(!scrollPaused));
    }
  }
  if (scrollScene) {
    $('#scroll-pause')?.addEventListener('click', () => { scrollPaused = !scrollPaused; syncScroll(); });
    new IntersectionObserver(entries => { scrollVisible = entries[0].isIntersecting; syncScroll(); }, { threshold: .08 }).observe(scrollScene);
    if (scrollTrack && scrollPanels[0]) {
      const setDuration = () => {
        const width = scrollPanels[0].getBoundingClientRect().width;
        if (width) scrollTrack.style.setProperty('--scroll-duration', `${Math.max(28, (width - window.innerWidth * .03) / 38).toFixed(2)}s`);
      };
      new ResizeObserver(setDuration).observe(scrollPanels[0]); setDuration();
    }
  }

  const setBackgroundInert = () => {
    inertSnapshot = [...document.querySelectorAll('body > main,body > nav,body > footer')].filter(element => !element.contains(modal)).map(element => ({ element, attribute: element.getAttribute('inert') }));
    inertSnapshot.forEach(({ element }) => element.setAttribute('inert', ''));
  };
  const restoreBackgroundInert = () => {
    inertSnapshot.forEach(({ element, attribute }) => {
      if (attribute === null) element.removeAttribute('inert'); else element.setAttribute('inert', attribute);
    });
    inertSnapshot = [];
  };
  const lockBody = () => {
    if (bodySnapshot) return;
    bodySnapshot = { style: document.body.getAttribute('style'), y: window.scrollY };
    const width = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    Object.assign(document.body.style, { position: 'fixed', top: `-${bodySnapshot.y}px`, left: '0', width: '100%', overflow: 'hidden' });
    if (width) document.body.style.paddingRight = `${width}px`;
  };
  const unlockBody = () => {
    if (!bodySnapshot) return;
    const previous = bodySnapshot; bodySnapshot = null;
    if (previous.style === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', previous.style);
    window.scrollTo({ top: previous.y, behavior: 'instant' });
  };
  const renderWork = index => {
    const work = works[index];
    if (!work || !modalReady) return;
    activeWork = index;
    modalImage.src = work.image.currentSrc || work.image.src;
    modalImage.alt = work.title;
    modalTitle.textContent = work.title;
    if ($('#modal-type')) $('#modal-type').textContent = work.type;
    if ($('#modal-description')) $('#modal-description').textContent = work.description;
    if ($('#modal-count')) $('#modal-count').textContent = `${String(index + 1).padStart(2, '0')} / ${String(works.length).padStart(2, '0')}`;
    if ($('#modal-prev')) $('#modal-prev').disabled = index === 0;
    if ($('#modal-next')) $('#modal-next').disabled = index === works.length - 1;
    modal.querySelector('.modal-stage')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };
  const openModal = (index, trigger) => {
    if (!modalReady || !works[index]) return;
    hideLens();
    if (!modalIsOpen()) {
      const candidate = trigger || document.activeElement;
      returnFocus = candidate?.closest('[aria-hidden="true"]') ? works[index].element : candidate;
      lockBody(); setBackgroundInert();
      modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
      if (!modalInner.hasAttribute('tabindex')) modalInner.tabIndex = -1;
      (modalClose || modalInner).focus({ preventScroll: true });
    }
    railTween = null; holdRail();
    renderWork(index); syncRail(); syncScroll();
  };
  const closeModal = () => {
    if (!modalIsOpen()) return;
    modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
    restoreBackgroundInert(); unlockBody();
    if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus({ preventScroll: true });
    returnFocus = null; activeWork = -1; holdRail(); syncRail(); syncScroll();
  };
  const nextWork = direction => {
    const index = activeWork + direction;
    if (modalIsOpen() && works[index]) renderWork(index);
  };
  if (modalReady) {
    document.addEventListener('click', event => {
      if (event.target.closest('#modal') || event.target.closest('#gallery-prev,#gallery-next,#gallery-pause,#scroll-pause,#lens-toggle')) return;
      const trigger = event.target.closest('[data-title]');
      if (!trigger || (rail?.contains(trigger) && performance.now() < ignoreRailClickUntil)) return;
      const index = resolveWork(trigger);
      if (index >= 0) openModal(index, trigger);
    });
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('.close')) closeModal();
    });
    $('#modal-prev')?.addEventListener('click', () => nextWork(-1));
    $('#modal-next')?.addEventListener('click', () => nextWork(1));
    document.addEventListener('keydown', event => {
      if (!modalIsOpen()) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const trigger = event.target.closest('[data-title]');
        if (!trigger || trigger.matches('button,a[href],input,select,textarea') || trigger.closest('[aria-hidden="true"]')) return;
        const index = resolveWork(trigger);
        if (index >= 0) { event.preventDefault(); openModal(index, trigger); }
        return;
      }
      if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
      if (event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); nextWork(event.key === 'ArrowLeft' ? -1 : 1); }
      if (event.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(element => !element.closest('[hidden],[inert]') && element.getClientRects().length);
        const first = focusable[0] || modalInner, last = focusable[focusable.length - 1] || modalInner;
        if (!focusable.length || !modal.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
        } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
      }
    });
    document.addEventListener('focusin', event => {
      if (modalIsOpen() && !modal.contains(event.target)) (modalClose || modalInner).focus({ preventScroll: true });
    });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) hideLens(); syncRail(); syncScroll(); });
  reduced.addEventListener('change', () => {
    if (reduced.matches) { railPaused = true; scrollPaused = true; railTween = null; }
    syncRail(); syncScroll();
  });
  updateRailControls(); syncScroll();
})();
