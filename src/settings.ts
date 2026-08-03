import { cityFromTimeZone, isValidTimeZone, localTimeZone } from "./time";

/**
 * How much detail the face shows: just the time, or the time with a numeric seconds readout
 * alongside the sweeping seconds ring.
 */
export type ClockStyle = "minimal" | "seconds";

/**
 * Whether the digital readout uses a 12- or 24-hour clock.
 */
export type HourFormat = "12" | "24";

/**
 * Settings persisted per action instance, written by the property inspector.
 *
 * Every field is optional: a key that has never been configured still has to render something
 * sensible, and the property inspector clears fields back to `undefined` when the user empties them.
 */
export type WorldClockSettings = {
	timezone?: string;
	label?: string;
	accentColor?: string;
	hourFormat?: HourFormat;
	style?: ClockStyle;
};

/**
 * Settings with every field resolved to a usable value, ready to hand to the renderer.
 */
export type ResolvedSettings = {
	timezone: string;
	label: string;
	accentColor: string;
	hourFormat: HourFormat;
	style: ClockStyle;
};

/**
 * Warm amber; reads well against the near-black dial without shouting.
 */
export const DEFAULT_ACCENT = "#ff9f45";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Fills in defaults and rejects anything the renderer can't safely use, so that a corrupt or
 * half-written settings blob degrades to a working clock instead of a broken key.
 * @param settings Raw settings as persisted by the property inspector.
 * @returns Settings with every field resolved.
 */
export function resolveSettings(settings: WorldClockSettings | undefined): ResolvedSettings {
	const timezone =
		settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : localTimeZone();

	const label = settings?.label?.trim();

	return {
		timezone,
		label: label && label.length > 0 ? label : cityFromTimeZone(timezone),
		accentColor: normalizeHex(settings?.accentColor) ?? DEFAULT_ACCENT,
		hourFormat: settings?.hourFormat === "12" ? "12" : "24",
		style: settings?.style === "seconds" ? "seconds" : "minimal",
	};
}

/**
 * Validates a hex colour and expands the shorthand form, so downstream colour maths can assume
 * exactly six digits.
 * @param value Candidate colour, e.g. `#f90` or `#ff9900`.
 * @returns The six-digit form, or `undefined` when {@link value} is not a hex colour.
 */
function normalizeHex(value: string | undefined): string | undefined {
	if (value === undefined || !HEX_COLOR.test(value)) {
		return undefined;
	}

	if (value.length === 7) {
		return value;
	}

	const [, r, g, b] = value;
	return `#${r}${r}${g}${g}${b}${b}`;
}
