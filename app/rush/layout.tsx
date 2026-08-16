import { Toaster } from "./_toast";

/** Rush shell — mounts the toast stack once so every /rush page can fire in-app feedback
 *  (toast()) instead of a native window.alert(). Server component; the Toaster is a client
 *  island that self-mounts. */
export default function RushLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
