import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";

export async function ask(label: string, secret = false): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Setup needs an interactive terminal. Open a terminal and run bun run setup; see docs/SETUP.md for manual setup.");
  }
  if (!secret) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try { return (await rl.question(`${label}: `)).trim(); }
    finally { rl.close(); }
  }
  process.stdout.write(`${label} (hidden): `);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean; meta?: boolean }) => {
      if (key.ctrl && (key.name === "c" || key.name === "d")) { finish(); reject(new Error("Setup cancelled; saved progress is safe.")); }
      else if (key.name === "return" || key.name === "enter") { finish(); resolve(value); }
      else if (key.name === "backspace") value = [...value].slice(0, -1).join("");
      else if (key.ctrl && key.name === "u") value = "";
      else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    };
    process.stdin.on("keypress", onKey);
  });
}

export async function confirm(label: string): Promise<boolean> {
  return /^y(es)?$/i.test(await ask(`${label} [y/N]`));
}
