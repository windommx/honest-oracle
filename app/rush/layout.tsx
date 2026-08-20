import { Toaster } from "./_toast";

/** Rush shell — two jobs.
 *
 *  1. Mounts the toast stack once so every /rush page can fire in-app feedback
 *     (toast()) instead of a native window.alert(). The Toaster is a client island.
 *  2. Marks the subtree as the RUSH product, which switches the CSS custom properties
 *     to the dark-fintech palette (see the [data-app="rush"] block in globals.css).
 *     This repo ships TWO products from one stylesheet: without the marker, the rush
 *     theme leaked into the oracle pages — a navy body behind their near-black
 *     containers, and purple focus rings on a gold-branded product.
 */
export default function RushLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-app="rush">
      {children}
      <Toaster />
    </div>
  );
}
