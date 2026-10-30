#!/usr/bin/env node
// Records how V8 parses date strings and does local-time Date arithmetic, for
// the Rust port of analyticsRoutes.js's getDateRange (rust/crates/api/src/js_date.rs).
// Runs itself once per fixed-offset zone (UTC and Etc/GMT+7 = UTC-07:00), so
// the Rust test can replay it with a fixed offset.
//
//   node backend/scripts/gen-js-date-fixtures.js
//   → rust/crates/api/fixtures/js_date.json
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ZONES = { UTC: 0, 'Etc/GMT+7': -7 * 3600 * 1000 };

const STRINGS = [
  // ES ISO forms
  '2026-01-01', '2026-01', '2026', '+002026-01-01', '-000001-01-01', '-000000-01-01', '+010000-01-01',
  '+275760-09-13', '+275760-09-14', '-271821-04-20', '-271821-04-19',
  '2026-01-01T10:00', '2026-01-01T10:00:30', '2026-01-01T10:00:30.5', '2026-01-01T10:00:30.123456',
  '2026-01-01T10:00:30.1234567891234', '2026-01-01T10:00:30.0001234567891',
  '2026-01-01T10:00Z', '2026-01-01T10:00:30.123Z', '2026-01-01T10:00+05:30', '2026-01-01T10:00-0800',
  '2026-01-01T24:00', '2026-01-01T24:00:00.000Z', '2026-01-01T24:01', '2026-01-01T25:00', '2026-01-01T10:60',
  '2026-01-01t10:00', '2026-01-01T10:00z', '2026-01-01T10:00ZZ', '2026-01-01T10', '2026-01-01T1:00',
  '2026-02-29', '2026-02-31', '2026-04-31', '2024-02-29', '2026-00-10', '2026-13-01', '2026-01-00', '2026-01-32',
  '2026-1-5', '2026-01-5', '0049-01-01', '0049-01-01 10:00', '0000-01-01', '9999-12-31T23:59:59.999Z',
  // legacy forms
  '2026-01-01 10:00', '2026-01-01 10:00:00', '2026-01-01 10:00:00.123', '2026-01-01 10:00:00 +0530',
  '2026-01-01 10:00 GMT', '2026-01-01 10:00 UTC+2', '2026-01-01 10:00 PST', '2026-01-01 10:00 pdt',
  '2026/01/15', '01/15/2026', '1/2/26', '1/2/49', '1/2/50', '1/2/99', '1/2/100', '15/01/2026', '1.2.2026',
  'Jan 15 2026', 'January 15, 2026', '15 Jan 2026', '2026 Jan 15', 'Jan 5', '5', 'Thu, 01 Jan 2026 00:00:00 GMT',
  'Thu Jan 01 2026 10:00:00 GMT-0800 (Pacific Standard Time)', 'Jan 1 2026 10:00 am', 'Jan 1 2026 10:00 pm',
  'Jan 1 2026 12:00 am', 'Jan 1 2026 12:30 PM', 'Jan 1 2026 13:00 pm', 'Jan 1 2026 10 pm', 'Jan 1 2026 10:00:00 +01:00',
  'Jan 1 2026 10:00 GMT+1', 'Jan 1 2026 10:00 GMT-12345', 'Jan 1 2026 10:00 +', 'Jan 1 2026 10::', 'Jan 1 2026 10:00.5',
  'Jan 1 2026 10:00:00.5', 'Jan 1 2026 10.30', 'Jan 1 2026 Z', 'Jan 1 2026 10:00 Z', 'Jan 1 2026 10:00Z',
  'Jan 1 2026 10:00 z', 'Jan 1 2026 10:00 t', 'Jan 1 2026 10:00 foo', 'foo Jan 1 2026', 'foo1 Jan 1 2026',
  'Jan 1 2026 (comment) 10:00', 'Jan 1 2026 ((nested) x) 10:00', 'Jan 1 2026 (unclosed 10:00', 'Jan 1 2026 )',
  ') Jan 1 2026', '- Jan 1 2026', 'Jan 1 2026 -', 'Janu 1 2026', 'Ja 1 2026', 'Decembre 25 2026', 'jAN 1 2026',
  'Jan 1 2026 10:00:00:00', '1 2 3 4', '2026-01-01-02', '2026 01 01', '20260101', '2026-0101', '12:00',
  'Jan 1 2026 24:00', 'Jan 1 2026 24:00:01', 'Jan 1 2026 10:00 PST+2', 'Jan 1 2026 UT', 'Jan 1 2026 10:00 UT',
  'Jan 1 2026 10:00 utc', 'Jan 1 2026 10:00 utcx', 'Jan 1 2026 10:00 EST', 'Jan 1 2026 10:00 CDT', 'Jan 1 2026 10:00 MST',
  '000000000002026-01-01', '2026-01-01 10:00', '2026-01-01\n10:00', '2026-01-01 10:00', '2026-01-01\u000010:00',
  'Jan 1 2026 10:00é', 'é Jan 1 2026', 'Jan 1 1234567890123', '1234567890123', 'Jan 32 2026', 'Feb 30 2026',
  '2026-01-01T10:00:00+24:00', '2026-01-01T10:00:00+23:59', '2026-01-01T10:00:00+1260', '2026-01-01T10:00:00+05',
  ' 2026-01-01', '2026-01-01 ', 'garbage', '', '[object Object]', ',', '2026-01-01,2026-02-01', 'null', 'undefined',
  'Sat, 30 Oct 2027 14:00:00', 'Oct 30 2027 14:00:00 GMT+0000', '10/30/2027 14:00', 'Tue Mar 01 2022',
  '+2026-01-01', '+02026-01-01', '2026-01-01T10:00:00.Z', '2026-01-01T10:00:00.', '2026-01-01T',
];

function iso(t) {
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function record() {
  const parse = STRINGS.map((s) => { const t = new Date(s).getTime(); return Number.isNaN(t) ? null : t; });
  const base = [
    Date.UTC(2026, 9, 30, 14, 32, 27, 99), Date.UTC(2026, 2, 31, 5, 0, 0, 1), Date.UTC(2026, 0, 31, 23, 30),
    Date.UTC(2024, 1, 29, 12), Date.UTC(2026, 0, 1, 3), Date.UTC(2025, 11, 31, 22, 59, 59, 999), Date.UTC(2026, 6, 1, 6),
    8.64e15, -8.64e15, 8.64e15 - 1, Date.UTC(0, 0, 1) - 1, -62198755200000, 253402300800000, 0, -1, NaN,
  ];
  const times = base.map((t) => {
    const d = () => new Date(t);
    const op = (f) => { const x = d(); const r = f(x); return Number.isNaN(r) ? null : r; };
    return {
      t: Number.isNaN(t) ? null : t,
      iso: iso(t),
      fields: Number.isNaN(t) ? null : (() => { const x = d(); return [x.getFullYear(), x.getMonth(), x.getDate(), x.getHours(), x.getMinutes(), x.getSeconds(), x.getMilliseconds(), x.getDay()]; })(),
      startOfDay: op((x) => x.setHours(0, 0, 0, 0)),
      endOfDay: op((x) => x.setHours(23, 59, 59, 999)),
      minus1Day: op((x) => x.setDate(x.getDate() - 1)),
      minus7Days: op((x) => x.setDate(x.getDate() - 7)),
      minus30Days: op((x) => x.setDate(x.getDate() - 30)),
      minus1Month: op((x) => x.setMonth(x.getMonth() - 1)),
      minus1Year: op((x) => x.setFullYear(x.getFullYear() - 1)),
      firstOfMonth: [1, 12, 24].map((n) => { const x = d(); const r = new Date(x.getFullYear(), x.getMonth() - (n - 1), 1).getTime(); return Number.isNaN(r) ? null : r; }),
    };
  });
  return { parse, times };
}

if (process.argv[2] === '--zone') {
  process.stdout.write(JSON.stringify(record()));
} else {
  const zones = {};
  for (const [tz, offset] of Object.entries(ZONES)) {
    const out = execFileSync(process.execPath, [__filename, '--zone'], { env: { ...process.env, TZ: tz } });
    zones[tz] = { offset_ms: offset, ...JSON.parse(String(out)) };
  }
  const file = path.join(__dirname, '..', '..', 'rust', 'crates', 'api', 'fixtures', 'js_date.json');
  fs.writeFileSync(file, JSON.stringify({ strings: STRINGS, zones }, null, 1) + '\n');
  console.log(`wrote ${file}`);
}
