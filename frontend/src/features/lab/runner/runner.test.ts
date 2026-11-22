import { describe, expect, it } from "vitest";
import type { LabJobStep, LabParamSpec } from "@tng/shared";
import { changedParams, compactSuiteModels, missingVars, parseParam, stepSummary } from "@tng/shared/lab";

const spec = (name: string, type: string, def: LabParamSpec["default"]): LabParamSpec => ({
  name,
  type,
  default: def,
  help: "",
  choices: null,
});

describe("runner params", () => {
  it("parses by type and keeps $VAR", () => {
    expect(parseParam(spec("smoke", "int", 0), "50")).toBe(50);
    expect(parseParam(spec("l2", "list[float]", []), "0.1, 1e-3")).toEqual([0.1, 0.001]);
    expect(parseParam(spec("parts", "list[str]", []), "a b  c")).toEqual(["a", "b", "c"]);
    expect(parseParam(spec("latest", "bool", true), "false")).toBe(false);
    expect(parseParam(spec("e4_ft_run", "str", ""), " $E4_A ")).toBe("$E4_A");
  });

  it("only sends values that differ from defaults", () => {
    const specs = [spec("smoke", "int", 0), spec("parts", "list[str]", ["a", "b"]), spec("note", "str", "")];
    expect(changedParams(specs, { smoke: 0, parts: ["a", "b", "c"], note: "" })).toEqual({ parts: ["a", "b", "c"] });
  });

  it("finds variables used before they are saved", () => {
    const steps: LabJobStep[] = [
      { cmd: "e5", params: { e4_ft_run: "$E4" } },
      { cmd: "e4", params: {}, save_as: "E4" },
      { cmd: "e5", params: { e4_ft_run: "$E4" } },
    ];
    expect(missingVars(steps)).toEqual(["$E4"]);
    expect(stepSummary(steps[1])).toBe("e4 → $E4");
  });
});

describe("suite helpers", () => {
  it("drops models equal to the CLI default", () => {
    expect(
      compactSuiteModels(
        { clip: "A", e1: ["P"], yolo: "y2.pt", dino: "", ft: ["f.pt"] },
        { clip: "A", e1: ["P"], yolo: "y.pt", dino: "d" },
      ),
    ).toEqual({ yolo: "y2.pt", ft: ["f.pt"] });
  });
});
