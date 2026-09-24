import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * The color picker app is plain HTML/CSS/JS served from
 * /color-picker/index.html — send visitors there from the root.
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tintwell — Color Picker" },
      { name: "description", content: "A responsive color picker, harmony generator and palette library." },
      { httpEquiv: "refresh", content: "0; url=/color-picker/index.html" },
    ],
  }),
  component: RootRedirect,
});

function RootRedirect() {
  useEffect(() => {
    window.location.replace("/color-picker/index.html");
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <a href="/color-picker/index.html" className="text-sm underline">
        Open Tintwell →
      </a>
    </div>
  );
}
