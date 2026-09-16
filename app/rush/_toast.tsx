// The toast stack now lives in components/toast.tsx — StageLab needs the same
// in-app feedback and two stores would mean two stacks fighting for the corner.
// This re-export keeps every existing `./_toast` import (and its tests) working.
export {
  toast,
  dismissToast,
  Toaster,
  _resetToasts,
  _getToasts,
  type Toast,
  type ToastVariant,
} from "@/components/toast";
