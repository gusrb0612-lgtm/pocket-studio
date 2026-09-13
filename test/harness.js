'use strict';
/* 아주 작은 테스트 도구. 프레임워크를 안 쓰는 이유는 이 프로젝트에 npm 이 없기 때문이다. */

let pass = 0, fail = 0;

function is(label, got, want, tol = 1e-6) {
  const ok = typeof want === 'number'
    ? Math.abs(got - want) <= tol
    : JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label} = ${JSON.stringify(got)}`); }
  else    { fail++; console.log(`  FAIL ${label}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); }
}

function ok(label, cond) {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else      { fail++; console.log(`  FAIL ${label}`); }
}

function section(t) { console.log('\n' + t); }

function report() {
  console.log(`\n${pass}건 통과, ${fail}건 실패`);
  if (fail) process.exitCode = 1;
  return fail;
}

module.exports = { is, ok, section, report };
