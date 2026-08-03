import type { ResolvedSettings } from "./settings";
import { zonedTime, type ZonedTime } from "./time";

/**
 * The face is drawn in a 200x200 coordinate space and scaled by Stream Deck to whatever the
 * hardware needs (72px on most models, 80px on a Mini, 96px on an XL). Every size below was chosen
 * against that smallest physical size, not against the design canvas.
 */
const SIZE = 200;
const CENTER = SIZE / 2;

/**
 * Seconds ring: the only moving element, and what stops the key from looking like a static label.
 * Kept to a hairline — at any heavier weight a near-complete accent circle stops reading as a clock
 * and starts reading as a loading spinner.
 */
const RING_RADIUS = 90;
const RING_WIDTH = 3;

/**
 * Digits are placed one glyph at a time into fixed-width slots rather than drawn as a single
 * string. System fonts are not tabular, so "11:11" is markedly narrower than "00:00" — rendered as
 * text the readout would visibly shuffle every minute. Slots make it immovable.
 */
const DIGIT_ADVANCE = 38;
const COLON_ADVANCE = 18;
const DIGIT_SIZE = 60;

/** Warm off-white rather than pure white — pure white glares against the near-black background. */
const DIGIT_COLOR = "#f2f2ee";

/**
 * Background gradient endpoints. The face drifts between them across the day: cooler blue-grey
 * overnight, a touch warmer in the afternoon. Both pairs sit within a few RGB steps of each other,
 * so the effect registers as "alive" rather than as a colour change.
 */
const NIGHT_CENTER = "#0e1016";
const NIGHT_EDGE = "#181c26";
const DAY_CENTER = "#141010";
const DAY_EDGE = "#221c1a";

/** No embedded webfonts: they are not guaranteed to resolve in Stream Deck's render context. */
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Long enough for any real city name; guards against a pasted essay in the custom label field. */
const MAX_LABEL_LENGTH = 20;

/**
 * Baselines for the two compositions. With no third line the remaining two are re-centred rather
 * than left hanging above an empty lower half.
 */
const THREE_LINE = { label: 59, time: 120, detail: 153 };
const TWO_LINE = { label: 74, time: 137 };

/**
 * Renders the clock face for a single instant.
 *
 * Pure: given the same settings and date it always produces the same string, which lets the action
 * layer skip redundant `setImage` calls and makes the face trivial to preview outside Stream Deck.
 * @param settings Resolved settings for the action instance.
 * @param date Instant to draw; defaults to now.
 * @returns A standalone SVG document.
 */
export function renderClockSVG(settings: ResolvedSettings, date: Date = new Date()): string {
	const time = zonedTime(settings.timezone, date);

	const daylight = daylightFactor(time);
	const backgroundCenter = mixHex(NIGHT_CENTER, DAY_CENTER, daylight);
	const backgroundEdge = mixHex(NIGHT_EDGE, DAY_EDGE, daylight);

	const detail = renderDetail(settings, time);
	const layout = detail === undefined ? TWO_LINE : THREE_LINE;

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`,
		`<defs><radialGradient id="wcBg" cx="50%" cy="46%" r="72%">`,
		`<stop offset="0%" stop-color="${backgroundCenter}"/><stop offset="100%" stop-color="${backgroundEdge}"/>`,
		`</radialGradient></defs>`,

		// Full-bleed background: Stream Deck already rounds the key corners for us.
		`<rect width="${SIZE}" height="${SIZE}" fill="url(#wcBg)"/>`,

		renderRing(time.second, settings.accentColor),
		renderLabel(settings.label, layout.label),
		renderTime(time, settings, layout.time),
		detail === undefined ? "" : renderDetailText(detail, THREE_LINE.detail),

		`</svg>`,
	].join("");
}

/**
 * Draws the seconds ring: a faint full-circle track with an accent arc sweeping once a minute.
 * @param second Current second, `0`-`59`.
 * @param accent Accent colour for the swept portion.
 * @returns SVG markup for the ring.
 */
function renderRing(second: number, accent: string): string {
	const track =
		`<circle cx="${CENTER}" cy="${CENTER}" r="${RING_RADIUS}" fill="none" stroke="#ffffff"` +
		` stroke-opacity="0.1" stroke-width="${RING_WIDTH}"/>`;

	// A zero-length arc is ambiguous — renderers draw it as nothing or as a full circle — so at the
	// top of the minute the track is simply left bare.
	if (second === 0) {
		return track;
	}

	const sweep = second * 6;
	const [x, y] = polar(sweep, RING_RADIUS);

	return (
		track +
		`<path d="M ${CENTER} ${CENTER - RING_RADIUS} A ${RING_RADIUS} ${RING_RADIUS} 0 ${sweep > 180 ? 1 : 0} 1 ${x} ${y}"` +
		` fill="none" stroke="${accent}" stroke-width="${RING_WIDTH}" stroke-linecap="round"/>`
	);
}

/**
 * Draws the city label. This is what makes a wall of six clocks scannable — without it every key is
 * an anonymous set of digits and the user has to remember which is which.
 * @param label City name, in whatever case the user supplied.
 * @param baseline Text baseline.
 * @returns SVG markup for the label.
 */
function renderLabel(label: string, baseline: number): string {
	// Sliced by code point, not code unit: cutting a surrogate pair in half yields a lone surrogate,
	// which is not valid XML and would blank the key.
	const text = Array.from(label).slice(0, MAX_LABEL_LENGTH).join("").toUpperCase();

	// Shrink to fit rather than clip: "BUENOS AIRES" has to survive the same slot as "OSLO". Sized
	// on the raw text — measuring the escaped form would shrink "R&D" as if it were seven glyphs.
	const length = text.length;
	const size = length <= 8 ? 15 : length <= 11 ? 13 : length <= 14 ? 11.5 : length <= 17 ? 10 : 9;

	return (
		`<text x="${CENTER}" y="${baseline}" text-anchor="middle" font-family="${FONT_STACK}" font-size="${size}"` +
		` font-weight="500" letter-spacing="${round(size * 0.14)}" fill="#ffffff" fill-opacity="0.55">${escapeXml(text)}</text>`
	);
}

/**
 * Draws the hours and minutes, glyph by glyph, into fixed slots centred on the canvas.
 *
 * In 12-hour mode the leading zero is dropped, as on a real digital watch, and the slots narrow to
 * match so the readout stays centred instead of drifting right.
 * @param time Current wall-clock time in the instance's zone.
 * @param settings Resolved settings for the action instance.
 * @param baseline Text baseline for the digits.
 * @returns SVG markup for the readout.
 */
function renderTime(time: ZonedTime, settings: ResolvedSettings, baseline: number): string {
	const hour =
		settings.hourFormat === "12"
			? String(time.hour % 12 === 0 ? 12 : time.hour % 12)
			: String(time.hour).padStart(2, "0");
	const minute = String(time.minute).padStart(2, "0");

	const width = (hour.length + minute.length) * DIGIT_ADVANCE + COLON_ADVANCE;
	let x = (SIZE - width) / 2;
	let markup = "";

	for (const glyph of hour) {
		markup += renderDigit(glyph, x + DIGIT_ADVANCE / 2, baseline);
		x += DIGIT_ADVANCE;
	}

	// Two dots rather than a ":" glyph: it reads as a digital display, and it sidesteps the wildly
	// inconsistent colon metrics across the fonts this might land on.
	const dotX = round(x + COLON_ADVANCE / 2);
	markup +=
		`<circle cx="${dotX}" cy="${round(baseline - 29)}" r="3.2" fill="${settings.accentColor}"/>` +
		`<circle cx="${dotX}" cy="${round(baseline - 14)}" r="3.2" fill="${settings.accentColor}"/>`;
	x += COLON_ADVANCE;

	for (const glyph of minute) {
		markup += renderDigit(glyph, x + DIGIT_ADVANCE / 2, baseline);
		x += DIGIT_ADVANCE;
	}

	return markup;
}

/**
 * Draws a single digit centred in its slot.
 * @param glyph The character to draw.
 * @param x Horizontal centre of the slot.
 * @param baseline Text baseline.
 * @returns SVG markup for the digit.
 */
function renderDigit(glyph: string, x: number, baseline: number): string {
	return (
		`<text x="${round(x)}" y="${baseline}" text-anchor="middle" font-family="${FONT_STACK}"` +
		` font-size="${DIGIT_SIZE}" font-weight="300" fill="${DIGIT_COLOR}">${glyph}</text>`
	);
}

/**
 * Builds the third line: the meridiem in 12-hour mode, the seconds when the user asked for them, or
 * both separated by a dot. Returns `undefined` when there is nothing to show, which switches the
 * face to the two-line composition.
 * @param settings Resolved settings for the action instance.
 * @param time Current wall-clock time in the instance's zone.
 * @returns Text content for the third line, including markup, or `undefined`.
 */
function renderDetail(settings: ResolvedSettings, time: ZonedTime): string | undefined {
	const meridiem = settings.hourFormat === "12" ? (time.hour < 12 ? "AM" : "PM") : undefined;
	const seconds = settings.style === "seconds" ? String(time.second).padStart(2, "0") : undefined;

	if (meridiem === undefined && seconds === undefined) {
		return undefined;
	}

	if (seconds === undefined) {
		return `<tspan fill="#ffffff" fill-opacity="0.5">${meridiem}</tspan>`;
	}

	const secondsSpan = `<tspan fill="${settings.accentColor}" fill-opacity="0.9"`;
	if (meridiem === undefined) {
		return `${secondsSpan}>${seconds}</tspan>`;
	}

	// `dx` rather than literal spaces: whitespace either side of the divider is collapsed away,
	// leaving the dot crowded against both neighbours.
	return (
		`<tspan fill="#ffffff" fill-opacity="0.5">${meridiem}</tspan>` +
		`<tspan fill="#ffffff" fill-opacity="0.25" dx="3">&#183;</tspan>` +
		`${secondsSpan} dx="3">${seconds}</tspan>`
	);
}

/**
 * Wraps third-line content in its text element.
 * @param content Markup produced by {@link renderDetail}.
 * @param baseline Text baseline.
 * @returns SVG markup for the third line.
 */
function renderDetailText(content: string, baseline: number): string {
	return (
		`<text x="${CENTER}" y="${baseline}" text-anchor="middle" font-family="${FONT_STACK}" font-size="15"` +
		` font-weight="500" letter-spacing="2">${content}</text>`
	);
}

/**
 * Maps the time of day onto a smooth 0-1 curve, troughing at 01:00 and peaking at 13:00. A cosine
 * rather than a threshold, so the background warms and cools gradually instead of snapping at 06:00.
 * @param time Current wall-clock time in the instance's zone.
 * @returns `0` at deepest night through `1` at midday.
 */
function daylightFactor(time: ZonedTime): number {
	const hours = time.hour + time.minute / 60;
	return 0.5 - 0.5 * Math.cos((2 * Math.PI * (hours - 1)) / 24);
}

/**
 * Converts polar coordinates to a point on the canvas, with 0 degrees at twelve o'clock and angles
 * increasing clockwise.
 * @param angle Degrees from twelve o'clock.
 * @param radius Distance from the centre.
 * @returns The `[x, y]` point, pre-rounded for compact output.
 */
function polar(angle: number, radius: number): [string, string] {
	const radians = ((angle - 90) * Math.PI) / 180;
	return [round(CENTER + radius * Math.cos(radians)), round(CENTER + radius * Math.sin(radians))];
}

/**
 * Blends two six-digit hex colours.
 * @param from Colour at `amount` 0.
 * @param to Colour at `amount` 1.
 * @param amount Blend position, 0-1.
 * @returns The blended colour as a six-digit hex string.
 */
function mixHex(from: string, to: string, amount: number): string {
	let hex = "#";

	for (let i = 1; i < 7; i += 2) {
		const a = Number.parseInt(from.slice(i, i + 2), 16);
		const b = Number.parseInt(to.slice(i, i + 2), 16);

		hex += Math.round(a + (b - a) * amount)
			.toString(16)
			.padStart(2, "0");
	}

	return hex;
}

/**
 * Rounds to two decimals and drops trailing zeroes. Called for every coordinate on every tick, so
 * it meaningfully trims what goes over the websocket once a second per key.
 * @param value Number to format.
 * @returns The shortest equivalent decimal string.
 */
function round(value: number): string {
	return value.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Escapes text destined for SVG character data. The label is user-supplied, so an unescaped `&`
 * or `<` would produce a malformed document and a blank key.
 * @param value Raw text.
 * @returns XML-safe text.
 */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
