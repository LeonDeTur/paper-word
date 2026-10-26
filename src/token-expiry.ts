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
    throw new Error("Укажите только один способ задания срока.");
  const seconds = input.expires_in ?? (input.days ?? 90) * 86400;
  if (
    input.expires_at === undefined &&
    (!Number.isSafeInteger(seconds) || seconds <= 0)
  )
    throw new Error("Срок должен быть положительным целым числом секунд.");
  const date =
    input.expires_at !== undefined
      ? new Date(input.expires_at)
      : new Date(now.getTime() + seconds * 1000);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999)
    throw new Error("Укажите корректную дату не позднее 9999 года.");
  if (date.getTime() <= now.getTime())
    throw new Error("Дата окончания должна быть в будущем.");
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
  const text = value.trim().replace(/^до\s+/i, "");
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ Tt](\d{2}):(\d{2}))?$/.exec(text);
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2}))?$/.exec(text);
  const match = iso || ru;
  if (!match)
    throw new Error(
      "Введите дату ГГГГ-ММ-ДД или ДД.ММ.ГГГГ, при необходимости — ЧЧ:ММ.",
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
    throw new Error(
      "Такой даты или времени не существует в вашем часовом поясе.",
    );
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
    .replace(/^через\s+/, "");
  const duration =
    /^(\d+)\s*(m|min|мин|минута|минуты|минут|h|ч|час|часа|часов|d|д|день|дня|дней|w|н|нед|неделя|недели|недель)$/.exec(
      text,
    );
  if (duration) {
    const unit = duration[2];
    const multiplier = /^(m|min|мин|минута|минуты|минут)$/.test(unit)
      ? 60
      : /^(h|ч|час|часа|часов)$/.test(unit)
        ? 3600
        : /^(d|д|день|дня|дней)$/.test(unit)
          ? 86400
          : 604800;
    const result = { expires_in: Number(duration[1]) * multiplier };
    resolveTokenExpiry(result, now);
    return result;
  }
  if (!text) throw new Error("Введите срок или дату окончания.");
  if (/^\d{4}-\d{2}-\d{2}|^\d{2}\.\d{2}\.\d{4}|^до\s/.test(text))
    return parseTokenExpiryDate(text, now);
  throw new Error("Примеры: 30d, 12h, 2w, 30 дней или 31.12.2027 18:00.");
}
