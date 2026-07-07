#!/usr/bin/env node
/**
 * Parse a spell-automation-proposals.md report (produced by the
 * spell-automation-triage skill) into a JSON work list for generator agents.
 *
 * Usage: node parse_proposals.mjs <proposals.md> [--out proposals.json]
 *
 * Only the "## Proposed automations" section is parsed; the "## Skipped"
 * table is ignored. Each proposal block looks like:
 *
 *   ### <Name> (<level>, <version>)
 *   **Pitch:** ...
 *   **Behavior:** ...
 *   **Trigger:** ... · **Feasibility:** ready | needs-new-event (...) | needs-gm-or-rights (...)
 *   **Settings:** ...
 *   **Notes:** ...
 */
import {readFileSync, writeFileSync} from 'node:fs';

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outPath = outFlag !== -1 ? args[outFlag + 1] : null;
const reportPath = args.find((a, i) => !a.startsWith('--') && (outFlag === -1 || i !== outFlag + 1));
if (!reportPath) {
    console.error('Usage: node parse_proposals.mjs <proposals.md> [--out proposals.json]');
    process.exit(1);
}

const text = readFileSync(reportPath, 'utf8').replace(/\r\n/g, '\n');
const proposedSection = text.split(/^## Skipped\b/m)[0];
const blocks = proposedSection.split(/^### /m).slice(1);

/** "Drayfn's Bane of Excellence" -> words ["Drayfns","Bane","of","Excellence"] */
function words(name) {
    return name.replace(/['’]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/);
}
function camelId(name) {
    return words(name)
        .map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join('');
}
function kebab(name) {
    return words(name).map(w => w.toLowerCase()).join('-');
}

const proposals = [];
for (const block of blocks) {
    const newlineAt = block.indexOf('\n');
    const headingLine = (newlineAt === -1 ? block : block.slice(0, newlineAt)).trim();
    const body = newlineAt === -1 ? '' : block.slice(newlineAt + 1);

    const heading = headingLine.match(/^(.+?)\s*\((.+)\)\s*$/);
    const name = heading ? heading[1].trim() : headingLine;
    const inner = heading ? heading[2] : '';
    const commaAt = inner.indexOf(',');
    const level = commaAt === -1 ? inner.trim() : inner.slice(0, commaAt).trim();
    const version = commaAt === -1 ? '' : inner.slice(commaAt + 1).trim();

    const field = label => {
        const m = body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n##|$)`));
        return m ? m[1].trim() : '';
    };

    const triggerLine = field('Trigger');
    const [triggerRaw, feasRaw] = triggerLine.split(/\s*·\s*\*\*Feasibility:\*\*\s*/);
    const feasibilityDetail = (feasRaw ?? '').trim();
    const feasibility = feasibilityDetail.match(/^(ready|needs-new-event|needs-gm-or-rights)/)?.[1]
        ?? feasibilityDetail;

    const id = camelId(name);
    const folder = kebab(name);
    proposals.push({
        name,
        level,
        version,
        id,
        exportName: id,
        folder,
        file: `scripts/automations/${folder}/${id}.js`,
        pitch: field('Pitch'),
        behavior: field('Behavior'),
        trigger: (triggerRaw ?? '').trim(),
        feasibility,
        feasibilityDetail,
        settings: field('Settings'),
        notes: field('Notes')
    });
}

const byFeasibility = {};
for (const p of proposals) byFeasibility[p.feasibility] = (byFeasibility[p.feasibility] ?? 0) + 1;

const result = {reportPath, count: proposals.length, byFeasibility, proposals};
const json = JSON.stringify(result, null, 2);
if (outPath) {
    writeFileSync(outPath, json);
    console.log(`${proposals.length} proposals (${Object.entries(byFeasibility).map(([k, v]) => `${v} ${k}`).join(', ')}) -> ${outPath}`);
} else {
    console.log(json);
}
