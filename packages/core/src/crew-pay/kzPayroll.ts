/**
 * Kazakh payroll deductions, 2026 rules.
 *
 * Reverse-engineered from a real payslip and checked against it: the three totals on that payslip
 * reconcile to the tiyin, and the model reproduces its net pay to within 0.44 ₸ on 920 908,50 of
 * income tax — see the acceptance test.
 *
 * One thing that payslip could NOT settle: whether the imputed company pension contribution
 * attracts ОПВ and ВОСМС. Both sat on their ceilings there, so adding it to the base changed
 * nothing and either treatment fits. Here it is included in `grossEarnings` and therefore charged,
 * which is the conservative reading. For a pilot below the ceilings that choice is visible in the
 * result and should be checked against their own payslip before being trusted.
 */

export interface KzTaxParams {
  /** Минимальная заработная плата. */
  mzp: number;
  /** Месячный расчётный показатель. */
  mrp: number;
  /** ОПВ: rate, and the income ceiling it stops applying above, in МЗП. */
  opvRate: number;
  opvCapMzp: number;
  /** ВОСМС: employee medical contribution, same shape. */
  vosmsRate: number;
  vosmsCapMzp: number;
  /** Standard monthly deduction from the income-tax base, in МРП. */
  standardDeductionMrp: number;
  /** ИПН is progressive: the lower rate applies until year-to-date taxable income passes the
   *  threshold, the upper rate applies above it. */
  ipnLowerRate: number;
  ipnUpperRate: number;
  /** Annual threshold between the two ИПН rates, in МРП. */
  ipnThresholdMrpPerYear: number;
}

export const KZ_2026: KzTaxParams = {
  mzp: 85_000,
  mrp: 4_325,
  opvRate: 0.1,
  opvCapMzp: 50,
  vosmsRate: 0.02,
  vosmsCapMzp: 20,
  standardDeductionMrp: 30,
  ipnLowerRate: 0.1,
  ipnUpperRate: 0.15,
  ipnThresholdMrpPerYear: 8_500,
};

export interface PayrollInput {
  /** Итого начисления for the month, including any indirect income. */
  grossEarnings: number;
  /**
   * Взнос работника в КорпПП — a voluntary pension contribution.
   *
   * It does two things, and missing either one throws the result out: it comes off the income-tax
   * base, *and* it is withheld from pay like any other contribution. Callers pass it once here
   * rather than also listing it in `otherDeductions`.
   */
  voluntaryPension?: number;
  /**
   * Taxable income already accumulated since 1 January, *before* this month. This is what decides
   * whether the month falls in the 10% band or the 15% one: the scale is annual and cumulative,
   * so the same month's figures produce a different tax in January than they do in July.
   */
  taxableYearToDate?: number;
  /**
   * Fraction of income withheld for alimony under an enforcement document — Ст. 95, Закон РК
   * №261-IV «Об исполнительном производстве…»: up to 50% of what is left "на руки", i.e. after
   * ОПВ, ВОСМС, ИПН and the pilot's own pension contribution, not off gross pay. Computed here
   * rather than by the caller because that base needs ОПВ/ВОСМС/ИПН, which do not exist yet
   * outside this function. Verified against a real payslip's alimony line to within 0.27 ₸ — see
   * the acceptance test.
   */
  alimonyRate?: number;
  /**
   * Everything else withheld that is not a statutory contribution — аванс, and the indirect
   * income that is added to earnings and taken straight back out again.
   */
  otherDeductions?: number;
}

export interface PayrollResult {
  grossEarnings: number;
  opv: number;
  vosms: number;
  /** Withheld as well as being deducted from the tax base. */
  voluntaryPension: number;
  /** Base the income tax was charged on, after contributions and the standard deduction. */
  taxableIncome: number;
  ipn: number;
  /** Portion of `taxableIncome` charged at each rate. */
  taxedAtLowerRate: number;
  taxedAtUpperRate: number;
  /** Computed from `alimonyRate` — see `PayrollInput.alimonyRate`. */
  alimony: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  /** `taxableYearToDate` plus this month's, ready to carry into the next month. */
  taxableYearToDateAfter: number;
}

/** A contribution is a flat percentage of income, but only up to a ceiling set in МЗП. */
export function cappedContribution(income: number, rate: number, capMzp: number, mzp: number): number {
  return Math.min(income, capMzp * mzp) * rate;
}

/**
 * Works out a month's statutory deductions and what is left to pay.
 *
 * The one thing that cannot be done month-by-month is ИПН: its scale is annual, so a pilot whose
 * year-to-date income has already passed the threshold pays the upper rate on the whole month,
 * while the same month earlier in the year would be split across both rates. Callers must pass
 * `taxableYearToDate` and carry `taxableYearToDateAfter` forward, or every month will be taxed as
 * if it were January.
 */
export function calculateNetPay(input: PayrollInput, params: KzTaxParams = KZ_2026): PayrollResult {
  const { grossEarnings } = input;
  const voluntaryPension = input.voluntaryPension ?? 0;
  const taxableYearToDate = input.taxableYearToDate ?? 0;
  const alimonyRate = input.alimonyRate ?? 0;
  const otherDeductions = input.otherDeductions ?? 0;

  const opv = cappedContribution(grossEarnings, params.opvRate, params.opvCapMzp, params.mzp);
  const vosms = cappedContribution(grossEarnings, params.vosmsRate, params.vosmsCapMzp, params.mzp);

  // The standard deduction cannot turn the base negative — a month that earns less than it is
  // worth carries no tax rather than a credit.
  const taxableIncome = Math.max(
    0,
    grossEarnings - opv - vosms - voluntaryPension - params.standardDeductionMrp * params.mrp,
  );

  const annualThreshold = params.ipnThresholdMrpPerYear * params.mrp;
  const lowerBandLeft = Math.max(0, annualThreshold - taxableYearToDate);
  const taxedAtLowerRate = Math.min(taxableIncome, lowerBandLeft);
  const taxedAtUpperRate = taxableIncome - taxedAtLowerRate;
  const ipn = taxedAtLowerRate * params.ipnLowerRate + taxedAtUpperRate * params.ipnUpperRate;

  // "На руки" for the purpose of Ст. 95 — everything actually taken out ahead of alimony, but not
  // otherDeductions (аванс etc.), which are withheld after alimony is worked out on the payslip.
  const alimonyBase = Math.max(0, grossEarnings - opv - vosms - ipn - voluntaryPension);
  const alimony = alimonyBase * alimonyRate;

  // The voluntary contribution is withheld too, not only relieved from tax -- leaving it out here
  // overstates take-home pay by its whole amount.
  const totalDeductions = opv + vosms + ipn + voluntaryPension + alimony + otherDeductions;

  return {
    grossEarnings,
    opv,
    vosms,
    voluntaryPension,
    taxableIncome,
    ipn,
    taxedAtLowerRate,
    taxedAtUpperRate,
    alimony,
    otherDeductions,
    totalDeductions,
    netPay: grossEarnings - totalDeductions,
    taxableYearToDateAfter: taxableYearToDate + taxableIncome,
  };
}
