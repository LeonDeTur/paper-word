export type TokenExpiryInput = {
  days?: number;
  expires_in?: number;
  expires_at?: string;
};

export function resolveTokenExpiry(input: TokenExpiryInput, now = new Date()) {
  if (
    [input.days, input.expires_in, input.expires_at].filter(
      (v) => v !== undefined,
    ).length > 1
  )
    throw new Error("Choose only one way to specify expiry.");
  const seconds = input.expires_in ?? (input.days ?? 90) * 86400;
  if (
    input.expires_at === undefined &&
    (!Number.isSafeInteger(seconds) || seconds <= 0)
  )
    throw new Error("Duration must be a positive whole number of seconds.");
  const date =
    input.expires_at !== undefined
      ? new Date(input.expires_at)
      : new Date(now.getTime() + seconds * 1000);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999)
    throw new Error("Enter a valid date no later than year 9999.");
  if (date.getTime() <= now.getTime())
    throw new Error("The expiration date must be in the future.");
  return date;
}

export function localDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Date-only commands end at the end of that day in the browser's timezone.
// Explicit components prevent Date from silently normalizing February 30.
export function parseTokenExpiryDate(
  value: string,
  now = new Date(),
): TokenExpiryInput {
  const text = value.trim().replace(/^(?:until|\u0434\u043e)\s+/i, "");
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ Tt](\d{2}):(\d{2}))?$/.exec(text);
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2}))?$/.exec(
    text,
  );
  const match = iso || dotted;
  if (!match)
    throw new Error(
      "Enter YYYY-MM-DD or DD.MM.YYYY, optionally followed by HH:MM.",
    );
  const year = Number(match[iso ? 1 : 3]),
    month = Number(match[2]),
    day = Number(match[iso ? 3 : 1]);
  const hasTime = match[4] !== undefined;
  const hour = hasTime ? Number(match[4]) : 23,
    minute = hasTime ? Number(match[5]) : 59;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, hasTime ? 0 : 59, hasTime ? 0 : 999);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  )
    throw new Error("This date or time does not exist in your timezone.");
  const result = { expires_at: date.toISOString() };
  resolveTokenExpiry(result, now);
  return result;
}

export function parseTokenExpiryCommand(
  value: string,
  now = new Date(),
): TokenExpiryInput {
  const text = value
    .trim()
    .toLowerCase()
    .replace(/^(?:in|\u0447\u0435\u0440\u0435\u0437)\s+/, "");
  const duration =
    /^(\d+)\s*(m|min|minutes?|\u043c\u0438\u043d|\u043c\u0438\u043d\u0443\u0442\u0430|\u043c\u0438\u043d\u0443\u0442\u044b|\u043c\u0438\u043d\u0443\u0442|h|hours?|\u0447|\u0447\u0430\u0441|\u0447\u0430\u0441\u0430|\u0447\u0430\u0441\u043e\u0432|d|days?|\u0434|\u0434\u0435\u043d\u044c|\u0434\u043d\u044f|\u0434\u043d\u0435\u0439|w|weeks?|\u043d|\u043d\u0435\u0434|\u043d\u0435\u0434\u0435\u043b\u044f|\u043d\u0435\u0434\u0435\u043b\u0438|\u043d\u0435\u0434\u0435\u043b\u044c)$/.exec(
      text,
    );
  if (duration) {
    const unit = duration[2];
    const multiplier =
      /^(m|min|minutes?|\u043c\u0438\u043d|\u043c\u0438\u043d\u0443\u0442\u0430|\u043c\u0438\u043d\u0443\u0442\u044b|\u043c\u0438\u043d\u0443\u0442)$/.test(
        unit,
      )
        ? 60
        : /^(h|hours?|\u0447|\u0447\u0430\u0441|\u0447\u0430\u0441\u0430|\u0447\u0430\u0441\u043e\u0432)$/.test(
              unit,
            )
          ? 3600
          : /^(d|days?|\u0434|\u0434\u0435\u043d\u044c|\u0434\u043d\u044f|\u0434\u043d\u0435\u0439)$/.test(
                unit,
              )
            ? 86400
            : 604800;
    const result = { expires_in: Number(duration[1]) * multiplier };
    resolveTokenExpiry(result, now);
    return result;
  }
  if (!text) throw new Error("Enter a duration or expiration date.");
  if (
    /^\d{4}-\d{2}-\d{2}|^\d{2}\.\d{2}\.\d{4}|^(?:until|\u0434\u043e)\s/.test(
      text,
    )
  )
    return parseTokenExpiryDate(text, now);
  throw new Error("Examples: 30d, 12h, 2w, 30 days or 2027-12-31 18:00.");
}
