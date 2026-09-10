import { KZ_2026, calculateNetPay } from '../kzPayroll';

/**
 * Every figure below is taken from a real July 2026 payslip. Its own three totals reconcile
 * exactly — earnings 7 008 268,21 less deductions 4 753 172,84 leaves 2 255 095,37 — which is
 * what makes it usable as an oracle rather than just an example.
 */
const PAYSLIP = {
  grossEarnings: 7_008_268.21,
  voluntaryPension: 280_131.17, // Взнос работника в КорпПП
  opv: 425_000,
  vosms: 34_000,
  ipn: 920_908.5,
  alimony: 2_674_114, // Ст. 95: 50% of gross less ОПВ/ВОСМС/ИПН/КорпПП — see calculateNetPay
  /** Аванс 138 888 + косвенный доход 280 131,17 taken straight back out. Алименты is computed. */
  otherDeductions: 138_888 + 280_131.17,
  netPay: 2_255_095.37,
};

/** By July the year-to-date taxable income has passed the annual threshold. */
const PAST_THRESHOLD = KZ_2026.ipnThresholdMrpPerYear * KZ_2026.mrp;

describe('the real payslip', () => {
  const result = calculateNetPay(
    {
      grossEarnings: PAYSLIP.grossEarnings,
      voluntaryPension: PAYSLIP.voluntaryPension,
      taxableYearToDate: PAST_THRESHOLD,
      alimonyRate: 0.5,
      otherDeductions: PAYSLIP.otherDeductions,
    },
    KZ_2026,
  );

  it('reproduces ОПВ exactly — the ceiling, not a percentage of this income', () => {
    // 10% of 50 МЗП. This pilot earns well above the cap, so the contribution is the cap itself.
    expect(result.opv).toBe(PAYSLIP.opv);
  });

  it('reproduces ВОСМС exactly, likewise capped', () => {
    expect(result.vosms).toBe(PAYSLIP.vosms);
  });

  it('reproduces ИПН to within a tenge', () => {
    expect(Math.abs(result.ipn - PAYSLIP.ipn)).toBeLessThan(1);
  });

  it('reproduces the net pay to within a tenge', () => {
    expect(Math.abs(result.netPay - PAYSLIP.netPay)).toBeLessThan(1);
  });

  it('reproduces the payslip’s alimony line to within a tenge', () => {
    expect(Math.abs(result.alimony - PAYSLIP.alimony)).toBeLessThan(1);
  });

  it('taxes the whole month at the upper rate, none at the lower one', () => {
    expect(result.taxedAtLowerRate).toBe(0);
    expect(result.taxedAtUpperRate).toBe(result.taxableIncome);
  });
});

describe('the progressive scale is annual, not monthly', () => {
  const month = {
    grossEarnings: PAYSLIP.grossEarnings,
    voluntaryPension: PAYSLIP.voluntaryPension,
  };

  it('taxes the identical month far more lightly in January than in July', () => {
    const january = calculateNetPay({ ...month, taxableYearToDate: 0 }, KZ_2026);
    const july = calculateNetPay({ ...month, taxableYearToDate: PAST_THRESHOLD }, KZ_2026);

    // Same earnings, same deductions, different tax — which is exactly why a month cannot be
    // calculated in isolation.
    expect(january.ipn).toBeLessThan(july.ipn);
    expect(january.taxedAtLowerRate).toBeGreaterThan(0);
    expect(july.taxedAtLowerRate).toBe(0);
  });

  it('splits a month that straddles the threshold across both rates', () => {
    const justUnder = PAST_THRESHOLD - 1_000_000;
    const result = calculateNetPay({ ...month, taxableYearToDate: justUnder }, KZ_2026);

    expect(result.taxedAtLowerRate).toBe(1_000_000);
    expect(result.taxedAtUpperRate).toBe(result.taxableIncome - 1_000_000);
    expect(result.ipn).toBeCloseTo(
      1_000_000 * KZ_2026.ipnLowerRate + result.taxedAtUpperRate * KZ_2026.ipnUpperRate,
      6,
    );
  });

  it('carries the year-to-date base forward so the next month can continue the scale', () => {
    const first = calculateNetPay({ ...month, taxableYearToDate: 0 }, KZ_2026);
    const second = calculateNetPay(
      { ...month, taxableYearToDate: first.taxableYearToDateAfter },
      KZ_2026,
    );

    expect(first.taxableYearToDateAfter).toBe(first.taxableIncome);
    expect(second.taxableYearToDateAfter).toBe(first.taxableIncome + second.taxableIncome);
  });
});

describe('contributions below the ceilings', () => {
  it('charges the plain percentage when income is under the cap', () => {
    // 1 000 000 is below both ceilings (50 МЗП = 4 250 000 and 20 МЗП = 1 700 000).
    const result = calculateNetPay({ grossEarnings: 1_000_000 }, KZ_2026);

    expect(result.opv).toBe(100_000);
    expect(result.vosms).toBe(20_000);
  });

  it('caps ВОСМС before ОПВ, since its ceiling is the lower of the two', () => {
    // 2 000 000 is over the ВОСМС ceiling but under the ОПВ one.
    const result = calculateNetPay({ grossEarnings: 2_000_000 }, KZ_2026);

    expect(result.opv).toBe(200_000);
    expect(result.vosms).toBe(34_000);
  });

  it('never returns a negative tax base for a month that earns less than the deduction', () => {
    const result = calculateNetPay({ grossEarnings: 50_000 }, KZ_2026);

    expect(result.taxableIncome).toBe(0);
    expect(result.ipn).toBe(0);
  });
});

describe('alimony — Ст. 95, on income after ОПВ/ВОСМС/ИПН/КорпПП, not on gross', () => {
  it('is zero without a rate, even with other deductions present', () => {
    const result = calculateNetPay({ grossEarnings: 1_000_000, otherDeductions: 50_000 }, KZ_2026);

    expect(result.alimony).toBe(0);
  });

  it('is computed on income net of statutory deductions and the pension contribution', () => {
    const result = calculateNetPay(
      { grossEarnings: 1_000_000, voluntaryPension: 100_000, alimonyRate: 0.5 },
      KZ_2026,
    );

    const expectedBase = 1_000_000 - result.opv - result.vosms - result.ipn - 100_000;
    expect(result.alimony).toBeCloseTo(expectedBase * 0.5, 6);
  });

  it('is withheld from net pay, on top of otherDeductions', () => {
    const withoutAlimony = calculateNetPay({ grossEarnings: 1_000_000 }, KZ_2026);
    const withAlimony = calculateNetPay({ grossEarnings: 1_000_000, alimonyRate: 0.5 }, KZ_2026);

    expect(withAlimony.netPay).toBeLessThan(withoutAlimony.netPay);
    expect(withAlimony.totalDeductions).toBeCloseTo(
      withoutAlimony.totalDeductions + withAlimony.alimony,
      6,
    );
  });

  it('never goes negative even if statutory deductions somehow exceeded gross', () => {
    const result = calculateNetPay(
      { grossEarnings: 50_000, voluntaryPension: 100_000, alimonyRate: 0.5 },
      KZ_2026,
    );

    expect(result.alimony).toBe(0);
  });
});
