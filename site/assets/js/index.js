'use strict';

function loadApplicationScript(name) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const source = `assets/js/${name}.js`;

        script.src = source;
        script.addEventListener(
            'load',
            () => {
                console.log(`Loaded script: ${source}`);
                resolve();
            },
            { once: true }
        );
        script.addEventListener('error', reject, { once: true });
        document.body.append(script);
    });
}

async function loadApplication() {
    const names = document.body.dataset.applicationScripts
        .split(/\s+/u)
        .filter(Boolean);

    for (const name of names) {
        await loadApplicationScript(name);
    }
}

window.addEventListener(
    'load',
    () => {
        void loadApplication().catch((error) => {
            console.error('Unable to load the application.', error);
        });
    },
    { once: true }
);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () =>
        navigator.serviceWorker.register('/service-worker.js').catch(() => {})
    );
}
