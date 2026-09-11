import { useEffect, useRef } from 'react';

interface YearChipsProps {
  years: number[];
  activeYear?: number;
  onSelect(year: number): void;
}

export function YearChips({ years, activeYear, onSelect }: YearChipsProps) {
  const chipRefs = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    if (activeYear === undefined) return;
    const activeChip = chipRefs.current.get(activeYear);
    if (typeof activeChip?.scrollIntoView !== 'function') return;
    activeChip.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeYear]);

  return (
    <nav className="year-chips" aria-label="Logbook years">
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
