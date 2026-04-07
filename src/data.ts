import { Activity, BrainCircuit, FlaskConical, Radar } from "lucide-react";
import type { ModuleDefinition, ModuleId } from "./types";

export const modules: ModuleDefinition[] = [
  {
    id: "ops",
    name: "Ops",
    eyebrow: "Execution lane",
    summary:
      "Track automation readiness, current system pressure, and operational follow-through from real local sources.",
    context:
      "Ops reads the automation manifest, system reference, and latest brief attention list so execution pressure is tied to actual repo state.",
    icon: Radar,
    accent: "#F6B94C",
    glow: "rgba(246,185,76,0.35)",
  },
  {
    id: "brain",
    name: "Brain",
    eyebrow: "Reasoning lane",
    summary:
      "Surface generated briefs and rolling system context without losing scan speed or source provenance.",
    context:
      "Brain renders the latest brief archive and system reference digest straight from Aries outputs and documentation.",
    icon: BrainCircuit,
    accent: "#66B8FF",
    glow: "rgba(102,184,255,0.32)",
  },
  {
    id: "lab",
    name: "Lab",
    eyebrow: "Adapter lane",
    summary:
      "Track local prototypes, overnight build artifacts, and self-improvement activity while keeping the standalone app replaceable later.",
    context:
      "Lab is the proving ground for local Mission Control adapters, prototype outputs, and filesystem-backed build intelligence before true Aries APIs replace them.",
    icon: FlaskConical,
    accent: "#59F28C",
    glow: "rgba(89,242,140,0.3)",
  },
];

export const moduleSignals: Record<
  ModuleId,
  Array<{ label: string; icon: typeof Activity; helper: string }>
> = {
  ops: [
    { label: "Automation jobs", icon: Activity, helper: "Manifest + installer contract" },
    { label: "Known issues", icon: Activity, helper: "Rolling system reference" },
    { label: "Needs attention", icon: Activity, helper: "Latest daily brief" },
  ],
  brain: [
    { label: "Latest brief", icon: Activity, helper: "Rendered from docs/briefs" },
    { label: "Reference digest", icon: Activity, helper: "docs/SYSTEM-REFERENCE.md" },
    { label: "Archive continuity", icon: Activity, helper: "Recent brief history" },
  ],
  lab: [
    { label: "Prototype grid", icon: Activity, helper: "Filesystem-backed outputs" },
    { label: "Overnight builds", icon: Activity, helper: "dist + bundle artifacts" },
    { label: "Build logs", icon: Activity, helper: "Cron + self-improvement timeline" },
  ],
};
