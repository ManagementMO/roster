import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DENSE_ADM_ZIP_TARBALL } from "./dense.js";
import { readRegularFileNoFollow } from "./safeFile.js";

interface ZipEntry {
  entryName: string;
}

interface Archive {
  addFile(name: string, bytes: Buffer): void;
  getEntry(name: string): ZipEntry;
  toBuffer(): Buffer;
  extractAllTo(target: string, overwrite: boolean): void;
  extractEntryTo(entry: ZipEntry, target: string, maintainPath: boolean, overwrite: boolean): void;
  extractAllToAsync(target: string, overwrite: boolean, keepPermissions: boolean, cb: (error?: Error) => void): void;
}

// Exercise the package actually selected through ONNX, not a separately added
// direct dependency that could conceal a vulnerable copy in the shipped graph.
const coachRequire = createRequire(fileURLToPath(new URL("../../coach/package.json", import.meta.url)));
const transformersRequire = createRequire(coachRequire.resolve("@huggingface/transformers"));
const onnxRequire = createRequire(transformersRequire.resolve("onnxruntime-node"));
const Zip = onnxRequire("adm-zip") as new (bytes?: Buffer) => Archive;

const modes = ["all", "entry", "onnx-flat-entry", "async"] as const;
type Mode = (typeof modes)[number];

async function extract(zip: Archive, mode: Mode, target: string, entry: string): Promise<void> {
  if (mode === "all") zip.extractAllTo(target, true);
  else if (mode === "async") {
    await new Promise<void>((resolve, reject) => {
      zip.extractAllToAsync(target, true, false, (error) => error ? reject(error) : resolve());
    });
  } else {
    // onnxruntime-node/script/install-utils.js flattens selected archive entries.
    zip.extractEntryTo(zip.getEntry(entry), target, mode !== "onnx-flat-entry", true);
  }
}

let base: string;
beforeEach(() => {
  // Resolve macOS's /var alias before testing attacker-controlled symlinks.
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "roster-zip-")));
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

it("keeps the workspace and separately installed semantic runtime on the same patch", () => {
  const config = parse(fs.readFileSync(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8"));
  const commit = DENSE_ADM_ZIP_TARBALL.split("/").at(-1);
  expect(config.overrides["adm-zip"]).toBe(`file:vendor/adm-zip-${commit}.tgz`);
  const archive = fs.readFileSync(new URL(`../../../vendor/adm-zip-${commit}.tgz`, import.meta.url));
  expect(createHash("sha256").update(archive).digest("hex")).toBe(
    "9887a4a56101700a4333e9b842c5b0287c2f0518ca926df87e5588505c598efe",
  );
});

describe.each(modes)("ZIP extraction through ONNX: %s", (mode) => {
  it("extracts a real archive, creates directories, and overwrites ordinary files", async () => {
    const source = new Zip();
    const entry = "native/nested/payload.txt";
    source.addFile(entry, Buffer.from("first"));
    const target = path.join(base, "new-target");
    await extract(new Zip(source.toBuffer()), mode, target, entry);
    const file = path.join(target, mode === "onnx-flat-entry" ? "payload.txt" : entry);
    expect(fs.readFileSync(file, "utf8")).toBe("first");
    source.addFile(entry, Buffer.from("replacement"));
    await extract(new Zip(source.toBuffer()), mode, target, entry);
    expect(fs.readFileSync(file, "utf8")).toBe("replacement");
  });

  it.each(["leaf", "parent", "root", "dangling-leaf"] as const)(
    "blocks a %s symlink without writing or chmodding outside the destination",
    async (attack) => {
      const outside = path.join(base, "outside");
      fs.mkdirSync(outside);
      const sentinel = path.join(outside, "payload.txt");
      const sentinelFd = fs.openSync(sentinel, "wx", 0o640);
      let beforeMode: number;
      try {
        fs.writeFileSync(sentinelFd, "original");
        beforeMode = fs.fstatSync(sentinelFd).mode;
      } finally {
        fs.closeSync(sentinelFd);
      }
      const target = path.join(base, "target");
      const directoryLink = process.platform === "win32" ? "junction" : "dir";
      if (attack === "root") fs.symlinkSync(outside, target, directoryLink);
      else fs.mkdirSync(target);
      let destination = target;
      let entry = "payload.txt";
      if (attack === "parent") {
        fs.symlinkSync(outside, path.join(target, "nested"), directoryLink);
        if (mode === "onnx-flat-entry") destination = path.join(target, "nested", "deeper");
        else entry = "nested/payload.txt";
      } else if (attack === "leaf" || attack === "dangling-leaf") {
        fs.symlinkSync(
          attack === "leaf" ? sentinel : path.join(outside, "not-created.txt"),
          path.join(target, "payload.txt"),
          "file",
        );
      }
      const source = new Zip();
      source.addFile(entry, Buffer.from("replacement"));
      await expect(extract(new Zip(source.toBuffer()), mode, destination, entry)).rejects.toThrow();
      expect(readRegularFileNoFollow(sentinel).toString("utf8")).toBe("original");
      expect(fs.statSync(sentinel).mode).toBe(beforeMode);
      expect(fs.existsSync(path.join(outside, "not-created.txt"))).toBe(false);
      expect(fs.existsSync(path.join(outside, "deeper"))).toBe(false);
    },
  );
});
