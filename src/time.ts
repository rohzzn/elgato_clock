/**
 * Wall-clock time in a specific zone, already adjusted for that zone's current UTC offset and DST.
 */
export type ZonedTime = {
	/** Hour on a 24-hour clock, `0`-`23`. */
	hour: number;
	/** Minute, `0`-`59`. */
	minute: number;
	/** Second, `0`-`59`. */
	second: number;
};

/**
 * `Intl.DateTimeFormat` construction is comparatively expensive and we format once per second per
 * key, so formatters are built lazily and reused for the lifetime of the plugin.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Gets the current wall-clock time in {@link timeZone}.
 *
 * Offsets are never computed by hand: `Intl` consults the IANA database, so DST transitions and
 * historic offset changes are handled for free.
 * @param timeZone IANA time zone identifier, e.g. `Asia/Tokyo`.
 * @param date Instant to convert; defaults to now.
 * @returns The wall-clock time in {@link timeZone}.
 */
export function zonedTime(timeZone: string, date: Date = new Date()): ZonedTime {
	const parts = formatterFor(timeZone).formatToParts(date);

	// `hourCycle: "h23"` should keep midnight at 0, but some ICU builds still emit 24; fold it back.
	return {
		hour: partAsNumber(parts, "hour") % 24,
		minute: partAsNumber(parts, "minute"),
		second: partAsNumber(parts, "second"),
	};
}

/**
 * Determines whether {@link timeZone} is a time zone this runtime understands.
 * @param timeZone Candidate IANA time zone identifier.
 * @returns `true` when the zone can be used for formatting; otherwise `false`.
 */
export function isValidTimeZone(timeZone: string): boolean {
	try {
		formatterFor(timeZone);
		return true;
	} catch {
		return false;
	}
}

/**
 * Gets the host machine's time zone, used when an instance has not been configured yet.
 * @returns An IANA time zone identifier.
 */
export function localTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * Derives a human-readable city name from a time zone identifier, e.g. `America/New_York` becomes
 * `New York`. The final segment is used so three-part zones such as `America/Argentina/Buenos_Aires`
 * still resolve to the city rather than the region.
 * @param timeZone IANA time zone identifier.
 * @returns The city name.
 */
export function cityFromTimeZone(timeZone: string): string {
	const segment = timeZone.split("/").pop();
	return (segment ?? timeZone).replace(/_/g, " ");
}

/**
 * Gets a cached formatter for {@link timeZone}, creating it on first use.
 * @param timeZone IANA time zone identifier.
 * @returns A formatter that yields 24-hour time parts in {@link timeZone}.
 * @throws {RangeError} When {@link timeZone} is not a recognised zone.
 */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timeZone);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hourCycle: "h23",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});

		formatters.set(timeZone, formatter);
	}

	return formatter;
}

/**
 * Reads a numeric field out of formatted parts.
 * @param parts Parts produced by {@link Intl.DateTimeFormat.formatToParts}.
 * @param type Field to read.
 * @returns The field's value, or `0` when absent.
 */
function partAsNumber(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
	const part = parts.find((p) => p.type === type);
	return part === undefined ? 0 : Number.parseInt(part.value, 10);
}
