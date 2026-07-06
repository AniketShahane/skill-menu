import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BatchDeployConfirm } from "@/components/interactive-memory/interactive-memory-studio";

// framer-motion's useReducedMotion reads window.matchMedia, which jsdom lacks.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

type Props = ComponentProps<typeof BatchDeployConfirm>;

function renderModal(overrides: Partial<Props> = {}) {
  const onToggleExclude = vi.fn();
  const onConfirm = vi.fn();
  const props: Props = {
    busy: false,
    excluded: new Set<string>(),
    models: { t1: "sonnet", t2: "sonnet" },
    onCancel: () => {},
    onClose: () => {},
    onConfirm,
    onToggleExclude,
    result: undefined,
    setModel: () => {},
    tasks: [
      { id: "t1", title: "First task" },
      { id: "t2", title: "Second task" },
    ],
    ...overrides,
  };
  const utils = render(<BatchDeployConfirm {...props} />);
  return { ...utils, onToggleExclude, onConfirm };
}

describe("BatchDeployConfirm exclude behavior", () => {
  it("lists one include checkbox per task and counts all as included by default", () => {
    renderModal();
    expect(screen.getByRole("heading").textContent).toBe("Deploy 2 agent-ready tasks?");
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    for (const box of checkboxes) {
      expect((box as HTMLInputElement).checked).toBe(true);
    }
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("calls onToggleExclude with the task id when a checkbox is clicked", () => {
    const { onToggleExclude } = renderModal();
    fireEvent.click(screen.getByLabelText("Include First task in this deploy"));
    expect(onToggleExclude).toHaveBeenCalledTimes(1);
    expect(onToggleExclude).toHaveBeenCalledWith("t1");
  });

  it("reflects an excluded task: count drops, row struck, checkbox off, model disabled", () => {
    renderModal({ excluded: new Set<string>(["t1"]) });
    // includedCount = 1 of 2 -> singular "task"
    expect(screen.getByRole("heading").textContent).toBe("Deploy 1 of 2 agent-ready task?");

    const firstCheckbox = screen.getByLabelText(
      "Include First task in this deploy",
    ) as HTMLInputElement;
    expect(firstCheckbox.checked).toBe(false);

    const excludedRow = firstCheckbox.closest("li");
    expect(excludedRow?.classList.contains("is-excluded")).toBe(true);

    const firstModel = within(excludedRow as HTMLElement).getByRole(
      "combobox",
    ) as HTMLSelectElement;
    expect(firstModel.disabled).toBe(true);

    // The other task is still deployable.
    const secondCheckbox = screen.getByLabelText(
      "Include Second task in this deploy",
    ) as HTMLInputElement;
    expect(secondCheckbox.checked).toBe(true);
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("disables Confirm when every task is excluded (no zero-task deploy)", () => {
    renderModal({ excluded: new Set<string>(["t1", "t2"]) });
    expect(screen.getByRole("heading").textContent).toBe("Deploy 0 of 2 agent-ready tasks?");
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("renders the rocket icon before the Confirm label inside the button", () => {
    renderModal();
    const confirm = screen.getByRole("button", { name: "Confirm" });
    // Icon is the first child element and comes before the text node.
    expect(confirm.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(confirm.textContent).toContain("Confirm");
  });
});
