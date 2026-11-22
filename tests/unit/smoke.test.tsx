import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "@/app/page";

test("the test toolchain renders a React component", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: "AI Training" })).toBeInTheDocument();
});
