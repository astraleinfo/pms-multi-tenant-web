import { describe, expect, it } from "vitest";
import {
  FULL_NAME, LOGO_MAX_BYTES, LOGO_MAX_SIDE, logoProblem, logoSizeProblem, PRODUCT_NAME,
} from "./brand";

describe("logoSizeProblem", () => {
  it("accepts up to the limit on each side, the limit itself included", () => {
    expect(LOGO_MAX_SIDE).toBe(4000);
    expect(logoSizeProblem(4000, 4000)).toBeNull();
    expect(logoSizeProblem(1382, 245)).toBeNull();
  });

  it("refuses a side over the limit, naming the limit and the image's size", () => {
    expect(logoSizeProblem(4001, 10)).toBe("Logos are limited to 4000 × 4000 pixels; this one is 4001 × 10.");
    expect(logoSizeProblem(10, 12000)).toMatch(/10 × 12000/);
  });
});

describe("the product's name", () => {
  it("is the Clinic Management System, and Practice OS no more", () => {
    expect(PRODUCT_NAME).toBe("Clinic Management System");
    expect(FULL_NAME).toBe("Astrale Clinic Management System");
    expect(FULL_NAME).not.toMatch(/Practice OS/);
  });
});

describe("logoProblem", () => {
  it("accepts a PNG, JPEG or WebP up to 2 MB", () => {
    expect(logoProblem({ type: "image/png", size: 1024 })).toBeNull();
    expect(logoProblem({ type: "image/jpeg", size: LOGO_MAX_BYTES })).toBeNull();
    expect(logoProblem({ type: "image/webp", size: 10 })).toBeNull();
  });

  it("refuses any other kind of file, SVG included", () => {
    expect(logoProblem({ type: "image/svg+xml", size: 100 })).toMatch(/PNG, JPEG or WebP/);
    expect(logoProblem({ type: "application/pdf", size: 100 })).toMatch(/PNG, JPEG or WebP/);
    expect(logoProblem({ type: "", size: 100 })).toMatch(/PNG, JPEG or WebP/);
  });

  it("refuses an empty file and one over the limit", () => {
    expect(logoProblem({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(logoProblem({ type: "image/png", size: LOGO_MAX_BYTES + 1 })).toMatch(/2 MB/);
  });
});
