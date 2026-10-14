import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import module from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';

const destination = 'site/assets/vendor';
const soundFontCatalogDirectory = 'site/assets/soundfonts';

function soundFontPatterns(extension) {
    return [
        `${soundFontCatalogDirectory}/*.${extension}`,
        `${destination}/*/soundfonts/*.${extension}`,
    ];
}

const rootRequire = module.createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

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

const packages = [
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

for (const [packageDirectory, assetGroups] of packages) {
    const packageDestination = path.join(
        destination,
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

const soundFontFiles = [];
const soundFontNames = new Set();
for (const pattern of soundFontPatterns('sf3')) {
    for await (const soundFontFile of fs.glob(pattern)) {
        const name = path.basename(soundFontFile, '.sf3');
        const normalizedName = name.toLowerCase();
        if (soundFontNames.has(normalizedName)) {
            throw new Error(`Duplicate SoundFont name: ${name}`);
        }
        const fileDirectory = path.dirname(soundFontFile);
        const soundFontBuffer = await fs.readFile(soundFontFile);
        const soundFontScript = [
            'globalThis.soundFontData = globalThis.soundFontData || {};',
            `globalThis.soundFontData[${JSON.stringify(name)}] = ${JSON.stringify(soundFontBuffer.toString('base64'))};`,
            '',
        ].join('\n');
        const relativeFile = path
            .relative('site', soundFontFile)
            .split(path.sep)
            .join('/');

        soundFontNames.add(normalizedName);
        soundFontFiles.push(relativeFile);
        await fs.writeFile(
            path.join(fileDirectory, `${name}.js`),
            soundFontScript
        );
    }
}

soundFontFiles.sort((left, right) => left.localeCompare(right));
await fs.mkdir(soundFontCatalogDirectory, { recursive: true });
await fs.writeFile(
    path.join(soundFontCatalogDirectory, 'files.js'),
    `globalThis.soundFontFiles = ${JSON.stringify(soundFontFiles, null, 4)};\n`
);

const midiDirectory = 'site/assets/midi';
const midiFiles = [];

for await (const midiFile of fs.glob(`${midiDirectory}/*.mid`)) {
    const name = path.basename(midiFile);
    const midiBuffer = await fs.readFile(midiFile);
    const midiScript = [
        'globalThis.midiData = globalThis.midiData || {};',
        `globalThis.midiData[${JSON.stringify(name)}] = ${JSON.stringify(midiBuffer.toString('base64'))};`,
        '',
    ].join('\n');

    midiFiles.push(name);
    await fs.writeFile(path.join(midiDirectory, `${name}.js`), midiScript);
}

midiFiles.sort((left, right) => left.localeCompare(right));
await fs.writeFile(
    path.join(midiDirectory, 'files.js'),
    `globalThis.midiFiles = ${JSON.stringify(midiFiles, null, 4)};\n`
);
