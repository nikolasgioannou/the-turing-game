import { useEffect, useRef, useState } from 'react';

export function PreviewFrame({
  title,
  src,
  mobile,
}: {
  title: string;
  src: string;
  mobile: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const width = mobile ? 390 : 1280;
  const height = mobile ? 844 : 900;

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / width, entry.contentRect.height / height));
    });

    observer.observe(container.current!);

    return () => observer.disconnect();
  }, [width, height]);

  return (
    <div className="min-h-0 flex-1 overflow-hidden border border-line bg-black/30 p-3">
      <div
        ref={container}
        className="flex h-full w-full items-center justify-center overflow-hidden"
      >
        <div className="shrink-0" style={{ width: width * scale, height: height * scale }}>
          <iframe
            title={title}
            src={src}
            style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            className="block max-w-none border-0 bg-canvas"
          />
        </div>
      </div>
    </div>
  );
}
