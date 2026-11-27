import { useEffect, useRef } from 'react';

// Mounts a vanilla-JS module into a container once (StrictMode-safe).
export function VanillaMount({ mount }: { mount: (el: HTMLElement) => void | (() => void) }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || el.childElementCount > 0) return;
    mount(el);
  }, [mount]);
  return <div ref={ref} />;
}
