import { useState, useRef, useEffect } from 'react';

/**
 * LazyImage — intersection-observer based lazy loader
 * Drops in as a replacement for <img>.
 * Shows a shimmer placeholder until the image enters the viewport.
 */
export default function LazyImage({
  src, alt = '', className = '', style = {},
  placeholderStyle = {}, width, height, objectFit = 'cover',
  threshold = 0.1, rootMargin = '200px',
}) {
  const [loaded,   setLoaded]   = useState(false);
  const [inView,   setInView]   = useState(false);
  const [errored,  setErrored]  = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!src) return;
    const el = imgRef.current;
    if (!el) return;

    // IntersectionObserver — widely supported
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
        { threshold, rootMargin }
      );
      obs.observe(el);
      return () => obs.disconnect();
    } else {
      // Fallback — load immediately
      setInView(true);
    }
  }, [src, threshold, rootMargin]);

  const shimmerStyle = {
    display: 'block',
    width:  width  || '100%',
    height: height || '100%',
    background: 'linear-gradient(90deg, #f0e4dc 25%, #f8ede6 50%, #f0e4dc 75%)',
    backgroundSize: '200% 100%',
    animation: 'lazy-shimmer 1.4s infinite',
    borderRadius: 'inherit',
    ...placeholderStyle,
  };

  return (
    <span
      ref={imgRef}
      style={{ display: 'block', width: width || '100%', height: height || '100%', position: 'relative', overflow: 'hidden', borderRadius: 'inherit' }}
    >
      <style>{`@keyframes lazy-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      {/* Shimmer while not loaded */}
      {!loaded && !errored && <span style={shimmerStyle} />}

      {/* Actual image — only set src once in viewport */}
      {inView && !errored && (
        <img
          src={src}
          alt={alt}
          className={className}
          style={{
            width:      width  || '100%',
            height:     height || '100%',
            objectFit,
            display:    loaded ? 'block' : 'none',
            position:   'absolute',
            inset:      0,
            ...style,
          }}
          onLoad={()  => setLoaded(true)}
          onError={() => setErrored(true)}
          loading="lazy"
          decoding="async"
        />
      )}

      {/* Fallback on error */}
      {errored && (
        <span style={{ ...shimmerStyle, background: '#f0e4dc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', animation: 'none' }}>
          💅
        </span>
      )}
    </span>
  );
}