// Resizer behavior: draggable divider between <main> and <aside>.
// - Supports mouse and touch dragging
// - Keyboard adjustments with ArrowLeft/ArrowRight
// - Double-click to reset
// - Updates the CSS variable --aside-width on the <aside> element

(function () {
    'use strict';

    const resizer = document.querySelector('.resizer');
    const aside = document.querySelector('aside');
    if (!resizer || !aside) return;

    const MIN_WIDTH = 200; // px
    const MAX_PCT = 0.6; // 60% of window width
    const KEY_STEP = 20; // px per arrow key press

    let isResizing = false;

    const clientX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);

    function onPointerDown(e) {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.classList.add('resizing');

        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
        window.addEventListener('touchmove', onPointerMove, { passive: false });
        window.addEventListener('touchend', onPointerUp);

        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!isResizing) return;
        const x = clientX(e);
        const max = window.innerWidth * MAX_PCT;
        const newWidth = Math.min(Math.max(window.innerWidth - x, MIN_WIDTH), max);
        aside.style.setProperty('--aside-width', newWidth + 'px');
        e.preventDefault();
    }

    function onPointerUp() {
        if (!isResizing) return;
        isResizing = false;
        resizer.classList.remove('resizing');
        document.body.classList.remove('resizing');

        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('touchend', onPointerUp);
    }

    function onKey(e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const cur = parseInt(getComputedStyle(aside).width, 10) || 300;
        const max = window.innerWidth * MAX_PCT;
        let next = cur + (e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP);
        next = Math.min(Math.max(next, MIN_WIDTH), max);
        aside.style.setProperty('--aside-width', next + 'px');
        e.preventDefault();
    }

    function onDblClick() {
        aside.style.removeProperty('--aside-width');
    }

    // Events
    resizer.addEventListener('mousedown', onPointerDown);
    resizer.addEventListener('touchstart', onPointerDown, { passive: false });
    resizer.addEventListener('keydown', onKey);
    resizer.addEventListener('dblclick', onDblClick);

    // Expose for debugging (optional)
    window.__resizer = {
        setWidth(px) { aside.style.setProperty('--aside-width', px + 'px'); },
        reset() { aside.style.removeProperty('--aside-width'); }
    };
})();
