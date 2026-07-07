#!/usr/bin/env node
/**
 * batch_spells.mjs — parse a 5etools-style spell CSV and emit batches for triage.
 *
 * The CSV has quoted multi-line fields (spell text contains newlines) and the
 * same spell may appear multiple times (PHB'14 vs PHB'24 etc.). Rows are merged
 * by spell name, keeping every source version's text — rules can differ wildly
 * between versions (e.g. Blade Ward '14 vs '24), so the analyst sees all of them.
 *
 * Usage:
 *   node batch_spells.mjs <spells.csv> [--batch-size 10] [--out batches.json]
 *
 * Output (stdout or --out): JSON
 *   { "spellCount": N, "batchCount": M, "batches": [ [spell, ...], ... ] }
 * where spell = { name, level, school, castingTime, range, components, versions: [
 *   { source, duration, text, atHigherLevels } ] }
 */

import {readFileSync, writeFileSync} from 'node:fs';

function parseCsv(raw) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (inQuotes) {
            if (c === '"') {
                if (raw[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            row.push(field); field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && raw[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
}

const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith('--'));
if (!csvPath) {
    console.error('Usage: node batch_spells.mjs <spells.csv> [--batch-size 10] [--out batches.json]');
    process.exit(1);
}
const opt = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : dflt;
};
const batchSize = Number(opt('batch-size', 10));
const outPath = opt('out', null);

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const header = rows.shift().map(h => h.trim().toLowerCase());
const col = name => header.indexOf(name);
const c = {
    name: col('name'), source: col('source'), level: col('level'),
    castingTime: col('casting time'), duration: col('duration'),
    school: col('school'), range: col('range'), components: col('components'),
    text: col('text'), higher: col('at higher levels'),
};
if (c.name < 0 || c.text < 0) {
    console.error(`Unrecognized header: ${header.join(', ')} — expected at least "Name" and "Text" columns.`);
    process.exit(1);
}

const spells = new Map();
for (const row of rows) {
    const name = (row[c.name] ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!spells.has(key)) {
        spells.set(key, {
            name,
            level: row[c.level] ?? '',
            school: row[c.school] ?? '',
            castingTime: row[c.castingTime] ?? '',
            range: row[c.range] ?? '',
            components: row[c.components] ?? '',
            versions: [],
        });
    }
    spells.get(key).versions.push({
        source: row[c.source] ?? '',
        duration: row[c.duration] ?? '',
        text: row[c.text] ?? '',
        atHigherLevels: row[c.higher] ?? '',
    });
}

const all = [...spells.values()];
const batches = [];
for (let i = 0; i < all.length; i += batchSize) batches.push(all.slice(i, i + batchSize));

const result = {spellCount: all.length, batchCount: batches.length, batches};
const json = JSON.stringify(result, null, 2);
if (outPath) {
    writeFileSync(outPath, json);
    console.log(`${all.length} unique spells (${rows.length} CSV rows) -> ${batches.length} batches of <=${batchSize}, written to ${outPath}`);
} else {
    console.log(json);
}
