import { parseRoster } from '../parseRoster';
import { buildAirAstanaPage, FlightRowSpec, SimulatorRowSpec } from '../__fixtures__/airAstanaSample';
import { ExtractedPage } from '../types';

const SELF_ROW: FlightRowSpec = {
  date: '02/07/26',
  depAirport: 'NQZ',
  depTime: '07:04',
  arrAirport: 'FRA',
  arrTime: '14:41',
  type: '763',
  reg: 'EI-KEC',
  fltTime: '07:37',
  namePic: ['Self'],
  roleColumn: 'opPic',
};

const NIGHT_LANDING_ROW: FlightRowSpec = {
  date: '24/07/26',
  depAirport: 'NQZ',
  depTime: '14:48',
  arrAirport: 'ALA',
  arrTime: '16:41',
  type: '763',
  reg: 'EI-KEC',
  fltTime: '01:53',
  namePic: ['Self'],
  roleColumn: 'opPic',
};

const SIMULATOR_ROW: SimulatorRowSpec = {
  kind: 'simulator',
  date: '06/02/26',
  airport: 'ALA',
  startTime: '10:00',
  endTime: '16:00',
  type: '763',
  synthTime: '06:00',
  deviceType: 'VPTI',
};

const SIC_ROW: FlightRowSpec = {
  date: '28/07/26',
  depAirport: 'NQZ',
  depTime: '07:00',
  arrAirport: 'FRA',
  arrTime: '14:00',
  type: '763',
  reg: 'EI-KEA',
  fltTime: '07:00',
  namePic: ['SMITH', 'J'],
  roleColumn: 'opCoPlt',
};

const INSTR_ROW: FlightRowSpec = {
  ...SIC_ROW,
  date: '29/07/26',
  roleColumn: 'opInstr',
};

describe('parseRoster with the Air Astana rule', () => {
  it('recognizes the report format', () => {
    const page = buildAirAstanaPage([SELF_ROW], '07:37');
    const result = parseRoster([page]);
    expect(result.ruleId).toBe('air-astana-flight-time-report-v1');
  });

  it('parses a "Self" row as full PIC time with high confidence', () => {
    const page = buildAirAstanaPage([SELF_ROW], '07:37');
    const { candidates } = parseRoster([page]);

    expect(candidates).toHaveLength(1);
    const [candidate] = candidates;
    expect(candidate.confidence).toBe('high');
    expect(candidate.fields.date).toBe('2026-07-02');
    // The report prints IATA; entries are canonicalised to ICAO on the way in.
    expect(candidate.fields.departureAirport).toBe('UACC');
    expect(candidate.fields.arrivalAirport).toBe('EDDF');
    expect(candidate.fields.aircraftType).toBe('763');
    expect(candidate.fields.aircraftRegistration).toBe('EI-KEC');
    expect(candidate.fields.totalTimeMinutes).toBe(457);
    expect(candidate.fields.picMinutes).toBe(457);
    expect(candidate.fields.sicMinutes).toBe(0);
    expect(candidate.fields.pilotInCommandName).toBeUndefined();
    // No flight-number column exists in this report at all.
    expect(candidate.fields.flightNumber).toBeUndefined();
  });

  it('computes real night landing status independent of the report (which has no such column)', () => {
    const page = buildAirAstanaPage([NIGHT_LANDING_ROW], '01:53');
    const { candidates } = parseRoster([page]);

    expect(candidates[0].fields.nightLandings).toBe(1);
    expect(candidates[0].fields.dayTakeoffs).toBe(1);
  });

  it('assigns SIC time and the other pilot\'s name when Name PIC is not "Self", using the OPERATED AS column', () => {
    const page = buildAirAstanaPage([SIC_ROW], '07:00');
    const { candidates } = parseRoster([page]);

    const [candidate] = candidates;
    expect(candidate.fields.picMinutes).toBe(0);
    expect(candidate.fields.sicMinutes).toBe(420);
    expect(candidate.fields.dualGivenMinutes).toBe(0);
    expect(candidate.fields.pilotInCommandName).toBe('SMITH J');
    expect(candidate.confidence).toBe('high');
  });

  it('assigns instructor (dual given) time when the trailing time sits under the Instr column', () => {
    const page = buildAirAstanaPage([INSTR_ROW], '07:00');
    const { candidates } = parseRoster([page]);

    const [candidate] = candidates;
    expect(candidate.fields.dualGivenMinutes).toBe(420);
    expect(candidate.fields.sicMinutes).toBe(0);
  });

  it('reports a matching totals cross-check when the report totals agree with parsed rows', () => {
    const page = buildAirAstanaPage([SELF_ROW, NIGHT_LANDING_ROW], '09:30'); // 457 + 113 = 570 = 09:30
    const { crossChecks } = parseRoster([page]);

    expect(crossChecks).toHaveLength(1);
    expect(crossChecks[0].matches).toBe(true);
    expect(crossChecks[0].parsedTotalMinutes).toBe(570);
    expect(crossChecks[0].reportedTotalMinutes).toBe(570);
  });

  it('flags a mismatching totals cross-check', () => {
    const page = buildAirAstanaPage([SELF_ROW, NIGHT_LANDING_ROW], '10:00');
    const { crossChecks } = parseRoster([page]);

    expect(crossChecks[0].matches).toBe(false);
    expect(crossChecks[0].reportedTotalMinutes).toBe(600);
    expect(crossChecks[0].parsedTotalMinutes).toBe(570);
  });
});

describe('parseRoster falling back to the generic rule', () => {
  it('extracts a best-effort candidate from an unrecognized report layout', () => {
    const page: ExtractedPage = {
      width: 500,
      height: 100,
      items: [
        { str: '02/07/2026', x: 10, y: 10, width: 60 },
        { str: 'NQZ', x: 80, y: 10, width: 30 },
        { str: '07:04', x: 120, y: 10, width: 40 },
        { str: 'FRA', x: 170, y: 10, width: 30 },
        { str: '14:41', x: 210, y: 10, width: 40 },
      ],
    };

    const result = parseRoster([page]);
    expect(result.ruleId).toBe('generic-v1');
    expect(result.candidates).toHaveLength(1);

    const [candidate] = result.candidates;
    expect(candidate.fields.date).toBe('2026-07-02');
    // The report prints IATA; entries are canonicalised to ICAO on the way in.
    expect(candidate.fields.departureAirport).toBe('UACC');
    expect(candidate.fields.arrivalAirport).toBe('EDDF');
    expect(candidate.fields.totalTimeMinutes).toBe(457);
    expect(candidate.confidence).toBe('medium');
  });
});

describe('parseRoster with simulator sessions', () => {
  it('logs a training session as simulator time, not flight time', () => {
    const result = parseRoster([buildAirAstanaPage([SIMULATOR_ROW], '00:00')]);

    expect(result.candidates).toHaveLength(1);
    const { fields } = result.candidates[0];

    // The whole point: 06:00 in the SYNTH. DEVICES column is not flight time.
    expect(fields.totalTimeMinutes).toBe(0);
    expect(fields.simulatorMinutes).toBe(360);
    expect(fields.simulatorType).toBe('VPTI');
  });

  it('does not mistake the device code for the PIC name', () => {
    const result = parseRoster([buildAirAstanaPage([SIMULATOR_ROW], '00:00')]);

    expect(result.candidates[0].fields.pilotInCommandName).toBeUndefined();
  });

  it('computes no day/night for a session in a box', () => {
    const result = parseRoster([buildAirAstanaPage([SIMULATOR_ROW], '00:00')]);
    const { fields } = result.candidates[0];

    expect(fields.dayMinutes).toBe(0);
    expect(fields.nightMinutes).toBe(0);
    expect(fields.dayLandings).toBe(0);
    expect(fields.nightLandings).toBe(0);
  });

  it('keeps simulator time out of the Flt time cross-check', () => {
    // Report totals only the flight: the airline lists SYNTH. DEVICES separately.
    const result = parseRoster([buildAirAstanaPage([SELF_ROW, SIMULATOR_ROW], '07:37')]);

    expect(result.candidates).toHaveLength(2);
    expect(result.crossChecks[0].parsedTotalMinutes).toBe(457);
    expect(result.crossChecks[0].matches).toBe(true);
  });

  it('still parses a real flight in the same report unchanged', () => {
    const result = parseRoster([buildAirAstanaPage([SIMULATOR_ROW, SELF_ROW], '07:37')]);
    const flight = result.candidates.find((candidate) => candidate.fields.totalTimeMinutes !== 0);

    expect(flight?.fields.picMinutes).toBe(457);
    expect(flight?.fields.simulatorMinutes).toBe(0);
    expect(flight?.fields.aircraftRegistration).toBe('EI-KEC');
  });
});
