import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import { companyKeys, useCompany, useUpdateCompany } from "@/hooks/useCompany";
import type { Company } from "@/types";

const mockInvoke = vi.mocked(invoke);

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
    qc,
  };
}

beforeEach(() => mockInvoke.mockReset());

const company: Company = { name: "Internal", logo_data: null };

describe("useCompany", () => {
  it("fetches the company record", async () => {
    mockInvoke.mockResolvedValueOnce(company);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCompany(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(company);
    expect(mockInvoke).toHaveBeenCalledWith("get_company");
  });
});

describe("useUpdateCompany", () => {
  it("calls update_company and invalidates companyKeys.all", async () => {
    mockInvoke.mockResolvedValueOnce({ name: "Mattos", logo_data: "data:x" });
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateCompany(), { wrapper });
    await result.current.mutateAsync({ name: "Mattos", logo_data: "data:x" });
    expect(mockInvoke).toHaveBeenCalledWith("update_company", { payload: { name: "Mattos", logo_data: "data:x" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: companyKeys.all });
  });

  it("does not invalidate when the command fails", async () => {
    mockInvoke.mockRejectedValueOnce("company name cannot be blank");
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateCompany(), { wrapper });
    await expect(result.current.mutateAsync({ name: " " })).rejects.toBe("company name cannot be blank");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
