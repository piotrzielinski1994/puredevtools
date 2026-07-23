import browser from "webextension-polyfill";

void browser.devtools.panels.create(
  "puredevtools",
  "",
  "/src/devtools/panel.html",
);
