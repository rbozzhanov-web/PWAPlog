import { useEffect, useRef } from 'react';

interface YearChipsProps {
  years: number[];
  activeYear?: number;
  onSelect(year: number): void;
}

export function YearChips({ years, activeYear, onSelect }: YearChipsProps) {
  const stripRef = useRef<HTMLElement>(null);
  const chipRefs = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    if (activeYear === undefined) return;
    const activeChip = chipRefs.current.get(activeYear);
    const strip = stripRef.current;
    if (!activeChip || !strip) return;
    // Center only this strip: scrollIntoView also moves the outer tab pager.
    const chip = activeChip.getBoundingClientRect();
    const bounds = strip.getBoundingClientRect();
    const left = Math.max(0, strip.scrollLeft + chip.left - bounds.left - (strip.clientWidth - chip.width) / 2);
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
