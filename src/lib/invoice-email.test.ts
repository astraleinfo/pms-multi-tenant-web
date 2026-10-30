import { describe, expect, it } from "vitest";
import {
  DEFAULT_MESSAGE, DEFAULT_SUBJECT, PLACEHOLDERS, emailProblem, fillTemplate, invoiceEmailProblem,
  previewValues, senderNameProblem, subjectProblem, templateProblem,
} from "./invoice-email";

describe("templateProblem", () => {
  it("accepts plain text, the defaults, and every placeholder", () => {
    expect(templateProblem("")).toBeNull();
    expect(templateProblem("Thank you for visiting.")).toBeNull();
    expect(templateProblem(DEFAULT_SUBJECT)).toBeNull();
    expect(templateProblem(DEFAULT_MESSAGE)).toBeNull();
    expect(templateProblem(PLACEHOLDERS.map((p) => `{${p.key}}`).join(" "))).toBeNull();
  });

  it("names a placeholder it does not know", () => {
    expect(templateProblem("Hi {first_name}")).toMatch(/\{first_name\}/);
    expect(templateProblem("Invoice {0}")).toMatch(/\{0\}/);
    expect(templateProblem("{patient_name.__class__}")).toMatch(/not a placeholder/);
    expect(templateProblem("{amount!r}")).toMatch(/not a placeholder/);
  });

  it("refuses a brace that is not part of a placeholder", () => {
    expect(templateProblem("Hello {patient_name")).toMatch(/brace/);
    expect(templateProblem("Hi }")).toMatch(/brace/);
    expect(templateProblem("{{patient_name}}")).toMatch(/brace/);
  });
});

describe("subjectProblem", () => {
  it("is one line", () => {
    expect(subjectProblem("Invoice {invoice_number}")).toBeNull();
    expect(subjectProblem("Line one\nLine two")).toMatch(/one line/);
  });
});

describe("senderNameProblem", () => {
  it("accepts a name and refuses anything that looks like an address", () => {
    expect(senderNameProblem("")).toBeNull();
    expect(senderNameProblem("Northgate Accounts")).toBeNull();
    expect(senderNameProblem("billing@bank.example")).toMatch(/not an address/);
    expect(senderNameProblem("Billing <x>")).toMatch(/not an address/);
    expect(senderNameProblem("Billing\nBcc: x")).toMatch(/one line/);
  });
});

describe("emailProblem", () => {
  it("accepts one plausible address", () => {
    expect(emailProblem("asha.rao@example.com")).toBeNull();
    expect(emailProblem("  asha.rao@example.com ")).toBeNull();
  });

  it("refuses an empty, partial or doubled address", () => {
    expect(emailProblem("")).toMatch(/address/i);
    expect(emailProblem("asha")).toMatch(/address/i);
    expect(emailProblem("asha@example")).toMatch(/address/i);
    expect(emailProblem("a@example.com, b@example.com")).toMatch(/address/i);
  });
});

describe("fillTemplate", () => {
  it("fills every known placeholder in one pass", () => {
    expect(fillTemplate("{patient_name} owes {amount}", { patient_name: "Asha Rao", amount: "₹750.00" }))
      .toBe("Asha Rao owes ₹750.00");
  });

  it("does not fill in a value that looks like a placeholder", () => {
    expect(fillTemplate("{patient_name} owes {amount}", { patient_name: "{amount}", amount: "₹10.00" }))
      .toBe("{amount} owes ₹10.00");
  });

  it("leaves an unknown token as it was written", () => {
    expect(fillTemplate("Hi {first_name}", { patient_name: "Asha" })).toBe("Hi {first_name}");
  });
});

describe("previewValues", () => {
  it("uses the clinic's own name and sample figures for the rest", () => {
    const values = previewValues("Northgate Family Practice");
    expect(values.clinic_name).toBe("Northgate Family Practice");
    for (const p of PLACEHOLDERS) expect(values[p.key]).toBeTruthy();
  });
});

describe("invoiceEmailProblem", () => {
  const blank = {
    invoice_email_reply_to: "", invoice_email_sender_name: "",
    invoice_email_subject: "", invoice_email_message: "",
  };

  it("is happy with nothing set — every field has a default", () => {
    expect(invoiceEmailProblem(blank)).toBeNull();
  });

  it("reports the first thing wrong, naming the field", () => {
    expect(invoiceEmailProblem({ ...blank, invoice_email_reply_to: "nope" })).toMatch(/reply-to/i);
    expect(invoiceEmailProblem({ ...blank, invoice_email_subject: "{nope}" })).toMatch(/subject/i);
    expect(invoiceEmailProblem({ ...blank, invoice_email_message: "{nope}" })).toMatch(/message/i);
    expect(invoiceEmailProblem({ ...blank, invoice_email_sender_name: "a@b.co" })).toMatch(/sender/i);
  });
});
