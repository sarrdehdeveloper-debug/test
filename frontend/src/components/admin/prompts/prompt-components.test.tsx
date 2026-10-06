// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DiffView } from "./DiffView";
import { Tabs } from "./Tabs";
import { TemplateEditor, type TemplateEditorHandle } from "./TemplateEditor";

afterEach(cleanup);

function Controlled({
  initial,
  handle,
  known,
}: {
  initial: string;
  handle: React.Ref<TemplateEditorHandle>;
  known?: ReadonlySet<string>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TemplateEditor
      aria-label="Template"
      value={value}
      onChange={setValue}
      handleRef={handle}
      known={known}
    />
  );
}

describe("TemplateEditor", () => {
  it("numbers lines and highlights unknown variables", () => {
    const { container } = render(
      <Controlled
        initial={"Hello {{ name }}\n{{ nmae }}"}
        handle={createRef()}
        known={new Set(["name"])}
      />,
    );
    const backdrop = container.querySelector("[aria-hidden='true']");
    expect(backdrop?.textContent).toContain("1");
    expect(backdrop?.textContent).toContain("2");
    const unknown = [...container.querySelectorAll("span")].find(
      (s) => s.textContent === "{{ nmae }}",
    );
    expect(unknown?.className).toContain("decoration-wavy");
    const known = [...container.querySelectorAll("span")].find(
      (s) => s.textContent === "{{ name }}",
    );
    expect(known?.className).toContain("text-gold-deep");
  });

  it("inserts a snippet at the caret through its handle", () => {
    const handle = createRef<TemplateEditorHandle>();
    render(<Controlled initial="Sun: . End" handle={handle} />);
    const textarea = screen.getByRole("textbox", { name: "Template" }) as HTMLTextAreaElement;
    textarea.setSelectionRange(5, 5);
    act(() => handle.current?.insert("{{ sun_sign }}"));
    expect(textarea.value).toBe("Sun: {{ sun_sign }}. End");
  });

  it("is read-only when asked", () => {
    const handle = createRef<TemplateEditorHandle>();
    render(<TemplateEditor aria-label="Published" value="x" readOnly handleRef={handle} />);
    const textarea = screen.getByRole("textbox", { name: "Published" }) as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
    act(() => handle.current?.insert("y"));
    expect(textarea.value).toBe("x");
  });
});

describe("Tabs", () => {
  function Harness() {
    const [value, setValue] = useState<"a" | "b" | "c">("a");
    return (
      <Tabs
        label="Demo"
        idBase="demo"
        value={value}
        onChange={setValue}
        items={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta", disabled: true },
          { value: "c", label: "Gamma", count: 3 },
        ]}
      />
    );
  }

  it("moves with the arrow keys, skipping disabled tabs", () => {
    render(<Harness />);
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    expect(alpha.getAttribute("aria-selected")).toBe("true");
    expect(alpha.tabIndex).toBe(0);
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    const gamma = screen.getByRole("tab", { name: /Gamma/ });
    expect(gamma.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(gamma);
    fireEvent.keyDown(gamma, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Alpha" }).getAttribute("aria-selected")).toBe("true");
    expect(gamma.getAttribute("aria-controls")).toBe("demo-panel");
  });
});

describe("DiffView", () => {
  it("renders added and removed lines and expands collapsed context", () => {
    const before = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n");
    const after = before.replace("line 10", "line ten");
    render(<DiffView before={before} after={after} caption="Template" context={2} />);
    expect(screen.getByText("Removed:", { exact: false })).toBeTruthy();
    expect(screen.getByText("line ten")).toBeTruthy();
    const expand = screen.getByRole("button", { name: /Show 7 unchanged lines/ });
    fireEvent.click(expand);
    expect(screen.getByText("line 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show 7 unchanged lines/ })).toBeNull();
  });

  it("says when there is no difference", () => {
    render(<DiffView before="same" after="same" caption="x" />);
    expect(screen.getByText("No differences.")).toBeTruthy();
  });
});
