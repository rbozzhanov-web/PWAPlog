import { ExtractedPage, TextItem } from '../types';

/** Approximate column x-positions, modeled on the real Air Astana report's layout. */
export const COLS = {
  date: 10,
  depAirport: 90,
  depTime: 140,
  arrAirport: 190,
  arrTime: 240,
  type: 290,
  reg: 330,
  fltTime: 400,
  namePic: 460,
  namePic2: 510, // second word of a two-word crew name, e.g. "SMITH J"
  toffDay: 560,
  toffNight: 600,
  lndDay: 640,
  lndNight: 680,
  opPic: 730,
  opCoPlt: 780,
  opInstr: 830,
  synthTime: 880,
  synthType: 920,
};

let y = 0;
function row(cells: [number, string][]): TextItem[] {
  y += 20;
  return cells.map(([x, str]) => ({ str, x, y, width: str.length * 6 }));
}

export interface FlightRowSpec {
  date: string;
  depAirport: string;
  depTime: string;
  arrAirport: string;
  arrTime: string;
  type: string;
  reg: string;
  fltTime: string;
  namePic: string[]; // one or two words
  /** x-column for the trailing role-time echo: opPic, opCoPlt, or opInstr. */
  roleColumn: 'opPic' | 'opCoPlt' | 'opInstr';
}

/** A training-device session: no registration, no PIC name, duration under SYNTH. DEVICES. */
export interface SimulatorRowSpec {
  kind: 'simulator';
  date: string;
  airport: string;
  startTime: string;
  endTime: string;
  type: string;
  synthTime: string;
  deviceType: string;
}

export type RowSpec = FlightRowSpec | SimulatorRowSpec;

function isSimulator(spec: RowSpec): spec is SimulatorRowSpec {
  return 'kind' in spec && spec.kind === 'simulator';
}

export function buildAirAstanaPage(rows: RowSpec[], totalsFltTime: string): ExtractedPage {
  y = 0;
  const items: TextItem[] = [];

  items.push(...row([[COLS.date, 'AIR ASTANA']]));
  items.push(...row([[COLS.date, '01/07/2026 - 01/08/2026']]));
  items.push(...row([[COLS.date, '9871 BOZZHANOV RAMIL (ALA-763-CP)']]));

  items.push(
    ...row([
      [COLS.depAirport, 'DEPARTURE'],
      [COLS.arrAirport, 'ARRIVAL'],
      [COLS.type, 'AIRCRAFT'],
      [COLS.toffDay, 'TOFF'],
      [COLS.lndDay, 'LND'],
      [COLS.opPic, 'OPERATED AS'],
      [COLS.synthTime, 'SYNTH. DEVICES'],
    ]),
  );
  items.push(
    ...row([
      [COLS.date, 'Date'],
      [COLS.depAirport, 'Airport'],
      [COLS.depTime, 'Time'],
      [COLS.arrAirport, 'Airport'],
      [COLS.arrTime, 'Time'],
      [COLS.type, 'Type'],
      [COLS.reg, 'Reg.'],
      [COLS.fltTime, 'Flt time'],
      [COLS.namePic, 'Name PIC'],
      [COLS.toffDay, 'Day'],
      [COLS.toffNight, 'Night'],
      [COLS.lndDay, 'Day'],
      [COLS.lndNight, 'Night'],
      [COLS.opPic, 'PIC'],
      [COLS.opCoPlt, 'Co-Plt'],
      [COLS.opInstr, 'Instr'],
      [COLS.synthTime, 'Time'],
      [COLS.synthType, 'Type'],
    ]),
  );

  for (const spec of rows) {
    if (isSimulator(spec)) {
      items.push(
        ...row([
          [COLS.date, spec.date],
          [COLS.depAirport, spec.airport],
          [COLS.depTime, spec.startTime],
          [COLS.arrAirport, spec.airport],
          [COLS.arrTime, spec.endTime],
          [COLS.type, spec.type],
          [COLS.synthTime, spec.synthTime],
          [COLS.synthType, spec.deviceType],
        ]),
      );
      continue;
    }

    const nameCells: [number, string][] =
      spec.namePic.length === 2
        ? [
            [COLS.namePic, spec.namePic[0]],
            [COLS.namePic2, spec.namePic[1]],
          ]
        : [[COLS.namePic, spec.namePic[0]]];

    items.push(
      ...row([
        [COLS.date, spec.date],
        [COLS.depAirport, spec.depAirport],
        [COLS.depTime, spec.depTime],
        [COLS.arrAirport, spec.arrAirport],
        [COLS.arrTime, spec.arrTime],
        [COLS.type, spec.type],
        [COLS.reg, spec.reg],
        [COLS.fltTime, spec.fltTime],
        ...nameCells,
        [COLS[spec.roleColumn], spec.fltTime],
      ]),
    );
  }

  items.push(...row([[COLS.date, 'Totals :'], [COLS.fltTime, totalsFltTime]]));
  items.push(...row([[COLS.date, 'Generated on Aug 21, 2026 20:16 Page 1 of 1']]));

  return { items, width: 1000, height: y + 20 };
}
