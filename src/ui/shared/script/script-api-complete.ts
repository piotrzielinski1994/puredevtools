import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import type { ScriptStage } from "./model";

const CONSOLE = ["log", "info", "warn", "error"];
const REQ_READ = ["getUrl", "getMethod", "getHeader", "getHeaders", "getBody"];
const REQ_FULL = [
  "getUrl",
  "setUrl",
  "getMethod",
  "setMethod",
  "getHeader",
  "setHeader",
  "removeHeader",
  "getHeaders",
  "getBody",
  "setBody",
];
const RES = [
  "getStatus",
  "getHeader",
  "setHeader",
  "removeHeader",
  "getHeaders",
  "getBody",
  "setBody",
  "getJson",
];

export const apiMembers = (object: string, stage: ScriptStage): string[] => {
  if (object === "console") return CONSOLE;
  if (object === "req") return stage === "pre" ? REQ_FULL : REQ_READ;
  if (object === "res") return stage === "post" ? RES : [];
  return [];
};

const topLevel = (stage: ScriptStage): Completion[] =>
  (stage === "post" ? ["req", "res", "console"] : ["req", "console"]).map(
    (label) => ({
      label,
      type: "namespace",
    }),
  );

export const scriptApiCompletion =
  (stage: ScriptStage) =>
  (context: CompletionContext): CompletionResult | null => {
    const member = context.matchBefore(/(\w+)\.(\w*)$/);
    if (member) {
      const object = member.text.slice(0, member.text.indexOf("."));
      const members = apiMembers(object, stage);
      if (members.length === 0) return null;
      return {
        from: member.from + object.length + 1,
        options: members.map((label) => ({ label, type: "method" })),
        validFor: /^\w*$/,
      };
    }
    const word = context.matchBefore(/\w+$/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return { from: word.from, options: topLevel(stage), validFor: /^\w*$/ };
  };
