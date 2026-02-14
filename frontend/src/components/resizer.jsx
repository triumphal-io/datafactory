import { useEffect, useRef } from 'react';

/**
 * Draggable resize handle for adjusting the width of the adjacent aside panel.
 * Supports mouse, touch, and keyboard (arrow keys) interaction. Double-click resets width.
 */
export default function Resizer() {
    const ref = useRef(null);
    const resizing = useRef(false);

    useEffect(() => {
        const r = ref.current;
        const a = r?.parentElement?.querySelector('aside');
        if (!r || !a) return;

        const w = (v) => a.style.setProperty('--aside-width', Math.min(Math.max(v, 200), innerWidth * 0.6) + 'px');
        
        const onMove = (e) => {
            if (!resizing.current) return;
            w(innerWidth - (e.touches?.[0]?.clientX || e.clientX));
            e.preventDefault();
        };

        const onUp = () => {
            if (!resizing.current) return;
            resizing.current = false;
            r.classList.remove('resizing');
            document.body.classList.remove('resizing');
            ['mousemove', 'mouseup', 'touchmove', 'touchend'].forEach(e => 
                removeEventListener(e, e.includes('move') ? onMove : onUp)
            );
        };

        const onDown = (e) => {
            resizing.current = true;
            r.classList.add('resizing');
            document.body.classList.add('resizing');
            ['mousemove', 'touchmove'].forEach(ev => addEventListener(ev, onMove, ev === 'touchmove' && { passive: false }));
            ['mouseup', 'touchend'].forEach(ev => addEventListener(ev, onUp));
            e.preventDefault();
        };

        r.addEventListener('mousedown', onDown);
        r.addEventListener('touchstart', onDown, { passive: false });
        r.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                w(parseInt(getComputedStyle(a).width) + (e.key === 'ArrowRight' ? 20 : -20));
                e.preventDefault();
            }
        });
        r.addEventListener('dblclick', () => a.style.removeProperty('--aside-width'));

        return () => {
            r.removeEventListener('mousedown', onDown);
            r.removeEventListener('touchstart', onDown);
            ['mousemove', 'mouseup', 'touchmove', 'touchend'].forEach(e => 
                removeEventListener(e, e.includes('move') ? onMove : onUp)
            );
        };
    }, []);

    return <div ref={ref} className="resizer" tabIndex={0} />;
}
