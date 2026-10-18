'use strict';

function loadApplicationScript(name) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const source = `assets/js/${name}.js`;

        script.async = false;
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

function loadApplication() {
    const names = document.body.dataset.applicationScripts
        .split(/\s+/u)
        .filter(Boolean);

    return Promise.all(names.map(loadApplicationScript));
}

void loadApplication().catch((error) => {
    console.error('Unable to load the application.', error);
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () =>
        navigator.serviceWorker.register('/service-worker.js').catch(() => {})
    );
}
