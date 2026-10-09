import { describe, expect, it } from "vitest";
import {
  allIds, blocks, contentProblems, freshId, missingFields, move, newSection, personName, signingProblems,
  type ConsentContent,
} from "./consent";

const form = (): ConsentContent => ({
  title: "Dental Treatment Consent",
  intro: "",
  patient_fields: ["full_name", "mrn"],
  sections: [
    {
      id: "treatment", kind: "fields", title: "Treatment", body: "",
      fields: [
        { id: "procedure", label: "Proposed treatment", required: true, multiline: false },
        { id: "notes", label: "Notes", required: false, multiline: true },
      ],
      statements: [],
    },
    { id: "risks", kind: "text", title: "Risks", body: "- Pain\n- Swelling", fields: [], statements: [] },
    {
      id: "declaration", kind: "acknowledgements", title: "Declaration", body: "", fields: [],
      statements: [
        { id: "a1", text: "I understand the risks.", required: true },
        { id: "a2", text: "Photographs may be taken.", required: false },
      ],
    },
  ],
  signatures: { declaration: "I consent.", provider: true, witness: false },
  validity_days: 30,
});

describe("what stops a form from being saved", () => {
  it("accepts a complete form", () => {
    expect(contentProblems(form())).toEqual([]);
  });

  it("names each problem in words an administrator can act on", () => {
    const c = form();
    c.title = " ";
    c.sections[0].fields[0].label = "";
    c.sections[2].statements = [];
    c.signatures.declaration = "";
    c.validity_days = 0;
    const problems = contentProblems(c);
    expect(problems).toContain("The form needs a title.");
    expect(problems).toContain("The signature declaration cannot be empty.");
    expect(problems).toContain("Every field in “Treatment” needs a label.");
    expect(problems).toContain("“Declaration” needs at least one statement.");
    expect(problems.some((p) => p.includes("365"))).toBe(true);
  });

  it("refuses a form with no sections", () => {
    expect(contentProblems({ ...form(), sections: [] })).toContain("The form needs at least one section.");
  });
});

describe("asking for consent", () => {
  it("lists only the required fields still empty", () => {
    expect(missingFields(form(), {})).toEqual(["Proposed treatment"]);
    expect(missingFields(form(), { procedure: "  " })).toEqual(["Proposed treatment"]);
    expect(missingFields(form(), { procedure: "Root canal" })).toEqual([]);
  });
});

describe("what is still needed before signing", () => {
  const ready = { acknowledged: ["a1"], signerName: "Priyanka Bose", patientSigned: true, providerSigned: true };

  it("is nothing once every required part is done — optional statements are optional", () => {
    expect(signingProblems(form(), ready)).toEqual([]);
  });

  it("counts unticked required statements and names each missing signature", () => {
    const problems = signingProblems(form(), { acknowledged: [], signerName: "", patientSigned: false, providerSigned: false });
    expect(problems).toEqual([
      "1 required statement still to tick",
      "The name of the person signing",
      "The patient's signature",
      "The clinician's signature",
    ]);
  });

  it("does not ask for a clinician's signature the form does not have", () => {
    const c = form();
    c.signatures.provider = false;
    expect(signingProblems(c, { ...ready, providerSigned: false })).toEqual([]);
  });
});

describe("editing", () => {
  it("makes ids that are not already used", () => {
    expect(freshId("field", ["field-1", "field-2"])).toBe("field-3");
    expect(freshId("ack", [])).toBe("ack-1");
  });

  it("adds a section of each kind with what that kind needs", () => {
    const c = form();
    const fields = newSection("fields", c);
    const acks = newSection("acknowledgements", c);
    const text = newSection("text", c);
    expect(fields.fields).toHaveLength(1);
    expect(acks.statements).toHaveLength(1);
    expect(text.fields).toEqual([]);
    expect(allIds(c)).not.toContain(fields.id);
    expect(contentProblems({ ...c, sections: [...c.sections, fields, acks, text] })).toEqual([]);
  });

  it("moves a section within bounds only", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});

describe("reading text the way the document prints it", () => {
  it("joins lines into paragraphs and keeps bullets as one list", () => {
    expect(blocks("First line\nsame paragraph\n\n- one\n- two\nAfter")).toEqual([
      { kind: "p", lines: ["First line same paragraph"] },
      { kind: "ul", lines: ["one", "two"] },
      { kind: "p", lines: ["After"] },
    ]);
  });

  it("reads nothing from blank text", () => {
    expect(blocks("   ")).toEqual([]);
  });
});

it("shows a person, not their sign-in", () => {
  expect(personName("Hema Nair <admin@northgate.clinic>")).toBe("Hema Nair");
  expect(personName("System")).toBe("System");
});
