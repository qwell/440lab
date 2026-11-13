#!/usr/bin/env node

import fs from 'node:fs/promises';

const packageFile = 'package.json';
const indexFile = 'site/index.html';
const structuredDataStart = '<script type="application/ld+json">';
const structuredDataEnd = '</script>';
const modifiedTypes = new Set([
    'SoftwareSourceCode',
    'WebApplication',
    'WebPage',
    'WebSite',
]);

function types(entity) {
    return Array.isArray(entity['@type']) ? entity['@type'] : [entity['@type']];
}

function updateStructuredData(html, version, dateModified) {
    const start = html.indexOf(structuredDataStart);
    const contentStart = start + structuredDataStart.length;
    const end = html.indexOf(structuredDataEnd, contentStart);
    if (start === -1 || end === -1) {
        throw new Error(`Expected JSON-LD structured data in ${indexFile}.`);
    }

    const structuredData = JSON.parse(html.slice(contentStart, end));
    const graph = structuredData['@graph'];
    for (const entity of graph) {
        if (types(entity).some((type) => modifiedTypes.has(type))) {
            entity.dateModified = dateModified;
        }
    }

    const application = graph.find((entity) =>
        types(entity).includes('WebApplication')
    );
    application.softwareVersion = version;

    const scriptIndentation = html.slice(
        html.lastIndexOf('\n', start) + 1,
        start
    );
    const json = JSON.stringify(structuredData, null, 4)
        .split('\n')
        .map((line) => `${scriptIndentation}    ${line}`)
        .join('\n');
    const replacement = `${structuredDataStart}\n${json}\n${scriptIndentation}${structuredDataEnd}`;

    return `${html.slice(0, start)}${replacement}${html.slice(
        end + structuredDataEnd.length
    )}`;
}

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
    console.log('Usage: node scripts/release.js VERSION');
    process.exit(0);
}
if (args.length !== 1) {
    throw new Error('VERSION is required.');
}

const version = args[0].startsWith('v') ? args[0].slice(1) : args[0];
const dateModified = new Date().toISOString().slice(0, 10);
const packageJson = JSON.parse(await fs.readFile(packageFile, 'utf8'));
packageJson.version = version;

const html = await fs.readFile(indexFile, 'utf8');
const updatedHtml = updateStructuredData(html, version, dateModified);

await fs.writeFile(packageFile, `${JSON.stringify(packageJson, null, 4)}\n`);
await fs.writeFile(indexFile, updatedHtml);

console.log(`Updated release metadata for v${version} (${dateModified}).`);
