import { afterEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import ConsentTemplate from "../../src/models/ConsentTemplate.js";

describe("ConsentTemplate tenant scoping", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("includes businessId when fetching active template for a service", async () => {
    const sort = jest.fn().mockResolvedValue({ _id: "template_1" });
    const findOne = jest.spyOn(ConsentTemplate, "findOne").mockReturnValue({
      sort,
    });

    await ConsentTemplate.getActiveForService("service_1", "tenant_1");

    expect(findOne).toHaveBeenCalledWith({
      "requiredFor.services": "service_1",
      status: "published",
      businessId: "tenant_1",
    });
    expect(sort).toHaveBeenCalledWith({ version: -1 });
  });

  it("does not force businessId when none is provided", async () => {
    const sort = jest.fn().mockResolvedValue(null);
    const findOne = jest.spyOn(ConsentTemplate, "findOne").mockReturnValue({
      sort,
    });

    await ConsentTemplate.getActiveForService("service_2");

    expect(findOne).toHaveBeenCalledWith({
      "requiredFor.services": "service_2",
      status: "published",
    });
  });

  it("passes businessId through consent requirement checks", async () => {
    const getActiveForService = jest
      .spyOn(ConsentTemplate, "getActiveForService")
      .mockResolvedValue(null);
    jest.spyOn(mongoose, "model").mockReturnValue({
      findOne: jest.fn(),
    });

    const result = await ConsentTemplate.isConsentRequired(
      "service_3",
      "client_1",
      "tenant_3"
    );

    expect(getActiveForService).toHaveBeenCalledWith("service_3", "tenant_3");
    expect(result).toEqual({ required: false, signed: false });
  });
});
