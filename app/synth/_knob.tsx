"use client";

// app/synth's Knob: the shared control, with this product's group colours
// applied. The component itself lives in components/knob.tsx because /master
// uses it too, and a copy would have been two knobs to fix.

import { Knob as BaseKnob, type KnobProps as BaseKnobProps } from "@/components/knob";
import { GROUP_COLOR, type SynthGroup } from "./_tokens";

export interface KnobProps extends Omit<BaseKnobProps, "color"> {
  group?: SynthGroup;
}

export function Knob({ group = "source", ...rest }: KnobProps) {
  return <BaseKnob {...rest} color={GROUP_COLOR[group]} />;
}
