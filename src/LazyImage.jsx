import { useState, useRef, useEffect } from 'react';

/**
 * LazyImage — intersection-observer based lazy loader
 * Fixed: immediately loads if already in viewport on mount.
 */
export default function LazyImage({
  src, alt = '', className = '', style = {},
  placeholderStyle = {}, width, height, objectFit = 'cover',
  threshold = 0, rootMargin = '400px',
}) {
  const [loaded,  setLoaded]  = useState(false);
  const [inView,  setInView]  = useState(false);
  const [errored, setErrored] = useState(false);
  const spanRef = useRef(null);

  useEffect(() => {
    if (!src) { setInView(true); return; }

    // If IntersectionObserver not supported — load immediately
    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }

    const el = spanRef.current;
    if (!el) { setInView(true); return; }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    obs.observe(el);

    // KEY FIX: check if already in viewport right now
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 400 && rect.bottom > -400) {
      setInView(true);
      obs.disconnect();
    }

    return () => obs.disconnect();
  }, [src]);

  const shimmerStyle = {
    display: 'block',
    width:   width  || '100%',
    height:  height || '100%',
    background: 'linear-gradient(90deg, #f0e4dc 25%, #f8ede6 50%, #f0e4dc 75%)',
    backgroundSize: '200% 100%',
    animation: 'lazy-shimmer 1.4s infinite',
    borderRadius: 'inherit',
    ...placeholderStyle,
  };

  return (
    <span
      ref={spanRef}
      style={{
        display: 'block',
        width:    width  || '100%',
        height:   height || '100%',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'inherit',
      }}
    >
      <style>{`@keyframes lazy-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* Shimmer placeholder */}
      {!loaded && !errored && <span style={shimmerStyle} aria-hidden="true" />}

      {/* Image — only rendered once in viewport */}
      {inView && !errored && (
        <img
          src={src}
          alt={alt}
          className={className}
          style={{
            width:     width  || '100%',
            height:    height || '100%',
            objectFit,
            display:   loaded ? 'block' : 'none',
            position:  'absolute',
            inset:     0,
            ...style,
          }}
          onLoad={()  => setLoaded(true)}
          onError={() => setErrored(true)}
          decoding="async"
        />
      )}

      {/* Fallback icon on error */}
      {errored && (
        <span style={{
          ...shimmerStyle,
          background: '#f0e4dc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          animation: 'none',
        }}>
          💅
        </span>
      )}
    </span>
  );
}