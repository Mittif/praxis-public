import { useEffect, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';

type Tone = 'selection' | 'correct' | 'complete';

/** Small, finite bursts. All motion is transform/opacity; nothing intercepts input. */
export function PixelBurst({ tone = 'correct' }: { tone?: Tone }) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), tone === 'complete' ? 1400 : 1000);
    return () => window.clearTimeout(timer);
  }, [tone]);
  if (reduced || !visible) return null;
  const count = tone === 'complete' ? 26 : tone === 'correct' ? 14 : 6;
  const radius = tone === 'complete' ? 150 : tone === 'correct' ? 78 : 29;
  return (
    <span className={`pixel-burst burst-${tone}`} data-tone={tone} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        const distance = radius * (0.65 + ((i * 7) % 11) / 20);
        const style = {
          '--dx': `${Math.cos(angle) * distance}px`,
          '--dy': `${Math.sin(angle) * distance - radius * 0.2}px`,
          '--fall': `${Math.sin(angle) * distance + radius * 0.5}px`,
          '--turn': `${((i % 5) - 2) * 90}deg`,
          '--delay': `${(i % 4) * 22}ms`,
          '--size': `${tone === 'selection' ? 4 : 5 + (i % 3) * 2}px`,
        } as CSSProperties;
        return <i key={i} style={style} />;
      })}
    </span>
  );
}
