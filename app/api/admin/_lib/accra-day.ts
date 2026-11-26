/**
 * The shop's calendar day: the day in Accra, wherever the server happens to run.
 *
 * Ghana keeps UTC+0 all year (no daylight saving), so a day in Accra starts at 00:00 and ends
 * just before 24:00 on the same date in UTC. The date itself is worked out from the Africa/Accra
 * timezone by name, never from the server's own clock settings: a server set to another
 * timezone used to move "today" by a few hours.
 */
export type AccraDay = {
  /** YYYY-MM-DD */
  day: string;
  /** First instant of that day, as an ISO timestamp. */
  start: string;
  /** Last instant of that day, as an ISO timestamp. */
  end: string;
};

const ACCRA_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Accra',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today in Accra, or the given YYYY-MM-DD date as an Accra day. */
export function accraDay(date?: string | null, now: Date = new Date()): AccraDay {
  const raw = (date || '').trim();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ACCRA_DATE.format(now);
  return {
    day,
    start: `${day}T00:00:00.000+00:00`,
    end: `${day}T23:59:59.999+00:00`,
  };
}
