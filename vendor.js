import fs from 'node:fs/promises';
import module from 'node:module';
import path from 'node:path';

const destination = 'site/assets/vendor';

const rootRequire = module.createRequire(import.meta.url);

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
