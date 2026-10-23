/**
 * Customer cancellation window (the 30s countdown on the customer's receipt screen, plus a few seconds of
 * buffer for network latency). While it runs the order is HELD: the Print Agent doesn't see it and the
 * dashboard shows a countdown. Once it has passed the order can no longer be cancelled, and printing starts.
 */
export const CANCEL_WINDOW_MS = 35 * 1000;
