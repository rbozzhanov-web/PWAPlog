import { useEffect, useRef } from 'react';

interface YearChipsProps {
  years: number[];
  activeYear?: number;
  onSelect(year: number): void;
}

export function YearChips({ years, activeYear, onSelect }: YearChipsProps) {
  const chipRefs = useRef(new Map<number, HTMLButtonElement>());
  const stripRef = useRef<HTMLElement>(null);

  /**
   * Centres the active year in its own strip — and nothing else.
   *
   * This used to call `activeChip.scrollIntoView({ inline: 'center' })`, which scrolls *every*
   * scrollable ancestor, not just the strip. The five primary tabs are all mounted side by side in
   * one horizontally scrolling pager, so bringing a chip to the centre of the viewport dragged the
   * pager to the Logbook page: the app opened on Home and then visibly slid itself two tabs over,
   * a second or so later, as soon as the logbook finished loading and gave the chips a year to
   * mark. Only a pilot with entries already saved ever saw it.
   *
   * Scrolling the strip by hand keeps it to the one element that should move. The offset comes
   * from the two bounding rects rather than `offsetLeft`, which is measured against whichever
   * ancestor happens to be positioned.
   */
  useEffect(() => {
    const strip = stripRef.current;
    if (activeYear === undefined || !strip) return;
    const activeChip = chipRefs.current.get(activeYear);
    if (!activeChip || typeof strip.getBoundingClientRect !== 'function') return;

    const chipBox = activeChip.getBoundingClientRect();
    const stripBox = strip.getBoundingClientRect();
    const centred = strip.scrollLeft + (chipBox.left - stripBox.left) - (stripBox.width - chipBox.width) / 2;
    const left = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, centred));
    if (typeof strip.scrollTo === 'function') strip.scrollTo({ left, behavior: 'smooth' });
    else strip.scrollLeft = left;
  }, [activeYear]);

  return (
    <nav className="year-chips" aria-label="Logbook years" ref={stripRef}>
      {years.map((year) => (
        <button
          className="year-chip"
          type="button"
          aria-pressed={activeYear === year}
          key={year}
          ref={(element) => {
            if (element) chipRefs.current.set(year, element);
            else chipRefs.current.delete(year);
          }}
          onClick={() => onSelect(year)}
        >
          {year}
        </button>
      ))}
    </nav>
  );
}
