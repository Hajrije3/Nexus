import { loader, type BeforeMount } from "@monaco-editor/react";

/**
 * Load Monaco from our own origin (public/monaco, copied by
 * scripts/copy-monaco.mjs) instead of a CDN. See ADR-0004.
 */
loader.config({ paths: { vs: "/monaco/vs" } });

export const THEME = { dark: "nexus-dark", light: "nexus-light" } as const;

/** Editor themes matched to the NEXUS surface colours. */
export const defineThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(THEME.dark, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#17181d",
      "editor.lineHighlightBackground": "#1d1f25",
      "editorLineNumber.foreground": "#4a4c55",
      "editorLineNumber.activeForeground": "#9a9ca6",
      "editorGutter.background": "#17181d",
      "editorWidget.background": "#1d1f25",
      "editorIndentGuide.background1": "#24262d",
    },
  });
  monaco.editor.defineTheme(THEME.light, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff",
      "editor.lineHighlightBackground": "#f5f5f7",
      "editorLineNumber.foreground": "#b5b7bf",
      "editorLineNumber.activeForeground": "#5f616b",
    },
  });
};
