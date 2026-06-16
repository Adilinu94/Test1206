#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// package.json
var package_default;
var init_package = __esm({
  "package.json"() {
    package_default = {
      name: "framer-export",
      version: "4.4.1",
      description: "Export any Framer, Webflow, or Wix site into a fully working local mirror. Downloads all assets, strips badges, rewrites URLs, and pretty-prints JS.",
      type: "module",
      main: "dist/cli/index.js",
      types: "dist/cli/index.d.ts",
      bin: {
        "framer-export": "./bin/framer-export.js",
        fexport: "./bin/fexport.js",
        framerexport: "./bin/framerexport.js"
      },
      files: [
        "dist/",
        "bin/",
        "LICENSE",
        "README.md"
      ],
      scripts: {
        start: "tsx src/cli/index.ts",
        dev: "tsx src/cli/index.ts",
        build: "tsup",
        typecheck: "tsc --noEmit",
        format: 'prettier --write "src/**/*.ts"',
        prepublishOnly: "npm run build",
        prepack: "npm run build"
      },
      keywords: [
        "framer",
        "webflow",
        "wix",
        "exporter",
        "export",
        "scraper",
        "mirror",
        "site-downloader",
        "site-export",
        "cli"
      ],
      repository: {
        type: "git",
        url: "git+https://github.com/danbenba/FramerExport.git"
      },
      homepage: "https://github.com/danbenba/FramerExport#readme",
      bugs: {
        url: "https://github.com/danbenba/FramerExport/issues"
      },
      license: "MIT",
      author: "Dany (danbenba)",
      engines: {
        node: ">=18.0.0"
      },
      dependencies: {
        chalk: "^5.3.0",
        ora: "^8.0.0",
        prettier: "^3.2.0",
        puppeteer: "^22.0.0",
        "readline-promise": "^1.0.5"
      },
      devDependencies: {
        "@types/node": "^22.0.0",
        tsup: "^8.5.1",
        tsx: "^4.7.0",
        typescript: "^5.4.0"
      }
    };
  }
});

// src/cli/theme.ts
import chalk from "chalk";
function stripAnsi(s) {
  return s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}
function softGradient(text) {
  const colors = [THEME.primary, THEME.primarySoft, THEME.text, THEME.primarySoft, THEME.primary];
  let cursor = 0;
  return text.split("").map((char) => {
    if (char === " ") return char;
    const color = colors[cursor % colors.length];
    cursor++;
    return chalk.hex(color).bold(char);
  }).join("");
}
function chip(label) {
  return `${ui.border("[")}${ui.primary(label)}${ui.border("]")}`;
}
function bullet(label = "\u2022") {
  return ui.primary(label);
}
function centerText(text, width) {
  const visible = stripAnsi(text).length;
  if (visible >= width) return text;
  const left = Math.floor((width - visible) / 2);
  return " ".repeat(left) + text + " ".repeat(width - visible - left);
}
function truncatePlain(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 2)) + "..";
}
var THEME, ui;
var init_theme = __esm({
  "src/cli/theme.ts"() {
    "use strict";
    THEME = {
      background: "#0A0A0A",
      panel: "#141414",
      element: "#1E1E1E",
      border: "#484848",
      borderActive: "#606060",
      text: "#EEEEEE",
      muted: "#808080",
      primary: "#FAB283",
      primarySoft: "#FFC09F",
      secondary: "#5C9CF5",
      accent: "#9D7CD8",
      success: "#7FD88F",
      warning: "#F5A742",
      error: "#E06C75",
      info: "#56B6C2"
    };
    ui = {
      text: chalk.hex(THEME.text),
      muted: chalk.hex(THEME.muted),
      primary: chalk.hex(THEME.primary),
      primarySoft: chalk.hex(THEME.primarySoft),
      secondary: chalk.hex(THEME.secondary),
      accent: chalk.hex(THEME.accent),
      success: chalk.hex(THEME.success),
      warning: chalk.hex(THEME.warning),
      error: chalk.hex(THEME.error),
      info: chalk.hex(THEME.info),
      border: chalk.hex(THEME.border),
      borderActive: chalk.hex(THEME.borderActive),
      panel: chalk.hex(THEME.panel)
    };
  }
});

// src/cli/banner.ts
function getWidth() {
  return process.stdout.columns || 80;
}
function showBanner() {
  const width = getWidth();
  const isSmall = width < 65;
  if (isSmall) {
    console.log(
      `
  ${ui.primary.bold("f-export")} ${ui.muted(`v${package_default.version}`)} ${chip("beta ui")}`
    );
    console.log(`  ${ui.text.bold("Framer Export")} ${ui.muted("for Framer, Webflow, and Wix")}
`);
    return;
  }
  console.log("");
  ASCII_ART.forEach((line) => {
    console.log("  " + softGradient(line));
  });
  console.log("");
  console.log(
    `  ${ui.muted(`v${package_default.version}`)}  ${ui.text.bold("Framer Export")}  ${chip("fexport")} ${ui.muted("local mirror exporter")}`
  );
  console.log(
    `  ${ui.muted("Framer")} ${ui.border("/")} ${ui.muted("Webflow")} ${ui.border("/")} ${ui.muted("Wix")} ${ui.border("\xB7")} ${ui.primary("clean assets")} ${ui.border("\xB7")} ${ui.secondary("local serve")}
`
  );
}
var ASCII_ART;
var init_banner = __esm({
  "src/cli/banner.ts"() {
    "use strict";
    init_package();
    init_theme();
    ASCII_ART = [
      "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 ",
      "\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557",
      "\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D",
      "\u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557",
      "\u2588\u2588\u2551     \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551",
      "\u255A\u2550\u255D     \u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D     \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D",
      "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
      "\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u255A\u2588\u2588\u2557\u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D",
      "\u2588\u2588\u2588\u2588\u2588\u2557   \u255A\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D   \u2588\u2588\u2551   ",
      "\u2588\u2588\u2554\u2550\u2550\u255D   \u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2554\u2550\u2550\u2550\u255D \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557   \u2588\u2588\u2551   ",
      "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2554\u255D \u2588\u2588\u2557\u2588\u2588\u2551     \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551   \u2588\u2588\u2551   ",
      "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D      \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u255D   \u255A\u2550\u255D   "
    ];
  }
});

// src/cli/cooking.ts
import chalk2 from "chalk";
async function showLoadingIntro(version) {
  if (!process.stdout.isTTY || process.env.CI) return;
  await new Promise((resolve) => {
    let frame = 0;
    const draw = () => {
      const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      const title = renderShinyText(`Framer Export v${version}`, frame, {
        baseColor: "#b5b5b5",
        shineColor: "#ffffff",
        shineWidth: 12
      });
      const dots = ".".repeat(frame % 4).padEnd(3, " ");
      process.stdout.write(
        `\r\x1B[2K  ${ui.primary(spinner)} ${title} ${ui.muted(`Loading${dots}`)}`
      );
      frame++;
    };
    process.stdout.write("\x1B[?25l");
    draw();
    const interval = setInterval(draw, FRAME_INTERVAL);
    setTimeout(() => {
      clearInterval(interval);
      process.stdout.write("\r\x1B[2K\x1B[?25h");
      resolve();
    }, INTRO_DURATION);
  });
}
function renderShinyText(text, frame, options = {}) {
  const baseColor = options.baseColor || "#808080";
  const shineColor = options.shineColor || "#ffffff";
  const shineWidth = options.shineWidth || SHINE_WIDTH;
  const pos = frame % (text.length + shineWidth * 2) - shineWidth;
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const dist = Math.abs(i - pos);
    if (dist < shineWidth) {
      result += chalk2.hex(shineColor).bold(text[i]);
    } else {
      result += chalk2.hex(baseColor)(text[i]);
    }
  }
  return result;
}
var SHINE_WIDTH, FRAME_INTERVAL, INTRO_DURATION, SPINNER_FRAMES, CookingSpinner;
var init_cooking = __esm({
  "src/cli/cooking.ts"() {
    "use strict";
    init_theme();
    SHINE_WIDTH = 10;
    FRAME_INTERVAL = 80;
    INTRO_DURATION = 950;
    SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
    CookingSpinner = class {
      interval = null;
      frame = 0;
      phase = "";
      active = false;
      start(phase = "") {
        this.phase = phase;
        this.frame = 0;
        this.active = true;
        this.draw();
        this.interval = setInterval(() => {
          this.frame++;
          this.draw();
        }, FRAME_INTERVAL);
      }
      update(phase) {
        this.phase = phase;
      }
      log(message) {
        if (this.active) {
          process.stdout.write("\r\x1B[2K");
        }
        process.stdout.write(message + "\n");
        if (this.active) {
          this.draw();
        }
      }
      stop() {
        this.active = false;
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
        process.stdout.write("\r\x1B[2K");
      }
      draw() {
        if (!this.active) return;
        const spinner = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length];
        const shimmer = renderShinyText("Exporting", this.frame);
        const frameStr = ui.primary(spinner);
        const phaseStr = this.phase ? `  ${ui.muted(this.limitLen(this.phase, 52))}` : "";
        process.stdout.write(`\r\x1B[2K  ${frameStr} ${shimmer}${phaseStr}`);
      }
      limitLen(s, max) {
        if (s.length <= max) return s;
        return s.slice(0, max - 1) + "\u2026";
      }
    };
  }
});

// src/cli/box.ts
import chalk3 from "chalk";
function maxWidth() {
  return Math.min(process.stdout.columns || 80, 76);
}
function padRight(text, w) {
  const visible = stripAnsi(text).length;
  if (visible >= w) return text;
  return text + " ".repeat(w - visible);
}
function boxTop(w) {
  const inner = w - 4;
  return "  " + ui.border("\u256D\u2500") + ui.border("\u2500".repeat(inner)) + ui.border("\u2500\u256E");
}
function panelTop(w) {
  const inner = w - 4;
  return ui.border("\u256D\u2500") + ui.border("\u2500".repeat(inner)) + ui.border("\u2500\u256E");
}
function boxBot(w) {
  const inner = w - 4;
  return "  " + ui.border("\u2570\u2500") + ui.border("\u2500".repeat(inner)) + ui.border("\u2500\u256F");
}
function panelBot(w) {
  const inner = w - 4;
  return ui.border("\u2570\u2500") + ui.border("\u2500".repeat(inner)) + ui.border("\u2500\u256F");
}
function boxLine(w, text) {
  const inner = w - 4;
  const padded = padRight(text, inner);
  return "  " + ui.border("\u2502 ") + padded + ui.border(" \u2502");
}
function panelLine(w, text) {
  const inner = w - 4;
  const padded = padRight(text, inner);
  return ui.border("\u2502 ") + padded + ui.border(" \u2502");
}
function boxSep(w) {
  const inner = w - 4;
  return "  " + ui.border("\u251C\u2500") + ui.border("\u2500".repeat(inner)) + ui.border("\u2500\u2524");
}
function panelSep(w) {
  const inner = w - 4;
  return ui.border("\u251C\u2500") + ui.border("\u2500".repeat(inner)) + ui.border("\u2500\u2524");
}
function boxRow(w, label, value) {
  const inner = w - 4;
  const labelPlain = stripAnsi(chalk3.bold(label));
  const visible = labelPlain.length + 1 + value.length;
  if (visible > inner) {
    const avail = inner - labelPlain.length - 2;
    const truncated = value.length > avail ? value.slice(0, avail - 1) + ".." : value;
    return "  " + ui.border("\u2502 ") + chalk3.bold(label) + ": " + ui.primary(truncated) + " ".repeat(Math.max(0, inner - labelPlain.length - 1 - truncated.length)) + ui.border(" \u2502");
  }
  const right = inner - labelPlain.length - 1 - value.length;
  return "  " + ui.border("\u2502 ") + chalk3.bold(label) + ": " + ui.primary(value) + " ".repeat(right) + ui.border(" \u2502");
}
var init_box = __esm({
  "src/cli/box.ts"() {
    "use strict";
    init_theme();
  }
});

// src/cli/select.ts
import readline from "readline";
import { stdin, stdout } from "process";
async function select(question, options, defaultIndex = 0, config = {}) {
  const isTTY = stdin.isTTY && stdout.isTTY;
  if (!isTTY) {
    return fallbackPrompt(question, options, defaultIndex, config);
  }
  return arrowSelect(question, options, defaultIndex, config);
}
async function promptInput(question, defaultValue = "", config = {}) {
  if (!stdin.isTTY || !stdout.isTTY) {
    return fallbackInput(question, defaultValue);
  }
  return fullscreenInput(question, defaultValue, config);
}
async function arrowSelect(question, options, defaultIndex, config) {
  const actions = config.actions ?? [];
  const headerLines = config.headerLines ?? [];
  const width = Math.max(44, Math.min(maxWidth(), 72));
  const inner = width - 4;
  const actionLineOffset = 2 + headerLines.length;
  const hasActions = actions.length > 0;
  const optionStartOffset = 3 + headerLines.length + (hasActions ? 1 : 0);
  const lineCount = options.length + 4 + headerLines.length + (hasActions ? 1 : 0);
  const rows = process.stdout.rows || 24;
  const columns = process.stdout.columns || 80;
  const panelTopRow = Math.max(2, Math.floor((rows - lineCount) / 2) + 1);
  const panelLeftCol = Math.max(1, Math.floor((columns - width) / 2) + 1);
  const footerRow = Math.min(rows, panelTopRow + lineCount + 1);
  return new Promise((resolve) => {
    const firstEnabled = options.findIndex((option) => !option.disabled);
    let selected = options[defaultIndex]?.disabled ? firstEnabled : defaultIndex;
    let selectedAction = null;
    if (selected < 0) selected = 0;
    const move = (direction) => {
      let next = selected + direction;
      while (next >= 0 && next < options.length) {
        if (!options[next].disabled) {
          selected = next;
          return;
        }
        next += direction;
      }
    };
    const render = (initial = false) => {
      if (!initial) {
        stdout.write("\x1B[2J");
      }
      const lines = [];
      lines.push(panelTop(width));
      lines.push(
        panelLine(width, centerText(`${ui.primary("\u25CF")} ${ui.text.bold(question)}`, inner))
      );
      for (const header of headerLines) {
        lines.push(panelLine(width, centerText(ui.muted(header), inner)));
      }
      if (hasActions) {
        lines.push(
          panelLine(width, centerText(renderActions(actions, selectedAction, inner), inner))
        );
      }
      lines.push(panelSep(width));
      for (let i = 0; i < options.length; i++) {
        lines.push(
          panelLine(
            width,
            centerText(
              renderOption(options[i], selectedAction === null && i === selected, inner),
              inner
            )
          )
        );
      }
      lines.push(panelBot(width));
      lines.forEach((line, index) => writeAt(panelTopRow + index, panelLeftCol, line));
      writeAt(
        footerRow,
        panelLeftCol,
        centerText(
          ui.muted(config.footer || "\u2191\u2193 move  \xB7  enter select  \xB7  mouse hover/click  \xB7  esc close"),
          width
        )
      );
    };
    const choose = (value = options[selected].value) => {
      cleanup();
      console.log(
        `  ${ui.success("\u2713")} ${ui.text.bold(question)} ${ui.primary(labelForValue(value, options, actions))}
`
      );
      resolve(value);
    };
    const onMouseData = (chunk) => {
      const mouse = parseMouseEvent(chunk);
      if (!mouse) return;
      if (mouse.kind === "wheel-up") {
        move(-1);
        render();
        return;
      }
      if (mouse.kind === "wheel-down") {
        move(1);
        render();
        return;
      }
      if (hasActions && mouse.y === panelTopRow + actionLineOffset) {
        const actionIdx = actionIndexAtX(actions, mouse.x, panelLeftCol, inner);
        if (actionIdx === null || actions[actionIdx].disabled) return;
        if (selectedAction !== actionIdx) {
          selectedAction = actionIdx;
          render();
        }
        if (mouse.kind === "click") choose(actions[actionIdx].value);
        return;
      }
      const idx = mouse.y - panelTopRow - optionStartOffset;
      if (idx < 0 || idx >= options.length || options[idx].disabled) return;
      if (selected !== idx) {
        selected = idx;
        selectedAction = null;
        render();
      }
      if (mouse.kind === "click") {
        choose();
      }
    };
    const cleanup = () => {
      leaveInteractiveScreen();
      stdin.setRawMode(false);
      stdin.removeListener("keypress", onKeypress);
      stdin.removeListener("data", onMouseData);
      stdin.pause();
    };
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    enterInteractiveScreen(true);
    render(true);
    const onKeypress = (_str, key) => {
      if (!key) return;
      if (key.name === "up" && selected > 0) {
        move(-1);
        selectedAction = null;
        render();
      } else if (key.name === "down" && selected < options.length - 1) {
        move(1);
        selectedAction = null;
        render();
      } else if (key.name === "tab" && hasActions) {
        selectedAction = selectedAction === null ? 0 : null;
        render();
      } else if (key.name === "return") {
        choose(selectedAction === null ? options[selected].value : actions[selectedAction].value);
      } else if (key.ctrl && key.name === "c" || key.name === "escape") {
        cleanup();
        process.exit(0);
      }
    };
    stdin.resume();
    stdin.on("data", onMouseData);
    stdin.on("keypress", onKeypress);
  });
}
async function fallbackPrompt(question, options, defaultIndex, config) {
  if (!stdin.isTTY) {
    const firstEnabled = options.findIndex((option) => !option.disabled);
    const enabledDefault = options[defaultIndex]?.disabled ? firstEnabled : defaultIndex;
    const def = String(enabledDefault + 1);
    printFallbackOptions(question, options, enabledDefault, config);
    while (true) {
      const trimmed = (await readPipedLine()).trim();
      if (trimmed.toLowerCase() === "a") {
        const action = config.actions?.find((item) => !item.disabled);
        if (action) return action.value;
      }
      if (!trimmed) {
        const label = stripAnsi(options[enabledDefault].label);
        console.log(`  ${ui.success("\u2713")} ${ui.primary(label)}
`);
        return options[enabledDefault].value;
      }
      const idx = parseInt(trimmed, 10);
      if (idx >= 1 && idx <= options.length && !options[idx - 1].disabled) {
        const label = stripAnsi(options[idx - 1].label);
        console.log(`  ${ui.success("\u2713")} ${ui.primary(label)}
`);
        return options[idx - 1].value;
      }
      console.log(`  ${ui.error("\u2717")} ${ui.warning(`Enter 1-${options.length} or ${def}`)}
`);
    }
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const firstEnabled = options.findIndex((option) => !option.disabled);
    const enabledDefault = options[defaultIndex]?.disabled ? firstEnabled : defaultIndex;
    printFallbackOptions(question, options, enabledDefault, config);
    const def = String(enabledDefault + 1);
    const ask = () => {
      rl.question(
        `  ${ui.primary(">")} ${ui.muted(`Choose [1-${options.length}] (${def})`)}: `,
        (answer) => {
          const trimmed = answer.trim();
          if (trimmed.toLowerCase() === "a") {
            const action = config.actions?.find((item) => !item.disabled);
            if (action) {
              rl.close();
              resolve(action.value);
              return;
            }
          }
          if (!trimmed) {
            rl.close();
            const label = stripAnsi(options[enabledDefault].label);
            console.log(`  ${ui.success("\u2713")} ${ui.primary(label)}
`);
            resolve(options[enabledDefault].value);
            return;
          }
          const idx = parseInt(trimmed, 10);
          if (idx >= 1 && idx <= options.length && !options[idx - 1].disabled) {
            rl.close();
            const label = stripAnsi(options[idx - 1].label);
            console.log(`  ${ui.success("\u2713")} ${ui.primary(label)}
`);
            resolve(options[idx - 1].value);
          } else if (idx >= 1 && idx <= options.length && options[idx - 1].disabled) {
            console.log(`  ${ui.error("\u2717")} ${ui.warning("Option unavailable for now")}
`);
            ask();
          } else {
            console.log(`  ${ui.error("\u2717")} ${ui.warning(`Enter 1-${options.length}`)}
`);
            ask();
          }
        }
      );
    };
    ask();
  });
}
function fullscreenInput(question, defaultValue, config) {
  const headerLines = config.headerLines ?? [];
  const width = Math.max(44, Math.min(maxWidth(), 72));
  const inner = width - 4;
  const lineCount = 6 + headerLines.length;
  const rows = process.stdout.rows || 24;
  const columns = process.stdout.columns || 80;
  const panelTopRow = Math.max(2, Math.floor((rows - lineCount) / 2) + 1);
  const panelLeftCol = Math.max(1, Math.floor((columns - width) / 2) + 1);
  const footerRow = Math.min(rows, panelTopRow + lineCount + 1);
  return new Promise((resolve) => {
    let value = defaultValue;
    const render = () => {
      stdout.write("\x1B[2J");
      const shown = value || "";
      const clipped = truncatePlain(shown, Math.max(12, inner - 10));
      const input = `${ui.primary(">")} ${ui.text(clipped)}${ui.primary("\u258C")}`;
      const lines = [];
      lines.push(panelTop(width));
      lines.push(
        panelLine(width, centerText(`${ui.primary("\u25CF")} ${ui.text.bold(question)}`, inner))
      );
      for (const header of headerLines) {
        lines.push(panelLine(width, centerText(ui.muted(header), inner)));
      }
      lines.push(panelSep(width));
      lines.push(panelLine(width, centerText(input, inner)));
      lines.push(panelBot(width));
      lines.forEach((line, index) => writeAt(panelTopRow + index, panelLeftCol, line));
      writeAt(
        footerRow,
        panelLeftCol,
        centerText(ui.muted(config.footer || "type value  \xB7  enter confirm  \xB7  esc close"), width)
      );
    };
    const cleanup = () => {
      leaveInteractiveScreen();
      stdin.setRawMode(false);
      stdin.removeListener("keypress", onKeypress);
      stdin.pause();
    };
    const submit = () => {
      const output2 = cleanInputValue(value.trim() || defaultValue);
      cleanup();
      resolve(output2);
    };
    const onKeypress = (str, key) => {
      if (key.ctrl && key.name === "c" || key.name === "escape") {
        cleanup();
        process.exit(0);
      }
      if (key.name === "return") {
        submit();
        return;
      }
      if (key.name === "backspace") {
        value = value.slice(0, -1);
        render();
        return;
      }
      if (key.name === "delete") {
        value = "";
        render();
        return;
      }
      if (str && !key.ctrl && !key.meta && str >= " " && !isTerminalSequence(str, key)) {
        value += cleanInputValue(str.replace(/[\r\n]/g, ""));
        render();
      }
    };
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    enterInteractiveScreen(false);
    render();
    stdin.resume();
    stdin.on("keypress", onKeypress);
  });
}
async function fallbackInput(question, defaultValue) {
  if (!stdin.isTTY) {
    const suffix = defaultValue ? ui.muted(` (${defaultValue})`) : "";
    console.log(`  ${ui.primary(">")} ${ui.text.bold(question)}${suffix}: `);
    const answer = await readPipedLine();
    return cleanInputValue(answer.trim() || defaultValue);
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const suffix = defaultValue ? ui.muted(` (${defaultValue})`) : "";
    rl.question(`  ${ui.primary(">")} ${ui.text.bold(question)}${suffix}: `, (answer) => {
      rl.close();
      resolve(cleanInputValue(answer.trim() || defaultValue));
    });
  });
}
function printFallbackOptions(question, options, enabledDefault, config) {
  console.log(`  ${ui.primary("\u25CF")} ${ui.text.bold(question)}
`);
  for (const header of config.headerLines ?? []) {
    console.log(`  ${ui.muted(header)}`);
  }
  for (const action of config.actions ?? []) {
    console.log(
      `   ${ui.muted("[A]")} ${action.disabled ? ui.muted(action.label) : ui.text(action.label)}`
    );
  }
  if ((config.headerLines?.length || 0) > 0 || (config.actions?.length || 0) > 0) {
    console.log("");
  }
  for (let i = 0; i < options.length; i++) {
    const marker = i === enabledDefault ? ui.success(" \u25C6") : "  ";
    const label = options[i].disabled ? ui.muted(stripAnsi(options[i].label)) : ui.text(options[i].label);
    console.log(`   ${ui.muted(`[${i + 1}]`)}${marker} ${label}`);
  }
  console.log("");
}
function readPipedLine() {
  if (!pipedLinesPromise) {
    pipedLinesPromise = new Promise((resolve) => {
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => {
        data += chunk;
      });
      stdin.on("end", () => {
        resolve(data.split(/\r?\n/));
      });
      stdin.on("error", () => {
        resolve([]);
      });
    });
  }
  return pipedLinesPromise.then((lines) => lines[pipedLineIndex++] ?? "");
}
function renderActions(actions, active, width) {
  return actions.map((action, index) => {
    const label = truncatePlain(
      stripAnsi(action.label),
      Math.max(8, Math.floor(width / actions.length) - 8)
    );
    if (action.disabled) return `${ui.border("[")} ${ui.muted(label)} ${ui.border("]")}`;
    if (active === index)
      return `${ui.primary("\u203A")} ${ui.primary("[")} ${ui.text.bold(label)} ${ui.primary("]")} ${ui.primary("\u2039")}`;
    return `${ui.border("[")} ${ui.primary(label)} ${ui.border("]")}`;
  }).join(` ${ui.muted("\xB7")} `);
}
function actionIndexAtX(actions, mouseX, panelLeftCol, inner) {
  if (actions.length === 0) return null;
  const contentStart = panelLeftCol + 2;
  const relative = mouseX - contentStart;
  if (relative < 0 || relative > inner) return null;
  return Math.min(actions.length - 1, Math.floor(relative / Math.max(1, inner) * actions.length));
}
function labelForValue(value, options, actions) {
  return stripAnsi(
    options.find((option) => option.value === value)?.label || actions.find((action) => action.value === value)?.label || value
  );
}
function renderOption(option, selected, width) {
  const plain = truncatePlain(stripAnsi(option.label), Math.max(10, width - 12));
  if (option.disabled) {
    return `${ui.border("[")} ${ui.muted(plain)} ${ui.border("]")}`;
  }
  if (selected) {
    return `${ui.primary("\u203A")} ${ui.primary("[")} ${ui.text.bold(plain)} ${ui.primary("]")} ${ui.primary("\u2039")}`;
  }
  return `${ui.muted(" ")} ${ui.border("[")} ${ui.muted(plain)} ${ui.border("]")} ${ui.muted(" ")}`;
}
function enterInteractiveScreen(enableMouse) {
  stdout.write("\x1B[?1049h\x1B[2J\x1B[H\x1B[?25l");
  if (enableMouse) {
    stdout.write("\x1B[?1006h\x1B[?1000h\x1B[?1002h\x1B[?1003h");
  }
}
function leaveInteractiveScreen() {
  stdout.write(
    "\x1B[?1003l\x1B[?1002l\x1B[?1000l\x1B[?1006l\x1B[?25h\x1B[?1049l"
  );
}
function parseMouseEvent(chunk) {
  const text = chunk.toString("utf-8");
  const match = text.match(/\x1B\[<(\d+);(\d+);(\d+)([mM])/);
  if (!match) return parseLegacyMouseEvent(text);
  const code = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const state = match[4];
  if (code === 64) return { kind: "wheel-up", x, y };
  if (code === 65) return { kind: "wheel-down", x, y };
  if (state === "m") return { kind: "click", x, y };
  if ((code & 32) === 32 || code === 35) return { kind: "hover", x, y };
  if ((code & 3) === 0) return { kind: "hover", x, y };
  return null;
}
function parseLegacyMouseEvent(text) {
  const match = text.match(/\x1B\[M([\s\S])([\s\S])([\s\S])/);
  if (!match) return null;
  const code = match[1].charCodeAt(0) - 32;
  const x = match[2].charCodeAt(0) - 32;
  const y = match[3].charCodeAt(0) - 32;
  if (code === 64) return { kind: "wheel-up", x, y };
  if (code === 65) return { kind: "wheel-down", x, y };
  if ((code & 3) === 3) return { kind: "click", x, y };
  if ((code & 32) === 32) return { kind: "hover", x, y };
  return { kind: "hover", x, y };
}
function writeAt(row, col, text) {
  stdout.write(`\x1B[${row};${col}H${text}`);
}
function isTerminalSequence(str, key) {
  return str.includes("\x1B") || !!key.sequence?.includes("\x1B") || /^(?:\d+;){2}\d+[mM]$/.test(str);
}
function cleanInputValue(value) {
  return value.replace(/\x1B\[<\d+;\d+;\d+[mM]/g, "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "").replace(/(?:\d+;){2}\d+[mM]/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}
var pipedLinesPromise, pipedLineIndex;
var init_select = __esm({
  "src/cli/select.ts"() {
    "use strict";
    init_box();
    init_theme();
    pipedLinesPromise = null;
    pipedLineIndex = 0;
  }
});

// src/assets/asset-map.ts
import path from "path";
import crypto from "crypto";
import { URL as URL2 } from "url";
var AssetMap;
var init_asset_map = __esm({
  "src/assets/asset-map.ts"() {
    "use strict";
    AssetMap = class {
      entries = /* @__PURE__ */ new Map();
      buffers = /* @__PURE__ */ new Map();
      localPathFor(urlStr, platform) {
        if (this.entries.has(urlStr)) return this.entries.get(urlStr).localPath;
        let parsed;
        try {
          parsed = new URL2(urlStr);
        } catch {
          return null;
        }
        const host = parsed.hostname;
        const pathname = parsed.pathname;
        const ext = path.extname(pathname.split("?")[0]).toLowerCase();
        let dir = null;
        if (platform) {
          dir = platform.mapAssetDir(host, pathname, ext);
        }
        if (!dir) {
          dir = this.fallbackDir(host, ext);
        }
        let filename;
        const baseName = path.basename(pathname.split("?")[0]);
        const hash = crypto.createHash("md5").update(urlStr).digest("hex").slice(0, 6);
        if (baseName && baseName.length > 1 && baseName !== "/") {
          const clean = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
          filename = clean.includes(".") ? clean : `${clean}-${hash}`;
        } else {
          filename = `asset-${hash}${ext || ""}`;
        }
        if (ext === ".mjs" || ext === ".js") {
          filename = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
        }
        const localPath = `${dir}/${filename}`;
        this.entries.set(urlStr, { localPath });
        const base = urlStr.split("?")[0];
        if (base !== urlStr && !this.entries.has(base)) {
          this.entries.set(base, { localPath });
        }
        return localPath;
      }
      rewrite(text, fromDir = "") {
        const sorted = [...this.entries.entries()].sort((a, b) => b[0].length - a[0].length);
        let out = text;
        for (const [url, { localPath }] of sorted) {
          const rel = fromDir ? path.posix.relative(fromDir, localPath) : localPath;
          out = out.split(url).join(rel);
          if (url.includes("&")) {
            out = out.split(url.replace(/&/g, "&amp;")).join(rel);
          }
        }
        return out;
      }
      fallbackDir(host, ext) {
        if (host.includes("fonts.gstatic.com") || host.includes("fonts.googleapis.com")) {
          return "assets/fonts";
        }
        return ext === ".mjs" || ext === ".js" ? "scripts/vendor" : "assets/misc";
      }
    };
  }
});

// src/config/index.ts
var config_exports = {};
__export(config_exports, {
  CFG: () => CFG
});
var CFG;
var init_config = __esm({
  "src/config/index.ts"() {
    "use strict";
    CFG = {
      viewport: { width: 1440, height: 900 },
      timeout: 9e4,
      scrollStep: 250,
      scrollDelay: 60,
      concurrency: 12,
      retries: 3,
      dlTimeout: 3e4,
      sharedStripDomains: [
        "sentry.io",
        "www.googletagmanager.com",
        "connect.facebook.net",
        "stats.g.doubleclick.net",
        "google-analytics.com"
      ]
    };
  }
});

// src/network/download.ts
import https2 from "https";
import http from "http";
import { URL as URL3 } from "url";
function dlBuffer(url, retries = CFG.retries) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https2 : http;
    const go = (left) => {
      const req = proto.get(url, { timeout: CFG.dlTimeout }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return dlBuffer(new URL3(res.headers.location, url).href, left).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return left > 1 ? setTimeout(() => go(left - 1), 500) : reject(new Error(`HTTP ${res.statusCode}`));
        }
        const ch = [];
        res.on("data", (c) => ch.push(c));
        res.on("end", () => resolve(Buffer.concat(ch)));
        res.on("error", (e) => left > 1 ? setTimeout(() => go(left - 1), 500) : reject(e));
      });
      req.on("error", (e) => left > 1 ? setTimeout(() => go(left - 1), 500) : reject(e));
      req.on("timeout", () => {
        req.destroy();
        left > 1 ? setTimeout(() => go(left - 1), 500) : reject(new Error("Timeout"));
      });
    };
    go(retries);
  });
}
var init_download = __esm({
  "src/network/download.ts"() {
    "use strict";
    init_config();
  }
});

// src/logger/index.ts
import chalk4 from "chalk";
function setCooking(spinner) {
  _cooking = spinner;
}
function trunc(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 2) + "..";
}
function output(line) {
  if (_cooking) _cooking.log(line);
  else console.log(line);
}
var _cooking, T, LOG_PALETTE, _li, log, INFO_PALETTE, _ii, info, warn, success;
var init_logger = __esm({
  "src/logger/index.ts"() {
    "use strict";
    init_theme();
    _cooking = null;
    T = () => (/* @__PURE__ */ new Date()).toISOString().slice(11, 19);
    LOG_PALETTE = [
      (s) => chalk4.hex(THEME.primary)(s),
      (s) => chalk4.hex(THEME.primarySoft)(s),
      (s) => chalk4.hex(THEME.secondary)(s),
      (s) => chalk4.hex(THEME.accent)(s),
      (s) => chalk4.hex(THEME.info)(s),
      (s) => chalk4.hex(THEME.text)(s)
    ];
    _li = 0;
    log = (m) => {
      _li++;
      const c = LOG_PALETTE[_li % LOG_PALETTE.length];
      output(
        `${chalk4.hex(THEME.muted)(`[${T()}]`)} ${chalk4.hex(THEME.primary)("[log]")} ${c(trunc(m, 120))}`
      );
    };
    INFO_PALETTE = [
      (s) => chalk4.hex(THEME.info)(s),
      (s) => chalk4.hex(THEME.secondary)(s),
      (s) => chalk4.hex(THEME.primarySoft)(s)
    ];
    _ii = 0;
    info = (m) => {
      _ii++;
      const c = INFO_PALETTE[_ii % INFO_PALETTE.length];
      output(
        `${chalk4.hex(THEME.muted)(`[${T()}]`)} ${chalk4.hex(THEME.info).bold("[info]")} ${c(trunc(m, 120))}`
      );
    };
    warn = (m) => {
      const colors = [
        (s) => chalk4.hex(THEME.warning)(s),
        (s) => chalk4.hex(THEME.primary)(s)
      ];
      const c = colors[Math.floor(Math.random() * colors.length)];
      const line = `${chalk4.hex(THEME.muted)(`[${T()}]`)} ${chalk4.hex(THEME.warning).bold("[warn]")} ${c(trunc(m, 120))}`;
      if (_cooking) _cooking.log(line);
      else console.warn(line);
    };
    success = (m) => {
      const colors = [
        (s) => chalk4.hex(THEME.success)(s),
        (s) => chalk4.hex(THEME.info)(s)
      ];
      const c = colors[Math.floor(Math.random() * colors.length)];
      output(
        `${chalk4.hex(THEME.muted)(`[${T()}]`)} ${chalk4.hex(THEME.success)("[ok]")} ${c(trunc(m, 120))}`
      );
    };
  }
});

// src/platforms/framer.ts
var FONT_EXTS, framer;
var init_framer = __esm({
  "src/platforms/framer.ts"() {
    "use strict";
    FONT_EXTS = [".woff2", ".woff", ".ttf", ".otf"];
    framer = {
      name: "framer",
      displayName: "Framer",
      detectByUrl(url) {
        return /\.framer\.(app|website)|framercanvas\.com/.test(url);
      },
      detectByHtml(html) {
        return html.includes('id="main"') && (html.includes("framerstatic.com") || html.includes("framerusercontent.com"));
      },
      stripDomains: ["events.framer.com", "api.framer.com", "collect.frameranalytics.com"],
      stripSelectors: [
        'script[src*="events.framer.com"]',
        "#__framer-badge-container",
        "#__framer-badge",
        'link[href*="canvas-sandbox"]',
        'script[src*="framer.com/bootstrap"]'
      ],
      stripPatterns: [
        /<div id="__framer-badge-container"[^>]*><\/div>/g,
        /<script>try\{if\(localStorage\.get\("__framer_force_showing_editorbar_since"\)\)[^<]*<\/script>/g
      ],
      hydrationTimeout: 1e4,
      needsHydrationCheck: true,
      mapAssetDir(host, pathname, ext) {
        if (host.includes("framerusercontent.com")) {
          if (pathname.startsWith("/images/")) return "assets/images";
          if (pathname.startsWith("/assets/")) {
            return FONT_EXTS.includes(ext) ? "assets/fonts" : "assets/misc";
          }
          if (pathname.startsWith("/sites/")) {
            if (ext === ".mjs" || ext === ".js") return "scripts/vendor";
            if (ext === ".json") return "data";
            if (ext === ".css") return "styles";
            if (ext === ".framercms") return "data";
            return "assets/misc";
          }
          if (pathname.startsWith("/modules/")) {
            return ext === ".framercms" ? "data" : "scripts/modules";
          }
          return "assets/misc";
        }
        if (host.includes("app.framerstatic.com")) {
          if (ext === ".css") return "styles";
          if (ext === ".mjs" || ext === ".js") return "scripts/vendor";
          if (ext === ".woff2" || ext === ".woff") return "assets/fonts";
          if (ext === ".png" || ext === ".svg") return "assets/images";
          return "assets/misc";
        }
        if (host.includes("framercanvas.com") || host.includes("framer.com")) {
          if (ext === ".mjs" || ext === ".js") return "scripts/vendor";
          if (ext === ".css") return "styles";
          return "assets/misc";
        }
        return null;
      }
    };
  }
});

// src/platforms/webflow.ts
var IMG_EXTS, FONT_EXTS2, VIDEO_EXTS, webflow;
var init_webflow = __esm({
  "src/platforms/webflow.ts"() {
    "use strict";
    IMG_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".avif"];
    FONT_EXTS2 = [".woff2", ".woff", ".ttf", ".otf", ".eot"];
    VIDEO_EXTS = [".mp4", ".webm", ".ogg"];
    webflow = {
      name: "webflow",
      displayName: "Webflow",
      detectByUrl(url) {
        return /\.webflow\.(io|com)/.test(url);
      },
      detectByHtml(html) {
        return html.includes("data-wf-site") || html.includes("w-webflow-badge") || html.includes("Webflow") || html.includes("webflow.js");
      },
      stripDomains: ["js-agent.newrelic.com", "cdn.heapanalytics.com", "tr.snapchat.com"],
      stripSelectors: [".w-webflow-badge", 'link[href*="editorbar"]'],
      stripPatterns: [
        /<a[^>]*class="[^"]*w-webflow-badge[^"]*"[^>]*>[\s\S]*?<\/a>/g,
        /<a[^>]*href="[^"]*webflow\.com\?utm_campaign=brandjs[^"]*"[^>]*>[\s\S]*?<\/a>/g,
        /<style>[^<]*\.w-webflow-badge[^<]*<\/style>/g,
        /Powered by <a[^>]*href="[^"]*webflow\.com"[^>]*>[^<]*<\/a>/g,
        /<!-- This site was created in Webflow\.[^>]*-->/g,
        /<html([^>]*) data-wf-domain="[^"]*"/g,
        /<html([^>]*) data-wf-page="[^"]*"/g,
        /<html([^>]*) data-wf-site="[^"]*"/g,
        /<html([^>]*) data-wf-status="[^"]*"/g,
        /<meta[^>]*content="Webflow"[^>]*>/g
      ],
      hydrationTimeout: 2e3,
      needsHydrationCheck: false,
      mapAssetDir(host, pathname, ext) {
        if (host.includes("website-files.com") || host.includes("webflow.com") || host.includes("uploads-ssl.webflow.com")) {
          if (VIDEO_EXTS.includes(ext)) return "assets/videos";
          if (pathname.includes("/images/") || IMG_EXTS.includes(ext)) return "assets/images";
          if (pathname.includes("/css/") || ext === ".css") return "styles";
          if (pathname.includes("/js/") || ext === ".js") return "scripts/vendor";
          if (pathname.includes("/gsap/") || pathname.includes("/plugins/")) return "scripts/vendor";
          if (FONT_EXTS2.includes(ext)) return "assets/fonts";
          return "assets/misc";
        }
        if (host.includes("d3e54v103j8qbb.cloudfront.net")) {
          if (ext === ".js") return "scripts/vendor";
          if (ext === ".css") return "styles";
          if (IMG_EXTS.includes(ext)) return "assets/images";
          return "assets/misc";
        }
        return null;
      }
    };
  }
});

// src/platforms/wix.ts
var IMG_EXTS2, FONT_EXTS3, VIDEO_EXTS2, wix;
var init_wix = __esm({
  "src/platforms/wix.ts"() {
    "use strict";
    IMG_EXTS2 = [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".avif", ".ico"];
    FONT_EXTS3 = [".woff2", ".woff", ".ttf", ".otf", ".eot"];
    VIDEO_EXTS2 = [".mp4", ".webm", ".ogg"];
    wix = {
      name: "wix",
      displayName: "Wix",
      detectByUrl(url) {
        return /\.wixsite\.com|\.wix\.com/.test(url);
      },
      detectByHtml(html) {
        return html.includes("wix-viewer-model") || html.includes('id="WIX_ADS"') || html.includes("X-Wix-") || html.includes("Wix.com") || html.includes("wixcode-sdk") || html.includes("data-wix") || html.includes("wix-code") || html.includes("WixCode") || /\bwix\.com\b/.test(html) || /meta\s+name=["']generator["']\s+content=["'][^"']*Wix[^"']*["']/i.test(html) || /_wix_/i.test(html) || /wix-ecom/i.test(html);
      },
      stripDomains: [
        "frog.wix.com",
        "bi.wixapi.com",
        "fed.wixcodescheduler.com",
        "editor.wix.com",
        "panorama.wixapps.net"
      ],
      stripSelectors: ["#WIX_ADS", ".wix-ads", "#wix-badge", "#SCROLL_TO_TOP"],
      stripPatterns: [
        /<div[^>]*class="[^"]*wix-ads[^"]*"[^>]*>[\s\S]*?<\/div>/g
      ],
      hydrationTimeout: 3e3,
      needsHydrationCheck: false,
      mapAssetDir(host, pathname, ext) {
        if (host === "video.wixstatic.com") {
          return "assets/videos";
        }
        if (host.includes("wixstatic.com")) {
          if (VIDEO_EXTS2.includes(ext)) return "assets/videos";
          if (pathname.includes("/images/") || IMG_EXTS2.includes(ext)) return "assets/images";
          if (ext === ".css") return "styles";
          if (ext === ".js") return "scripts/vendor";
          if (FONT_EXTS3.includes(ext)) return "assets/fonts";
          return "assets/misc";
        }
        if (host.includes("parastorage.com")) {
          if (ext === ".js") return "scripts/vendor";
          if (ext === ".css") return "styles";
          if (FONT_EXTS3.includes(ext)) return "assets/fonts";
          if (IMG_EXTS2.includes(ext)) return "assets/images";
          return "assets/misc";
        }
        return null;
      }
    };
  }
});

// src/platforms/detect.ts
function detectByUrl(url) {
  for (const platform of ALL_PLATFORMS) {
    if (platform.detectByUrl(url)) return platform;
  }
  return null;
}
function detectByHtml(html) {
  for (const platform of ALL_PLATFORMS) {
    if (platform.detectByHtml(html)) return platform;
  }
  return null;
}
function detectPlatform(url, html) {
  const byUrl = detectByUrl(url);
  if (byUrl) return byUrl;
  if (html) {
    const byHtml = detectByHtml(html);
    if (byHtml) return byHtml;
  }
  return framer;
}
async function detectByDom(page) {
  try {
    const signal = await page.evaluate(() => {
      const html = document.documentElement.outerHTML || "";
      if (/wix-viewer-model|_wix_|wix-ecom/i.test(html)) return "wix";
      if (/data-wf-|w-webflow-badge|webflow\.js/i.test(html)) return "webflow";
      if (/framerusercontent|framercanvas|framerstatic/i.test(html)) return "framer";
      const srcs = [];
      const scripts = document.querySelectorAll("script[src]");
      scripts.forEach((s) => {
        if (s.src) srcs.push(s.src);
      });
      const allSrcs = srcs.join(" ");
      if (/wixstatic\.com|parastorage\.com/.test(allSrcs)) return "wix";
      if (/website-files\.com|webflow\.com/.test(allSrcs)) return "webflow";
      if (/framerusercontent\.com|framerstatic\.com|framer\.app/.test(allSrcs)) return "framer";
      return "";
    });
    if (signal === "wix") return wix;
    if (signal === "webflow") return webflow;
    if (signal === "framer") return framer;
  } catch {
  }
  return null;
}
function getPlatformByName(name) {
  const map = { framer, webflow, wix };
  return map[name] || framer;
}
var ALL_PLATFORMS;
var init_detect = __esm({
  "src/platforms/detect.ts"() {
    "use strict";
    init_framer();
    init_webflow();
    init_wix();
    ALL_PLATFORMS = [framer, webflow, wix];
  }
});

// src/platforms/index.ts
var platforms_exports = {};
__export(platforms_exports, {
  detectByDom: () => detectByDom,
  detectByHtml: () => detectByHtml,
  detectByUrl: () => detectByUrl,
  detectPlatform: () => detectPlatform,
  framer: () => framer,
  getPlatformByName: () => getPlatformByName,
  webflow: () => webflow,
  wix: () => wix
});
var init_platforms = __esm({
  "src/platforms/index.ts"() {
    "use strict";
    init_framer();
    init_webflow();
    init_wix();
    init_detect();
  }
});

// src/exporter/capture.ts
import puppeteer from "puppeteer";
async function launchAndCapture(exporter) {
  exporter.cooking?.update("Launching browser...");
  log("Launching headless Chromium...");
  exporter.browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  success("Chromium launched");
  exporter.page = await exporter.browser.newPage();
  await exporter.page.setViewport(CFG.viewport);
  log("Viewport set to " + CFG.viewport.width + "x" + CFG.viewport.height);
  await exporter.page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );
  log("User agent set to Chrome 131");
  const allStripDomains = [
    ...CFG.sharedStripDomains,
    ...exporter.platform.stripDomains
  ];
  log("Blocking " + allStripDomains.length + " tracking domains:");
  for (const domain of allStripDomains) {
    log("  - " + domain);
  }
  let intercepted = 0;
  let blocked = 0;
  exporter.page.on("response", async (res) => {
    const url = res.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    try {
      const host = new URL(url).hostname;
      if (allStripDomains.some((d) => host.includes(d))) {
        blocked++;
        return;
      }
    } catch {
      return;
    }
    exporter.assets.localPathFor(url, exporter.platform);
    try {
      exporter.assets.buffers.set(url, await res.buffer());
      intercepted++;
    } catch {
    }
  });
  log("Network interception enabled");
  exporter.cooking?.update("Navigating to site...");
  info("Navigating to " + exporter.siteUrl);
  await exporter.page.goto(exporter.siteUrl, {
    waitUntil: "networkidle2",
    timeout: CFG.timeout
  });
  success("Page loaded (networkidle2)");
  log("Intercepted " + intercepted + " resources, blocked " + blocked + " tracking requests");
  log("Checking DOM-based platform detection...");
  const domDetected = await detectByDom(exporter.page);
  if (domDetected && domDetected.name !== exporter.platform.name) {
    log("Platform refined from DOM: " + domDetected.displayName + " (override: " + exporter.platform.name + ")");
    exporter.platform = domDetected;
  }
  exporter.cooking?.update("Waiting for " + exporter.platform.displayName + " hydration...");
  if (exporter.platform.needsHydrationCheck) {
    log("Checking for #main element hydration...");
    log("Hydration timeout: " + exporter.platform.hydrationTimeout + "ms");
    const timeout = exporter.platform.hydrationTimeout;
    await exporter.page.evaluate(`
      new Promise(function(r) {
        var start = Date.now();
        var tick = function() {
          var m = document.getElementById('main') || document.body;
          if (m && m.children.length > 0) setTimeout(r, 2000);
          else if (Date.now() - start > ${timeout}) r();
          else setTimeout(tick, 200);
        };
        tick();
      })
    `);
    success("Hydration complete (SPA rendered)");
  } else {
    log("Static site detected, waiting " + exporter.platform.hydrationTimeout + "ms for render...");
    await new Promise((r) => setTimeout(r, exporter.platform.hydrationTimeout));
    success(exporter.platform.displayName + " page rendered");
  }
  exporter.cooking?.update("Scrolling page...");
  log("Starting full-page scroll (step: " + CFG.scrollStep + "px, delay: " + CFG.scrollDelay + "ms)");
  const scrollStep = CFG.scrollStep;
  const scrollDelay = CFG.scrollDelay;
  const pageHeight = await exporter.page.evaluate(`
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
  `);
  log("Page height: " + pageHeight + "px (" + Math.ceil(pageHeight / scrollStep) + " scroll steps)");
  await exporter.page.evaluate(`
    new Promise(function(r) {
      var y = 0;
      var max = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      var step = function() {
        y += ${scrollStep};
        window.scrollTo({ top: y, behavior: 'instant' });
        y < max + 500 ? setTimeout(step, ${scrollDelay}) : (window.scrollTo(0, 0), r());
      };
      step();
    })
  `);
  success("Full-page scroll complete");
  exporter.cooking?.update("Waiting for lazy resources...");
  log("Waiting 2s for lazy-loaded resources...");
  await new Promise((r) => setTimeout(r, 2e3));
  log("Checking network idle (1.5s quiet, 8s timeout)...");
  try {
    await exporter.page.waitForNetworkIdle({ idleTime: 1500, timeout: 8e3 });
    success("Network idle confirmed");
  } catch {
    log("Network idle timeout reached (continuing anyway)");
  }
  const totalCaptured = exporter.assets.buffers.size;
  success("Captured " + totalCaptured + " network resources total");
  const cssCount = [...exporter.assets.entries.values()].filter((e) => e.localPath.endsWith(".css")).length;
  const jsCount = [...exporter.assets.entries.values()].filter((e) => e.localPath.endsWith(".js") || e.localPath.endsWith(".mjs")).length;
  const imgCount = [...exporter.assets.entries.values()].filter((e) => e.localPath.startsWith("assets/images")).length;
  const fontCount = [...exporter.assets.entries.values()].filter((e) => e.localPath.startsWith("assets/fonts")).length;
  log("  CSS: " + cssCount + " | JS: " + jsCount + " | Images: " + imgCount + " | Fonts: " + fontCount);
}
async function closeBrowser(exporter) {
  if (exporter.browser) {
    await exporter.browser.close();
    exporter.browser = null;
    log("Browser closed");
  }
}
async function captureSubpage(page, url, platform) {
  log("  Navigating to sub-page: " + url);
  await page.goto(url, { waitUntil: "networkidle2", timeout: CFG.timeout });
  if (platform.needsHydrationCheck) {
    await page.evaluate(
      `new Promise(function(r) {
        var t = Date.now();
        (function tick() {
          var m = document.getElementById('main') || document.body;
          if (m && m.children.length > 0) setTimeout(r, 500);
          else if (Date.now() - t > ${platform.hydrationTimeout}) r();
          else setTimeout(tick, 200);
        })();
      })`
    );
  } else {
    await new Promise((r) => setTimeout(r, 1e3));
  }
  const html = await page.evaluate(() => document.documentElement.outerHTML || document.body.innerHTML);
  log("  Sub-page fetched: " + (html.length / 1024).toFixed(1) + " KB");
  return html;
}
var init_capture = __esm({
  "src/exporter/capture.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_platforms();
  }
});

// src/network/pool.ts
async function pool(tasks, n) {
  let i = 0;
  const run = async () => {
    while (i < tasks.length) {
      const j = i++;
      await tasks[j]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, () => run()));
}
var init_pool = __esm({
  "src/network/pool.ts"() {
    "use strict";
  }
});

// src/exporter/download.ts
import fs from "fs/promises";
import path2 from "path";
async function downloadAll(exporter) {
  const seen = /* @__PURE__ */ new Set();
  const toDownload = [];
  for (const [url, { localPath }] of exporter.assets.entries) {
    if (seen.has(localPath)) continue;
    seen.add(localPath);
    toDownload.push({ url, localPath });
  }
  const total = toDownload.length;
  log("Starting download of " + total + " unique assets");
  log("Concurrency: " + CFG.concurrency + " parallel downloads");
  log("Retry policy: " + CFG.retries + " attempts, " + CFG.dlTimeout + "ms timeout");
  let ok = 0;
  let cached = 0;
  let fail = 0;
  let completed = 0;
  let lastReported = 0;
  const tasks = toDownload.map(
    ({ url, localPath }) => async () => {
      const dest = path2.join(exporter.outDir, localPath);
      await fs.mkdir(path2.dirname(dest), { recursive: true });
      try {
        const buf = exporter.assets.buffers.get(url) || exporter.assets.buffers.get(url.split("?")[0]);
        if (buf) {
          await fs.writeFile(dest, buf);
          cached++;
          ok++;
        } else {
          const data = await dlBuffer(url);
          await fs.writeFile(dest, data);
          ok++;
        }
      } catch (e) {
        fail++;
        if (!url.includes("framer.com/edit") && !url.includes("framerstatic.com/editorbar")) {
          warn("Download failed: " + path2.basename(localPath) + " - " + e.message);
        }
      }
      completed++;
      const pct = Math.floor(completed / total * 100);
      if (pct >= lastReported + 10 || completed === total) {
        exporter.cooking?.update("Downloading... " + completed + "/" + total + " (" + pct + "%)");
        log("Download progress: " + completed + "/" + total + " (" + pct + "%)");
        lastReported = pct;
      }
    }
  );
  await pool(tasks, CFG.concurrency);
  success("Downloads complete: " + ok + " succeeded, " + cached + " from cache, " + fail + " failed");
  const totalBytes = [...exporter.assets.entries.values()].length;
  log("Total unique assets written to disk: " + totalBytes);
  exporter.assets.buffers.clear();
  log("Network buffer cache cleared");
}
var init_download2 = __esm({
  "src/exporter/download.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_download();
    init_pool();
  }
});

// src/formatter/prettify.ts
import prettier from "prettier";
async function prettifyJS(src) {
  try {
    return await prettier.format(src, {
      parser: "babel",
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: false,
      trailingComma: "es5",
      bracketSpacing: true,
      arrowParens: "always"
    });
  } catch {
    return src;
  }
}
var init_prettify = __esm({
  "src/formatter/prettify.ts"() {
    "use strict";
  }
});

// src/server/template.ts
var SERVE_SCRIPT;
var init_template = __esm({
  "src/server/template.ts"() {
    "use strict";
    SERVE_SCRIPT = `#!/usr/bin/env node
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html':      'text/html; charset=utf-8',
  '.css':       'text/css; charset=utf-8',
  '.js':        'application/javascript; charset=utf-8',
  '.mjs':       'application/javascript; charset=utf-8',
  '.json':      'application/json; charset=utf-8',
  '.png':       'image/png',
  '.jpg':       'image/jpeg',
  '.jpeg':      'image/jpeg',
  '.gif':       'image/gif',
  '.svg':       'image/svg+xml',
  '.webp':      'image/webp',
  '.avif':      'image/avif',
  '.ico':       'image/x-icon',
  '.woff':      'font/woff',
  '.woff2':     'font/woff2',
  '.ttf':       'font/ttf',
  '.otf':       'font/otf',
  '.mp4':       'video/mp4',
  '.webm':      'video/webm',
  '.ogg':       'video/ogg',
  '.framercms': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';

  let filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const serveFile = (pathToFile) => {
    fs.readFile(pathToFile, (err, data) => {
      if (err) {
        // SPA Fallback: if it's not a file, serve index.html
        if (url !== '/index.html' && !path.extname(url)) {
          return serveFile(path.join(ROOT, 'index.html'));
        }
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext  = path.extname(pathToFile).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(data);
    });
  };

  serveFile(filePath);
});

const ANSI = {
  reset: '\\x1b[0m',
  primary: '\\x1b[38;2;250;178;131m',
  soft: '\\x1b[38;2;255;192;159m',
  text: '\\x1b[38;2;238;238;238m',
  muted: '\\x1b[38;2;128;128;128m',
  border: '\\x1b[38;2;72;72;72m',
  success: '\\x1b[38;2;127;216;143m',
  info: '\\x1b[38;2;86;182;194m',
};

function color(name, value) {
  return ANSI[name] + value + ANSI.reset;
}

function frameLine(label, value) {
  const text = '  ' + label.padEnd(10) + value;
  const pad = Math.max(0, 56 - text.length);
  console.log('  ' + color('border', '\u2502 ') + color('muted', label.padEnd(10)) + color('text', value) + ' '.repeat(pad) + color('border', ' \u2502'));
}

function drawServerUi() {
  const logo = [
    '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 ',
    '\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557',
    '\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D',
    '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557',
    '\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u255A\u2588\u2588\u2557\u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D',
    '\u2588\u2588\u2588\u2588\u2588\u2557   \u255A\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D   \u2588\u2588\u2551   ',
  ];

  console.log('');
  for (const line of logo) console.log('  ' + color('primary', line));
  console.log('');
  console.log('  ' + color('border', '\u256D\u2500' + '\u2500'.repeat(56) + '\u2500\u256E'));
  console.log('  ' + color('border', '\u2502 ') + color('text', '  Framer Export local server') + ' '.repeat(28) + color('border', ' \u2502'));
  console.log('  ' + color('border', '\u251C\u2500' + '\u2500'.repeat(56) + '\u2500\u2524'));
  frameLine('URL', 'http://localhost:' + PORT);
  frameLine('Root', ROOT);
  frameLine('Mode', 'static mirror + SPA fallback');
  console.log('  ' + color('border', '\u2570\u2500' + '\u2500'.repeat(56) + '\u2500\u256F'));
  console.log('');
  console.log('  ' + color('success', 'ready') + color('muted', '  press Ctrl+C to stop') + '\\n');
}

server.listen(PORT, () => {
  const frames = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write('\\r\\x1B[2K  ' + color('primary', frames[i % frames.length]) + ' ' + color('muted', 'starting Framer Export server'));
    i++;
  }, 80);

  setTimeout(() => {
    clearInterval(timer);
    process.stdout.write('\\r\\x1B[2K');
    drawServerUi();
  }, 720);
});
`;
  }
});

// src/exporter/output.ts
import fs2 from "fs/promises";
import path3 from "path";
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stripBySelector(html, sel) {
  if (sel.includes('[src*="')) {
    const match = sel.match(/\[src\*="([^"]+)"\]/);
    if (match) {
      const domain = escapeRegex(match[1]);
      html = html.replace(new RegExp(`<script[^>]*${domain}[^>]*>[^<]*<\\/script>`, "g"), "");
      html = html.replace(new RegExp(`<script[^>]*${domain}[^>]*><\\/script>`, "g"), "");
    }
  } else if (sel.includes('[href*="')) {
    const match = sel.match(/\[href\*="([^"]+)"\]/);
    if (match) {
      const href = escapeRegex(match[1]);
      html = html.replace(new RegExp(`<link[^>]*${href}[^>]*>`, "g"), "");
    }
  } else if (sel.startsWith(".")) {
    const cls = escapeRegex(sel.slice(1));
    html = html.replace(
      new RegExp(`<[^>]*class="[^"]*${cls}[^"]*"[^>]*>[\\s\\S]*?<\\/[^>]*>`, "g"),
      ""
    );
  } else if (sel.startsWith("#")) {
    const id = sel.slice(1);
    html = removeElementById(html, id);
  }
  return html;
}
function removeElementById(html, id) {
  const marker = `id="${id}"`;
  let idx = html.indexOf(marker);
  while (idx !== -1) {
    const tagStart = html.lastIndexOf("<", idx);
    if (tagStart === -1) break;
    const tagNameEnd = html.indexOf(" ", tagStart + 1);
    const tagName = html.slice(tagStart + 1, tagNameEnd).toLowerCase();
    let depth = 0;
    let i = tagStart;
    while (i < html.length) {
      if (html.startsWith(`<${tagName}`, i) && (html[i + tagName.length + 1] === " " || html[i + tagName.length + 1] === ">")) {
        depth++;
        i += tagName.length + 1;
      } else if (html.startsWith(`</${tagName}>`, i)) {
        depth--;
        if (depth === 0) {
          html = html.slice(0, tagStart) + html.slice(i + tagName.length + 3);
          break;
        }
        i += tagName.length + 3;
      } else {
        i++;
      }
    }
    idx = html.indexOf(marker);
  }
  return html;
}
function processSEO(html, url) {
  const canonical = url.split("?")[0].replace(/\/$/, "");
  if (!html.includes('rel="canonical"')) {
    html = html.replace("</head>", `  <link rel="canonical" href="${canonical}">
  </head>`);
  }
  if (!html.includes('name="description"')) {
    html = html.replace(
      "</head>",
      `  <meta name="description" content="Exported with Framer Export - Fast, SEO-optimized, and clean.">
  </head>`
    );
  }
  if (!html.includes('property="og:')) {
    html = html.replace(
      "</head>",
      `  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="Exported Site">
  <meta property="og:description" content="A fast, clean version of this site, exported for performance.">
  </head>`
    );
  }
  if (!html.includes('name="robots"')) {
    html = html.replace("</head>", `  <meta name="robots" content="index, follow">
  </head>`);
  }
  return html;
}
function stripIntegrityAndCors(html) {
  html = html.replace(/\s+integrity="[^"]*"/g, "");
  html = html.replace(/\s+crossorigin="[^"]*"/g, "");
  html = html.replace(/\s+crossorigin/g, "");
  html = html.replace(/<link[^>]*rel="preconnect"[^>]*>/g, "");
  html = html.replace(/<link[^>]*rel="dns-prefetch"[^>]*>/g, "");
  html = html.replace(/<meta[^>]*content-security-policy[^>]*>/gi, "");
  return html;
}
function stripSrcsetCdnUrls(html) {
  html = html.replace(/srcset="([^"]*)"/g, (_match, srcset) => {
    const cleaned = srcset.split(",").map((entry) => entry.trim()).filter((entry) => !entry.startsWith("http")).join(", ");
    return cleaned ? 'srcset="' + cleaned + '"' : "";
  });
  return html;
}
async function buildOutput(exporter) {
  exporter.cooking?.update("Stripping platform badges...");
  log("Starting HTML post-processing...");
  log("HTML size: " + (exporter.ssrHTML.length / 1024).toFixed(1) + " KB");
  let html = exporter.ssrHTML;
  if (!html) {
    warn("No SSR HTML available, cannot build output");
    return;
  }
  exporter.cooking?.update("Removing integrity checks...");
  const beforeIntegrity = html.length;
  html = stripIntegrityAndCors(html);
  log("Stripped integrity/crossorigin/preconnect (" + (beforeIntegrity - html.length) + " chars)");
  success("Integrity and CORS restrictions removed");
  if (typeof processSEO === "function") {
    exporter.cooking?.update("Optimizing SEO...");
    html = processSEO(html, exporter.siteUrl);
    success("SEO meta tags optimized");
  }
  log("Stripping " + exporter.platform.stripSelectors.length + " selectors:");
  for (const sel of exporter.platform.stripSelectors) {
    const before = html.length;
    html = stripBySelector(html, sel);
    const removed = before - html.length;
    if (removed > 0) {
      log("  Stripped " + sel + " (" + removed + " chars removed)");
    }
  }
  log("Applying " + exporter.platform.stripPatterns.length + " regex patterns...");
  for (const pattern of exporter.platform.stripPatterns) {
    const before = html.length;
    html = html.replace(new RegExp(pattern.source, pattern.flags), "");
    const removed = before - html.length;
    if (removed > 0) {
      log("  Pattern removed " + removed + " chars");
    }
  }
  success("Platform badges and tracking stripped");
  exporter.cooking?.update("Rewriting asset URLs...");
  log("Rewriting " + exporter.assets.entries.size + " CDN URLs to local paths...");
  const beforeRewrite = html.length;
  html = exporter.assets.rewrite(html, "");
  log("HTML rewrite delta: " + (html.length - beforeRewrite) + " chars");
  exporter.cooking?.update("Cleaning srcset references...");
  html = stripSrcsetCdnUrls(html);
  log("Cleaned remaining CDN URLs from srcset attributes");
  await rewriteDownloadedFiles(exporter);
  success("All URLs rewritten to local paths");
  exporter.cooking?.update("Pretty-printing JS files...");
  await prettifyDownloadedJS(exporter);
  exporter.cooking?.update("Writing final output...");
  log("Writing index.html (" + (html.length / 1024).toFixed(1) + " KB)...");
  await fs2.writeFile(path3.join(exporter.outDir, "index.html"), html);
  success("index.html written");
  await fs2.writeFile(path3.join(exporter.outDir, "serve.cjs"), SERVE_SCRIPT);
  log("serve.cjs written");
  success("Output build complete");
}
async function rewriteDownloadedFiles(exporter) {
  const dirs = ["scripts/vendor", "scripts/modules", "styles"];
  let rewritten = 0;
  for (const dir of dirs) {
    const fullDir = path3.join(exporter.outDir, dir);
    let files;
    try {
      files = await fs2.readdir(fullDir);
    } catch {
      continue;
    }
    for (const file of files) {
      const ext = path3.extname(file).toLowerCase();
      if (![".mjs", ".js", ".css"].includes(ext)) continue;
      const filePath = path3.join(fullDir, file);
      try {
        let content = await fs2.readFile(filePath, "utf-8");
        const before = content;
        content = exporter.assets.rewrite(content, dir);
        if (content !== before) {
          await fs2.writeFile(filePath, content);
          rewritten++;
        }
      } catch {
      }
    }
  }
  log("Rewrote URLs in " + rewritten + " JS/CSS files");
}
async function prettifyDownloadedJS(exporter) {
  const dirs = ["scripts/vendor", "scripts/modules"];
  let count = 0;
  let total = 0;
  for (const dir of dirs) {
    const fullDir = path3.join(exporter.outDir, dir);
    let files;
    try {
      files = await fs2.readdir(fullDir);
    } catch {
      continue;
    }
    const jsFiles = files.filter((f) => {
      const ext = path3.extname(f).toLowerCase();
      return ext === ".mjs" || ext === ".js";
    });
    total += jsFiles.length;
    for (const file of jsFiles) {
      const filePath = path3.join(fullDir, file);
      try {
        const raw = await fs2.readFile(filePath, "utf-8");
        const nlRatio = (raw.match(/\n/g) || []).length / raw.length;
        if (nlRatio > 0.05) {
          count++;
          continue;
        }
        const pretty = await prettifyJS(raw);
        await fs2.writeFile(filePath, pretty, "utf-8");
        count++;
        if (count % 5 === 0) {
          exporter.cooking?.update("Pretty-printing... (" + count + "/" + total + ")");
        }
      } catch (e) {
        warn("Pretty-print skipped: " + file + " - " + e.message);
        count++;
      }
    }
  }
  success("Formatted " + count + "/" + total + " JS/MJS files");
}
var init_output = __esm({
  "src/exporter/output.ts"() {
    "use strict";
    init_logger();
    init_prettify();
    init_template();
  }
});

// src/exporter/summary.ts
import fs3 from "fs/promises";
import path4 from "path";
async function printSummary(exporter) {
  const w = maxWidth();
  const isSmall = w < 50;
  const count = async (d) => {
    try {
      return (await fs3.readdir(path4.join(exporter.outDir, d))).length;
    } catch {
      return 0;
    }
  };
  const [imgs, fonts, videos, misc, scripts, vendor, styles, data, subpages] = await Promise.all([
    count("assets/images"),
    count("assets/fonts"),
    count("assets/videos"),
    count("assets/misc"),
    count("scripts/modules"),
    count("scripts/vendor"),
    count("styles"),
    count("data"),
    count("subpages")
  ]);
  const G = ui.primary;
  const G2 = ui.primarySoft;
  const C2 = ui.secondary;
  const Y = ui.accent;
  const O = ui.warning;
  const Br = ui.info;
  const Gr = ui.muted;
  const Gn = ui.success;
  const entries = [
    ["styles/", styles, "CSS", G],
    ["scripts/vendor/", vendor, "JS vendor", G2],
    ["scripts/modules/", scripts, "JS modules", C2],
    ["assets/images/", imgs, "images", Y],
    ["assets/videos/", videos, "videos", O],
    ["assets/fonts/", fonts, "fonts", Br],
    ["assets/misc/", misc, "misc", Gr],
    ["data/", data, "data", Gr],
    ["subpages/", subpages, "pages", Gn]
  ];
  console.log("");
  if (!isSmall) {
    console.log(boxTop(w));
    console.log(boxLine(w, `${ui.text.bold("  Export Summary")} ${chip("done")}`));
    console.log(boxSep(w));
  } else {
    console.log(ui.text.bold("  Export Summary:"));
  }
  for (const [label, cnt, type, color] of entries) {
    if (cnt === 0) continue;
    const inner = w - 4;
    const l = label.padEnd(16);
    const c = String(cnt).padStart(3);
    const rowText = `${color(l)}${ui.text(c)}  ${ui.muted(type)}`;
    const visible = 16 + 3 + 2 + type.length;
    const pad = Math.max(0, inner - visible);
    if (isSmall) {
      console.log(`  ${color(label)} ${ui.text(String(cnt))} ${ui.muted(type)}`);
    } else {
      console.log("  " + ui.border("\u2502 ") + rowText + " ".repeat(pad) + ui.border(" \u2502"));
    }
  }
  if (!isSmall) {
    console.log(boxBot(w));
  }
  console.log("");
  const cdCmd = "cd " + path4.basename(exporter.outDir) + " && node serve.cjs";
  if (!isSmall) {
    console.log(boxTop(w));
    console.log(boxLine(w, ui.text.bold("  To serve locally")));
    console.log(boxSep(w));
    const inner = w - 6;
    const cmdLen = cdCmd.length;
    const pad = Math.max(0, inner - cmdLen);
    console.log(
      "  " + ui.border("\u2502 ") + G(cdCmd) + " ".repeat(pad) + ui.muted(" copy") + ui.border(" \u2502")
    );
    console.log(boxBot(w));
  } else {
    console.log(ui.text.bold("  To serve locally:"));
    console.log(`  ${G(cdCmd)}`);
  }
  console.log("");
  console.log(ui.muted("  note: must be served via HTTP for JS modules to work."));
  console.log("");
}
var init_summary = __esm({
  "src/exporter/summary.ts"() {
    "use strict";
    init_box();
    init_theme();
  }
});

// src/ai/prompt-assistant.ts
import fs4 from "fs/promises";
import path5 from "path";
import { stdin as stdin2, stdout as stdout2 } from "process";
import { spawn } from "child_process";
async function runAiPromptAssistant(exporter) {
  if (!stdin2.isTTY || !stdout2.isTTY) return;
  printConvertPanel(exporter);
  const action = await select(
    "Framer Export AI Convert",
    [
      { label: `${buttonLabel("Convert")} open AI prompt modal`, value: "convert" },
      { label: `${buttonLabel("Skip")} finish export`, value: "skip" }
    ],
    0
  );
  if (action === "skip") return;
  printAssistantModal("AI conversion prompt", [
    "Choose a target stack, AI tool, and conversion situation.",
    "Mouse clicks are supported in the terminal when available.",
    "A detailed prompt file will be generated inside the export folder."
  ]);
  const targetOptions = [
    ...TARGETS.map((target2) => ({ label: target2.label, value: target2.id })),
    { label: "Customize with AI - BETA in development", value: "custom-ai", disabled: true }
  ];
  const targetId = await select("Choose target stack", targetOptions, 0);
  const aiToolId = await select(
    "Choose the AI coding tool",
    AI_TOOLS.map((tool) => ({ label: tool.label, value: tool.id })),
    0
  );
  const goalId = await select(
    "Choose the conversion situation",
    GOALS.map((goal2) => ({ label: goal2.label, value: goal2.id })),
    0
  );
  const target = TARGETS.find((item) => item.id === targetId) || TARGETS[0];
  const aiTool = AI_TOOLS.find((item) => item.id === aiToolId) || AI_TOOLS[0];
  const goal = GOALS.find((item) => item.id === goalId) || GOALS[0];
  const facts = await collectExportFacts(exporter);
  const prompt = buildConversionPrompt(target, aiTool, goal, facts);
  const aiDir = path5.join(exporter.outDir, "ai");
  const promptPath = path5.join(aiDir, `${aiTool.id}-${target.id}-${goal.id}-prompt.md`);
  await fs4.mkdir(aiDir, { recursive: true });
  await fs4.writeFile(promptPath, prompt, "utf-8");
  printPromptResult(promptPath, target, aiTool, goal);
  const promptAction = await select(
    "Prompt actions",
    [
      { label: `${buttonLabel("Copy prompt")} clipboard`, value: "copy" },
      { label: `${buttonLabel("Done")} keep file only`, value: "done" }
    ],
    0
  );
  if (promptAction === "copy") {
    try {
      await copyToClipboard(prompt);
      console.log(`  ${ui.success("\u2713")} ${ui.text.bold("Prompt copied to clipboard")}
`);
    } catch (error) {
      console.log(
        `  ${ui.warning("!")} ${ui.warning("Clipboard copy unavailable:")} ${ui.muted(error.message)}
`
      );
    }
  }
}
async function collectExportFacts(exporter) {
  const counts = {};
  const rootEntries = await safeReadDir(exporter.outDir);
  for (const item of IMPORTANT_DIRS) {
    counts[item] = item === "index.html" ? await exists(path5.join(exporter.outDir, item)) ? 1 : 0 : await countEntries(path5.join(exporter.outDir, item));
  }
  return {
    sourceUrl: exporter.siteUrl,
    outputDir: exporter.outDir,
    platformName: exporter.platform.displayName,
    rootEntries,
    counts
  };
}
async function exists(filePath) {
  try {
    await fs4.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function safeReadDir(dir) {
  try {
    return (await fs4.readdir(dir)).sort();
  } catch {
    return [];
  }
}
async function countEntries(dir) {
  try {
    return (await fs4.readdir(dir)).length;
  } catch {
    return 0;
  }
}
function buttonLabel(label) {
  return `${ui.border("[")} ${ui.text.bold(label)} ${ui.border("]")}`;
}
function centerText2(text, width) {
  const visible = stripAnsi(text).length;
  if (visible >= width) return text;
  const left = Math.floor((width - visible) / 2);
  return " ".repeat(left) + text + " ".repeat(width - visible - left);
}
function printConvertPanel(exporter) {
  const w = maxWidth();
  const inner = w - 4;
  const rows = [
    centerText2(`${ui.text.bold("AI Convert")} ${ui.muted("BETA")}`, inner),
    centerText2(ui.muted("Generate a conversion prompt after the export."), inner),
    centerText2(`${buttonLabel("Convert")} ${ui.muted("or")} ${buttonLabel("Skip")}`, inner),
    centerText2(ui.muted(path5.basename(exporter.outDir)), inner)
  ];
  console.log("");
  console.log(boxTop(w));
  for (const row of rows) console.log(boxLine(w, row));
  console.log(boxBot(w));
  console.log("");
}
function printAssistantModal(title, lines) {
  const w = maxWidth();
  const inner = w - 4;
  console.log("");
  console.log(boxTop(w));
  console.log(boxLine(w, centerText2(`${ui.primary("\u25C6")} ${ui.text.bold(title)}`, inner)));
  console.log(boxSep(w));
  for (const line of lines) {
    console.log(boxLine(w, centerText2(ui.muted(line), inner)));
  }
  console.log(boxBot(w));
  console.log("");
}
function buildConversionPrompt(target, aiTool, goal, facts) {
  const rootEntries = facts.rootEntries.length ? facts.rootEntries.join(", ") : "No root entries detected";
  const exportDir = quoteForPrompt(facts.outputDir);
  const projectDir = quoteForPrompt(path5.join(facts.outputDir, target.projectDir));
  const scaffoldCommand = `cd ${exportDir}; ${target.scaffold}`;
  const sourceAssets = quoteForPrompt(path5.join(facts.outputDir, "assets", "*"));
  const destinationAssets = quoteForPrompt(
    path5.join(facts.outputDir, target.projectDir, target.staticDir, "assets")
  );
  const windowsAssetCopyCommand = `New-Item -ItemType Directory -Force -Path ${destinationAssets}; Copy-Item -Path ${sourceAssets} -Destination ${destinationAssets} -Recurse -Force`;
  const unixSourceAssets = quoteForPrompt(toPosixPath(path5.join(facts.outputDir, "assets")));
  const unixDestinationParent = quoteForPrompt(
    toPosixPath(path5.join(facts.outputDir, target.projectDir, target.staticDir))
  );
  const unixAssetCopyCommand = `mkdir -p ${unixDestinationParent} && cp -R ${unixSourceAssets} ${unixDestinationParent}/assets`;
  const directoryLines = IMPORTANT_DIRS.map(
    (dir) => `Inspect ${dir}: ${facts.counts[dir]} item(s) detected in the export.`
  );
  const promptLines = [
    `You are ${aiTool.agentName} working inside a local export created by Framer Export.`,
    "This brief was generated by the Framer Export AI Prompt Assistant BETA.",
    "Treat this beta prompt as a strict conversion checklist, not as permission to skip inspection.",
    "Your mission is to convert this exported static mirror into a clean production project.",
    `Target stack: ${target.stack}.`,
    `Selected AI coding tool: ${aiTool.displayName}.`,
    `Selected conversion situation: ${goal.label}.`,
    `Primary instruction for this situation: ${goal.instruction}`,
    `Main priority: ${goal.priority}`,
    `Source URL from the real export: ${facts.sourceUrl}`,
    `Detected platform from the real export: ${facts.platformName}`,
    `Export folder to inspect first: ${facts.outputDir}`,
    `Root entries actually present: ${rootEntries}`,
    `Create the converted project in: ${projectDir}`,
    `Recommended scaffold command: ${scaffoldCommand}`,
    `Expected important target files: ${target.entryFiles}`,
    `Routing guidance: ${target.routing}`,
    `Static assets destination for this stack: ${target.staticDir}/assets inside the converted project.`,
    `PowerShell command to copy exported assets after scaffolding: ${windowsAssetCopyCommand}`,
    `macOS/Linux command to copy exported assets after scaffolding: ${unixAssetCopyCommand}`,
    "Run the asset copy command; do not recreate, redownload, rename randomly, or replace real exported assets with placeholders.",
    "After copying assets, update every image, video, font, CSS url(), and script reference to the new local asset path.",
    "Do not rush. Take time to inspect the export before writing the final implementation.",
    "Do not invent brand names, copy, images, links, animations, colors, or sections.",
    "Use only real information found in index.html, CSS files, JavaScript files, data files, and assets.",
    "If a detail is missing, inspect more files instead of guessing.",
    "If a vendor script is minified or hard to understand, identify what behavior it provides before replacing it.",
    "Keep the final result professional, clean, responsive, and maintainable.",
    "Do not simplify the site because a section, animation, page, or layout is difficult.",
    "If something is hard, break it into smaller components and keep working until the result matches closely.",
    "For every exported page, aim for the closest possible pixel-perfect result: spacing, typography, images, viewport behavior, and motion.",
    "Do not merge multiple pages into one generic page unless the export proves they are duplicate routes.",
    "Do not replace complex exported sections with summaries, cards, screenshots, or placeholder blocks.",
    "If a page has visual depth, overlapping layers, sticky sections, galleries, or scroll effects, recreate those behaviors instead of flattening them.",
    "Start by listing the files and directories that matter for the conversion.",
    ...directoryLines,
    "Read index.html fully enough to understand page structure, metadata, linked assets, and scripts.",
    "Read the CSS files that define layout, typography, responsive rules, and visual details.",
    "Inspect scripts/vendor only to understand required interactions; do not blindly copy huge vendor bundles.",
    "Inspect scripts/modules for page-specific logic, animations, sliders, menus, and dynamic behavior.",
    "Inspect data files for CMS-like content, page data, configuration, or serialized props.",
    "Inspect assets/images and preserve the real image files that are actually used.",
    "Inspect assets/fonts and preserve font loading if the design depends on custom fonts.",
    "Inspect subpages if it contains exported pages; map them to routes only when they represent real pages.",
    "If subpages contains pages, convert each meaningful page with its own route and page component.",
    "For each converted page, compare against the original exported HTML route and adjust until it is visually close.",
    "Create a clean project structure instead of dumping everything into one component.",
    "Separate global layout, page sections, shared components, data helpers, and styles.",
    "Use semantic HTML for headings, navigation, buttons, forms, sections, and footer content.",
    "Preserve the original hierarchy of visible content unless there is a clear bug to fix.",
    "Preserve real URLs and links, but convert local asset paths to the new project structure.",
    "Move static assets into the target framework public/static asset location when appropriate.",
    "Do not keep broken CDN references if a local exported asset already exists.",
    "Do not hardcode absolute machine paths into source files; use framework-relative public asset paths after copying.",
    "Keep original filenames when possible so CSS and content references remain traceable.",
    "Do not leave unused analytics, editor badges, platform badges, or export-only scripts in the new app.",
    "Replace platform-specific runtime code with native framework components when possible.",
    "Keep interactions that users can see: menus, hover states, forms, sliders, animations, and scroll effects.",
    "If an interaction is too complex, implement a clean equivalent and document the difference briefly.",
    "Keep responsive behavior for desktop, tablet, and mobile.",
    "Check layout at small widths and avoid fixed desktop-only dimensions unless the original requires them.",
    "Use CSS variables or a clear theme file for colors, spacing, radius, shadows, and typography.",
    "Name components after their role: Hero, Header, FeatureGrid, Gallery, Pricing, Footer, and similar real sections.",
    "Avoid generic placeholder components if the exported site has specific section meaning.",
    "Use TypeScript types where they make the content or component props clearer.",
    "Do not add unnecessary libraries unless they replace a real exported behavior cleanly.",
    "If you add a library, explain why it is needed and where it is used.",
    "Keep package.json scripts standard: dev, build, preview, lint when available.",
    "Keep the build reproducible from a fresh install.",
    "After implementing, run the install/build/typecheck commands available for the target project.",
    "Fix any build errors instead of leaving TODOs.",
    "Open the generated app locally if possible and compare against the exported index.html visually.",
    "When there are subpages, compare every generated route against its matching exported file.",
    "Verify that every visible image loads from the new project.",
    "Verify that font rendering is close to the export.",
    "Verify that navigation and internal links work.",
    "Verify that responsive breakpoints do not overlap or hide important content.",
    "Verify that there are no console errors caused by missing assets or copied platform scripts.",
    "Keep accessibility basics: alt text when inferable, keyboard-reachable controls, visible focus states.",
    "Keep SEO basics: title, meta description if present, canonical only if it is correct, Open Graph when present.",
    "Do not fabricate SEO copy; reuse existing metadata or ask for missing copy if necessary.",
    "Commit to a small number of high-quality files rather than many noisy fragments.",
    "If a section repeats, extract a reusable component and data array.",
    "If a section is unique, keep it simple and local to the page.",
    "Document important migration decisions in a short README inside the converted project.",
    "The README must mention the source export folder, target stack, setup command, and known limitations.",
    "Do not delete the original export folder.",
    "Do not modify unrelated files outside the new converted project unless required for setup.",
    "If the worktree has existing changes, avoid reverting or overwriting them.",
    "Before large edits, inspect first and explain the conversion plan briefly.",
    "Then implement the conversion step by step until the app builds.",
    "Final answer must summarize what was converted, where the new project lives, and which checks passed.",
    "If something could not be converted, state the exact file or behavior and the reason.",
    "Quality bar: the result should feel like a real hand-built production app, not an automated scrape or simplified demo."
  ];
  return [
    `# ${aiTool.displayName} Conversion Prompt - ${target.label}`,
    "",
    "Status: BETA assistant output. Review the export carefully and follow the real files.",
    `Generated from real export: ${facts.outputDir}`,
    `AI tool: ${aiTool.displayName}`,
    `Target: ${target.label}`,
    `Situation: ${goal.label}`,
    "",
    promptLines.map((line, index) => `${String(index + 1).padStart(2, "0")}. ${line}`).join("\n"),
    ""
  ].join("\n");
}
function quoteForPrompt(value) {
  return `"${value.replace(/"/g, '\\"')}"`;
}
function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}
async function copyToClipboard(text) {
  const commands = process.platform === "win32" ? [{ command: "clip", args: [] }] : process.platform === "darwin" ? [{ command: "pbcopy", args: [] }] : [
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] }
  ];
  let lastError = null;
  for (const item of commands) {
    try {
      await pipeToCommand(item.command, item.args, text);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No clipboard command found");
}
function pipeToCommand(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", finish);
    child.on("close", (code) => {
      if (code === 0) {
        finish();
      } else {
        finish(new Error(`${command} exited with ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
      }
    });
    child.stdin?.end(input);
  });
}
function printPromptResult(promptPath, target, aiTool, goal) {
  const w = maxWidth();
  const isSmall = w < 50;
  const inner = w - 4;
  const relPath = path5.relative(process.cwd(), promptPath) || promptPath;
  console.log("");
  if (!isSmall) {
    console.log(boxTop(w));
    console.log(
      boxLine(
        w,
        centerText2(
          `${ui.success("\u2713")} ${ui.text.bold("AI Prompt Ready")} ${ui.muted("BETA")}`,
          inner
        )
      )
    );
    console.log(boxSep(w));
    console.log(
      boxLine(w, centerText2(`${ui.muted("Tool")} ${ui.primary(aiTool.displayName)}`, inner))
    );
    console.log(boxLine(w, centerText2(`${ui.muted("Stack")} ${ui.primary(target.label)}`, inner)));
    console.log(boxLine(w, centerText2(`${ui.muted("Mode")} ${ui.primary(goal.label)}`, inner)));
    console.log(boxLine(w, centerText2(`${ui.muted("File")} ${ui.primary(relPath)}`, inner)));
    console.log(boxSep(w));
    console.log(
      boxLine(w, centerText2(`${buttonLabel("Copy prompt")} ${buttonLabel("Done")}`, inner))
    );
    console.log(boxBot(w));
  } else {
    console.log(ui.text.bold("  AI Prompt Ready - BETA"));
    console.log(`  Tool: ${ui.primary(aiTool.displayName)}`);
    console.log(`  Stack: ${ui.primary(target.label)}`);
    console.log(`  Situation: ${ui.primary(goal.label)}`);
    console.log(`  File: ${ui.primary(relPath)}`);
  }
  console.log("");
}
var IMPORTANT_DIRS, AI_TOOLS, TARGETS, GOALS;
var init_prompt_assistant = __esm({
  "src/ai/prompt-assistant.ts"() {
    "use strict";
    init_select();
    init_box();
    init_theme();
    IMPORTANT_DIRS = [
      "index.html",
      "styles",
      "scripts/vendor",
      "scripts/modules",
      "assets/images",
      "assets/videos",
      "assets/fonts",
      "assets/misc",
      "data",
      "subpages"
    ];
    AI_TOOLS = [
      {
        id: "claude-code",
        label: "Claude Code",
        displayName: "Claude Code",
        agentName: "Claude Code"
      },
      {
        id: "codex",
        label: "Codex",
        displayName: "Codex",
        agentName: "Codex coding agent"
      },
      {
        id: "opencode",
        label: "OpenCode",
        displayName: "OpenCode",
        agentName: "OpenCode"
      },
      {
        id: "other-ai",
        label: "Other AI coding agent",
        displayName: "Other AI",
        agentName: "AI coding agent"
      }
    ];
    TARGETS = [
      {
        id: "react-vite",
        label: "React + Vite + TypeScript",
        stack: "React 18/19, TypeScript, Vite, CSS modules or plain CSS",
        projectDir: "converted-react-vite",
        staticDir: "public",
        scaffold: "npm create vite@latest converted-react-vite -- --template react-ts",
        entryFiles: "src/main.tsx, src/App.tsx, src/components/*, src/styles/*",
        routing: "Use React Router only if multiple exported pages exist in subpages/."
      },
      {
        id: "nextjs-app-router",
        label: "Next.js App Router",
        stack: "Next.js App Router, TypeScript, React Server Components where useful",
        projectDir: "converted-nextjs",
        staticDir: "public",
        scaffold: "npx create-next-app@latest converted-nextjs --ts --app --eslint",
        entryFiles: "app/page.tsx, app/layout.tsx, components/*, public/*",
        routing: "Map exported subpages to app routes and keep shared layout code reusable."
      },
      {
        id: "vue-vite",
        label: "Vue + Vite + TypeScript",
        stack: "Vue 3, TypeScript, Vite, single-file components",
        projectDir: "converted-vue-vite",
        staticDir: "public",
        scaffold: "npm create vite@latest converted-vue-vite -- --template vue-ts",
        entryFiles: "src/main.ts, src/App.vue, src/components/*.vue, src/styles/*",
        routing: "Use Vue Router only if multiple exported pages exist in subpages/."
      },
      {
        id: "sveltekit",
        label: "SvelteKit",
        stack: "SvelteKit, TypeScript, componentized routes and assets",
        projectDir: "converted-sveltekit",
        staticDir: "static",
        scaffold: "npm create svelte@latest converted-sveltekit",
        entryFiles: "src/routes/+page.svelte, src/lib/components/*, static/*",
        routing: "Create SvelteKit routes for meaningful exported pages when subpages/ exists."
      },
      {
        id: "astro",
        label: "Astro",
        stack: "Astro, TypeScript, island components only where interactivity is needed",
        projectDir: "converted-astro",
        staticDir: "public",
        scaffold: "npm create astro@latest converted-astro",
        entryFiles: "src/pages/index.astro, src/components/*, public/*",
        routing: "Use Astro pages for exported subpages and avoid unnecessary client JavaScript."
      }
    ];
    GOALS = [
      {
        id: "clean-rebuild",
        label: "Clean professional rebuild",
        instruction: "Rebuild the export as clean production code, not as a one-file HTML clone, while preserving the full page experience.",
        priority: "Readable structure, maintainability, complete pages, and faithful visual result."
      },
      {
        id: "pixel-perfect",
        label: "Pixel-perfect visual migration",
        instruction: "Prioritize pixel-perfect fidelity before refactoring anything aggressively, even when the layout is difficult.",
        priority: "Spacing, typography, responsive behavior, colors, media, animations, and page-by-page fidelity."
      },
      {
        id: "component-system",
        label: "Reusable component system",
        instruction: "Extract repeated UI blocks into reusable components with clean props without simplifying the original pages.",
        priority: "Components, layout primitives, naming, future editability, and complete section coverage."
      },
      {
        id: "performance-seo",
        label: "Performance and SEO rebuild",
        instruction: "Rebuild the site while reducing unused vendor code and improving SEO basics without losing visual fidelity.",
        priority: "Fast loading, semantic markup, metadata, accessibility, asset hygiene, and faithful pages."
      }
    ];
  }
});

// src/exporter/index.ts
var exporter_exports = {};
__export(exporter_exports, {
  FramerExporter: () => FramerExporter,
  deriveOutputName: () => deriveOutputName
});
import fs5 from "fs/promises";
import path6 from "path";
import chalk5 from "chalk";
function deriveOutputName(url, platformName) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    let siteName;
    if (hostname.endsWith(".webflow.io")) {
      siteName = hostname.replace(".webflow.io", "");
    } else if (hostname.includes(".wixsite.com")) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      siteName = parts[0] || hostname.split(".")[0];
    } else if (hostname.match(/\.framer\.(app|website|ai)$/)) {
      siteName = hostname.split(".framer.")[0];
    } else {
      siteName = hostname.replace(/\./g, "-");
    }
    const cleanName = siteName.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "site";
    return `${platformName}-${cleanName}-${randomOutputSuffix()}`;
  } catch {
    return `framer-export-output-${randomOutputSuffix()}`;
  }
}
function randomOutputSuffix() {
  const adjectives = ["clean", "bright", "swift", "sharp", "fresh", "solid", "tidy", "prime"];
  const nouns = ["mirror", "export", "site", "build", "copy", "page", "stack", "bundle"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const id = Math.random().toString(36).slice(2, 6);
  return `${adjective}-${noun}-${id}`;
}
var FramerExporter;
var init_exporter = __esm({
  "src/exporter/index.ts"() {
    "use strict";
    init_asset_map();
    init_download();
    init_logger();
    init_capture();
    init_download2();
    init_output();
    init_summary();
    init_prompt_assistant();
    init_platforms();
    init_cooking();
    init_theme();
    FramerExporter = class {
      siteUrl;
      outDir;
      assets;
      browser;
      page;
      ssrHTML;
      prettyPrint;
      platform;
      cooking;
      constructor(siteUrl, outDir, platformOverride) {
        this.siteUrl = siteUrl;
        this.outDir = outDir;
        this.assets = new AssetMap();
        this.browser = null;
        this.page = null;
        this.ssrHTML = "";
        this.prettyPrint = true;
        if (platformOverride && platformOverride !== "unknown") {
          this.platform = getPlatformByName(platformOverride);
        } else {
          this.platform = detectPlatform(siteUrl);
        }
      }
      async run(includeSubpages = false) {
        console.log(
          `
  ${ui.text.bold("Framer Export")} ${chip("mirror")} ${ui.muted("v4 pipeline")}
`
        );
        info("Source   : " + chalk5.underline(this.siteUrl));
        info("Output   : " + ui.primary(this.outDir));
        info("Platform : " + ui.primary(this.platform.displayName));
        if (includeSubpages) {
          info("Subpages : " + ui.success("enabled"));
        }
        console.log("");
        this.cooking = new CookingSpinner();
        setCooking(this.cooking);
        this.cooking.start("Preparing directories...");
        for (const d of [
          "",
          "assets/images",
          "assets/fonts",
          "assets/videos",
          "assets/misc",
          "styles",
          "scripts/vendor",
          "scripts/modules",
          "data",
          "subpages"
        ]) {
          await fs5.mkdir(path6.join(this.outDir, d), { recursive: true });
        }
        log("Output directory structure created");
        this.cooking.update("Fetching SSR HTML...");
        log("Fetching SSR HTML from " + this.siteUrl);
        try {
          const buf = await dlBuffer(this.siteUrl);
          this.ssrHTML = buf.toString("utf-8");
          success("SSR HTML fetched (" + (this.ssrHTML.length / 1024).toFixed(1) + " KB)");
        } catch (e) {
          log(chalk5.red("Could not fetch SSR HTML: " + e.message));
        }
        const htmlDetected = detectPlatform(this.siteUrl, this.ssrHTML);
        if (htmlDetected.name !== this.platform.name) {
          this.platform = htmlDetected;
          log("Platform refined: " + ui.primary(this.platform.displayName) + " (from HTML analysis)");
        }
        await launchAndCapture(this);
        if (includeSubpages && this.page) {
          await this.crawlSubpages();
        }
        await closeBrowser(this);
        this.cooking.update("Downloading assets...");
        await downloadAll(this);
        this.cooking.update("Building output...");
        await buildOutput(this);
        this.cooking.stop();
        setCooking(null);
        console.log("");
        success("Export complete!");
        await printSummary(this);
        await runAiPromptAssistant(this);
      }
      async crawlSubpages() {
        this.cooking?.update("Discovering sub-pages...");
        log("Scanning page for internal links...");
        const page = this.page;
        const baseUrl = new URL(this.siteUrl);
        const baseHost = baseUrl.hostname.replace(/^www\./, "");
        const links = await page.evaluate((host) => {
          const anchors = Array.from(document.querySelectorAll("a[href]"));
          const hrefs = /* @__PURE__ */ new Set();
          for (const a of anchors) {
            const href = a.href;
            if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#"))
              continue;
            try {
              const u = new URL(href);
              const h = u.hostname.replace(/^www\./, "");
              if (h === host && u.pathname !== "/" && u.pathname !== "" && !u.pathname.startsWith("/#")) {
                hrefs.add(href.split("#")[0]);
              }
            } catch {
            }
          }
          return Array.from(hrefs);
        }, baseHost);
        log("Found " + links.length + " sub-page links");
        const uniqueLinks = [...new Set(links)].slice(0, 50);
        if (uniqueLinks.length === 0) {
          log("No sub-pages to crawl");
          return;
        }
        for (let i = 0; i < uniqueLinks.length; i++) {
          const link = uniqueLinks[i];
          this.cooking?.update("Crawling sub-page " + (i + 1) + "/" + uniqueLinks.length);
          try {
            const html = await captureSubpage(page, link, {
              needsHydrationCheck: this.platform.needsHydrationCheck,
              hydrationTimeout: this.platform.hydrationTimeout
            });
            const slug = this.deriveSlug(link, baseUrl);
            const filename = slug + ".html";
            const filepath = path6.join(this.outDir, "subpages", filename);
            await fs5.writeFile(filepath, html, "utf-8");
            log("  Saved: subpages/" + filename);
          } catch (e) {
            log("  Skipped " + link + ": " + e.message);
          }
        }
        success("Sub-pages crawled: " + uniqueLinks.length);
      }
      deriveSlug(link, baseUrl) {
        try {
          const u = new URL(link);
          let pathname = u.pathname.replace(/\/+$/, "").replace(/^\//, "");
          if (!pathname) return "index";
          return pathname.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_") || "page";
        } catch {
          return "page";
        }
      }
    };
  }
});

// src/cli/setup.ts
var setup_exports = {};
__export(setup_exports, {
  runSetup: () => runSetup
});
import readline2 from "readline/promises";
import { stdin as stdin3, stdout as stdout3 } from "process";
import path7 from "path";
import { URL as URL4 } from "url";
import chalk6 from "chalk";
function drawHeader(title) {
  const w = maxWidth();
  if (w < 50) {
    console.log(`
  ${bullet("\u25CF")} ${ui.text.bold(title)}`);
    return;
  }
  console.log(boxTop(w));
  console.log(boxLine(w, ui.text.bold("  " + title)));
  console.log(boxBot(w));
  console.log("");
}
async function runSetup(legacyMode = false) {
  showBanner();
  console.log(`  ${ui.text.bold("Framer Export setup")} ${chip("interactive")}`);
  console.log(
    `  ${ui.muted("Export Framer, Webflow, and Wix sites into a clean local mirror.")}
`
  );
  const rl = legacyMode ? readline2.createInterface({ input: stdin3, output: stdout3 }) : null;
  const ask = async (question, defaultVal, headerLines = []) => {
    if (!legacyMode) {
      return promptInput(question, defaultVal || "", { headerLines });
    }
    const suffix = defaultVal ? chalk6.gray(` (${defaultVal})`) : "";
    const prompt = `  ${ui.primary("\u25CF")} ${ui.text.bold(question)}${suffix} ${ui.muted(">")} `;
    const answer = await rl.question(prompt);
    return answer.trim() || defaultVal || "";
  };
  if (legacyMode) drawHeader("Step 1 : Site URL");
  let siteUrl = "";
  let urlError = "";
  while (!siteUrl) {
    const input = await ask(
      "Enter the site URL",
      "",
      ["Step 1 : Site URL", urlError].filter(Boolean)
    );
    try {
      new URL4(input);
      siteUrl = input;
      urlError = "";
    } catch {
      urlError = "Invalid URL. Enter a valid URL (https://...)";
      if (legacyMode) {
        console.log(`  ${ui.error("\u2717")} ${ui.error(urlError)}
`);
      }
    }
  }
  if (legacyMode) {
    console.log(`  ${ui.success("\u2713")} ${ui.success("URL:")} ${chalk6.underline(siteUrl)}
`);
  }
  let platformName = null;
  if (legacyMode) {
    drawHeader("Step 2 : Platform");
    const detected = detectPlatform(siteUrl);
    console.log(`  ${ui.info("i")} Auto-detected: ${ui.primary(detected.displayName)}`);
    const platformInput = await ask("Platform (framer/webflow/wix)", detected.name);
    platformName = ["framer", "webflow", "wix"].includes(platformInput) ? platformInput : detected.name;
    console.log(`  ${ui.success("\u2713")} ${ui.success("Platform:")} ${ui.primary(platformName)}
`);
  } else {
    while (!platformName) {
      const detected = detectPlatform(siteUrl);
      const platforms = [
        {
          label: `Framer${detected.name === "framer" ? chalk6.gray(" (detected)") : ""}`,
          value: "framer"
        },
        {
          label: `Webflow${detected.name === "webflow" ? chalk6.gray(" (detected)") : ""}`,
          value: "webflow"
        },
        { label: `Wix${detected.name === "wix" ? chalk6.gray(" (detected)") : ""}`, value: "wix" }
      ];
      const defaultIdx = ["framer", "webflow", "wix"].indexOf(detected.name);
      const platformChoice = await select("Select platform", platforms, Math.max(0, defaultIdx), {
        headerLines: [`URL: ${siteUrl}`],
        actions: [{ label: "Modify URL", value: "modify-url" }],
        footer: "tab focus button  \xB7  mouse hover/click  \xB7  enter select"
      });
      if (platformChoice === "modify-url") {
        siteUrl = "";
        urlError = "";
        while (!siteUrl) {
          const input = await ask(
            "Modify site URL",
            "",
            ["Step 1 : Site URL", urlError].filter(Boolean)
          );
          try {
            new URL4(input);
            siteUrl = input;
            urlError = "";
          } catch {
            urlError = "Invalid URL. Enter a valid URL (https://...)";
          }
        }
        continue;
      }
      platformName = platformChoice;
    }
  }
  if (!platformName) {
    throw new Error("Platform selection failed");
  }
  const rl2 = legacyMode ? rl : null;
  const ask2 = async (question, defaultVal, headerLines = []) => {
    if (!legacyMode) {
      return promptInput(question, defaultVal || "", { headerLines });
    }
    const suffix = defaultVal ? chalk6.gray(` (${defaultVal})`) : "";
    const prompt = `  ${ui.primary("\u25CF")} ${ui.text.bold(question)}${suffix} ${ui.muted(">")} `;
    const answer = await rl2.question(prompt);
    return answer.trim() || defaultVal || "";
  };
  const derivedName = deriveOutputName(siteUrl, platformName);
  if (legacyMode) drawHeader("Step 3 : Output Directory");
  const outDir = await ask2("Output directory", "./" + derivedName, [
    "Step 3 : Output Directory",
    `URL: ${siteUrl}`,
    `Platform: ${platformName}`
  ]);
  if (legacyMode) {
    console.log(`  ${ui.success("\u2713")} ${ui.success("Output:")} ${ui.primary(outDir)}
`);
  }
  if (legacyMode) drawHeader("Step 4 : Options");
  let prettyPrint;
  let concurrency;
  let includeSubpages;
  if (legacyMode) {
    const prettyAnswer = await ask2("Pretty-print JS files? (y/n)", "y");
    prettyPrint = prettyAnswer.toLowerCase().startsWith("y");
    console.log(
      `  ${ui.success("\u2713")} Pretty-print: ${prettyPrint ? ui.success("yes") : ui.error("no")}
`
    );
    const subpagesAnswer = await ask2("Export sub-pages? (y/n)", "n");
    includeSubpages = subpagesAnswer.toLowerCase().startsWith("y");
    console.log(
      `  ${ui.success("\u2713")} Sub-pages: ${includeSubpages ? ui.success("yes") : ui.error("no")}
`
    );
    const concurrencyAnswer = await ask2("Download concurrency", "12");
    concurrency = parseInt(concurrencyAnswer, 10) || 12;
    console.log(`  ${ui.success("\u2713")} Concurrency: ${ui.primary(String(concurrency))}
`);
  } else {
    const prettyVal = await select("Pretty-print JS files?", [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" }
    ]);
    prettyPrint = prettyVal === "yes";
    const subpagesVal = await select(
      "Export sub-pages?",
      [
        { label: "No", value: "no" },
        { label: "Yes, crawl and export", value: "yes" }
      ],
      0
    );
    includeSubpages = subpagesVal === "yes";
    const concurrencyVal = await select(
      "Download concurrency",
      [
        { label: "6 (slow connection)", value: "6" },
        { label: "12 (default)", value: "12" },
        { label: "20 (fast connection)", value: "20" }
      ],
      1
    );
    concurrency = parseInt(concurrencyVal, 10);
  }
  const w = maxWidth();
  const isSmall = w < 50;
  console.log("");
  if (!isSmall) {
    console.log(boxTop(w));
    console.log(boxLine(w, ui.text.bold("  Summary")));
    console.log(boxSep(w));
  } else {
    console.log(ui.text.bold("  Summary:"));
  }
  for (const [label, value] of [
    ["URL", siteUrl],
    ["Platform", platformName],
    ["Output", path7.resolve(outDir)],
    ["Pretty-print", prettyPrint ? "yes" : "no"],
    ["Sub-pages", includeSubpages ? "yes" : "no"],
    ["Concurrency", String(concurrency)]
  ]) {
    console.log(boxRow(w, label, value));
  }
  if (!isSmall) {
    console.log(boxBot(w));
  }
  console.log("");
  let startExport;
  if (legacyMode) {
    const confirm = await ask2("Start export? (y/n)", "y");
    startExport = confirm.toLowerCase().startsWith("y");
    rl2.close();
  } else {
    const confirmVal = await select("Start export?", [
      { label: "Yes, start now", value: "yes" },
      { label: "Cancel", value: "no" }
    ]);
    startExport = confirmVal === "yes";
  }
  if (!startExport) {
    console.log(`
  ${ui.warning("Export cancelled.")}
`);
    return;
  }
  console.log("");
  const { CFG: CFG2 } = await Promise.resolve().then(() => (init_config(), config_exports));
  CFG2.concurrency = concurrency;
  const exporter = new FramerExporter(siteUrl, path7.resolve(outDir), platformName);
  exporter.prettyPrint = prettyPrint;
  await exporter.run(includeSubpages);
}
var init_setup = __esm({
  "src/cli/setup.ts"() {
    "use strict";
    init_banner();
    init_exporter();
    init_platforms();
    init_select();
    init_box();
    init_theme();
  }
});

// src/cli/index.ts
init_package();
import path8 from "path";
import { URL as URL5 } from "url";
import { spawnSync } from "child_process";

// src/cli/help.ts
init_banner();
init_theme();
function showHelp() {
  showBanner();
  console.log(`${ui.text.bold("  USAGE")} ${chip("cli")}
`);
  console.log(
    `    ${ui.primary("framer-export")} ${ui.warning("<url>")} ${ui.muted("[output-dir]")}`
  );
  console.log(
    `    ${ui.primary("fexport")}         ${ui.warning("<url>")} ${ui.muted("[output-dir]")}`
  );
  console.log("");
  console.log(ui.text.bold("  OPTIONS\n"));
  const opts = [
    ["--setup", "Launch the interactive setup assistant"],
    ["--platform <p>", "Force platform: framer, webflow, wix"],
    ["--subpages", "Crawl and export sub-pages"],
    ["--legacy-mode", "Use text input instead of arrow selection"],
    ["--help, -h", "Show this help message"]
  ];
  for (const [flag, desc] of opts) {
    console.log(`    ${ui.success(flag.padEnd(18))} ${ui.text(desc)}`);
  }
  console.log("");
  console.log(ui.text.bold("  SUPPORTED PLATFORMS\n"));
  const platforms = [
    ["Framer", "Auto-detected via .framer.app / .framer.website URLs"],
    ["Webflow", "Auto-detected via .webflow.io URLs"],
    ["Wix", "Auto-detected via .wixsite.com URLs + HTML analysis"]
  ];
  for (const [name, desc] of platforms) {
    console.log(`    ${ui.primary(name.padEnd(12))} ${ui.muted(desc)}`);
  }
  console.log("");
  console.log(ui.text.bold("  EXAMPLES\n"));
  console.log(
    `    ${ui.muted("$")} ${ui.primary("framer-export")} ${ui.warning("https://mysite.framer.app")}`
  );
  console.log(
    `    ${ui.muted("$")} ${ui.primary("framer-export")} ${ui.warning("https://mysite.webflow.io")}`
  );
  console.log(
    `    ${ui.muted("$")} ${ui.primary("framer-export")} ${ui.warning("https://user.wixsite.com/my-site")}`
  );
  console.log(
    `    ${ui.muted("$")} ${ui.primary("framer-export")} ${ui.success("--platform webflow")} ${ui.warning("https://custom.com")}`
  );
  console.log(
    `    ${ui.muted("$")} ${ui.primary("framer-export")} ${ui.success("--subpages")} ${ui.warning("https://mysite.com")}`
  );
  console.log(`    ${ui.muted("$")} ${ui.primary("framer-export")} ${ui.success("--setup")}`);
  console.log(
    `    ${ui.muted("$")} ${ui.primary("framer-export")} ${ui.success("--setup --legacy-mode")}`
  );
  console.log("");
}

// src/cli/index.ts
init_banner();
init_cooking();

// src/cli/update-check.ts
import https from "https";
async function checkForUpdates(currentVersion) {
  return new Promise((resolve) => {
    const req = https.get(
      "https://registry.npmjs.org/framer-export/latest",
      { timeout: 3e3 },
      (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const latest = json.version;
            if (!latest) return resolve(null);
            if (isNewerVersion(latest, currentVersion)) return resolve(latest);
            resolve(null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}
function isNewerVersion(latest, current) {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] ?? 0;
    const currentPart = currentParts[i] ?? 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  return false;
}
function parseVersion(version) {
  return version.replace(/^v/, "").split(/[.-]/).map((part) => Number.parseInt(part, 10)).filter((part) => Number.isFinite(part));
}

// src/cli/index.ts
init_select();
init_theme();
var VERSION = package_default.version;
function extractFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  const value = args[idx + 1];
  args.splice(idx, 2);
  return value;
}
function hasFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}
async function showUpdateNotice() {
  const latest = await checkForUpdates(VERSION);
  if (!latest) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("");
    console.log(
      `  ${ui.warning("\u21B3")} Update available: ${ui.muted(VERSION)} -> ${ui.success(latest)}`
    );
    console.log(`  ${ui.primary("  Run:")} ${ui.primarySoft("npm i -g framer-export@latest")}`);
    console.log("");
    return;
  }
  const action = await select(
    "Update available",
    [
      { label: "Continue without updating", value: "continue" },
      { label: "Update now", value: "update" }
    ],
    0,
    {
      headerLines: [
        `Current version: ${VERSION}`,
        `Latest version:  ${latest}`,
        "You can continue now and update later."
      ],
      footer: "enter continue  \xB7  mouse hover/click"
    }
  );
  if (action === "update") {
    console.log(
      `  ${ui.primary("Updating:")} ${ui.primarySoft("npm i -g framer-export@latest")}
`
    );
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(npmCommand, ["i", "-g", "framer-export@latest"], {
      stdio: "inherit"
    });
    if (result.status === 0) {
      console.log(`
  ${ui.success("\u2713")} Updated. Re-run your command to use the new version.
`);
      process.exit(0);
    }
    console.log(
      `
  ${ui.error("\u2717")} Update failed. Run manually: ${ui.primarySoft("npm i -g framer-export@latest")}
`
    );
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--version") || args.includes("-v")) {
    console.log(VERSION);
    process.exit(0);
  }
  if (args.includes("--about")) {
    const chalk7 = (await import("chalk")).default;
    showBanner();
    console.log(`  ${ui.text.bold("Framer Export")}  ${ui.muted(`v${package_default.version}`)}`);
    console.log(`  ${ui.text(package_default.description)}
`);
    console.log(`  ${ui.text.bold("Author")}     ${ui.primary("Dany (danbenba)")}`);
    console.log(
      `  ${ui.text.bold("Portfolio")}  ${chalk7.underline.hex("#FAB283")("https://github.com/danbenba")}`
    );
    console.log(
      `  ${ui.text.bold("GitHub")}     ${chalk7.underline.hex("#FAB283")(package_default.repository.url.replace("git+", "").replace(".git", ""))}`
    );
    console.log(
      `  ${ui.text.bold("npm")}        ${chalk7.underline.hex("#FAB283")(`https://www.npmjs.com/package/${package_default.name}`)}`
    );
    console.log(`  ${ui.text.bold("License")}    ${ui.success(package_default.license)}`);
    console.log(`  ${ui.text.bold("Node")}       ${ui.muted(`>=${package_default.engines.node}`)}`);
    console.log("");
    process.exit(0);
  }
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }
  await showLoadingIntro(VERSION);
  await showUpdateNotice();
  if (args.includes("--setup")) {
    hasFlag(args, "--setup");
    const legacyMode = hasFlag(args, "--legacy-mode");
    const { runSetup: runSetup2 } = await Promise.resolve().then(() => (init_setup(), setup_exports));
    await runSetup2(legacyMode);
    return;
  }
  if (!args.length) {
    const { runSetup: runSetup2 } = await Promise.resolve().then(() => (init_setup(), setup_exports));
    await runSetup2(false);
    return;
  }
  const platformOverride = extractFlag(args, "--platform");
  const includeSubpages = hasFlag(args, "--subpages");
  showBanner();
  const url = args[0];
  try {
    new URL5(url);
  } catch {
    console.log(`  ${ui.error("\u2717")} ${ui.error.bold("Invalid URL:")} ${ui.text(url)}`);
    console.log(`  ${ui.muted("Expected: https://yoursite.framer.app")}
`);
    process.exit(1);
  }
  const { FramerExporter: FramerExporter2, deriveOutputName: deriveOutputName2 } = await Promise.resolve().then(() => (init_exporter(), exporter_exports));
  const { detectPlatform: detectPlatform2 } = await Promise.resolve().then(() => (init_platforms(), platforms_exports));
  const detected = platformOverride || detectPlatform2(url).name;
  const defaultDir = deriveOutputName2(url, detected);
  const out = args[1] || `./${defaultDir}`;
  try {
    await new FramerExporter2(url, path8.resolve(out), platformOverride || void 0).run(
      includeSubpages
    );
  } catch (e) {
    const chalk7 = (await import("chalk")).default;
    console.log(
      `
  ${ui.error("\u2717")} ${ui.error.bold("FAILED:")} ${ui.text(e.message)}`
    );
    console.log(chalk7.gray(e.stack || ""));
    process.exit(1);
  }
}
main();
//# sourceMappingURL=index.js.map