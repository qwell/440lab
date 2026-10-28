'use strict';
const PREFERENCES_KEY = '440Lab.preferences.v1';

const STATS_KEYS = {
    pitch: '440Lab.pitchStats.v1',
    match: '440Lab.matchStats.v1',
    interval: '440Lab.intervalStats.v1',
    chord: '440Lab.chordStats.v1',
};

const TRIAL_KEYS = {
    pitchMemory: '440Lab.pitchMemoryTrial.v2',
};

const TRIAL_ADVANCE_DELAY = 3000;
function getReferenceFrequency() {
    return readNumber(getControl('global-reference-a4'), DEFAULT_A4_FREQUENCY);
}

function frequencyFromMidi(midi) {
    return (
        getReferenceFrequency() *
        2 ** ((midi - MIDI_NOTES.A4) / SEMITONES_PER_OCTAVE)
    );
}

function midiFromFrequency(frequency) {
    return (
        MIDI_NOTES.A4 +
        SEMITONES_PER_OCTAVE * Math.log2(frequency / getReferenceFrequency())
    );
}

function pitchClassFromMidi(midi) {
    return (
        ((Math.round(midi) % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) %
        SEMITONES_PER_OCTAVE
    );
}

function pitchClassName(pitchClass, accidental = null) {
    const names = PITCH_CLASS_NAMES[pitchClass];

    return (
        names.natural ?? names[accidental] ?? `${names.sharp} / ${names.flat}`
    );
}

function noteNameFromMidi(midi, accidental = null) {
    const roundedMidi = Math.round(midi);
    const pitchClass = pitchClassFromMidi(roundedMidi);
    const octave = Math.floor(roundedMidi / SEMITONES_PER_OCTAVE) - 1;
    const noteName = pitchClassName(pitchClass, accidental);

    return `${noteName}${octave}`;
}

function getControl(name, root = document) {
    return root.querySelector(`[data-control="${name}"]`);
}

function getControls(names, root = document) {
    const controlNames = Array.isArray(names) ? names : [names];
    const selector = controlNames
        .map((name) => `[data-control="${name}"]`)
        .join(', ');

    return root.querySelectorAll(selector);
}

function getOutput(name, root = document) {
    return root.querySelector(`[data-output="${name}"]`);
}

function getOutputs(name, root = document) {
    return root.querySelectorAll(`[data-output="${name}"]`);
}

function getAction(name, root = document) {
    return root.querySelector(`[data-action="${name}"]`);
}

function getActions(name, root = document) {
    return root.querySelectorAll(`[data-action="${name}"]`);
}

function getModuleActions(module, action, root = document) {
    return root.querySelectorAll(
        `[data-action^="${module}-"][data-action$="-${action}"]`
    );
}

function getNoteControl(name) {
    return document.querySelector(`[data-note="${name}"]`);
}

function getWaveform(name) {
    return document.querySelector(`[data-waveform="${name}"]`);
}

function synchronizeSharedControl(control) {
    const name = control?.dataset?.control;

    if (!name?.startsWith('shared-')) {
        return;
    }

    for (const peer of getControls(name)) {
        if (control instanceof HTMLInputElement && control.type === 'radio') {
            peer.checked = peer.value === control.value;
        } else if (
            control instanceof HTMLInputElement &&
            control.type === 'checkbox'
        ) {
            peer.checked = control.checked;
        } else {
            peer.value = control.value;
        }
    }
}

function getModePanels(name) {
    return document.querySelectorAll(
        `[data-panel="${name}"] > [data-mode-panel]`
    );
}

const storage = {
    load(key, fallback) {
        try {
            let serialized = localStorage.getItem(key);

            if (serialized === null) {
                const suffix = key.slice(key.indexOf('.'));
                const previousKey = Object.keys(localStorage).find(
                    (candidate) =>
                        candidate !== key && candidate.endsWith(suffix)
                );

                if (previousKey) {
                    serialized = localStorage.getItem(previousKey);
                    localStorage.setItem(key, serialized);
                }
            }

            const value = JSON.parse(serialized || 'null');

            return value === null ? fallback : value;
        } catch {
            return fallback;
        }
    },

    save(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Storage is optional.
        }
    },

    remove(key) {
        try {
            const suffix = key.slice(key.indexOf('.'));

            for (const candidate of Object.keys(localStorage)) {
                if (candidate === key || candidate.endsWith(suffix)) {
                    localStorage.removeItem(candidate);
                }
            }
        } catch {
            // Storage is optional.
        }
    },
};

function savePreferences() {
    storage.save(PREFERENCES_KEY, {
        a4: getReferenceFrequency(),
        volume: Number(getControl('global-volume').value),
    });
}

function restorePreferences() {
    const preferences = storage.load(PREFERENCES_KEY, {});
    const referenceFrequencyInput = getControl('global-reference-a4');
    const volumeInput = getControl('global-volume');

    if (Number.isFinite(preferences.a4)) {
        referenceFrequencyInput.value = clamp(
            preferences.a4,
            Number(referenceFrequencyInput.min),
            Number(referenceFrequencyInput.max)
        ).toFixed(3);
    }

    if (Number.isFinite(preferences.volume)) {
        volumeInput.value = String(
            clamp(
                preferences.volume,
                Number(volumeInput.min),
                Number(volumeInput.max)
            )
        );
    }
}

const stats = {};

function loadStats(name) {
    return storage.load(STATS_KEYS[name], null);
}

function saveStats(name) {
    const moduleStats = stats[name];

    for (const typeStats of Object.values(moduleStats)) {
        if (Number.isFinite(typeStats.errorTotal)) {
            typeStats.errorTotal = Number(typeStats.errorTotal.toFixed(3));
        }

        if (Number.isFinite(typeStats.best)) {
            typeStats.best = Number(typeStats.best.toFixed(3));
        }
    }

    storage.save(STATS_KEYS[name], moduleStats);
}

function createAutoAdvance(elements, advance) {
    let timer = null;

    function cancel() {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }

        for (const button of elements) {
            button.classList.remove('is-counting-down');
        }
    }

    function schedule() {
        cancel();

        const refreshButton = [...elements].find(
            (button) => !button.closest('[hidden]')
        );
        if (!refreshButton) {
            return;
        }

        void refreshButton.offsetWidth;
        refreshButton.classList.add('is-counting-down');

        timer = window.setTimeout(() => {
            timer = null;
            refreshButton.classList.remove('is-counting-down');
            advance();
        }, TRIAL_ADVANCE_DELAY);
    }

    return { cancel, schedule };
}

function clearPracticeResult(outputName) {
    const result = getOutput(outputName);

    result.classList.remove('is-correct', 'is-incorrect');
    result.replaceChildren();
}

function renderPracticeResult(outputName, correct, text) {
    const result = getOutput(outputName);
    const icon = document.createElement('strong');

    result.classList.add(correct ? 'is-correct' : 'is-incorrect');
    icon.textContent = correct ? '✓' : '✕';
    result.replaceChildren(icon, document.createTextNode(` ${text}`));
}

function answerStateClass(answer, selected, correct) {
    if (selected === null) {
        return null;
    }

    if (answer === correct) {
        return answer === selected ? 'is-correct' : 'is-target';
    }

    return answer === selected ? 'is-incorrect' : null;
}

function setAnswerOptionState(button, answer, selected, correct) {
    button.classList.remove('is-correct', 'is-incorrect', 'is-target');

    const stateClass = answerStateClass(answer, selected, correct);

    if (stateClass) {
        button.classList.add(stateClass);
    }
}

// Audio

const audio = (() => {
    let context = null;
    let masterGain = null;

    const transientVoices = new Set();

    function ensureContext() {
        if (!context) {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                throw new Error('Web Audio API is unavailable.');
            }

            context = new AudioContextClass();

            masterGain = context.createGain();
            masterGain.gain.value = masterVolume;
            masterGain.connect(context.destination);
        }

        if (context.state === 'suspended') {
            void context.resume();
        }

        return context;
    }

    function currentTime() {
        return ensureContext().currentTime;
    }

    function getContext() {
        return ensureContext();
    }

    function getDestination() {
        ensureContext();
        return masterGain;
    }

    function cancelAndHold(parameter, time) {
        const currentValue = parameter.value;

        parameter.cancelScheduledValues(time);
        parameter.setValueAtTime(currentValue, time);
    }

    function fadeTo(parameter, target, seconds = 0.015) {
        const audioContext = ensureContext();
        const now = audioContext.currentTime;

        cancelAndHold(parameter, now);
        parameter.linearRampToValueAtTime(target, now + seconds);
    }

    function createVoice(frequency, waveform, pan = 0) {
        const audioContext = ensureContext();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const panner = audioContext.createStereoPanner?.() ?? null;

        oscillator.type = waveform;
        oscillator.frequency.value = frequency;

        oscillator.connect(gain);
        if (panner) {
            panner.pan.value = clamp(pan, -1, 1);
            gain.connect(panner);
            panner.connect(masterGain);
        } else {
            gain.connect(masterGain);
        }

        return {
            audioContext,
            oscillator,
            gain,
            panner,
        };
    }

    function setMasterVolume(volume) {
        masterVolume = clamp(volume, 0, 1);

        if (masterGain) {
            masterGain.gain.setTargetAtTime(
                masterVolume,
                context.currentTime,
                0.01
            );
        }
    }

    function playContinuous(frequency, waveform, volume = 1) {
        const { audioContext, oscillator, gain, panner } = createVoice(
            frequency,
            waveform
        );

        gain.gain.value = 0;

        oscillator.start();

        fadeTo(gain.gain, VOICE_GAIN * clamp(volume, 0, 1));

        let stopped = false;

        return {
            setFrequency(frequency) {
                if (stopped) {
                    return;
                }

                oscillator.frequency.setTargetAtTime(
                    frequency,
                    audioContext.currentTime,
                    0.006
                );
            },

            stop() {
                if (stopped) {
                    return;
                }

                stopped = true;

                fadeTo(gain.gain, 0);

                try {
                    oscillator.stop(audioContext.currentTime + 0.025);
                } catch {
                    // move on
                }

                oscillator.addEventListener(
                    'ended',
                    () => {
                        oscillator.disconnect();
                        gain.disconnect();
                        panner?.disconnect();
                    },
                    {
                        once: true,
                    }
                );
            },
        };
    }

    function playTransient(
        frequency,
        waveform,
        durationSeconds,
        volume = 1,
        delaySeconds = 0,
        pan = 0
    ) {
        const { audioContext, oscillator, gain, panner } = createVoice(
            frequency,
            waveform,
            pan
        );

        const startTime = audioContext.currentTime + delaySeconds;

        const releaseTime = startTime + durationSeconds;

        const targetGain = VOICE_GAIN * clamp(volume, 0, 1);

        oscillator.frequency.setValueAtTime(frequency, startTime);

        gain.gain.setValueAtTime(0, startTime);

        gain.gain.linearRampToValueAtTime(targetGain, startTime + 0.012);

        gain.gain.setValueAtTime(
            targetGain,
            Math.max(startTime + 0.012, releaseTime - 0.015)
        );

        gain.gain.linearRampToValueAtTime(0, releaseTime);

        oscillator.start(startTime);
        oscillator.stop(releaseTime + 0.02);

        let stopped = false;

        const voice = {
            stop() {
                if (stopped) {
                    return;
                }

                stopped = true;

                const now = audioContext.currentTime;

                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(gain.gain.value, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.015);
            },
        };

        transientVoices.add(voice);

        oscillator.addEventListener(
            'ended',
            () => {
                transientVoices.delete(voice);

                oscillator.disconnect();
                gain.disconnect();
                panner?.disconnect();
            },
            {
                once: true,
            }
        );

        return voice;
    }

    function stopTransient() {
        for (const voice of transientVoices) {
            voice.stop();
        }

        transientVoices.clear();
    }

    function createAnalyser(stream, sampleWindowSize = 2048) {
        const audioContext = ensureContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();

        analyser.fftSize = sampleWindowSize;
        analyser.smoothingTimeConstant = 0;

        source.connect(analyser);

        return {
            analyser,
            source,
            sampleRate: audioContext.sampleRate,
        };
    }

    return {
        currentTime,
        getContext,
        getDestination,
        playContinuous,
        playTransient,
        stopTransient,
        createAnalyser,
        setMasterVolume,
    };
})();

const MICROPHONE_STATES = Object.freeze({
    UNPROMPTED: 'unprompted',
    DENIED: 'denied',
    LISTENING: 'listening',
    PAUSED: 'paused',
});
const MICROPHONE_MESSAGES = Object.freeze({
    REQUESTING: 'Requesting microphone access...',
    LISTENING: 'Listening...',
    PAUSED: 'Microphone paused',
    NO_STABLE_PITCH: 'No stable pitch',
    DENIED: 'Microphone permission denied',
    NOT_FOUND: 'No microphone found',
    UNAVAILABLE: 'Microphone access unavailable',
    FAILED: 'Could not start microphone',
});
const MICROPHONE_MEDIA_CONSTRAINTS = Object.freeze({
    audio: Object.freeze({
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
    }),
    video: false,
});

let microphoneStream = null;
let microphoneRequest = null;
let microphoneState = MICROPHONE_STATES.UNPROMPTED;
let microphoneRequestState = MICROPHONE_STATES.PAUSED;
let microphoneFailureMessage = MICROPHONE_MESSAGES.FAILED;
let activeMicrophoneInput = null;
let microphoneConnection = null;
let microphoneAnalysis = null;
let microphoneAnalysisFrame = null;
let microphoneInputRequestId = 0;

function microphoneStreamConnected() {
    return Boolean(
        microphoneStream
            ?.getAudioTracks()
            .some((track) => track.readyState === 'live')
    );
}

function microphoneErrorMessage(error) {
    if (error?.name === 'NotAllowedError') {
        return MICROPHONE_MESSAGES.DENIED;
    }
    if (error?.name === 'NotFoundError') {
        return MICROPHONE_MESSAGES.NOT_FOUND;
    }
    if (error?.name === 'NotSupportedError') {
        return MICROPHONE_MESSAGES.UNAVAILABLE;
    }

    return MICROPHONE_MESSAGES.FAILED;
}

function renderMicrophoneState(state, failureMessage = null) {
    microphoneState = state;
    if (state === MICROPHONE_STATES.DENIED) {
        microphoneFailureMessage = failureMessage ?? MICROPHONE_MESSAGES.DENIED;
    }

    const labels = {
        [MICROPHONE_STATES.UNPROMPTED]: 'Enable microphone',
        [MICROPHONE_STATES.DENIED]: 'Retry microphone access',
        [MICROPHONE_STATES.LISTENING]: 'Pause microphone',
        [MICROPHONE_STATES.PAUSED]: 'Start microphone',
    };
    const label = labels[state];

    for (const button of getActions('global-microphone-toggle')) {
        button.dataset.microphoneState = state;
        button.setAttribute(
            'aria-pressed',
            String(state === MICROPHONE_STATES.LISTENING)
        );
        button.setAttribute('aria-label', label);
        button.title = label;
    }
}

function setMicrophoneTracksEnabled(enabled) {
    microphoneStream?.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
    });
}

async function microphonePermissionState() {
    if (!navigator.permissions?.query) {
        return null;
    }

    try {
        return (await navigator.permissions.query({ name: 'microphone' }))
            .state;
    } catch {
        return null;
    }
}

async function requestMicrophoneStream() {
    if (microphoneStreamConnected()) {
        return microphoneStream;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('', 'NotSupportedError');
    }

    microphoneRequest ??= navigator.mediaDevices
        .getUserMedia(MICROPHONE_MEDIA_CONSTRAINTS)
        .then((stream) => {
            microphoneStream = stream;
            return stream;
        })
        .finally(() => {
            microphoneRequest = null;
        });

    return microphoneRequest;
}

async function setMicrophoneState(requestedState) {
    if (
        requestedState !== MICROPHONE_STATES.LISTENING &&
        requestedState !== MICROPHONE_STATES.PAUSED
    ) {
        throw new TypeError(`Invalid microphone state: ${requestedState}`);
    }

    microphoneRequestState = requestedState;

    if (requestedState === MICROPHONE_STATES.PAUSED) {
        deactivateActiveMicrophoneInput('microphone-paused');
        setMicrophoneTracksEnabled(false);

        if (microphoneStreamConnected()) {
            renderMicrophoneState(MICROPHONE_STATES.PAUSED);
            return microphoneState;
        }

        const permission = await microphonePermissionState();

        if (microphoneRequestState !== MICROPHONE_STATES.PAUSED) {
            return microphoneState;
        }

        if (permission === 'denied') {
            renderMicrophoneState(
                MICROPHONE_STATES.DENIED,
                MICROPHONE_MESSAGES.DENIED
            );
            return microphoneState;
        }

        if (permission !== 'granted') {
            renderMicrophoneState(MICROPHONE_STATES.UNPROMPTED);
            return microphoneState;
        }
    }

    try {
        await requestMicrophoneStream();
    } catch (error) {
        if (microphoneRequestState === MICROPHONE_STATES.LISTENING) {
            microphoneRequestState = MICROPHONE_STATES.PAUSED;
        }
        renderMicrophoneState(
            MICROPHONE_STATES.DENIED,
            microphoneErrorMessage(error)
        );
        return microphoneState;
    }

    const listening = microphoneRequestState === MICROPHONE_STATES.LISTENING;
    setMicrophoneTracksEnabled(listening);
    renderMicrophoneState(
        listening ? MICROPHONE_STATES.LISTENING : MICROPHONE_STATES.PAUSED
    );

    return microphoneState;
}

function createMicrophoneInput({
    minimumMidi,
    maximumMidi,
    sampleIntervalMs,
    processFrame,
    onDeactivate,
    initialState = {},
}) {
    const input = {
        minimumMidi,
        maximumMidi,
        sampleIntervalMs,
        processFrame,
        onDeactivate,
        ...initialState,
    };

    return Object.assign(input, {
        activate: () => activateMicrophoneInput(input),
        active: () => activeMicrophoneInput === input,
        deactivate: (reason) => deactivateMicrophoneInput(input, reason),
    });
}

function microphoneSampleWindowSize(input, sampleRate) {
    const minimumSamples = Math.ceil(
        (2 * sampleRate) / frequencyFromMidi(input.minimumMidi)
    );

    return 2 ** Math.ceil(Math.log2(minimumSamples));
}

function cancelMicrophoneAnalysis() {
    if (microphoneAnalysisFrame !== null) {
        cancelAnimationFrame(microphoneAnalysisFrame);
        microphoneAnalysisFrame = null;
    }

    microphoneAnalysis = null;
}

function processMicrophoneInputFrame(time) {
    const analysis = microphoneAnalysis;

    if (!analysis || activeMicrophoneInput !== analysis.input) {
        return;
    }

    const samplesUpdated =
        time - analysis.lastSampleTime >= analysis.input.sampleIntervalMs;

    if (samplesUpdated) {
        analysis.lastSampleTime = time;
        analysis.analyser.getFloatTimeDomainData(analysis.buffer);
    }

    analysis.input.processFrame({
        time,
        samples: analysis.buffer,
        sampleRate: analysis.sampleRate,
        samplesUpdated,
    });

    if (microphoneAnalysis === analysis) {
        microphoneAnalysisFrame = requestAnimationFrame(
            processMicrophoneInputFrame
        );
    }
}

function connectMicrophoneInput(input) {
    cancelMicrophoneAnalysis();

    if (microphoneConnection?.stream !== microphoneStream) {
        microphoneConnection?.source.disconnect();

        const connection = audio.createAnalyser(microphoneStream);

        microphoneConnection = {
            stream: microphoneStream,
            source: connection.source,
            analyser: connection.analyser,
            sampleRate: connection.sampleRate,
        };
    }

    microphoneConnection.analyser.fftSize = microphoneSampleWindowSize(
        input,
        microphoneConnection.sampleRate
    );

    microphoneAnalysis = {
        input,
        analyser: microphoneConnection.analyser,
        sampleRate: microphoneConnection.sampleRate,
        buffer: new Float32Array(microphoneConnection.analyser.fftSize),
        lastSampleTime: 0,
    };
    microphoneAnalysisFrame = requestAnimationFrame(
        processMicrophoneInputFrame
    );
}

function deactivateMicrophoneInput(input, reason = 'deactivated') {
    if (activeMicrophoneInput !== input) {
        return;
    }

    microphoneInputRequestId += 1;
    cancelMicrophoneAnalysis();
    activeMicrophoneInput = null;
    input.onDeactivate?.({ reason });
}

async function activateMicrophoneInput(input) {
    if (activeMicrophoneInput !== input) {
        activeMicrophoneInput?.deactivate('input-replaced');
        activeMicrophoneInput = input;
    }

    const requestId = ++microphoneInputRequestId;
    const state = await setMicrophoneState(MICROPHONE_STATES.LISTENING);

    if (
        requestId !== microphoneInputRequestId ||
        activeMicrophoneInput !== input
    ) {
        return false;
    }
    if (state !== MICROPHONE_STATES.LISTENING) {
        input.deactivate('microphone-unavailable');
        return false;
    }

    const sampleWindowChanged =
        microphoneConnection &&
        microphoneConnection.analyser.fftSize !==
            microphoneSampleWindowSize(input, microphoneConnection.sampleRate);

    if (
        microphoneAnalysis?.input !== input ||
        microphoneConnection?.stream !== microphoneStream ||
        sampleWindowChanged
    ) {
        try {
            connectMicrophoneInput(input);
        } catch (error) {
            input.deactivate('analysis-failed');
            throw error;
        }
    }

    return true;
}

function deactivateActiveMicrophoneInput(reason) {
    activeMicrophoneInput?.deactivate(reason);
}

function pauseMicrophone() {
    void setMicrophoneState(MICROPHONE_STATES.PAUSED);
}

let masterVolume = DEFAULT_VOLUME;
let volumeBeforeMute = DEFAULT_VOLUME;

function updateVolume() {
    const input = getControl('global-volume');

    const volume = clamp(Number(input.value), 0, 1);

    let icon = '🔊';

    if (volume === 0) {
        icon = '🔇';
    } else if (volume <= 0.2) {
        icon = '🔈';
    } else if (volume <= 0.6) {
        icon = '🔉';
    }

    if (volume > 0) {
        volumeBeforeMute = volume;
    }

    getOutput('global-volume-percent').textContent =
        `${Math.round(volume * 100)}%`;
    getOutput('global-volume-icon').textContent = icon;

    const button = getAction('global-volume-toggle');
    const label = volume === 0 ? 'Restore volume' : 'Mute volume';
    button.setAttribute('aria-label', label);
    button.title = label;

    audio.setMasterVolume(volume);
    savePreferences();
}

function toggleVolume() {
    const input = getControl('global-volume');
    input.value = Number(input.value) === 0 ? String(volumeBeforeMute) : '0';
    updateVolume();
}

const musicEngine = Object.freeze({
    ...music,
    ...musicNotation,
    MICROPHONE_MESSAGES,
    MICROPHONE_STATES,
    TRIAL_KEYS,
    answerStateClass,
    audio,
    clearPracticeResult,
    createAutoAdvance,
    createMicrophoneInput,
    deactivateActiveMicrophoneInput,
    frequencyFromMidi,
    getAction,
    getActions,
    getControl,
    getControls,
    getModePanels,
    getModuleActions,
    getNoteControl,
    getOutput,
    getOutputs,
    getWaveform,
    loadStats,
    midiFromFrequency,
    noteNameFromMidi,
    pitchClassFromMidi,
    pitchClassName,
    renderMicrophoneState,
    renderPracticeResult,
    restorePreferences,
    savePreferences,
    saveStats,
    setAnswerOptionState,
    setMicrophoneState,
    stats,
    pauseMicrophone,
    storage,
    synchronizeSharedControl,
    toggleVolume,
    updateVolume,
    get microphoneFailureMessage() {
        return microphoneFailureMessage;
    },
    get microphoneRequestState() {
        return microphoneRequestState;
    },
    get microphoneState() {
        return microphoneState;
    },
});
