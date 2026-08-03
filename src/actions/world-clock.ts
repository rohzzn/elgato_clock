import {
	action,
	SingletonAction,
	streamDeck,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { renderClockSVG } from "../clock-face";
import { resolveSettings, type ResolvedSettings, type WorldClockSettings } from "../settings";
import { onTick } from "../ticker";

const logger = streamDeck.logger.createScope("WorldClock");

/**
 * Everything needed to keep one key on screen ticking.
 */
type ClockInstance = {
	/** The key this clock is drawn on. */
	action: KeyAction<WorldClockSettings>;
	/** Current settings, refreshed whenever the property inspector saves. */
	settings: ResolvedSettings;
	/** Last SVG sent, used to skip redundant `setImage` calls. */
	lastImage?: string;
	/** Detaches this instance from the shared tick. */
	stop: () => void;
};

/**
 * A live analog clock for a single city. The action can be dropped on any number of keys; each one
 * is tracked separately here and configured independently through its own property inspector.
 */
@action({ UUID: "com.rohan.worldclock.clock" })
export class WorldClock extends SingletonAction<WorldClockSettings> {
	/**
	 * Visible instances, keyed by action id. Only keys that are actually on screen appear here, so
	 * a clock on another page or profile costs nothing.
	 */
	readonly #instances = new Map<string, ClockInstance>();

	/**
	 * Starts a clock when its key becomes visible — on plugin start, and whenever the user navigates
	 * to the page or profile it lives on.
	 * @param ev Event containing the action and its persisted settings.
	 */
	override onWillAppear(ev: WillAppearEvent<WorldClockSettings>): void {
		// Keypad-only per the manifest; the guard is what narrows the action to one that has setImage.
		if (!ev.action.isKey()) {
			return;
		}

		// Stream Deck can re-announce an action that is already on screen; never leave a stale
		// subscription behind, or the key would end up drawn by two tick listeners.
		this.#stop(ev.action.id);

		const instance: ClockInstance = {
			action: ev.action,
			settings: resolveSettings(ev.payload.settings),
			stop: () => {},
		};

		instance.stop = onTick((now) => this.#draw(instance, now));
		this.#instances.set(ev.action.id, instance);

		// Draw straight away rather than leaving the manifest placeholder up for up to a second.
		this.#draw(instance, new Date());
	}

	/**
	 * Stops a clock when its key leaves the screen, so keys on other pages don't burn CPU.
	 * @param ev Event identifying the action that disappeared.
	 */
	override onWillDisappear(ev: WillDisappearEvent<WorldClockSettings>): void {
		this.#stop(ev.action.id);
	}

	/**
	 * Applies a change from the property inspector immediately, instead of letting the key show
	 * stale settings until the next tick.
	 * @param ev Event containing the action and its new settings.
	 */
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<WorldClockSettings>): void {
		const instance = this.#instances.get(ev.action.id);
		if (instance === undefined) {
			return;
		}

		instance.settings = resolveSettings(ev.payload.settings);
		this.#draw(instance, new Date());
	}

	/**
	 * Toggles the numeric seconds readout on press. A clock doesn't need to *do* anything, but a
	 * press is free real estate for the one setting people flip situationally, and it persists so
	 * the key comes back the way it was left.
	 * @param ev Event containing the action and its current settings.
	 */
	override async onKeyDown(ev: KeyDownEvent<WorldClockSettings>): Promise<void> {
		const settings = ev.payload.settings;
		settings.style = settings.style === "seconds" ? "minimal" : "seconds";

		await ev.action.setSettings(settings);

		const instance = this.#instances.get(ev.action.id);
		if (instance !== undefined) {
			instance.settings = resolveSettings(settings);
			this.#draw(instance, new Date());
		}
	}

	/**
	 * Renders the face and pushes it to the key, skipping the send when nothing changed.
	 * @param instance Instance to draw.
	 * @param now Instant to draw.
	 */
	#draw(instance: ClockInstance, now: Date): void {
		let image: string;

		try {
			image = renderClockSVG(instance.settings, now);
		} catch (err) {
			logger.error("Failed to render clock face.", err);
			return;
		}

		// Consecutive ticks can land in the same wall-clock second; there is nothing new to send.
		if (image === instance.lastImage) {
			return;
		}

		instance.lastImage = image;
		instance.action
			.setImage(`data:image/svg+xml,${encodeURIComponent(image)}`)
			.catch((err) => logger.error("Failed to set key image.", err));
	}

	/**
	 * Detaches an instance from the tick and forgets it. Safe to call for an unknown id.
	 * @param id Action id to stop.
	 */
	#stop(id: string): void {
		const instance = this.#instances.get(id);
		if (instance !== undefined) {
			instance.stop();
			this.#instances.delete(id);
		}
	}
}
