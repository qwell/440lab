'use strict';
const SETTINGS_KEY = '440Lab.settings.v1';
const STATS_KEY = '440Lab.stats.v1';
const STATE_KEY = '440Lab.state.v1';

const TRIAL_ADVANCE_DELAY = 3000;
let referenceFrequency = music.DEFAULT_A4_FREQUENCY;

function getReferenceFrequency() {
    return referenceFrequency;
}

function setReferenceFrequency(frequency) {
    referenceFrequency = Number.isFinite(frequency)
        ? frequency
        : music.DEFAULT_A4_FREQUENCY;
}

function frequencyFromMidi(midi) {
    return (
        getReferenceFrequency() *
        2 ** ((midi - music.MIDI_NOTES.A4) / music.SEMITONES_PER_OCTAVE)
    );
}

function midiFromFrequency(frequency) {
    return (
        music.MIDI_NOTES.A4 +
        music.SEMITONES_PER_OCTAVE *
            Math.log2(frequency / getReferenceFrequency())
    );
}

const storage = {
    load(key, fallback) {
        try {
            const serialized = localStorage.getItem(key);
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
            localStorage.removeItem(key);
        } catch {
            // Storage is optional.
        }
    },
};

function saveSettings(settings) {
    storage.save(SETTINGS_KEY, settings);
}

function loadSettings() {
    return storage.load(SETTINGS_KEY, {});
}

function removeSettings() {
    storage.remove(SETTINGS_KEY);
}

function defaultStats(module = null, mode = null, type = null) {
    const base = {
        streak: 0,
        trials: 0,
        correct: 0,
    };
    const path = [module, mode, type].filter(Boolean).join('/');

    switch (path) {
        case '':
            return {
                chord: defaultStats('chord'),
                interval: defaultStats('interval'),
                match: defaultStats('match'),
                pitch: defaultStats('pitch'),
                rhythm: defaultStats('rhythm'),
            };

        case 'chord':
            return { quality: defaultStats('chord', 'quality') };
        case 'interval':
            return {
                recognition: defaultStats('interval', 'recognition'),
                construction: defaultStats('interval', 'construction'),
            };
        case 'match':
            return {
                identification: defaultStats('match', 'identification'),
                target: defaultStats('match', 'target'),
            };
        case 'pitch':
            return {
                placement: defaultStats('pitch', 'placement'),
                memory: defaultStats('pitch', 'memory'),
            };
        case 'rhythm':
            return { metronome: defaultStats('rhythm', 'metronome') };

        case 'pitch/memory':
            return {
                novel: defaultStats('pitch', 'memory', 'novel'),
                interference: defaultStats('pitch', 'memory', 'interference'),
            };

        case 'chord/quality':
        case 'interval/construction':
        case 'interval/recognition':
        case 'match/identification':
            return { ...base, bestStreak: null };

        case 'pitch/memory/interference':
        case 'pitch/memory/novel':
        case 'pitch/placement':
        case 'rhythm/metronome':
            return { ...base, bestError: null, errorTotal: 0 };

        case 'match/target':
            return { ...base, bestStreak: null, errorTotal: 0 };

        default:
            throw new TypeError(`Invalid stats path: ${path}`);
    }
}

function statsWithDefaults(defaults, stored) {
    if (defaults === null || typeof defaults === 'number') {
        return Number.isFinite(stored) ? stored : defaults;
    }

    return Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [
            key,
            statsWithDefaults(value, stored?.[key]),
        ])
    );
}

function loadStats() {
    return statsWithDefaults(defaultStats(), storage.load(STATS_KEY, {}));
}

const stats = loadStats();

function saveStats() {
    storage.save(STATS_KEY, stats);
}

function resetStats(module, mode, type = null) {
    const parent = type === null ? stats[module] : stats[module][mode];
    const key = type ?? mode;

    parent[key] = defaultStats(module, mode, type);
    saveStats();
}

function updateStats(stats, { correct, error = null, bestError = error }) {
    stats.trials += 1;
    stats.correct += correct ? 1 : 0;
    stats.streak = correct ? stats.streak + 1 : 0;

    if (error !== null) {
        stats.errorTotal += error;
    }

    if ('bestError' in stats) {
        if (
            bestError !== null &&
            (stats.bestError === null || bestError < stats.bestError)
        ) {
            stats.bestError = bestError;
        }
    } else if (
        correct &&
        (stats.bestStreak === null || stats.streak > stats.bestStreak)
    ) {
        stats.bestStreak = stats.streak;
    }

    saveStats();
}

function loadState() {
    const stored = storage.load(STATE_KEY, {});

    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(stored).filter(
            ([, moduleState]) =>
                moduleState &&
                typeof moduleState === 'object' &&
                !Array.isArray(moduleState)
        )
    );
}

const state = loadState();
let statePersistenceEnabled = true;

function getState(module) {
    const moduleState = state[module];

    if (
        !moduleState ||
        typeof moduleState !== 'object' ||
        Array.isArray(moduleState)
    ) {
        state[module] = {};
    }

    return state[module];
}

function saveState() {
    if (!statePersistenceEnabled) {
        return;
    }
    storage.save(STATE_KEY, state);
}

function clearState() {
    statePersistenceEnabled = false;
    for (const moduleState of Object.values(state)) {
        for (const name of Object.keys(moduleState)) {
            delete moduleState[name];
        }
    }
    storage.remove(STATE_KEY);
}

function removeState(module, name) {
    delete state[module]?.[name];

    if (!statePersistenceEnabled) {
        return;
    }

    if (
        Object.values(state).every(
            (moduleState) => Object.keys(moduleState).length === 0
        )
    ) {
        storage.remove(STATE_KEY);
    } else {
        saveState();
    }
}

// Audio

const audio = (() => {
    let context = null;
    let masterGain = null;

    const continuousVoices = new Set();
    const transientVoices = new Set();
    const playbackStateListeners = new Set();

    function isPlaying() {
        return continuousVoices.size > 0 || transientVoices.size > 0;
    }

    function notifyPlaybackStateChange(wasPlaying) {
        const playing = isPlaying();
        if (playing === wasPlaying) {
            return;
        }
        for (const listener of playbackStateListeners) {
            listener(playing);
        }
    }

    function addPlaybackVoice(voices, voice) {
        const wasPlaying = isPlaying();
        voices.add(voice);
        notifyPlaybackStateChange(wasPlaying);
    }

    function removePlaybackVoice(voices, voice) {
        const wasPlaying = isPlaying();
        if (voices.delete(voice)) {
            notifyPlaybackStateChange(wasPlaying);
        }
    }

    function addPlaybackStateListener(listener) {
        playbackStateListeners.add(listener);
        return () => playbackStateListeners.delete(listener);
    }

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
            context.resume();
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

        fadeTo(gain.gain, music.VOICE_GAIN * clamp(volume, 0, 1));

        let stopped = false;

        const voice = {
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
                removePlaybackVoice(continuousVoices, voice);

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

        addPlaybackVoice(continuousVoices, voice);
        return voice;
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

        const targetGain = music.VOICE_GAIN * clamp(volume, 0, 1);

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
                removePlaybackVoice(transientVoices, voice);

                const now = audioContext.currentTime;

                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(gain.gain.value, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.015);
            },
        };

        addPlaybackVoice(transientVoices, voice);

        oscillator.addEventListener(
            'ended',
            () => {
                removePlaybackVoice(transientVoices, voice);

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
        isPlaying,
        addPlaybackStateListener,
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
const microphoneStateListeners = new Set();

function notifyMicrophoneStateChange() {
    for (const listener of microphoneStateListeners) {
        listener();
    }
}

function setMicrophoneRequestState(state) {
    if (microphoneRequestState === state) {
        return;
    }
    microphoneRequestState = state;
    notifyMicrophoneStateChange();
}

function addMicrophoneStateListener(listener) {
    microphoneStateListeners.add(listener);
    return () => microphoneStateListeners.delete(listener);
}

function isMicrophoneStreamConnected() {
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

function applyMicrophoneState(state, failureMessage = null) {
    const changed = microphoneState !== state;
    microphoneState = state;
    if (state === MICROPHONE_STATES.DENIED) {
        microphoneFailureMessage = failureMessage ?? MICROPHONE_MESSAGES.DENIED;
    }

    if (changed) {
        notifyMicrophoneStateChange();
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
    if (isMicrophoneStreamConnected()) {
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

    setMicrophoneRequestState(requestedState);

    if (requestedState === MICROPHONE_STATES.PAUSED) {
        deactivateActiveMicrophoneInput('microphone-paused');
        setMicrophoneTracksEnabled(false);

        if (isMicrophoneStreamConnected()) {
            applyMicrophoneState(MICROPHONE_STATES.PAUSED);
            return microphoneState;
        }

        const permission = await microphonePermissionState();

        if (microphoneRequestState !== MICROPHONE_STATES.PAUSED) {
            return microphoneState;
        }

        if (permission === 'denied') {
            applyMicrophoneState(
                MICROPHONE_STATES.DENIED,
                MICROPHONE_MESSAGES.DENIED
            );
            return microphoneState;
        }

        if (permission !== 'granted') {
            applyMicrophoneState(MICROPHONE_STATES.UNPROMPTED);
            return microphoneState;
        }
    }

    try {
        await requestMicrophoneStream();
    } catch (error) {
        if (microphoneRequestState === MICROPHONE_STATES.LISTENING) {
            setMicrophoneRequestState(MICROPHONE_STATES.PAUSED);
        }
        applyMicrophoneState(
            MICROPHONE_STATES.DENIED,
            microphoneErrorMessage(error)
        );
        return microphoneState;
    }

    const listening = microphoneRequestState === MICROPHONE_STATES.LISTENING;
    setMicrophoneTracksEnabled(listening);
    applyMicrophoneState(
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
        isActive: () => activeMicrophoneInput === input,
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

let masterVolume = music.DEFAULT_VOLUME;

function setVolume(volume) {
    audio.setMasterVolume(volume);
}

const engine = Object.freeze({
    audio,
    setVolume,

    frequencyFromMidi,
    midiFromFrequency,
    setReferenceFrequency,

    loadSettings,
    removeSettings,
    saveSettings,

    resetStats,
    stats,
    updateStats,

    clearState,
    getState,
    removeState,
    saveState,
    state,

    addMicrophoneStateListener,
    createMicrophoneInput,
    deactivateActiveMicrophoneInput,

    MICROPHONE_MESSAGES,
    MICROPHONE_STATES,

    get microphoneFailureMessage() {
        return microphoneFailureMessage;
    },
    get microphoneRequestState() {
        return microphoneRequestState;
    },
    get microphoneState() {
        return microphoneState;
    },
    setMicrophoneState,
});
