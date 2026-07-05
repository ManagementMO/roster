// EXACT regex copied from trust.ts:49 (destructive-command)
const re = /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)[a-z]*\s+[~/]/i;

function measure(makeInput, label) {
  console.log(`\n== ${label} ==`);
  let prev = null;
  for (const n of [10000, 20000, 40000, 80000]) {
    const text = makeInput(n);
    const t0 = process.hrtime.bigint();
    const r = re.test(text);
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - t0) / 1e6;
    const ratio = prev ? (ms / prev).toFixed(2) + "x" : "-";
    console.log(`n=${n}  ${ms.toFixed(1)}ms  match=${r}  ratio=${ratio}`);
    prev = ms;
  }
}

// All-r run after "rm -" (has r, no f) — the quadratic trigger for alt A
measure((n) => "rm -" + "r".repeat(n), "rm -  + r*n  (r present, no f)");

// Plain letters, no r no f
measure((n) => "rm -" + "a".repeat(n), "rm -  + a*n  (no r, no f)");

// Real 256KB cap extrapolation on the worst case
const N = 256 * 1024;
const big = "rm -" + "r".repeat(N);
const t0 = process.hrtime.bigint();
const r = re.test(big);
const t1 = process.hrtime.bigint();
console.log(`\n== 256KB cap (real MAX_SCRIPT_BYTES) ==`);
console.log(`n=${N}  ${(Number(t1 - t0) / 1e6).toFixed(1)}ms  match=${r}`);
