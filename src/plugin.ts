import streamDeck from "@elgato/streamdeck";

import { WorldClock } from "./actions/world-clock";

// The clock redraws once a second per visible key; trace logging would fill the log files with
// nothing but render chatter, so stay at "info" and let the action log its own failures.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new WorldClock());

streamDeck.connect();
