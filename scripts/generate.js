import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import module from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';

const vendorDestination = 'site/assets/vendor';

const indexFile = 'site/index.html';
const nginxFile = 'nginx.conf.example';

const soundFontDirectory = 'site/assets/soundfonts';
await generateBrowserDataAssets({
    assetType: 'SoundFont',
    catalogDirectory: soundFontDirectory,
    catalogVariable: 'soundFontFiles',
    dataVariable: 'soundFontData',
    patterns: soundFontPatterns('sf3'),
});

const midiDirectory = 'site/assets/midi';
await generateBrowserDataAssets({
    assetType: 'MIDI',
    catalogDirectory: midiDirectory,
    catalogVariable: 'midiFiles',
    dataVariable: 'midiData',
    patterns: [`${midiDirectory}/*.mid`],
});

function soundFontPatterns(extension) {
    return [
        `${soundFontDirectory}/*.${extension}`,
        `${vendorDestination}/*/soundfonts/*.${extension}`,
    ];
}

function siteRelativePath(file) {
    return path.relative('site', file).split(path.sep).join('/');
}

async function generateBrowserDataAssets({
    assetType,
    catalogDirectory,
    catalogVariable,
    dataVariable,
    patterns,
}) {
    const files = [];
    const names = new Set();

    for (const pattern of patterns) {
        for await (const file of fs.glob(pattern)) {
            const { dir, name } = path.parse(file);
            const normalizedName = name.toLowerCase();
            if (names.has(normalizedName)) {
                throw new Error(`Duplicate ${assetType} name: ${name}`);
            }

            const relativeFile = siteRelativePath(file);
            const buffer = await fs.readFile(file);
            const script = [
                `globalThis.${dataVariable} = globalThis.${dataVariable} || {};`,
                `globalThis.${dataVariable}[${JSON.stringify(name)}] = ${JSON.stringify(buffer.toString('base64'))};`,
                '',
            ].join('\n');

            names.add(normalizedName);
            files.push(relativeFile);
            await fs.writeFile(path.join(dir, `${name}.js`), script);
        }
    }

    files.sort((left, right) => left.localeCompare(right));
    await fs.mkdir(catalogDirectory, { recursive: true });
    await fs.writeFile(
        path.join(catalogDirectory, 'files.js'),
        `globalThis.${catalogVariable} = ${JSON.stringify(files, null, 4)};\n`
    );
}

const rootRequire = module.createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

function browserPackages() {
    const spessaLibPackage = path.dirname(
        rootRequire.resolve('spessasynth_lib/package.json')
    );
    const spessaLibRequire = module.createRequire(
        path.join(spessaLibPackage, 'package.json')
    );

    const spessaCorePackage = path.dirname(
        spessaLibRequire.resolve('spessasynth_core/package.json')
    );
    const spessaCoreRequire = module.createRequire(
        path.join(spessaCorePackage, 'package.json')
    );

    const stbVorbisPackage = path.dirname(
        spessaCoreRequire.resolve('stb-vorbis/package.json')
    );

    return [
        [
            spessaLibPackage,
            {
                js: [
                    'dist/index.js',
                    'dist/index.js.map',
                    'dist/spessasynth_processor.min.js',
                    'dist/spessasynth_processor.min.js.map',
                ],
                root: ['LICENSE'],
            },
        ],
        [
            spessaCorePackage,
            {
                js: ['dist/index.js', 'dist/index.js.map'],
                root: ['LICENSE'],
            },
        ],
        [
            stbVorbisPackage,
            {
                js: ['dist/index.js'],
                root: ['LICENSE'],
            },
        ],
    ];
}

for (const [packageDirectory, assetGroups] of browserPackages()) {
    const packageDestination = path.join(
        vendorDestination,
        path.basename(packageDirectory)
    );

    for (const [assetType, files] of Object.entries(assetGroups)) {
        const assetDestination =
            assetType === 'root'
                ? packageDestination
                : path.join(packageDestination, assetType);
        await fs.mkdir(assetDestination, { recursive: true });

        for (const file of files) {
            await fs.copyFile(
                path.join(packageDirectory, file),
                path.join(assetDestination, path.basename(file))
            );
        }
    }
}

for (const pattern of soundFontPatterns('sf2')) {
    for await (const soundFontFile of fs.glob(pattern)) {
        const sf3File = soundFontFile.replace(/\.sf2$/u, '.sf3');

        try {
            console.log(`Converting ${soundFontFile} to ${sf3File}...`);
            await execFileAsync('sf3convert', [
                '-z',
                '-q',
                '0.8',
                '-a',
                '-1',
                soundFontFile,
                sf3File,
            ]);
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(
                    'sf3convert is required to generate SF3 files from SF2 files.',
                    { cause: error }
                );
            }

            throw error;
        }
    }
}

const html = await fs.readFile(indexFile, 'utf8');
const importMap = html.match(
    /<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/iu
);
if (!importMap) {
    throw new Error(`Import map not found in ${indexFile}`);
}
const importMapHash = `sha256-${crypto
    .createHash('sha256')
    .update(importMap[1])
    .digest('base64')}`;
const nginx = await fs.readFile(nginxFile, 'utf8');
const cspHashPattern = /'sha256-[A-Za-z0-9+/]+={0,2}'/gu;
const cspHashes = nginx.match(cspHashPattern) ?? [];
if (cspHashes.length !== 1) {
    throw new Error(`Expected one CSP hash in ${nginxFile}`);
}
const updatedNginx = nginx.replace(cspHashPattern, `'${importMapHash}'`);
if (updatedNginx !== nginx) {
    await fs.writeFile(nginxFile, updatedNginx);
    console.log(`Updated CSP import-map hash to ${importMapHash}`);
}
