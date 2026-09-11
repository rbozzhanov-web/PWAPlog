import type { MonthGroup } from '@pilot-logbook/core';
import { Link } from 'react-router-dom';

import { formatFlightMinutes, sumFlightMinutes } from './totals';

interface LogbookListProps {
  groups: MonthGroup[];
  registerMonth(month: string, element: HTMLElement | null): void;
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function LogbookList({ groups, registerMonth }: LogbookListProps) {
  return (
    <div className="logbook-list">
      {groups.map(({ month, entries }) => {
        const label = monthLabel(month);
        const headingId = `month-${month}-heading`;
        const flightCount = `${entries.length} ${entries.length === 1 ? 'flight' : 'flights'}`;

        return (
          <section
            className="month-card"
            data-month={month}
            id={`month-${month}`}
            key={month}
            ref={(element) => registerMonth(month, element)}
            aria-labelledby={headingId}
          >
            <header className="month-card__header">
              <div>
                <p className="month-card__eyebrow">{flightCount}</p>
                <h2 id={headingId}>{label}</h2>
              </div>
              <div className="month-card__total" aria-label={`${label} total`}>
                <span>Block time</span>
                <strong>{formatFlightMinutes(sumFlightMinutes(entries))}</strong>
              </div>
            </header>

            <div className="flight-rows">
              {entries.map((entry) => {
                const route = `${entry.departureAirport} to ${entry.arrivalAirport}`;
                const formattedDate = dateLabel(entry.date);
                const aircraft = [entry.aircraftType, entry.aircraftRegistration]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <Link
                    className="flight-row"
                    key={entry.id}
                    to={`/logbook/${entry.id}`}
                    aria-label={`${route}, ${formattedDate}`}
                  >
                    <div className="flight-row__main">
                      <strong className="flight-row__route">
                        {entry.departureAirport}
                        <span aria-hidden="true"> → </span>
                        {entry.arrivalAirport}
                      </strong>
                      <span className="flight-row__meta">
                        {formattedDate}
                        {entry.flightNumber ? ` · ${entry.flightNumber}` : ''}
                      </span>
                      <span className="flight-row__aircraft">
                        {aircraft || 'Aircraft not recorded'}
                      </span>
                    </div>
                    <strong className="flight-row__time">
                      {formatFlightMinutes(entry.totalTimeMinutes)}
                    </strong>
                    <span className="flight-row__chevron" aria-hidden="true">›</span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
