import { Toaster } from "./_toast";

/** Bookisdom shell — two jobs.
 *
 *  1. Mounts the toast stack once so every /bookisdom page can fire in-app feedback
 *     (toast()) instead of a native window.alert(). The Toaster is a client island.
 *  2. Marks the subtree as the BOOKISDOM product, which switches the CSS custom properties
 *     to the dark-fintech palette (see the [data-app="bookisdom"] block in globals.css).
 *     This repo ships TWO products from one stylesheet: without the marker, the bookisdom
 *     theme leaked into the lifemap pages — a navy body behind their near-black
 *     containers, and purple focus rings on a gold-branded product.
 */
export default function BookisdomLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-app="bookisdom">
      {children}
      <Toaster />
    </div>
  );
}
