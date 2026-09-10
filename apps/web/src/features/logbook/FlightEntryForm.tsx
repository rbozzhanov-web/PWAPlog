import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { FlightLogEntry } from '@pilot-logbook/core';

import {
  manualEntryInput,
  numericEntryFields,
  validateManualEntry,
  type EntryFieldErrors,
  type ManualEntryInput,
} from './entryForm';

interface FlightEntryFormProps {
  entry?: FlightLogEntry;
  onSave(entry: FlightLogEntry): Promise<void>;
  onDelete?: () => Promise<void>;
}

interface TextFieldProps {
  error?: string;
  label: string;
  name: keyof ManualEntryInput;
  onChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void;
  type?: 'date' | 'number' | 'text';
  value: string;
}

function TextField({ error, label, name, onChange, type = 'text', value }: TextFieldProps) {
  const inputId = `entry-${String(name)}`;
  const errorId = `${String(name)}-error`;
  return (
    <div className="entry-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        id={inputId}
        min={type === 'number' ? 0 : undefined}
        name={String(name)}
        onChange={onChange}
        step={type === 'number' ? 1 : undefined}
        type={type}
        value={value}
      />
      {error ? <span className="entry-field__error" id={errorId}>{error}</span> : null}
    </div>
  );
}

export function FlightEntryForm({ entry, onSave, onDelete }: FlightEntryFormProps) {
  const [values, setValues] = useState<ManualEntryInput>(() => manualEntryInput(entry));
  const [errors, setErrors] = useState<EntryFieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const field = event.target.name as keyof ManualEntryInput;
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validateManualEntry(values);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }

    setIsSaving(true);
    setSubmitError(undefined);
    try {
      await onSave(result.entry);
    } catch {
      setSubmitError('The flight could not be saved. Try again.');
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    setSubmitError(undefined);
    try {
      await onDelete();
    } catch {
      setSubmitError('The flight could not be deleted. Try again.');
      setIsDeleting(false);
    }
  };

  return (
    <form className="entry-form" noValidate onSubmit={handleSubmit}>
      <section className="entry-form__card" aria-labelledby="flight-details-heading">
        <div className="entry-form__section-heading">
          <p>Flight details</p>
          <h2 id="flight-details-heading">Route and aircraft</h2>
        </div>
        <div className="entry-form__fields">
          <TextField error={errors.date} label="Date" name="date" onChange={handleChange} type="date" value={values.date} />
          <div className="entry-form__route">
            <TextField error={errors.departureAirport} label="Departure" name="departureAirport" onChange={handleChange} value={values.departureAirport} />
            <TextField error={errors.arrivalAirport} label="Arrival" name="arrivalAirport" onChange={handleChange} value={values.arrivalAirport} />
          </div>
          <TextField error={errors.flightNumber} label="Flight number" name="flightNumber" onChange={handleChange} value={values.flightNumber} />
          <div className="entry-form__route">
            <TextField error={errors.aircraftType} label="Aircraft type" name="aircraftType" onChange={handleChange} value={values.aircraftType} />
            <TextField error={errors.aircraftRegistration} label="Registration" name="aircraftRegistration" onChange={handleChange} value={values.aircraftRegistration} />
          </div>
          <TextField error={errors.totalTimeMinutes} label="Total minutes" name="totalTimeMinutes" onChange={handleChange} type="number" value={values.totalTimeMinutes} />
        </div>
      </section>

      <section className="entry-form__card" aria-labelledby="time-breakdown-heading">
        <div className="entry-form__section-heading">
          <p>Experience</p>
          <h2 id="time-breakdown-heading">Time and counters</h2>
        </div>
        <div className="entry-form__number-grid">
          {numericEntryFields.slice(1).map(([name, label]) => (
            <TextField
              error={errors[name]}
              key={name}
              label={label}
              name={name}
              onChange={handleChange}
              type="number"
              value={values[name]}
            />
          ))}
        </div>
      </section>

      <section className="entry-form__card" aria-labelledby="remarks-heading">
        <div className="entry-form__section-heading">
          <p>Notes</p>
          <h2 id="remarks-heading">Flight notes</h2>
        </div>
        <div className="entry-field">
          <label htmlFor="entry-remarks">Remarks</label>
          <textarea id="entry-remarks" name="remarks" onChange={handleChange} rows={4} value={values.remarks} />
        </div>
      </section>

      {submitError ? <p className="entry-submit-error" role="alert">{submitError}</p> : null}

      <div className="entry-form__actions">
        <button className="primary-action" disabled={isSaving || isDeleting} type="submit">
          {isSaving ? 'Saving…' : 'Save flight'}
        </button>
        {onDelete && !confirmDelete ? (
          <button className="danger-action" disabled={isSaving} onClick={() => setConfirmDelete(true)} type="button">
            Delete flight
          </button>
        ) : null}
      </div>

      {confirmDelete ? (
        <section aria-labelledby="delete-flight-heading" className="entry-delete-confirmation">
          <h2 id="delete-flight-heading">Delete this flight?</h2>
          <p>This removes the flight from this device. This action cannot be undone.</p>
          <div className="entry-delete-confirmation__actions">
            <button className="secondary-action" disabled={isDeleting} onClick={() => setConfirmDelete(false)} type="button">Cancel</button>
            <button className="danger-action danger-action--filled" disabled={isDeleting} onClick={handleDelete} type="button">
              {isDeleting ? 'Deleting…' : 'Delete flight permanently'}
            </button>
          </div>
        </section>
      ) : null}
    </form>
  );
}
