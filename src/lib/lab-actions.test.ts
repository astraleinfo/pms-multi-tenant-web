import { describe, expect, it } from "vitest";
import { labActions } from "./lab-actions";

/* The permission sets the API hands each role (app/core/permissions.py), cut
   down to the lab ones that decide these buttons. */
const LAB_TECH = ["lab:read", "lab:result", "lab:verify", "billing:write"];
const DOCTOR = ["lab:read", "lab:order", "billing:write"];
const can = (held: string[]) => (p: string) => held.includes(p);

describe("labActions", () => {
  it("offers sample acceptance on an ordered test to whoever may work the bench", () => {
    expect(labActions("ordered", can(LAB_TECH)).accept).toBe(true);
  });

  it("does not offer it to a role the API would refuse", () => {
    const doctor = labActions("ordered", can(DOCTOR));
    expect(doctor.accept).toBe(false);
    expect(doctor.attach).toBe(false);
  });

  it("lets results be entered only while the order is on the bench", () => {
    expect(labActions("pending", can(LAB_TECH)).enterResults).toBe(true);
    expect(labActions("resulted", can(LAB_TECH)).enterResults).toBe(true);
    expect(labActions("ordered", can(LAB_TECH)).enterResults).toBe(false);
    expect(labActions("verified", can(LAB_TECH)).enterResults).toBe(false);
    expect(labActions("pending", can(DOCTOR)).enterResults).toBe(false);
  });

  it("offers release only on a resulted order, and only with lab:verify", () => {
    expect(labActions("resulted", can(LAB_TECH)).verify).toBe(true);
    expect(labActions("pending", can(LAB_TECH)).verify).toBe(false);
    expect(labActions("resulted", can(["lab:read", "lab:result"])).verify).toBe(false);
  });

  it("takes no more paper once verified", () => {
    expect(labActions("verified", can(LAB_TECH)).attach).toBe(false);
    expect(labActions("resulted", can(LAB_TECH)).attach).toBe(true);
  });
});
