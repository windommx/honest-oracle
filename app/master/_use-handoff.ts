"use client";

import { useEffect, useRef } from "react";
import { takeHandoff, type AudioHandoff } from "@/lib/audio-io/handoff";

/**
 * Receive audio another product handed over, exactly once.
 *
 * Extracted from the page because the obvious implementation of this is
 * wrong in a way only a browser showed, and a bug that destroys the user's
 * audio deserves a test rather than a comment.
 *
 * THE HAZARD. Taking the handoff DELETES it — that is the point, so a reload
 * does not drop the same buffer on top of whatever the operator has opened
 * since. Which makes the read destructive, and a destructive read inside an
 * effect has to survive the effect running more than once. React's StrictMode
 * mounts, cleans up, and mounts again on purpose, to surface exactly this.
 *
 * The version that ships in most codebases — a `cancelled` flag set by the
 * cleanup, checked when the read resolves — loses the data outright: the
 * first read takes the row and deletes it, the cleanup sets cancelled, the
 * payload is dropped, and the second read finds an empty slot. Measured:
 * MasterPro opened saying no file was loaded, with the row already gone from
 * IndexedDB and no way to get it back.
 *
 * So the guard is a ref, which survives the remount and keeps the read to
 * one, and the payload is delivered unconditionally once read. The component
 * is the same one across a StrictMode cycle, so a late delivery still reaches
 * a live component. On a genuine unmount the callback lands on a component
 * that is gone, which React 18 treats as a no-op — a worse outcome than
 * delivering, and a far better one than deleting the audio to avoid it.
 */
export function useIncomingHandoff(onReceive: (handoff: AudioHandoff) => void): void {
  const receive = useRef(onReceive);
  receive.current = onReceive;
  const taken = useRef(false);

  useEffect(() => {
    if (taken.current) return;
    taken.current = true;
    void takeHandoff().then((waiting) => {
      if (waiting) receive.current(waiting);
    });
  }, []);
}
