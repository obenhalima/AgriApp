// Validate datetime-local values before conversion; ignore fields of inactive modes.
export function validateTreatmentDates(form: {
  schedule_mode: string; exact_dates: string[]; starts_at: string; ends_at: string;
}) {
  const errors: Record<string, string> = {};
  const convert = (value: string, field: string): string | null => {
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value || '');
    const date = new Date(value);
    if (!parts || !Number.isFinite(date.getTime()) ||
        date.getFullYear() !== Number(parts[1]) || date.getMonth()+1 !== Number(parts[2]) ||
        date.getDate() !== Number(parts[3]) || date.getHours() !== Number(parts[4]) ||
        date.getMinutes() !== Number(parts[5]) || date.getSeconds() !== Number(parts[6] || 0)) {
      errors[field] = 'Renseignez une date et une heure valides.';
      return null;
    }
    return date.toISOString();
  };
  let exact_dates: string[] = [], starts_at: string | null = null, ends_at: string | null = null;
  if (form.schedule_mode === 'recurring') {
    starts_at = convert(form.starts_at, 'starts_at');
    if (form.ends_at) ends_at = convert(form.ends_at, 'ends_at');
    if (starts_at && ends_at && new Date(ends_at) < new Date(starts_at))
      errors.ends_at = 'La fin doit être postérieure ou égale à la première date.';
  } else if (['single', 'exact_dates'].includes(form.schedule_mode)) {
    const dates = form.schedule_mode === 'single' ? [form.exact_dates[0] || ''] : form.exact_dates;
    if (!dates.length) errors['date_0'] = 'Ajoutez au moins une date.';
    exact_dates = dates.map((value, index) => convert(value, `date_${index}`)).filter((value): value is string => value !== null);
  } else errors.mode = 'Sélectionnez un mode de planification.';
  return { errors, exact_dates, starts_at, ends_at };
}
