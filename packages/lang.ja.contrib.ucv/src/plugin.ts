import { param, plugin } from "@amsvs/api";
import {
  finalize as finalizeJa,
  plan as planJa,
  PLUGIN_ID,
  PLUGIN_VERSION,
} from "./implementation";
import type { EngineScore, PhonePlan } from "@amsvs/api";
import type { PlannerOptions, PluginError } from "./implementation";

function isError(value: unknown): value is PluginError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    ["unsupported", "malformed", "incompatible_schema", "runtime"].includes(
      String((value as PluginError).kind),
    )
  );
}

function unwrapPlan(value: PhonePlan | PluginError): PhonePlan {
  if (isError(value)) throw new Error(value.message);
  return value;
}

function unwrapScore(value: EngineScore | PluginError): EngineScore {
  if (isError(value)) throw new Error(value.message);
  return value;
}

plugin(PLUGIN_ID)
  .version(PLUGIN_VERSION)
  .name("Japanese portable CV/VCV/CVVC")
  .params(
    {
      vowelAnchoring: param.boolean({
        default: true,
        label: "Vowel anchoring",
        help: "Place the vowel nucleus at the authored mora boundary and move onset consonants earlier when space is available.",
        cacheScope: "timing_and_later",
      }),
      consonantLeadMs: param.number({
        default: 70,
        min: 0,
        max: 250,
        step: 5,
        label: "Consonant lead (ms)",
        help: "Target onset-consonant window before each vowel. No voicebank timing is inferred.",
        cacheScope: "timing_and_later",
      }),
    },
    { label: "Japanese timing", stages: ["plan", "timing"] },
  )
  .hooks({
    role: "language",
    plan(track) {
      const options: PlannerOptions = {
        vowelAnchoring: Boolean(this.params.vowelAnchoring ?? true),
        consonantLeadMs: Number(this.params.consonantLeadMs ?? 70),
      };
      return unwrapPlan(planJa(track, options));
    },
    finalize(plan, timingEdits) {
      return unwrapScore(finalizeJa(plan, timingEdits));
    },
  })
  .register();
