import { Select } from '../ui';
import { useState } from 'react';
import { App } from '../main';
import { materialize, reviewExamples } from './states';

export function ReviewGallery() {
  const params = new URLSearchParams(location.search);
  const initial =
    reviewExamples.find((item) => item.id === params.get('state')) ?? reviewExamples[0];
  const [selected, setSelected] = useState(initial);
  const [mobile, setMobile] = useState(params.get('size') === 'mobile');
  const [filter, setFilter] = useState('');
  const [revision, setRevision] = useState(0);
  const [copied, setCopied] = useState(false);

  if (params.has('frame')) return <App review={materialize(initial)} />;

  const select = (item: typeof initial) => {
    setSelected(item);

    history.replaceState(
      null,
      '',
      `/review?state=${item.id}&size=${mobile ? 'mobile' : 'desktop'}`,
    );
  };
  const index = reviewExamples.indexOf(selected);
  const url = `/review?frame=1&state=${selected.id}`;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <header className="shrink-0 border-b border-line px-5 py-4">
        <h1 className="font-arcade text-lg text-accent">UI review</h1>
      </header>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,30%)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[270px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="flex min-h-0 flex-col overflow-hidden border-b border-line p-4 lg:border-r">
          <label htmlFor="state-search" className="sr-only">
            Find a state
          </label>
          <input
            id="state-search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-4 w-full border border-line bg-panel p-2 text-sm"
            placeholder="Search states…"
          />
          <nav aria-label="UI states" className="min-h-0 flex-1 overflow-auto overscroll-contain">
            {reviewExamples
              .filter((item) =>
                `${item.group} ${item.title}`.toLowerCase().includes(filter.toLowerCase()),
              )
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => select(item)}
                  aria-current={item.id === selected.id ? 'page' : undefined}
                  className={`mb-1 block w-full border px-3 py-2 text-left text-xs ${item.id === selected.id ? 'border-accent bg-panel text-accent' : 'border-transparent text-muted hover:bg-panel'}`}
                >
                  <span className="mb-1 block text-[9px] uppercase">{item.group}</span>
                  {item.title}
                </button>
              ))}
          </nav>
        </aside>
        <main className="min-h-0 min-w-0 overflow-auto overscroll-contain p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
            <button
              className="border border-line px-3 py-2"
              disabled={index === 0}
              onClick={() => select(reviewExamples[index - 1])}
            >
              ← Previous
            </button>
            <button
              className="border border-line px-3 py-2"
              disabled={index === reviewExamples.length - 1}
              onClick={() => select(reviewExamples[index + 1])}
            >
              Next →
            </button>
            <button
              className="border border-line px-3 py-2"
              onClick={() => setRevision(revision + 1)}
            >
              Reset state
            </button>
            <Select
              aria-label="Preview size"
              value={mobile ? 'mobile' : 'desktop'}
              onChange={(event) => {
                const size = event.target.value;

                setMobile(size === 'mobile');
                setCopied(false);
                history.replaceState(null, '', `/review?state=${selected.id}&size=${size}`);
              }}
            >
              <option value="desktop">Desktop · 1280px</option>
              <option value="mobile">Mobile · 390px</option>
            </Select>
            <button
              className="border border-line px-3 py-2"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `${location.origin}/review?state=${selected.id}&size=${mobile ? 'mobile' : 'desktop'}`,
                );

                setCopied(true);
              }}
            >
              {copied ? 'Link copied' : 'Copy state link'}
            </button>
          </div>
          <h2 className="mb-3 text-base font-bold">{selected.title}</h2>
          <div className="overflow-auto border border-line bg-black/30 p-3">
            <iframe
              key={`${selected.id}-${revision}`}
              title={selected.title}
              src={url}
              style={{ width: mobile ? 390 : 1280, height: mobile ? 844 : 900 }}
              className="mx-auto block max-w-none border-0 bg-canvas"
            />
          </div>
        </main>
      </div>
    </div>
  );
}
