// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Modal } from "./ui";
afterEach(cleanup);
it("does not imply an in-flight command was cancelled by closing its dialog", () => {
  const close = vi.fn();
  const { rerender } = render(
    <Modal title="Stock command" busy onClose={close}>
      Saving
    </Modal>,
  );
  expect(
    screen
      .getByRole("button", { name: "Close dialog" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  rerender(
    <Modal title="Stock command" onClose={close}>
      Saved
    </Modal>,
  );
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});
