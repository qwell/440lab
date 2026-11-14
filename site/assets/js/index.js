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

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function signed(value, decimalPlaces = 1) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimalPlaces)}`;
}

function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 1
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

function addRollingSample(samples, sample, limit) {
    samples.push(sample);

    if (samples.length > limit) {
        samples.splice(0, samples.length - limit);
    }
}

function shuffle(items) {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));

        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }

    return result;
}
