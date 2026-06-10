const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const debounce = (callback, delay = 120) => {
	let timerId = 0;
	return (...args) => {
		window.clearTimeout(timerId);
		timerId = window.setTimeout(() => callback(...args), delay);
	};
};

const onMediaQueryChange = (mediaQuery, handler) => {
	if (typeof mediaQuery.addEventListener === 'function') {
		mediaQuery.addEventListener('change', handler);
	} else {
		mediaQuery.addListener(handler);
	}
};

const onVisibilityChange = (onVisible, onHidden) => {
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
			onHidden();
		} else {
			onVisible();
		}
	});
};

const whenFontsReady = (callback) => {
	if (document.fonts?.ready) {
		document.fonts.ready.finally(callback);
		return;
	}
	callback();
};

const setTextContent = (elements, value) => {
	for (const element of elements) {
		if (element instanceof HTMLElement) element.textContent = value;
	}
};

// parallax
(() => {
	const parallaxRoot = document.querySelector('.js-hero-parallax');
	if (!parallaxRoot || prefersReducedMotion()) return;

	for (const figure of parallaxRoot.querySelectorAll('[data-depth]')) {
		const depth = Number.parseFloat(figure.dataset.depth ?? '0');
		figure.style.setProperty('--depth', Number.isFinite(depth) ? String(depth) : '0');
	}

	const supportsFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	const MAX_X = 28;
	const MAX_Y = 18;

	let targetX = 0;
	let targetY = 0;
	let currentX = 0;
	let currentY = 0;
	let rafId = 0;

	const render = () => {
		parallaxRoot.style.setProperty('--parallax-x', `${currentX.toFixed(2)}px`);
		parallaxRoot.style.setProperty('--parallax-y', `${currentY.toFixed(2)}px`);
	};

	const tick = () => {
		currentX += (targetX - currentX) * 0.08;
		currentY += (targetY - currentY) * 0.08;
		render();
		rafId = window.requestAnimationFrame(tick);
	};

	const start = () => {
		if (!rafId) rafId = window.requestAnimationFrame(tick);
	};

	const stop = () => {
		if (!rafId) return;
		window.cancelAnimationFrame(rafId);
		rafId = 0;
	};

	const updateFromPointer = (event) => {
		const normalizedX = (event.clientX / window.innerWidth - 0.5) * 2;
		const normalizedY = (event.clientY / window.innerHeight - 0.5) * 2;
		targetX = clamp(normalizedX, -1, 1) * MAX_X;
		targetY = clamp(normalizedY, -1, 1) * MAX_Y;
	};

	const updateFromScroll = () => {
		targetX = 0;
		targetY = -clamp(window.scrollY / window.innerHeight, 0, 1) * MAX_Y;
	};

	if (supportsFinePointer) {
		window.addEventListener('pointermove', updateFromPointer, { passive: true });
	} else {
		window.addEventListener('scroll', updateFromScroll, { passive: true });
		updateFromScroll();
	}

	onVisibilityChange(start, stop);
	start();
})();

// ticker scroll
(() => {
	const tickers = Array.from(document.querySelectorAll('.ticker'));
	if (!tickers.length || prefersReducedMotion()) return;

	const SPEED_PX_PER_SEC = 70;
	const instances = tickers
		.map((ticker) => {
			const track = ticker.querySelector('.ticker__track');
			const baseInner = track?.querySelector('.ticker__inner');
			if (!(track instanceof HTMLElement) || !(baseInner instanceof HTMLElement)) return null;

			return {
				ticker,
				track,
				baseInner,
				baseWidth: 0,
				offsetX: 0,
				rafId: 0,
				lastTs: 0,
			};
		})
		.filter(Boolean);

	if (!instances.length) return;

	const scheduleTick = (instance) => {
		instance.rafId = window.requestAnimationFrame((ts) => tick(instance, ts));
	};

	const clearClones = (instance) => {
		for (const clone of instance.track.querySelectorAll('[data-ticker-clone="true"]')) {
			clone.remove();
		}
	};

	const syncClones = (instance) => {
		clearClones(instance);
		instance.baseWidth = instance.baseInner.getBoundingClientRect().width;
		if (!instance.baseWidth) return;

		const viewportWidth = instance.ticker.getBoundingClientRect().width;
		const clonesNeeded = Math.max(1, Math.ceil(viewportWidth / instance.baseWidth));
		for (let i = 0; i < clonesNeeded; i += 1) {
			const clone = instance.baseInner.cloneNode(true);
			if (!(clone instanceof HTMLElement)) continue;
			clone.setAttribute('aria-hidden', 'true');
			clone.dataset.tickerClone = 'true';
			instance.track.append(clone);
		}
	};

	const reset = (instance) => {
		instance.offsetX = 0;
		instance.lastTs = 0;
		instance.track.style.transform = 'translate3d(0px, 0px, 0px)';
		syncClones(instance);
	};

	const tick = (instance, ts) => {
		if (!instance.baseWidth) {
			scheduleTick(instance);
			return;
		}

		if (!instance.lastTs) instance.lastTs = ts;
		const dt = clamp(ts - instance.lastTs, 0, 64) / 1000;
		instance.lastTs = ts;

		instance.offsetX -= SPEED_PX_PER_SEC * dt;
		if (instance.offsetX <= -instance.baseWidth) instance.offsetX += instance.baseWidth;

		instance.track.style.transform = `translate3d(${instance.offsetX.toFixed(2)}px, 0px, 0px)`;
		scheduleTick(instance);
	};

	const start = (instance) => {
		if (!instance.rafId) scheduleTick(instance);
	};

	const stop = (instance) => {
		if (!instance.rafId) return;
		window.cancelAnimationFrame(instance.rafId);
		instance.rafId = 0;
	};

	const resetAll = debounce(() => {
		for (const instance of instances) reset(instance);
	});

	onVisibilityChange(
		() => {
			for (const instance of instances) start(instance);
		},
		() => {
			for (const instance of instances) stop(instance);
		},
	);

	window.addEventListener('resize', resetAll, { passive: true });

	whenFontsReady(() => {
		for (const instance of instances) {
			reset(instance);
			start(instance);
		}
	});
})();

// steps slider
(() => {
	const root = document.querySelector('.js-steps');
	if (!root) return;

	const viewport = root.querySelector('.steps__viewport');
	const track = root.querySelector('.steps__track');
	if (!(viewport instanceof HTMLElement) || !(track instanceof HTMLElement)) return;

	const prevBtn = root.querySelector('[data-steps-prev]');
	const nextBtn = root.querySelector('[data-steps-next]');
	const dotsWrap = root.querySelector('[data-steps-dots]');
	const plane = root.querySelector('.steps__plane');
	const sliderRoot = root.querySelector('.steps__slider');
	const desktopPlaneHost = root.querySelector('.steps-item--7');
	const mobileMq = window.matchMedia('(max-width: 1023px)');
	const items = Array.from(track.querySelectorAll('.steps-item'));
	const mobileGroups = [[0, 1], [2], [3, 4], [5], [6]];

	if (!items.length) return;

	let currentIndex = 0;
	let rafScroll = 0;
	let isMobile = false;

	const getSlides = () =>
		Array.from(track.children).filter(
			(child) =>
				child instanceof HTMLElement &&
				(child.classList.contains('steps-card') || child.classList.contains('steps-item')),
		);

	const getOffsets = () => getSlides().map((slide) => slide.offsetLeft);

	const replaceTrackChildren = (children) => {
		track.replaceChildren(...children);
	};

	const createCard = (indexes) => {
		const card = document.createElement('div');
		card.className = 'steps-card';
		for (const index of indexes) {
			const item = items[index];
			if (item) card.append(item);
		}
		return card;
	};

	const buildSlides = () => {
		if (isMobile) {
			replaceTrackChildren(mobileGroups.map(createCard));
			return;
		}
		replaceTrackChildren(items);
	};

	const ensureDots = () => {
		if (!(dotsWrap instanceof HTMLElement)) return;

		const slides = getSlides();
		if (dotsWrap.childElementCount === slides.length) return;

		const fragment = document.createDocumentFragment();
		for (let i = 0; i < slides.length; i += 1) {
			const dot = document.createElement('button');
			dot.type = 'button';
			dot.className = 'steps__dot';
			dot.dataset.stepsIndex = String(i);
			dot.setAttribute('aria-label', `Слайд ${i + 1}`);
			fragment.append(dot);
		}

		dotsWrap.replaceChildren(fragment);
	};

	const movePlane = () => {
		if (!(plane instanceof HTMLElement)) return;

		const target = isMobile ? sliderRoot : desktopPlaneHost;
		if (target instanceof HTMLElement && plane.parentElement !== target) {
			target.append(plane);
		}
	};

	const updateControls = () => {
		const maxIndex = Math.max(0, getSlides().length - 1);
		currentIndex = clamp(currentIndex, 0, maxIndex);

		if (prevBtn instanceof HTMLButtonElement) prevBtn.disabled = !isMobile || currentIndex === 0;
		if (nextBtn instanceof HTMLButtonElement)
			nextBtn.disabled = !isMobile || currentIndex === maxIndex;

		if (!(dotsWrap instanceof HTMLElement)) return;
		const dots = dotsWrap.querySelectorAll('.steps__dot');
		for (let i = 0; i < dots.length; i += 1) {
			dots[i].setAttribute('aria-current', i === currentIndex ? 'true' : 'false');
		}
	};

	const scrollToIndex = (index, behavior = prefersReducedMotion() ? 'auto' : 'smooth') => {
		const target = getOffsets()[index] ?? 0;
		viewport.scrollTo({ left: target, behavior });
	};

	const setIndex = (nextIndex, behavior) => {
		currentIndex = clamp(nextIndex, 0, Math.max(0, getSlides().length - 1));
		updateControls();
		if (isMobile) scrollToIndex(currentIndex, behavior);
	};

	const syncIndexFromScroll = () => {
		if (!isMobile) return;

		const offsets = getOffsets();
		if (!offsets.length) return;

		let bestIndex = 0;
		let bestDistance = Number.POSITIVE_INFINITY;

		for (let i = 0; i < offsets.length; i += 1) {
			const distance = Math.abs(offsets[i] - viewport.scrollLeft);
			if (distance < bestDistance) {
				bestDistance = distance;
				bestIndex = i;
			}
		}

		if (bestIndex === currentIndex) return;
		currentIndex = bestIndex;
		updateControls();
	};

	const onScroll = () => {
		if (!isMobile || rafScroll) return;
		rafScroll = window.requestAnimationFrame(() => {
			rafScroll = 0;
			syncIndexFromScroll();
		});
	};

	const applyMode = () => {
		isMobile = mobileMq.matches;
		buildSlides();
		ensureDots();
		movePlane();

		if (!isMobile) {
			currentIndex = 0;
			viewport.scrollLeft = 0;
			updateControls();
			return;
		}

		updateControls();
		scrollToIndex(currentIndex, 'auto');
		syncIndexFromScroll();
	};

	const handleResize = debounce(() => {
		applyMode();
		if (isMobile) scrollToIndex(currentIndex, 'auto');
	});

	if (prevBtn instanceof HTMLButtonElement) {
		prevBtn.addEventListener('click', () => setIndex(currentIndex - 1));
	}

	if (nextBtn instanceof HTMLButtonElement) {
		nextBtn.addEventListener('click', () => setIndex(currentIndex + 1));
	}

	if (dotsWrap instanceof HTMLElement) {
		dotsWrap.addEventListener('click', (event) => {
			const button =
				event.target instanceof HTMLElement ? event.target.closest('.steps__dot') : null;
			if (!(button instanceof HTMLElement)) return;

			const index = Number.parseInt(button.dataset.stepsIndex ?? '', 10);
			if (Number.isFinite(index)) setIndex(index);
		});
	}

	viewport.addEventListener('scroll', onScroll, { passive: true });
	viewport.addEventListener('keydown', (event) => {
		if (!isMobile) return;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			setIndex(currentIndex - 1);
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			setIndex(currentIndex + 1);
		}
	});

	window.addEventListener('resize', handleResize, { passive: true });
	onMediaQueryChange(mobileMq, applyMode);

	applyMode();
})();

// participants slider
(() => {
	const root = document.querySelector('.js-participants');
	if (!root) return;

	const track = root.querySelector('[data-participants-track]');
	if (!(track instanceof HTMLElement)) return;

	const prevButtons = Array.from(root.querySelectorAll('[data-participants-prev]')).filter(
		(button) => button instanceof HTMLButtonElement,
	);
	const nextButtons = Array.from(root.querySelectorAll('[data-participants-next]')).filter(
		(button) => button instanceof HTMLButtonElement,
	);
	const currentCounters = Array.from(root.querySelectorAll('[data-participants-current]'));
	const totalCounters = Array.from(root.querySelectorAll('[data-participants-total]'));
	const originalCards = Array.from(track.children).filter((card) => card instanceof HTMLElement);
	const mobileMq = window.matchMedia('(max-width: 767px)');

	if (!originalCards.length) return;

	const AUTO_DELAY = 4000;
	const TRANSITION_MS = 500;

	let visibleCount = mobileMq.matches ? 1 : 3;
	let clonesPerSide = visibleCount;
	let currentIndex = 0;
	let slideWidth = 0;
	let gap = 0;
	let autoTimer = 0;
	let isAnimating = false;

	const wrapIndex = (index) =>
		((index % originalCards.length) + originalCards.length) % originalCards.length;

	const updateCurrentCounter = () => {
		const visibleIndex = ((currentIndex + visibleCount - 1) % originalCards.length) + 1;
		setTextContent(currentCounters, String(visibleIndex));
	};

	const clearClones = () => {
		for (const clone of track.querySelectorAll('[data-participants-clone="true"]')) {
			clone.remove();
		}
	};

	const createClone = (card) => {
		const clone = card.cloneNode(true);
		if (!(clone instanceof HTMLElement)) return clone;

		clone.dataset.participantsClone = 'true';
		clone.setAttribute('aria-hidden', 'true');

		for (const focusable of clone.querySelectorAll(
			'a, button, input, textarea, select, [tabindex]',
		)) {
			if (focusable instanceof HTMLElement) focusable.setAttribute('tabindex', '-1');
		}

		return clone;
	};

	const buildLoop = () => {
		clearClones();
		clonesPerSide = Math.min(visibleCount, originalCards.length);

		const prependFragment = document.createDocumentFragment();
		const appendFragment = document.createDocumentFragment();

		for (let i = originalCards.length - clonesPerSide; i < originalCards.length; i += 1) {
			prependFragment.append(createClone(originalCards[i]));
		}

		for (let i = 0; i < clonesPerSide; i += 1) {
			appendFragment.append(createClone(originalCards[i]));
		}

		track.prepend(prependFragment);
		track.append(appendFragment);
	};

	const measure = () => {
		const firstCard = track.querySelector('.participant-card');
		if (!(firstCard instanceof HTMLElement)) return false;

		slideWidth = firstCard.getBoundingClientRect().width;
		const styles = window.getComputedStyle(track);
		const parsedGap = Number.parseFloat(styles.columnGap || styles.gap || '0');
		gap = Number.isFinite(parsedGap) ? parsedGap : 0;

		return slideWidth > 0;
	};

	const setTransition = (enabled) => {
		track.style.transition = enabled ? `transform ${TRANSITION_MS}ms ease` : 'none';
	};

	const applyPosition = (animate) => {
		const offset = (slideWidth + gap) * (clonesPerSide + currentIndex);
		setTransition(animate);
		track.style.transform = `translate3d(${-offset}px, 0px, 0px)`;
	};

	const jumpTo = (index) => {
		currentIndex = index;
		applyPosition(false);
		void track.offsetHeight;
		updateCurrentCounter();
	};

	const moveTo = (nextIndex) => {
		if (isAnimating || !measure()) return;
		currentIndex = nextIndex;
		isAnimating = true;
		updateCurrentCounter();
		applyPosition(true);
	};

	const normalizeIndex = () => {
		if (currentIndex >= originalCards.length) {
			jumpTo(0);
			return;
		}

		if (currentIndex < 0) {
			jumpTo(originalCards.length - 1);
			return;
		}

		updateCurrentCounter();
	};

	const stopAuto = () => {
		if (!autoTimer) return;
		window.clearInterval(autoTimer);
		autoTimer = 0;
	};

	const startAuto = () => {
		if (prefersReducedMotion() || autoTimer) return;
		autoTimer = window.setInterval(() => moveTo(currentIndex + 1), AUTO_DELAY);
	};

	const rebuild = () => {
		visibleCount = mobileMq.matches ? 1 : 3;
		isAnimating = false;
		buildLoop();
		measure();
		jumpTo(wrapIndex(currentIndex));
		startAuto();
	};

	const handleResize = debounce(() => {
		stopAuto();
		rebuild();
	});

	const bindMoveButton = (buttons, step) => {
		for (const button of buttons) {
			button.addEventListener('click', () => {
				stopAuto();
				moveTo(currentIndex + step);
				startAuto();
			});
		}
	};

	bindMoveButton(prevButtons, -1);
	bindMoveButton(nextButtons, 1);

	track.addEventListener('transitionend', (event) => {
		if (event.target !== track || event.propertyName !== 'transform') return;
		isAnimating = false;
		normalizeIndex();
	});

	root.addEventListener('mouseenter', stopAuto);
	root.addEventListener('mouseleave', startAuto);
	root.addEventListener('focusin', stopAuto);
	root.addEventListener('focusout', (event) => {
		const nextTarget = event.relatedTarget;
		if (nextTarget instanceof Node && root.contains(nextTarget)) return;
		startAuto();
	});

	onVisibilityChange(startAuto, stopAuto);
	window.addEventListener('resize', handleResize, { passive: true });
	onMediaQueryChange(mobileMq, handleResize);

	setTextContent(totalCounters, String(originalCards.length));

	whenFontsReady(rebuild);
})();
