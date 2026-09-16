/// <reference types="vitest/globals" />

import { fireEvent, render, screen } from '@testing-library/react';

import { YearChips } from '../YearChips';

/**
 * The real bug this guards: `scrollIntoView` scrolls every scrollable ancestor, not just the
 * element's own container. All five primary tabs are mounted side by side in one horizontally
 * scrolling pager, so centring a year chip in the viewport dragged the pager over to the Logbook
 * page — the app opened on Home and then slid itself two tabs across a second later, as soon as
 * the logbook loaded and gave the chips a year to mark.
 */
describe('YearChips', () => {
  let intoView: ReturnType<typeof vi.fn>;
  let original: typeof Element.prototype.scrollIntoView;

  beforeEach(() => {
    original = Element.prototype.scrollIntoView;
    intoView = vi.fn();
    Element.prototype.scrollIntoView = intoView;
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  it('never scrolls an ancestor to bring the active year into view', () => {
    const { rerender } = render(<YearChips years={[2026, 2025, 2024]} activeYear={2026} onSelect={() => {}} />);
    // The year arriving late is the real sequence: the logbook has to load before it knows one.
    rerender(<YearChips years={[2026, 2025, 2024]} activeYear={2024} onSelect={() => {}} />);

    expect(intoView).not.toHaveBeenCalled();
  });

  it('centres the active year by scrolling the strip itself', () => {
    const years = [2026, 2025, 2024];
    const { rerender } = render(<YearChips years={years} activeYear={2026} onSelect={() => {}} />);

    // jsdom has no layout, so the geometry has to be supplied — on these nodes only, so nothing
    // leaks into the next test.
    const strip = screen.getByRole('navigation', { name: 'Logbook years' });
    const chip = screen.getByRole('button', { name: '2024' });
    vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 300 } as DOMRect);
    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({ left: 420, width: 60 } as DOMRect);
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 900 });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 300 });

    rerender(<YearChips years={years} activeYear={2024} onSelect={() => {}} />);

    // 420 - 0 - (300 - 60) / 2 = 300, comfortably inside the 0..600 the strip can scroll.
    expect(strip.scrollLeft).toBe(300);
    expect(intoView).not.toHaveBeenCalled();
  });

  it('never scrolls the strip past its own end', () => {
    const years = [2026, 2025];
    const { rerender } = render(<YearChips years={years} activeYear={2026} onSelect={() => {}} />);
    const strip = screen.getByRole('navigation', { name: 'Logbook years' });
    const chip = screen.getByRole('button', { name: '2025' });
    vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 300 } as DOMRect);
    // The last chip: centring it would want to scroll well past the content.
    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({ left: 340, width: 60 } as DOMRect);
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 400 });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 300 });

    rerender(<YearChips years={years} activeYear={2025} onSelect={() => {}} />);

    expect(strip.scrollLeft).toBe(100);
  });

  it('still reports the year the pilot picks', () => {
    const onSelect = vi.fn();
    render(<YearChips years={[2026, 2025]} activeYear={2026} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: '2025' }));

    expect(onSelect).toHaveBeenCalledWith(2025);
  });
});
