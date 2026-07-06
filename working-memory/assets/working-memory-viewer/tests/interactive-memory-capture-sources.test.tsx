import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CaptureSourceList,
  sourceRefsFromDraft,
} from "@/components/interactive-memory/interactive-memory-studio";

describe("sourceRefsFromDraft", () => {
  it("returns a single fallback ref when every pair is blank (legacy behavior)", () => {
    const refs = sourceRefsFromDraft(
      { sourceKind: "manual", sources: [{ label: "", url: "" }] },
      "Manual capture",
    );
    expect(refs).toEqual([{ kind: "manual", label: "Manual capture" }]);
  });

  it("maps each filled pair to one ref sharing the draft source kind, in order", () => {
    const refs = sourceRefsFromDraft(
      {
        sourceKind: "slack",
        sources: [
          { label: "Thread", url: "https://slack.example/1" },
          { label: "Ticket", url: "https://jira.example/2" },
        ],
      },
      "Manual capture",
    );
    expect(refs).toEqual([
      { kind: "slack", label: "Thread", url: "https://slack.example/1" },
      { kind: "slack", label: "Ticket", url: "https://jira.example/2" },
    ]);
  });

  it("drops fully-blank extra rows instead of inflating them into junk fallback refs", () => {
    const refs = sourceRefsFromDraft(
      {
        sourceKind: "manual",
        sources: [
          { label: "Real", url: "" },
          { label: "  ", url: "  " },
          { label: "", url: "" },
        ],
      },
      "Manual capture",
    );
    expect(refs).toEqual([{ kind: "manual", label: "Real" }]);
  });

  it("uses the fallback label for a URL-only row so the link is not lost", () => {
    const refs = sourceRefsFromDraft(
      { sourceKind: "manual", sources: [{ label: "", url: "https://example.com" }] },
      "Manual capture",
    );
    expect(refs).toEqual([{ kind: "manual", label: "Manual capture", url: "https://example.com" }]);
  });
});

describe("CaptureSourceList", () => {
  it("renders one pair by default with the remove button disabled", () => {
    render(<CaptureSourceList onChange={() => {}} sources={[{ label: "", url: "" }]} />);
    expect(screen.getByLabelText("Source 1 label")).toBeTruthy();
    expect(screen.getByLabelText("Source 1 URL")).toBeTruthy();
    const remove = screen.getByLabelText("Remove source 1") as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
  });

  it("adds a blank pair when Add source is clicked", () => {
    const onChange = vi.fn();
    render(<CaptureSourceList onChange={onChange} sources={[{ label: "Real", url: "" }]} />);
    fireEvent.click(screen.getByRole("button", { name: /add source/i }));
    expect(onChange).toHaveBeenCalledWith([
      { label: "Real", url: "" },
      { label: "", url: "" },
    ]);
  });

  it("patches the correct pair when a field is edited", () => {
    const onChange = vi.fn();
    render(
      <CaptureSourceList
        onChange={onChange}
        sources={[
          { label: "A", url: "" },
          { label: "B", url: "" },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Source 2 URL"), {
      target: { value: "https://x" },
    });
    expect(onChange).toHaveBeenCalledWith([
      { label: "A", url: "" },
      { label: "B", url: "https://x" },
    ]);
  });

  it("removes the targeted pair when there is more than one", () => {
    const onChange = vi.fn();
    render(
      <CaptureSourceList
        onChange={onChange}
        sources={[
          { label: "A", url: "" },
          { label: "B", url: "" },
        ]}
      />,
    );
    const remove = screen.getByLabelText("Remove source 1") as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    fireEvent.click(remove);
    expect(onChange).toHaveBeenCalledWith([{ label: "B", url: "" }]);
  });
});
