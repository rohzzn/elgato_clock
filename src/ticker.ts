/**
 * Called once per second, with the instant the tick fired.
 */
export type TickListener = (now: Date) => void;

/**
 * Small cushion past the second boundary. Timers can fire a fraction of a millisecond early, which
 * would format the *previous* second and make the hand appear to stall; 8ms is imperceptible and
 * guarantees we are past the rollover.
 */
const BOUNDARY_CUSHION_MS = 8;

const listeners = new Set<TickListener>();

let timer: NodeJS.Timeout | undefined;

/**
 * Subscribes to the shared one-second tick.
 *
 * Every visible key shares a single timer rather than owning a `setInterval`. Two reasons: a plain
 * 1000ms interval drifts, and once it drifts across a second boundary the second hand visibly
 * doubles or skips a beat; and a shared tick means a wall of clocks moves in unison instead of each
 * hand landing tens of milliseconds apart. The timer only runs while at least one key is listening.
 * @param listener Invoked on each tick.
 * @returns Function that unsubscribes {@link listener}.
 */
export function onTick(listener: TickListener): () => void {
	listeners.add(listener);
	if (timer === undefined) {
		schedule();
	}

	return () => {
		listeners.delete(listener);
		if (listeners.size === 0 && timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	};
}

/**
 * Queues the next tick, aligned to the upcoming wall-clock second. Re-aligning on every tick keeps
 * the clock honest even if the process is descheduled or the machine sleeps.
 */
function schedule(): void {
	const delay = 1000 - (Date.now() % 1000) + BOUNDARY_CUSHION_MS;

	timer = setTimeout(() => {
		timer = undefined;
		const now = new Date();

		// Copy: a listener may unsubscribe (a key disappearing) while we're iterating.
		for (const listener of [...listeners]) {
			// One key failing to render must not stop every other clock on the device.
			try {
				listener(now);
			} catch {
				/* swallowed; the action layer logs its own failures */
			}
		}

		if (listeners.size > 0) {
			schedule();
		}
	}, delay);
}
