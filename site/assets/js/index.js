'use strict';

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () =>
        navigator.serviceWorker.register('/service-worker.js').catch(() => {})
    );
}

function isError(value) {
    return value instanceof Error;
}

function getErrorString(error, fallback = String(error)) {
    return isError(error) ? error.message : fallback;
}

function isElement(value) {
    return value instanceof Element;
}

function isHtmlInputElement(value) {
    return value instanceof HTMLInputElement;
}

function isHtmlSelectElement(value) {
    return value instanceof HTMLSelectElement;
}
