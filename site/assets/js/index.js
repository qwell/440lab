'use strict';

const DEFAULT_REFERENCE_A4 = 440;
const DEFAULT_MIDI = 69;
const SEMITONES_PER_OCTAVE = 12;

const TUNER_ANALYSIS_INTERVAL_MS = 50;
const TUNER_SMOOTHING = 0.18;
const TUNER_MIN_RMS = 0.006;
const TUNER_STABLE_FRAMES = 3;
const TUNER_YIN_THRESHOLD = 0.15;
const TUNER_HISTORY_LENGTH = 5;
const TUNER_ANALYSIS_FFT_SIZE = 8192;
const TUNER_ANALYSIS_SAMPLE_STRIDE = 2;
const TUNER_PLOT_SECONDS = 8;
const TUNER_PLOT_PADDING_SEMITONES = 7;

const TUNER_MIN_HZ = 12;
const TUNER_MAX_HZ = 5000;

const RHYTHM_LOOKAHEAD_MS = 25;
const RHYTHM_SCHEDULE_AHEAD_SECONDS = 0.1;
const RHYTHM_CLICK_DURATION = 0.035;
const RHYTHM_NORMAL_HZ = 800;
const RHYTHM_GROUP_HZ = 1000;
const RHYTHM_FIRST_HZ = 1200;

const RHYTHM_NOTE_VALUES = [
    { value: 1, name: 'whole', symbol: '𝅝', rest: '𝄻' },
    { value: 2, name: 'half', symbol: '𝅗𝅥', rest: '𝄼' },
    { value: 4, name: 'quarter', symbol: '𝅘𝅥', rest: '𝄽' },
    { value: 8, name: 'eighth', symbol: '𝅘𝅥𝅮', rest: '𝄾' },
    { value: 16, name: 'sixteenth', symbol: '𝅘𝅥𝅯', rest: '𝄿' },
];
const RHYTHM_DOT_MULTIPLIER = 1.5;
const RHYTHM_COMPOUND_SUBDIVISIONS = 3;

const SHEET_REM_PER_QUARTER = 5.5;
const SHEET_BAR_PADDING_REM = 1.25;
const SHEET_BAR_GLIDE_SECONDS = 0.15;
const SHEET_PLAY_LINE_REM = 2;
const SHEET_EIGHTH_PATTERN_RATE = 0.2;
const SHEET_SIXTEENTH_PATTERN_RATE = 0.05;
const SHEET_SIXTEENTH_PAIR_RATE = 0.7;
const SHEET_SUSTAINED_PATTERN_RATE = 0.6;
const SHEET_TIE_RATE = 0.35;
const RHYTHM_METERS = {
    '2/4': [2, 0],
    '3/4': [2, 0, 0],
    '4/4': [2, 0, 0, 0],

    '2/2': [2, 0],
    '3/8': [2, 0, 0],

    '6/8': [2, 0, 0, 1, 0, 0],
    '9/8': [2, 0, 0, 1, 0, 0, 1, 0, 0],
    '12/8': [2, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],

    '5/4': [2, 0, 0, 1, 0],
    '7/8': [2, 0, 1, 0, 1, 0, 0],
};
const RHYTHM_SIGNATURE_SYMBOLS = {
    '4/4': '𝄴',
    '2/2': '𝄵',
};

const SHEET_CLEFS = {
    treble: {
        symbol: '𝄞',
        minimumMidi: 60,
        maximumMidi: 81,
        bottomLineDiatonic: 30,
    },
    bass: {
        symbol: '𝄢',
        minimumMidi: 36,
        maximumMidi: 57,
        bottomLineDiatonic: 18,
    },
    alto: {
        symbol: '𝄡',
        minimumMidi: 48,
        maximumMidi: 69,
        bottomLineDiatonic: 24,
    },
    tenor: {
        symbol: '𝄡',
        minimumMidi: 43,
        maximumMidi: 64,
        bottomLineDiatonic: 22,
    },
};
const NATURAL_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];
const SHEET_CORRECT_CENTS = 50;
const SHEET_ANALYSIS_INTERVAL_MS = 50;
const SHEET_NOTE_CUE_DURATION = 0.09;
const SHEET_NOTE_CUE_VOLUME = 0.45;

const PREFERENCES_KEY = '440Lab.preferences.v1';

const STATS_KEYS = {
    pitch: '440Lab.pitchStats.v1',
    match: '440Lab.matchStats.v1',
    interval: '440Lab.intervalStats.v1',
    chord: '440Lab.chordStats.v1',
};

const PITCH_MEMORY_TRIAL_KEY = '440Lab.pitchMemoryTrial.v1';
const PITCH_MEMORY_MIN_HZ = 98; // G2
const PITCH_MEMORY_MAX_HZ = 987.77; // B5
const PITCH_MEMORY_CORRECT_CENTS = 50;
const PITCH_MEMORY_MIC_ADJUSTMENT_CENTS = 50;
const PITCH_MEMORY_RANGE_CENTS =
    1200 * Math.log2(PITCH_MEMORY_MAX_HZ / PITCH_MEMORY_MIN_HZ);
const TRIAL_ADVANCE_DELAY = 3000;
const ADAPTIVE_WINDOW_SIZE = 5;
const ADAPTIVE_NARROW_FACTOR = 0.8;
const ADAPTIVE_WIDEN_FACTOR = 1.25;
const DEFAULT_VOLUME = 0.8;
const VOICE_GAIN = 0.25;

const NOTE_NAMES = [
    'C',
    'C♯ / D♭',
    'D',
    'D♯ / E♭',
    'E',
    'F',
    'F♯ / G♭',
    'G',
    'G♯ / A♭',
    'A',
    'A♯ / B♭',
    'B',
];

const TUNER_ACCIDENTAL_NAMES = {
    sharp: {
        1: 'C♯',
        3: 'D♯',
        6: 'F♯',
        8: 'G♯',
        10: 'A♯',
    },
    flat: {
        1: 'D♭',
        3: 'E♭',
        6: 'G♭',
        8: 'A♭',
        10: 'B♭',
    },
};

const CHORD_QUALITIES = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    diminished: [0, 3, 6],
    augmented: [0, 4, 8],
};

const INTERVALS = [
    { semitones: 0, name: 'Unison', shortName: 'Unison' },
    { semitones: 1, name: 'Minor second', shortName: 'Minor 2nd' },
    { semitones: 2, name: 'Major second', shortName: 'Major 2nd' },
    { semitones: 3, name: 'Minor third', shortName: 'Minor 3rd' },
    { semitones: 4, name: 'Major third', shortName: 'Major 3rd' },
    { semitones: 5, name: 'Perfect fourth', shortName: 'Perfect 4th' },
    { semitones: 6, name: 'Tritone' },
    { semitones: 7, name: 'Perfect fifth', shortName: 'Perfect 5th' },
    { semitones: 8, name: 'Minor sixth', shortName: 'Minor 6th' },
    { semitones: 9, name: 'Major sixth', shortName: 'Major 6th' },
    { semitones: 10, name: 'Minor seventh', shortName: 'Minor 7th' },
    { semitones: 11, name: 'Major seventh', shortName: 'Major 7th' },
    { semitones: 12, name: 'Octave', shortName: 'Octave' },
];

const INTERVAL_LEVELS = {
    starter: [3, 4, 7, 12],
    common: [2, 3, 4, 5, 7, 8, 9, 12],
    all: INTERVALS.map(({ semitones }) => semitones),
};

const TUNER_INSTRUMENTS = [
    {
        name: 'guitar',
        tunings: [
            ['standard', [40, 45, 50, 55, 59, 64]],
            ['drop D', [38, 45, 50, 55, 59, 64]],
            ['DADGAD', [38, 45, 50, 55, 57, 62]],
            ['open G', [38, 43, 50, 55, 59, 62]],
            ['open D', [38, 45, 50, 54, 57, 62]],
            ['half step down', [39, 44, 49, 54, 58, 63], 'flat'],
        ],
    },
    {
        name: 'bass guitar',
        tunings: [
            ['standard (4 strings)', [28, 33, 38, 43]],
            ['drop D', [26, 33, 38, 43]],
            ['standard (5 strings)', [23, 28, 33, 38, 43]],
            ['standard (6 strings)', [23, 28, 33, 38, 43, 48]],
        ],
    },
    {
        name: 'violin',
        tunings: [['standard', [55, 62, 69, 76]]],
    },
    {
        name: 'viola',
        tunings: [['standard', [48, 55, 62, 69]]],
    },
    {
        name: 'cello',
        tunings: [['standard', [36, 43, 50, 57]]],
    },
    {
        name: 'double bass',
        tunings: [
            ['standard (4 strings)', [28, 33, 38, 43]],
            ['standard (5 strings)', [23, 28, 33, 38, 43]],
        ],
    },
    {
        name: 'ukulele',
        tunings: [
            ['standard (high G)', [67, 60, 64, 69]],
            ['low G', [55, 60, 64, 69]],
            ['baritone', [50, 55, 59, 64]],
        ],
    },
    {
        name: 'banjo',
        tunings: [
            ['open G (5 strings)', [67, 50, 55, 59, 62]],
            ['double C', [67, 48, 55, 60, 62]],
            ['sawmill', [67, 50, 55, 60, 62]],
            ['tenor', [48, 55, 62, 69]],
        ],
    },
    {
        name: 'mandolin',
        tunings: [['standard (paired)', [55, 55, 62, 62, 69, 69, 76, 76]]],
    },
];

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function readNumber(input, fallback) {
    const rawValue = input.value.trim();

    if (rawValue === '') {
        return fallback;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
        return fallback;
    }

    const minimum = input.hasAttribute('min')
        ? Number(input.getAttribute('min'))
        : -Infinity;

    const maximum = input.hasAttribute('max')
        ? Number(input.getAttribute('max'))
        : Infinity;

    return clamp(value, minimum, maximum);
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

function shuffle(items) {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));

        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }

    return result;
}

function frequencyFromCents(referenceHz, cents) {
    return referenceHz * 2 ** (cents / 1200);
}

function centsBetween(frequencyHz, referenceHz) {
    return 1200 * Math.log2(frequencyHz / referenceHz);
}

function nearestOctaveFrequency(frequencyHz, referenceHz) {
    const octaveOffset = Math.round(Math.log2(referenceHz / frequencyHz));

    return frequencyHz * 2 ** octaveOffset;
}

function getReferenceA4() {
    return readNumber(getControl('global-reference-a4'), DEFAULT_REFERENCE_A4);
}

function midiFrequency(midi) {
    return (
        getReferenceA4() * 2 ** ((midi - DEFAULT_MIDI) / SEMITONES_PER_OCTAVE)
    );
}

function midiFromFrequency(frequencyHz) {
    return (
        DEFAULT_MIDI +
        SEMITONES_PER_OCTAVE * Math.log2(frequencyHz / getReferenceA4())
    );
}

function midiToNoteName(midi) {
    const roundedMidi = Math.round(midi);
    const pitchClass =
        ((roundedMidi % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) %
        SEMITONES_PER_OCTAVE;
    const octave = Math.floor(roundedMidi / SEMITONES_PER_OCTAVE) - 1;

    return `${NOTE_NAMES[pitchClass]}${octave}`;
}

function midiToTunerNoteName(midi, accidental = 'sharp') {
    const roundedMidi = Math.round(midi);
    const pitchClass =
        ((roundedMidi % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) %
        SEMITONES_PER_OCTAVE;
    const octave = Math.floor(roundedMidi / SEMITONES_PER_OCTAVE) - 1;
    const noteName =
        TUNER_ACCIDENTAL_NAMES[accidental][pitchClass] ??
        NOTE_NAMES[pitchClass];

    return `${noteName}${octave}`;
}

function tunerTargetNoteName() {
    const instrument = TUNER_INSTRUMENTS[getControl('tuner-instrument').value];
    const tuning = instrument?.tunings[getControl('tuner-variation').value];
    const accidental = tuning?.[2] ?? 'sharp';

    return midiToTunerNoteName(tunerTargetMidi, accidental);
}

function selectedNoteFrequency(select) {
    return midiFrequency(Number(select.value));
}

function getControl(name, root = document) {
    return root.querySelector(`[data-control="${name}"]`);
}

function getControls(...names) {
    const selector = names.map((name) => `[data-control="${name}"]`).join(', ');

    return document.querySelectorAll(selector);
}

function getOutput(name, root = document) {
    return root.querySelector(`[data-output="${name}"]`);
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
        `[data-panel="${name}"] [data-mode-panel]`
    );
}

function getNote(name) {
    return document.querySelector(`[data-note="${name}"]`);
}

function getWaveform(name) {
    return document.querySelector(`[data-waveform="${name}"]`);
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
        a4: getReferenceA4(),
        volume: Number(getControl('global-volume').value),
    });
}

function restorePreferences() {
    const preferences = storage.load(PREFERENCES_KEY, {});
    const referenceA4Input = getControl('global-reference-a4');
    const volumeInput = getControl('global-volume');

    if (Number.isFinite(preferences.a4)) {
        referenceA4Input.value = clamp(
            preferences.a4,
            Number(referenceA4Input.min),
            Number(referenceA4Input.max)
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

function clearStats(name) {
    storage.remove(STATS_KEYS[name]);
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

    function createVoice(frequencyHz, waveform) {
        const audioContext = ensureContext();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = waveform;
        oscillator.frequency.value = frequencyHz;

        oscillator.connect(gain);
        gain.connect(masterGain);

        return {
            audioContext,
            oscillator,
            gain,
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

    function playContinuous(frequencyHz, waveform, volume = 1) {
        const { audioContext, oscillator, gain } = createVoice(
            frequencyHz,
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
                    },
                    {
                        once: true,
                    }
                );
            },
        };
    }

    function playTransient(
        frequencyHz,
        waveform,
        durationSeconds,
        volume = 1,
        delaySeconds = 0
    ) {
        const { audioContext, oscillator, gain } = createVoice(
            frequencyHz,
            waveform
        );

        const startTime = audioContext.currentTime + delaySeconds;

        const releaseTime = startTime + durationSeconds;

        const targetGain = VOICE_GAIN * clamp(volume, 0, 1);

        oscillator.frequency.setValueAtTime(frequencyHz, startTime);

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

    function createAnalyser(stream, fftSize = 2048) {
        const audioContext = ensureContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();

        analyser.fftSize = fftSize;
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
    STOPPED: 'stopped',
});
const MICROPHONE_FAILURE_MESSAGES = Object.freeze({
    DENIED: 'Microphone permission denied',
    NOT_FOUND: 'No microphone found',
    UNAVAILABLE: 'Microphone access unavailable',
    FAILED: 'Could not start microphone',
});

let microphoneStream = null;
let microphoneRequest = null;
let microphoneState = MICROPHONE_STATES.UNPROMPTED;
let requestedMicrophoneState = MICROPHONE_STATES.STOPPED;
let microphoneFailureMessage = MICROPHONE_FAILURE_MESSAGES.FAILED;

function microphoneStreamConnected() {
    return Boolean(
        microphoneStream
            ?.getAudioTracks()
            .some((track) => track.readyState === 'live')
    );
}

function microphoneErrorMessage(error) {
    if (error?.name === 'NotAllowedError') {
        return MICROPHONE_FAILURE_MESSAGES.DENIED;
    }
    if (error?.name === 'NotFoundError') {
        return MICROPHONE_FAILURE_MESSAGES.NOT_FOUND;
    }
    if (error?.name === 'NotSupportedError') {
        return MICROPHONE_FAILURE_MESSAGES.UNAVAILABLE;
    }

    return MICROPHONE_FAILURE_MESSAGES.FAILED;
}

function renderMicrophoneState(state, failureMessage = null) {
    microphoneState = state;
    if (state === MICROPHONE_STATES.DENIED) {
        microphoneFailureMessage =
            failureMessage ?? MICROPHONE_FAILURE_MESSAGES.DENIED;
    }

    const button = getAction('global-microphone-toggle');
    const labels = {
        [MICROPHONE_STATES.UNPROMPTED]: 'Enable microphone',
        [MICROPHONE_STATES.DENIED]: 'Retry microphone access',
        [MICROPHONE_STATES.LISTENING]: 'Stop microphone',
        [MICROPHONE_STATES.STOPPED]: 'Start microphone',
    };
    const label = labels[state];

    button.dataset.microphoneState = state;
    button.setAttribute(
        'aria-pressed',
        String(state === MICROPHONE_STATES.LISTENING)
    );
    button.setAttribute('aria-label', label);
    button.title = label;
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
        .getUserMedia({ audio: true, video: false })
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
        requestedState !== MICROPHONE_STATES.STOPPED
    ) {
        throw new TypeError(`Invalid microphone state: ${requestedState}`);
    }

    requestedMicrophoneState = requestedState;

    if (requestedState === MICROPHONE_STATES.STOPPED) {
        setMicrophoneTracksEnabled(false);

        if (microphoneStreamConnected()) {
            renderMicrophoneState(MICROPHONE_STATES.STOPPED);
            return microphoneState;
        }

        const permission = await microphonePermissionState();

        if (requestedMicrophoneState !== MICROPHONE_STATES.STOPPED) {
            return microphoneState;
        }

        if (permission === 'denied') {
            renderMicrophoneState(
                MICROPHONE_STATES.DENIED,
                MICROPHONE_FAILURE_MESSAGES.DENIED
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
        if (requestedMicrophoneState === MICROPHONE_STATES.LISTENING) {
            requestedMicrophoneState = MICROPHONE_STATES.STOPPED;
        }
        renderMicrophoneState(
            MICROPHONE_STATES.DENIED,
            microphoneErrorMessage(error)
        );
        return microphoneState;
    }

    const listening = requestedMicrophoneState === MICROPHONE_STATES.LISTENING;
    setMicrophoneTracksEnabled(listening);
    renderMicrophoneState(
        listening ? MICROPHONE_STATES.LISTENING : MICROPHONE_STATES.STOPPED
    );

    return microphoneState;
}

async function startMicrophoneInput(input, fftSize) {
    const requestId = ++input.requestId;
    const state = await setMicrophoneState(MICROPHONE_STATES.LISTENING);

    if (
        requestId !== input.requestId ||
        state !== MICROPHONE_STATES.LISTENING
    ) {
        return false;
    }

    const stream = microphoneStream;

    if (input.stream === stream && input.analyser) {
        return true;
    }

    input.source?.disconnect();

    const connection = audio.createAnalyser(stream, fftSize);

    input.stream = stream;
    input.source = connection.source;
    input.analyser = connection.analyser;
    input.sampleRate = connection.sampleRate;
    input.buffer = new Float32Array(input.analyser.fftSize);

    return true;
}

function microphoneInputConnected(input) {
    return Boolean(
        input.stream === microphoneStream &&
        input.analyser &&
        input.stream
            ?.getAudioTracks()
            .some((track) => track.readyState === 'live')
    );
}

function pauseMicrophoneInput(input) {
    input.requestId += 1;
}

function pauseMicrophone() {
    void setMicrophoneState(MICROPHONE_STATES.STOPPED);
    stopAllAudio();
    if (pitchMemory.trial && pitchMemory.trial.state !== 'complete') {
        stopPitchMemoryAudio();
    }
    stopTunerMic();
    stopSheetMic();
    stopPitchMemoryMic();
}

async function startGlobalMicrophone() {
    if (
        (await setMicrophoneState(MICROPHONE_STATES.LISTENING)) !==
        MICROPHONE_STATES.LISTENING
    ) {
        return;
    }

    const activeSection = document.querySelector('.nav-item.is-active')?.dataset
        .section;
    if (activeSection === 'tuner') {
        await startTunerMic();
    } else if (activeSection === 'rhythm' && sheetMusicEnabled()) {
        await startSheetMic();
    } else if (isPitchMemoryActive(activeSection)) {
        await startPitchMemoryMic();
    }
}

function toggleGlobalMicrophone() {
    if (requestedMicrophoneState === MICROPHONE_STATES.LISTENING) {
        pauseMicrophone();
        return;
    }

    void startGlobalMicrophone();
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

let tunerTargetMidi = null;

function initializeTunerInstruments() {
    const select = getControl('tuner-instrument');
    TUNER_INSTRUMENTS.forEach((instrument, index) => {
        select.add(new Option(instrument.name, String(index)));
    });
    updateTunerInstrument();
}

function updateTunerInstrument() {
    const select = getControl('tuner-variation');
    const instrument = TUNER_INSTRUMENTS[getControl('tuner-instrument').value];
    select.replaceChildren();
    select.disabled = !instrument || instrument.tunings.length === 1;
    if (instrument) {
        instrument.tunings.forEach(([name], index) => {
            select.add(new Option(name, String(index)));
        });
    } else {
        select.add(new Option('select an instrument', ''));
    }
    updateTunerStrings();
}

function clearTunerTarget() {
    if (tunerTargetMidi === null) {
        return;
    }

    tunerTargetMidi = null;
    for (const button of getOutput('tuner-strings').children) {
        button.setAttribute('aria-pressed', 'false');
    }
    resetTunerTracking(true);
    tunerMic.lastValidTime = 0;
    resetTunerDetection(tunerMic.stream ? 'Listening...' : 'Microphone off');
}

function updateTunerStrings() {
    stopTuner();
    clearTunerTarget();
    const container = getOutput('tuner-strings');
    container.replaceChildren();
    const instrument = TUNER_INSTRUMENTS[getControl('tuner-instrument').value];
    container.hidden = !instrument;
    if (!instrument) {
        return;
    }
    const [, notes, accidental = 'sharp'] =
        instrument.tunings[getControl('tuner-variation').value];
    notes.forEach((midi, index) => {
        const button = document.createElement('button');
        const noteName = midiToTunerNoteName(midi, accidental);

        button.type = 'button';
        button.textContent = noteName;
        button.setAttribute(
            'aria-label',
            `String ${notes.length - index}: ${noteName}`
        );
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
            const wasPlaying = tunerVoice !== null && tunerTargetMidi === midi;
            stopGeneratedAudio();

            if (tunerTargetMidi !== midi) {
                tunerTargetMidi = midi;
                for (const candidate of container.children) {
                    candidate.setAttribute(
                        'aria-pressed',
                        String(candidate === button)
                    );
                }
            }

            if (wasPlaying) {
                return;
            }

            tunerVoice = audio.playContinuous(
                midiFrequency(midi),
                getWaveform('tuner').value
            );
            button.classList.add('is-playing');
            resetTunerTracking(true);
            tunerMic.lastValidTime = 0;
            resetTunerDetection(
                tunerMic.stream ? 'Listening...' : 'Microphone off'
            );
        });
        container.append(button);
    });
}

function renderTunerString() {
    getOutput('tuner-closest').textContent = tunerTargetNoteName();
    getOutput('tuner-target').textContent =
        `${midiFrequency(tunerTargetMidi).toFixed(3)} Hz`;
}

let tunerVoice = null;
let tunerStartRequest = null;

async function playTuner() {
    stopGeneratedAudio();
    clearTunerTarget();

    const request = startTunerMic();
    tunerStartRequest = request;

    await request;

    if (request !== tunerStartRequest) {
        return;
    }

    tunerStartRequest = null;
    tunerVoice = audio.playContinuous(
        selectedNoteFrequency(getNote('tuner')),
        getWaveform('tuner').value
    );
}

function stopTuner() {
    tunerStartRequest = null;

    if (!tunerVoice) {
        return;
    }

    tunerVoice.stop();
    tunerVoice = null;

    for (const button of getOutput('tuner-strings').children) {
        button.classList.remove('is-playing');
    }

    if (tunerTargetMidi !== null) {
        setTunerStatus(tunerMic.stream ? 'Listening...' : 'Microphone off');
    }
}

function stopGeneratedAudio() {
    stopTuner();
    stopRhythm();
    audio.stopTransient();
}

function stopAllAudio() {
    stopGeneratedAudio();
}

// Notes

function createNoteOption(midi) {
    const option = document.createElement('option');

    option.value = String(midi);
    option.textContent = midiToNoteName(midi);

    return option;
}

function populateNoteSelector(select) {
    const options = [];

    for (let midi = 36; midi <= 84; midi += 1) {
        options.push(createNoteOption(midi));
    }

    select.replaceChildren(...options);
    select.value = String(DEFAULT_MIDI);
}

function initializeNotes() {
    for (const select of document.querySelectorAll('[data-note]')) {
        populateNoteSelector(select);
    }
}

function updateNoteReadout(select) {
    getOutput(`${select.dataset.note}-note-frequency`).textContent =
        `${selectedNoteFrequency(select).toFixed(3)} Hz`;
}

function updateNoteReadouts() {
    for (const select of document.querySelectorAll('[data-note]')) {
        updateNoteReadout(select);
    }
}

// Navigation

const sectionModes = {
    rhythm: 'metronome',
    pitch: 'placement',
    match: 'target',
    intervals: 'recognition',
};

function isPitchMemoryActive(sectionName) {
    return sectionName === 'pitch' && sectionModes.pitch === 'memory';
}

function sectionHash(sectionName) {
    switch (sectionName) {
        case 'pitch':
        case 'intervals':
        case 'rhythm':
        case 'match': {
            return `#${sectionName}/${sectionModes[sectionName]}`;
        }
        case 'about':
            return '';
    }

    return `#${sectionName}`;
}

function pushUrlHash(hash) {
    if (window.location.hash === hash) {
        return;
    }

    history.pushState(
        null,
        '',
        hash || `${window.location.pathname}${window.location.search}`
    );
}

function updateModeHash(sectionName) {
    pushUrlHash(sectionHash(sectionName));
}

function activateSection(button, updateUrl = true) {
    const sectionName = button.dataset.section;
    const pitchMemoryActive = isPitchMemoryActive(sectionName);

    if (
        !pitchMemoryActive &&
        pitchMemory.trial?.state === 'waiting' &&
        (pitchMemory.trial.type === 'interference' ||
            Date.now() < pitchMemory.trial.encodingEndsAt)
    ) {
        cancelPitchMemoryTrial();
    }

    for (const navItem of document.querySelectorAll('.nav-item')) {
        const active = navItem === button;

        navItem.classList.toggle('is-active', active);
        navItem.removeAttribute('aria-current');
    }

    for (const panel of document.querySelectorAll('.section-panel')) {
        panel.hidden = panel.dataset.panel !== sectionName;
    }

    stopAllAudio();

    if (sectionName !== 'tuner') {
        stopTunerMic();
    }

    if (sectionName !== 'rhythm') {
        stopSheetMic();
    }

    if (
        pitchMemoryActive &&
        pitchMemory.trial &&
        requestedMicrophoneState === MICROPHONE_STATES.LISTENING
    ) {
        void startPitchMemoryMic();
    } else if (!pitchMemoryActive) {
        stopPitchMemoryMic();
    }

    if (
        sectionName === 'tuner' &&
        requestedMicrophoneState === MICROPHONE_STATES.LISTENING
    ) {
        void startTunerMic();
    } else if (
        sectionName === 'rhythm' &&
        sheetMusicEnabled() &&
        requestedMicrophoneState === MICROPHONE_STATES.LISTENING
    ) {
        void startSheetMic();
    }

    cancelPitchAdvance();
    cancelMatchAdvance();
    cancelIntervalAdvance();
    cancelChordAdvance();

    if (updateUrl) {
        pushUrlHash(sectionHash(sectionName));
    }
}

function initializeNavigation() {
    const navItems = [...document.querySelectorAll('.nav-item')];
    const siteNavigation = document.querySelector('.site-nav');
    const navToggle = document.querySelector('.nav-toggle');

    siteNavigation.hidden = false;

    function closeNavigation(restoreFocus = false) {
        document.body.classList.remove('nav-open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Open navigation');
        siteNavigation.setAttribute('aria-hidden', 'true');
        siteNavigation.inert = true;

        if (restoreFocus) {
            navToggle.focus();
        }
    }

    function openNavigation() {
        document.body.classList.add('nav-open');
        navToggle.setAttribute('aria-expanded', 'true');
        navToggle.setAttribute('aria-label', 'Close navigation');
        siteNavigation.setAttribute('aria-hidden', 'false');
        siteNavigation.inert = false;
    }

    function syncModeNavigation() {
        const activeNavItem = navItems.find((item) =>
            item.classList.contains('is-active')
        );
        const activeSection = activeNavItem?.dataset.section;

        if (activeNavItem && !(activeSection in sectionModes)) {
            activeNavItem.setAttribute('aria-current', 'page');
        }

        for (const modeButton of document.querySelectorAll('[data-nav-mode]')) {
            const active =
                modeButton.dataset.navSection === activeSection &&
                sectionModes[activeSection] === modeButton.dataset.navMode;

            modeButton.classList.toggle('is-active', active);

            if (active) {
                modeButton.setAttribute('aria-current', 'page');
            } else {
                modeButton.removeAttribute('aria-current');
            }
        }
    }

    function activateHashSection() {
        const hash = window.location.hash.slice(1);
        const [sectionName, hashMode] = hash.split('/');

        if (
            sectionName === 'pitch' &&
            ['placement', 'memory'].includes(hashMode)
        ) {
            sectionModes.pitch = hashMode;
        } else if (
            sectionName === 'intervals' &&
            ['recognition', 'construction'].includes(hashMode)
        ) {
            sectionModes.intervals = hashMode;
        } else if (
            sectionName === 'match' &&
            ['target', 'identification'].includes(hashMode)
        ) {
            sectionModes.match = hashMode;
        }

        if (
            sectionName === 'rhythm' &&
            ['metronome', 'timing', 'sheet'].includes(hashMode)
        ) {
            sectionModes.rhythm = hashMode;
        }

        const navItem =
            navItems.find(
                (candidate) => candidate.dataset.section === sectionName
            ) ||
            (hash === ''
                ? navItems.find(
                      (candidate) => candidate.dataset.section === 'about'
                  )
                : null);

        if (!navItem) {
            return;
        }

        if (!navItem.classList.contains('is-active')) {
            activateSection(navItem, false);
        }

        switch (sectionName) {
            case 'rhythm':
                updateRhythmMode();
                break;

            case 'pitch':
                updatePitchMode();
                break;

            case 'intervals':
                updateIntervalMode();
                break;

            case 'match':
                updateMatchMode();
                break;
        }

        savePreferences();
        syncModeNavigation();
    }

    navItems.forEach((navItem) => {
        navItem.addEventListener('click', () => {
            activateSection(navItem);
            syncModeNavigation();
        });
    });

    navToggle.addEventListener('click', () => {
        if (document.body.classList.contains('nav-open')) {
            closeNavigation();
        } else {
            openNavigation();
        }
    });

    document.addEventListener('click', (event) => {
        if (
            document.body.classList.contains('nav-open') &&
            !siteNavigation.contains(event.target) &&
            !navToggle.contains(event.target)
        ) {
            closeNavigation();
        }
    });

    for (const modeButton of document.querySelectorAll('[data-nav-mode]')) {
        modeButton.addEventListener('click', () => {
            const sectionName = modeButton.dataset.navSection;
            const navItem = navItems.find(
                (candidate) => candidate.dataset.section === sectionName
            );

            sectionModes[sectionName] = modeButton.dataset.navMode;
            updateModeHash(sectionName);

            switch (sectionName) {
                case 'rhythm':
                    updateRhythmMode();
                    break;
                case 'pitch':
                    updatePitchMode();
                    break;
                case 'match':
                    updateMatchMode();
                    break;
                case 'intervals':
                    updateIntervalMode();
                    break;
            }

            activateSection(navItem);
            syncModeNavigation();
        });
    }

    document.addEventListener('keydown', (event) => {
        if (
            event.key === 'Escape' &&
            document.body.classList.contains('nav-open')
        ) {
            closeNavigation(true);
        }
    });

    window.addEventListener('hashchange', activateHashSection);
    window.addEventListener('popstate', activateHashSection);

    activateHashSection();
    syncModeNavigation();
}

function initializeTooltips() {
    function keepInsideViewport(event) {
        const tip = event.currentTarget;
        const style = getComputedStyle(tip, '::after');
        const tooltipWidth =
            parseFloat(style.width) +
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight) +
            parseFloat(style.borderLeftWidth) +
            parseFloat(style.borderRightWidth);
        const tipBounds = tip.getBoundingClientRect();
        const center = tipBounds.left + tipBounds.width / 2;
        const centeredLeft = center - tooltipWidth / 2;
        const viewportWidth = document.documentElement.clientWidth;
        const boundedLeft = clamp(
            centeredLeft,
            12,
            Math.max(12, viewportWidth - tooltipWidth - 12)
        );

        tip.style.setProperty(
            '--tooltip-shift-x',
            `${boundedLeft - centeredLeft}px`
        );
    }

    for (const tip of document.querySelectorAll('.info-tip')) {
        tip.addEventListener('pointerenter', keepInsideViewport);
        tip.addEventListener('focus', keepInsideViewport);
    }
}

// Tuning

const tunerMic = {
    stream: null,
    source: null,
    analyser: null,
    sampleRate: 0,
    buffer: null,
    frame: null,

    requestId: 0,

    smoothedCents: null,
    smoothedNoteMidi: null,

    pendingMidi: null,
    pendingFrames: 0,

    lastAnalysisTime: 0,
    lastValidTime: 0,

    history: [],
    plot: [],
    plotCenterMidi: DEFAULT_MIDI,
};

function setTunerStatus(text) {
    if (tunerVoice !== null && tunerTargetMidi !== null) {
        text = `Playing string tone · ${text}`;
    }
    getOutput('tuner-status').textContent = text;
}

function resetTunerTracking(resetPending) {
    tunerMic.history = [];

    tunerMic.smoothedCents = null;
    tunerMic.smoothedNoteMidi = null;

    if (resetPending) {
        tunerMic.pendingMidi = null;
        tunerMic.pendingFrames = 0;
    }
}

function resetTunerDetection(status = 'Microphone off') {
    if (tunerTargetMidi !== null) {
        renderTunerString();
    } else {
        getOutput('tuner-closest').textContent = '--';
        getOutput('tuner-target').textContent = '-- Hz';
    }

    getOutput('tuner-detected').textContent = '-- Hz detected';

    getOutput('tuner-cents').textContent = '--';

    const needle = getOutput('tuner-needle');
    needle.classList.remove('is-visible', 'is-in-tune');

    setTunerStatus(status);
}

function renderTunerHistory(time = performance.now()) {
    const canvas = getOutput('tuner-history');
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (width === 0 || height === 0) {
        return;
    }

    const scale = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * scale);
    const pixelHeight = Math.round(height * scale);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }

    const context = canvas.getContext('2d');
    const styles = getComputedStyle(document.documentElement);
    const mutedColor = styles.getPropertyValue('--muted');
    const gridColor = styles.getPropertyValue('--border');
    const pitchColor = styles.getPropertyValue('--target');
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);

    const cutoff = time - TUNER_PLOT_SECONDS * 1000;
    tunerMic.plot = tunerMic.plot.filter((sample) => sample.time >= cutoff);
    const visibleMidis = tunerMic.plot.map((sample) =>
        midiFromFrequency(sample.frequencyHz)
    );
    const minimumMidi =
        Math.floor(
            visibleMidis.length
                ? Math.min(...visibleMidis)
                : tunerMic.plotCenterMidi
        ) - TUNER_PLOT_PADDING_SEMITONES;
    const maximumMidi =
        Math.ceil(
            visibleMidis.length
                ? Math.max(...visibleMidis)
                : tunerMic.plotCenterMidi
        ) + TUNER_PLOT_PADDING_SEMITONES;
    const midiRange = maximumMidi - minimumMidi;
    const labelWidth = 34;
    const plotWidth = width - labelWidth;
    const plotTop = 8;
    const plotHeight = height - plotTop * 2;
    canvas.setAttribute(
        'aria-label',
        'Detected pitch history over the last eight seconds'
    );
    const yForMidi = (midi) =>
        plotTop + (1 - (midi - minimumMidi) / midiRange) * plotHeight;

    context.font = '10px system-ui, sans-serif';
    context.textBaseline = 'middle';
    context.textAlign = 'right';
    for (
        let midi = Math.ceil(minimumMidi);
        midi <= Math.floor(maximumMidi);
        midi += 1
    ) {
        const y = yForMidi(midi);
        const octaveBoundary =
            ((midi % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) %
                SEMITONES_PER_OCTAVE ===
            0;
        if (octaveBoundary) {
            context.fillStyle = mutedColor;
            context.fillText(midiToNoteName(midi), labelWidth - 6, y);
        }
        context.globalAlpha = octaveBoundary ? 1 : 0.3;
        context.strokeStyle = gridColor;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(labelWidth, Math.round(y) + 0.5);
        context.lineTo(width - 1, Math.round(y) + 0.5);
        context.stroke();
    }
    context.globalAlpha = 1;

    context.save();
    context.beginPath();
    context.rect(labelWidth, 0, plotWidth, height);
    context.clip();
    context.strokeStyle = pitchColor;
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.beginPath();
    let previousTime = null;
    let previousInRange = false;
    for (const sample of tunerMic.plot) {
        const exactMidi = midiFromFrequency(sample.frequencyHz);
        const x =
            labelWidth +
            ((sample.time - cutoff) / (TUNER_PLOT_SECONDS * 1000)) * plotWidth;
        const y = yForMidi(exactMidi);
        const inRange = exactMidi >= minimumMidi && exactMidi <= maximumMidi;
        if (
            !inRange ||
            !previousInRange ||
            sample.time - previousTime > TUNER_ANALYSIS_INTERVAL_MS * 3
        ) {
            context.moveTo(x, y);
        } else {
            context.lineTo(x, y);
        }
        previousTime = sample.time;
        previousInRange = inRange;
    }
    context.stroke();
    context.restore();
}

function initializeTunerHistory() {
    const canvas = getOutput('tuner-history');
    const observer = new ResizeObserver(() => renderTunerHistory());
    observer.observe(canvas);
}

function stopTunerMic() {
    if (tunerMic.frame !== null) {
        cancelAnimationFrame(tunerMic.frame);

        tunerMic.frame = null;
    }

    pauseMicrophoneInput(tunerMic);

    tunerMic.lastAnalysisTime = 0;

    tunerMic.lastValidTime = 0;

    resetTunerTracking(true);

    resetTunerDetection();
}

function detectPitchYin(
    samples,
    sampleRate,
    minimumHz,
    maximumHz,
    threshold = TUNER_YIN_THRESHOLD,
    sampleStride = 1
) {
    let squareTotal = 0;
    const sampleLength = Math.floor(samples.length / sampleStride);
    const analysisSampleRate = sampleRate / sampleStride;

    for (let index = 0; index < sampleLength; index += 1) {
        const sample = samples[index * sampleStride];
        squareTotal += sample * sample;
    }

    const rms = Math.sqrt(squareTotal / sampleLength);

    if (rms < TUNER_MIN_RMS) {
        return null;
    }

    const minimumPeriod = Math.max(
        2,
        Math.floor(analysisSampleRate / maximumHz)
    );

    const maximumPeriod = Math.min(
        Math.floor(analysisSampleRate / minimumHz),
        Math.floor(sampleLength / 2)
    );

    if (maximumPeriod <= minimumPeriod + 2) {
        return null;
    }

    const difference = new Float32Array(maximumPeriod + 1);

    const windowLength = sampleLength - maximumPeriod;

    for (let period = 1; period <= maximumPeriod; period += 1) {
        let total = 0;

        for (let index = 0; index < windowLength; index += 1) {
            const delta =
                samples[index * sampleStride] -
                samples[(index + period) * sampleStride];

            total += delta * delta;
        }

        difference[period] = total;
    }

    difference[0] = 1;

    let runningTotal = 0;

    for (let period = 1; period <= maximumPeriod; period += 1) {
        runningTotal += difference[period];

        difference[period] =
            runningTotal === 0
                ? 1
                : (difference[period] * period) / runningTotal;
    }

    let bestPeriod = -1;

    for (let period = minimumPeriod; period <= maximumPeriod; period += 1) {
        if (difference[period] >= threshold) {
            continue;
        }

        while (
            period + 1 <= maximumPeriod &&
            difference[period + 1] < difference[period]
        ) {
            period += 1;
        }

        bestPeriod = period;

        break;
    }

    if (bestPeriod === -1) {
        let bestValue = Infinity;

        for (let period = minimumPeriod; period <= maximumPeriod; period += 1) {
            if (difference[period] < bestValue) {
                bestValue = difference[period];

                bestPeriod = period;
            }
        }

        if (bestPeriod === -1 || bestValue > 0.25) {
            return null;
        }
    }

    let refinedPeriod = bestPeriod;

    if (bestPeriod > 1 && bestPeriod < maximumPeriod) {
        const left = difference[bestPeriod - 1];

        const center = difference[bestPeriod];

        const right = difference[bestPeriod + 1];

        const denominator = left - 2 * center + right;

        if (Math.abs(denominator) > 1e-12) {
            refinedPeriod += (0.5 * (left - right)) / denominator;
        }
    }

    if (!Number.isFinite(refinedPeriod) || refinedPeriod <= 0) {
        return null;
    }

    return analysisSampleRate / refinedPeriod;
}

function nearestMusicalNote(frequencyHz) {
    /*
     * MIDI 69 is A4.
     * The user's global A4 reference is
     * respected here.
     */
    const exactMidi = midiFromFrequency(frequencyHz);

    const midi = Math.round(exactMidi);

    const targetHz = midiFrequency(midi);

    return {
        midi,

        name: midiToNoteName(midi),

        targetHz,

        cents: centsBetween(frequencyHz, targetHz),
    };
}

function renderTunerDetection(frequencyHz) {
    const targetHz =
        tunerTargetMidi === null ? null : midiFrequency(tunerTargetMidi);
    const scoredFrequencyHz =
        targetHz === null
            ? frequencyHz
            : nearestOctaveFrequency(frequencyHz, targetHz);
    const nearest =
        targetHz === null
            ? nearestMusicalNote(frequencyHz)
            : {
                  midi: tunerTargetMidi,
                  name: tunerTargetNoteName(),
                  targetHz,
                  cents: centsBetween(scoredFrequencyHz, targetHz),
              };

    if (tunerMic.smoothedNoteMidi !== nearest.midi) {
        tunerMic.smoothedNoteMidi = nearest.midi;

        tunerMic.smoothedCents = nearest.cents;
    } else {
        tunerMic.smoothedCents +=
            (nearest.cents - tunerMic.smoothedCents) * TUNER_SMOOTHING;
    }

    const cents = tunerMic.smoothedCents;

    const limitedCents = clamp(cents, -50, 50);

    const percent = limitedCents + 50;

    getOutput('tuner-closest').textContent = nearest.name;

    getOutput('tuner-target').textContent = `${nearest.targetHz.toFixed(3)} Hz`;

    const detectedNote =
        tunerTargetMidi === null
            ? ''
            : `${nearestMusicalNote(frequencyHz).name} · `;
    getOutput('tuner-detected').textContent =
        `${detectedNote}${frequencyHz.toFixed(3)} Hz detected`;

    getOutput('tuner-cents').textContent = `${signed(cents, 1)} cents`;

    const inTune = Math.abs(cents) <= 3;

    const needle = getOutput('tuner-needle');
    needle.style.left = `${percent}%`;
    needle.classList.add('is-visible');
    needle.classList.toggle('is-in-tune', inTune);
    setTunerStatus('Listening...');
}

function analyzeTunerMic(time) {
    if (!tunerMic.analyser || !tunerMic.buffer) {
        return;
    }

    if (time - tunerMic.lastAnalysisTime >= TUNER_ANALYSIS_INTERVAL_MS) {
        tunerMic.lastAnalysisTime = time;

        tunerMic.analyser.getFloatTimeDomainData(tunerMic.buffer);

        const frequencyHz = detectPitchYin(
            tunerMic.buffer,
            tunerMic.sampleRate,
            TUNER_MIN_HZ,
            TUNER_MAX_HZ,
            TUNER_YIN_THRESHOLD,
            TUNER_ANALYSIS_SAMPLE_STRIDE
        );

        if (frequencyHz !== null) {
            const nearest = nearestMusicalNote(frequencyHz);

            if (nearest.midi !== tunerMic.pendingMidi) {
                tunerMic.pendingMidi = nearest.midi;

                tunerMic.pendingFrames = 1;

                tunerMic.history = [];
            } else {
                tunerMic.pendingFrames += 1;
            }

            if (tunerMic.pendingFrames >= TUNER_STABLE_FRAMES) {
                tunerMic.lastValidTime = time;

                tunerMic.history.push(frequencyHz);

                if (tunerMic.history.length > TUNER_HISTORY_LENGTH) {
                    tunerMic.history.shift();
                }

                const detectedHz = median(tunerMic.history);
                const exactMidi = midiFromFrequency(detectedHz);
                tunerMic.plotCenterMidi = exactMidi;
                tunerMic.plot.push({ time, frequencyHz: detectedHz });
                renderTunerDetection(detectedHz);
            }
        }

        if (time - tunerMic.lastValidTime > 400) {
            resetTunerTracking(frequencyHz === null);

            resetTunerDetection('No stable pitch');
        }
    }

    renderTunerHistory(time);

    tunerMic.frame = requestAnimationFrame(analyzeTunerMic);
}

async function startTunerMic() {
    if (microphoneInputConnected(tunerMic)) {
        if (
            (await setMicrophoneState(MICROPHONE_STATES.LISTENING)) !==
            MICROPHONE_STATES.LISTENING
        ) {
            return false;
        }
        if (tunerMic.frame === null) {
            tunerMic.frame = requestAnimationFrame(analyzeTunerMic);
        }
        setTunerStatus('Listening...');
        return true;
    }

    resetTunerDetection('Requesting microphone access...');

    try {
        if (!(await startMicrophoneInput(tunerMic, TUNER_ANALYSIS_FFT_SIZE))) {
            if (microphoneState === MICROPHONE_STATES.DENIED) {
                resetTunerDetection(microphoneFailureMessage);
            }
            return false;
        }

        tunerMic.lastAnalysisTime = 0;

        tunerMic.lastValidTime = performance.now();

        tunerMic.plot = [];
        renderTunerHistory();

        resetTunerTracking(true);

        setTunerStatus('Listening...');

        tunerMic.frame = requestAnimationFrame(analyzeTunerMic);
        return true;
    } catch {
        resetTunerDetection(MICROPHONE_FAILURE_MESSAGES.FAILED);
        return false;
    }
}

// Rhythm

const rhythm = {
    running: false,
    timer: null,
    frame: null,
    nextBeatTime: 0,
    beatIndex: 0,
    tapTimes: [],
};

const rhythmTiming = {
    originMs: 0,
    interval: 0.6,
    frame: null,
    lastBeat: -1,
    markBeat: null,
    errors: [],
};

const sheetMusic = {
    phrase: [],
    nextNoteIndex: 0,
    origin: 0,
    interval: 0.6,
    frame: null,
    active: false,
    held: null,
    input: null,
    extra: 0,
    holdSpans: [],
    currentHold: null,
    starting: false,
    mic: {
        requestId: 0,
        stream: null,
        source: null,
        analyser: null,
        sampleRate: 0,
        buffer: null,
        frame: null,
        lastAnalysisTime: 0,
        stableFrames: 0,
        silentFrames: 0,
        frequencies: [],
        voiceStartedAt: null,
        silenceStartedAt: null,
    },
};

// Rhythm: sheet music

function sheetMusicEnabled() {
    return sectionModes.rhythm === 'sheet';
}

function midiToDiatonicPosition(midi) {
    const roundedMidi = Math.round(midi);
    const pitchClass =
        ((roundedMidi % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) %
        SEMITONES_PER_OCTAVE;
    const naturalIndex = NATURAL_PITCH_CLASSES.indexOf(pitchClass);
    const octave = Math.floor(roundedMidi / SEMITONES_PER_OCTAVE) - 1;

    return octave * 7 + naturalIndex;
}

function sheetClef() {
    return SHEET_CLEFS[getControl('rhythm-sheet-clef').value];
}

function randomSheetMidi(previousMidi = null) {
    const clef = sheetClef();
    const pitches = [];

    for (let midi = clef.minimumMidi; midi <= clef.maximumMidi; midi += 1) {
        if (NATURAL_PITCH_CLASSES.includes(midi % SEMITONES_PER_OCTAVE)) {
            pitches.push(midi);
        }
    }

    if (!Number.isFinite(previousMidi)) {
        return pitches[Math.floor(Math.random() * pitches.length)];
    }

    const nearbyPitches = pitches.filter(
        (midi) => Math.abs(midi - previousMidi) <= 5
    );
    const weightedPitches = nearbyPitches.flatMap((midi) => {
        const distance = Math.abs(midi - previousMidi);
        const weight = distance === 0 ? 4 : distance <= 2 ? 5 : 2;

        return Array(weight).fill(midi);
    });

    return weightedPitches[Math.floor(Math.random() * weightedPitches.length)];
}

function rhythmMeter(signature) {
    const [units, denominator] = signature.split('/').map(Number);
    return {
        units,
        denominator,
        compound:
            denominator === 8 &&
            units >= 6 &&
            units % RHYTHM_COMPOUND_SUBDIVISIONS === 0,
    };
}

function rhythmClickInterval(signature, bpm) {
    return (
        60 /
        bpm /
        (rhythmMeter(signature).compound ? RHYTHM_COMPOUND_SUBDIVISIONS : 1)
    );
}

function rhythmNoteValue(note) {
    const denominator = sheetMusic.meter.denominator;
    for (const noteValue of RHYTHM_NOTE_VALUES) {
        const { value } = noteValue;
        const duration = denominator / value;
        if (note.duration === duration) {
            return {
                ...noteValue,
                dotted: false,
            };
        }
        if (note.duration === duration * RHYTHM_DOT_MULTIPLIER) {
            return {
                ...noteValue,
                dotted: true,
            };
        }
    }
    throw new Error('Unsupported rhythm note duration');
}

function rhythmNoteName(note) {
    const { name, dotted } = rhythmNoteValue(note);
    return `${dotted ? 'dotted ' : ''}${name}`;
}

function rhythmNotePosition(note) {
    const { units, compound } = sheetMusic.meter;
    return `Bar ${Math.floor(note.beat / units) + 1}, ${compound ? 'subdivision' : 'beat'} ${(note.beat % units) + 1}`;
}

function randomRhythmPattern(patterns) {
    return patterns[Math.floor(Math.random() * patterns.length)];
}

function rhythmBeatPattern(denominator, allowSixteenths) {
    const supportedDurations = new Set(
        RHYTHM_NOTE_VALUES.map(({ value }) => denominator / value)
    );
    const eighthDuration = denominator / 8;
    const sixteenthDuration = denominator / 16;
    const sixteenthRemainder = 1 - sixteenthDuration * 2;
    const sixteenthPatternSupported =
        allowSixteenths &&
        supportedDurations.has(sixteenthDuration) &&
        (sixteenthRemainder === 0 ||
            supportedDurations.has(sixteenthRemainder));
    const eighthPatternStart = sixteenthPatternSupported
        ? SHEET_SIXTEENTH_PATTERN_RATE
        : 0;
    const roll = Math.random();

    if (sixteenthPatternSupported && roll < SHEET_SIXTEENTH_PATTERN_RATE) {
        const paired = Math.random() < SHEET_SIXTEENTH_PAIR_RATE;
        const pattern = [
            { duration: sixteenthDuration, rest: false },
            { duration: sixteenthDuration, rest: paired ? false : true },
        ];

        if (sixteenthRemainder > 0) {
            pattern.push({ duration: sixteenthRemainder, rest: false });
        }

        return pattern;
    }

    if (
        roll >= eighthPatternStart &&
        roll < eighthPatternStart + SHEET_EIGHTH_PATTERN_RATE &&
        supportedDurations.has(eighthDuration) &&
        Number.isInteger(1 / eighthDuration)
    ) {
        return Array.from({ length: 1 / eighthDuration }, () => ({
            duration: eighthDuration,
            rest: null,
        }));
    }

    return [{ duration: 1, rest: null }];
}

function rhythmGroupPattern(length, denominator, includeDots, limits) {
    const sixteenthDuration = denominator / 16;
    const sustainedPatterns = RHYTHM_NOTE_VALUES.flatMap(({ value }) => {
        if (value > 4) {
            return [];
        }

        const duration = denominator / value;
        const patterns = [];

        for (const dotted of includeDots ? [false, true] : [false]) {
            if (dotted && value === 1) {
                continue;
            }

            const writtenDuration =
                duration * (dotted ? RHYTHM_DOT_MULTIPLIER : 1);
            const count = length / writtenDuration;

            if (
                Number.isInteger(count) &&
                count <= 4 &&
                (!dotted || count === 1)
            ) {
                const pattern = Array.from({ length: count }, () => ({
                    duration: writtenDuration,
                    rest: null,
                }));
                if (
                    !limits.sixteenthGroupUsed ||
                    !pattern.some(
                        (event) => event.duration === sixteenthDuration
                    )
                ) {
                    patterns.push(pattern);
                }
            }
        }

        return patterns;
    });

    if (denominator === 4 && length === 3) {
        sustainedPatterns.push(
            [
                { duration: 2, rest: null },
                { duration: 1, rest: null },
            ],
            [
                { duration: 1, rest: null },
                { duration: 2, rest: null },
            ]
        );
    }

    if (
        sustainedPatterns.length &&
        Math.random() < SHEET_SUSTAINED_PATTERN_RATE
    ) {
        const pattern = randomRhythmPattern(sustainedPatterns);
        limits.sixteenthGroupUsed ||= pattern.some(
            (event) => event.duration === sixteenthDuration
        );
        return pattern;
    }

    const pattern = [];
    for (let beat = 0; beat < length; beat += 1) {
        const beatPattern = rhythmBeatPattern(
            denominator,
            !limits.sixteenthGroupUsed
        );
        limits.sixteenthGroupUsed ||= beatPattern.some(
            (event) => event.duration === sixteenthDuration
        );
        pattern.push(...beatPattern);
    }

    return pattern;
}

function rhythmGroups(pattern) {
    const starts = pattern
        .map((strength, index) => (strength > 0 ? index : null))
        .filter((index) => index !== null);

    return starts.map((start, index) => ({
        start,
        length: (starts[index + 1] ?? pattern.length) - start,
    }));
}

function rhythmSegments(note) {
    return (
        note.segments ?? [
            {
                beat: note.beat,
                duration: note.duration,
            },
        ]
    );
}

function rhythmWrittenName(note) {
    return rhythmSegments(note).map(rhythmNoteName).join(' tied to ');
}

function addRhythmTie() {
    if (Math.random() >= SHEET_TIE_RATE) {
        return;
    }

    const { units, denominator } = sheetMusic.meter;
    const minimumSegmentDuration = denominator / 8;
    const candidates = [];

    for (let boundary = units; boundary < sheetMusic.total; boundary += units) {
        const previousIndex = sheetMusic.phrase.findIndex(
            (note) => note.beat + note.duration === boundary
        );
        const nextIndex = sheetMusic.phrase.findIndex(
            (note) => note.beat === boundary
        );

        if (previousIndex < 0 || nextIndex < 0) {
            continue;
        }

        const previous = sheetMusic.phrase[previousIndex];
        const next = sheetMusic.phrase[nextIndex];
        const duration = previous.duration + next.duration;

        if (
            previous.rest ||
            next.rest ||
            previous.duration < minimumSegmentDuration ||
            next.duration < minimumSegmentDuration ||
            duration < 2 ||
            duration > 4
        ) {
            continue;
        }

        candidates.push({ previousIndex, nextIndex });
    }

    if (!candidates.length) {
        return;
    }

    const { previousIndex, nextIndex } = randomRhythmPattern(candidates);
    const previous = sheetMusic.phrase[previousIndex];
    const next = sheetMusic.phrase[nextIndex];

    previous.segments = [
        { beat: previous.beat, duration: previous.duration },
        { beat: next.beat, duration: next.duration },
    ];
    previous.duration += next.duration;
    sheetMusic.phrase.splice(nextIndex, 1);
}

function newRhythmPhrase() {
    stopGeneratedAudio();
    sheetMusic.signature = getControl('shared-time-signature').value;
    sheetMusic.meter = rhythmMeter(sheetMusic.signature);
    const { units, denominator } = sheetMusic.meter;
    sheetMusic.bars = Number(getControl('rhythm-sheet-bars').value);
    sheetMusic.clef = getControl('rhythm-sheet-clef').value;
    sheetMusic.total = units * sheetMusic.bars;
    sheetMusic.phrase = [];
    const includeDots =
        getControl('rhythm-sheet-note-values').value === 'all-dotted';
    const groups = rhythmGroups(RHYTHM_METERS[sheetMusic.signature]);
    const limits = { sixteenthGroupUsed: false };
    let previousMidi = null;
    for (let bar = 0; bar < sheetMusic.bars; bar += 1) {
        let barHasRest = false;
        for (const group of groups) {
            let beat = bar * units + group.start;
            const events = rhythmGroupPattern(
                group.length,
                denominator,
                includeDots,
                limits
            );

            for (const event of events) {
                const { duration } = event;
                const rest =
                    event.rest === true
                        ? !barHasRest
                        : event.rest === false
                          ? false
                          : beat !== 0 && !barHasRest && Math.random() < 0.15;
                barHasRest ||= rest;
                const midi = rest ? null : randomSheetMidi(previousMidi);
                previousMidi = midi ?? previousMidi;
                sheetMusic.phrase.push({
                    beat,
                    duration,
                    rest,
                    midi,
                    attack: null,
                    release: null,
                    pitchHz: null,
                    pitchError: null,
                    pitchSamples: [],
                });
                beat += duration;
            }
        }
    }
    addRhythmTie();
    renderRhythmScore();
}

function rhythmDurationLabel(duration) {
    const fractions = {
        0.125: '⅛',
        0.25: '¼',
        0.375: '⅜',
        0.5: '½',
        0.75: '¾',
    };
    const whole = Math.floor(duration);
    const fraction = fractions[duration - whole] || '';
    return `${whole || !fraction ? whole : ''}${fraction}`;
}

function rhythmDurationUnit() {
    return sheetMusic.meter.compound ? 'subdivisions' : 'beats';
}

function clearRhythmSheetResults() {
    document.getElementById('rhythm-sheet-practice-results').hidden = true;
    document.getElementById('rhythm-sheet-result').textContent = '';
    document.getElementById('rhythm-sheet-stats').hidden = true;
    document.getElementById('rhythm-sheet-results-heading').hidden = true;
    document.getElementById('rhythm-sheet-results').hidden = true;
}

function showRhythmSheetResult(text) {
    document.getElementById('rhythm-sheet-result').textContent = text;
    document.getElementById('rhythm-sheet-practice-results').hidden = false;
}

function showRhythmSheetReport() {
    document.getElementById('rhythm-sheet-practice-results').hidden = false;
    document.getElementById('rhythm-sheet-stats').hidden = false;
    document.getElementById('rhythm-sheet-results-heading').hidden = false;
    document.getElementById('rhythm-sheet-results').hidden = false;
}

function sheetBarWidth() {
    return (
        sheetMusic.meter.units * sheetMusic.spacing + SHEET_BAR_PADDING_REM * 2
    );
}

function sheetWrittenPosition(position, boundarySide = 'start') {
    const { units } = sheetMusic.meter;

    if (position < 0) {
        return SHEET_BAR_PADDING_REM + position * sheetMusic.spacing;
    }

    const bar = Math.floor(position / units);
    const withinBar = position - bar * units;

    if (position > 0 && withinBar === 0 && boundarySide === 'end') {
        return bar * sheetBarWidth() - SHEET_BAR_PADDING_REM;
    }

    return (
        bar * sheetBarWidth() +
        SHEET_BAR_PADDING_REM +
        withinBar * sheetMusic.spacing
    );
}

function sheetPlaybackPosition(position) {
    const { units } = sheetMusic.meter;

    if (position < 0) {
        return sheetWrittenPosition(position);
    }
    if (position >= sheetMusic.total) {
        return (
            sheetWrittenPosition(sheetMusic.total, 'end') +
            (position - sheetMusic.total) * sheetMusic.spacing
        );
    }

    const bar = Math.floor(position / units);
    const withinBar = position - bar * units;
    const glideBeats = Math.min(
        0.5,
        SHEET_BAR_GLIDE_SECONDS / sheetMusic.interval
    );
    const glideStart = units - glideBeats;
    const writtenPosition = sheetWrittenPosition(position);

    if (bar >= sheetMusic.bars - 1 || withinBar <= glideStart) {
        return writtenPosition;
    }

    const progress = (withinBar - glideStart) / glideBeats;
    const easedProgress = progress * progress * (3 - 2 * progress);

    return writtenPosition + SHEET_BAR_PADDING_REM * 2 * easedProgress;
}

function rhythmBeamGroups(writtenNotes) {
    const { units, compound } = sheetMusic.meter;
    const beatLength = compound ? RHYTHM_COMPOUND_SUBDIVISIONS : 1;
    const groups = [];
    let group = [];

    function finishGroup() {
        if (group.length > 1) {
            groups.push(group);
        }
        group = [];
    }

    for (const writtenNote of writtenNotes) {
        const { note, segment, value } = writtenNote;
        const bar = Math.floor(segment.beat / units);
        const beat = Math.floor((segment.beat % units) / beatLength);
        const previous = group.at(-1);
        const followsPrevious =
            previous &&
            previous.segment.beat + previous.segment.duration === segment.beat;
        const sameBeat =
            previous && previous.bar === bar && previous.beat === beat;

        if (note.rest || value.value < 8 || !followsPrevious || !sameBeat) {
            finishGroup();
        }

        if (!note.rest && value.value >= 8) {
            writtenNote.bar = bar;
            writtenNote.beat = beat;
            group.push(writtenNote);
        }
    }

    finishGroup();
    return groups;
}

function renderRhythmScore() {
    sheetMusic.holdSpans = [];
    sheetMusic.currentHold = null;
    const score = document.getElementById('rhythm-sheet-score');
    const scoreStyles = getComputedStyle(score);
    const rem = (property) =>
        Number.parseFloat(scoreStyles.getPropertyValue(property));
    const beamThickness = rem('--rhythm-sheet-beam-thickness');
    const noteheadY = rem('--rhythm-sheet-notehead-y');
    const stemLength = rem('--rhythm-sheet-stem-length');
    const beamWidthExtension = rem('--rhythm-sheet-beam-width-extension');
    const beamStemInset = rem('--rhythm-sheet-beam-stem-inset');
    const beamGeometry = Object.fromEntries(
        ['up', 'down'].map((direction) => [
            direction,
            {
                stemX: rem(`--rhythm-sheet-${direction}-stem-x`),
                beamX: rem(`--rhythm-sheet-${direction}-beam-x`),
                noteY: rem(`--rhythm-sheet-${direction}-note-y`),
                layoutY: rem(`--rhythm-sheet-${direction}-layout-y`),
                stemAtNoteInset: rem(
                    `--rhythm-sheet-${direction}-stem-note-inset`
                ),
            },
        ])
    );
    clearRhythmSheetResults();
    document.getElementById('rhythm-sheet-stats').replaceChildren();
    document.getElementById('rhythm-sheet-results').replaceChildren();
    const { units, denominator, compound } = sheetMusic.meter;
    const clefDefinition = SHEET_CLEFS[sheetMusic.clef];
    sheetMusic.spacing = (SHEET_REM_PER_QUARTER * 4) / denominator;
    const staff = document.createElement('span');
    staff.className = 'rhythm-sheet-staff';
    staff.setAttribute('aria-hidden', 'true');
    for (let lineIndex = 0; lineIndex < 5; lineIndex += 1) {
        staff.append(document.createElement('span'));
    }
    const lane = document.createElement('div');
    lane.id = 'rhythm-sheet-lane';
    lane.className = 'rhythm-sheet-lane';
    for (let index = 0; index < units; index += 1) {
        const marker = document.createElement('span');
        marker.className = 'rhythm-sheet-count-marker';
        marker.style.left = `${sheetWrittenPosition(index - units)}rem`;
        marker.textContent = String(index + 1);
        lane.append(marker);
    }
    for (let bar = 0; bar <= sheetMusic.bars; bar += 1) {
        const line = document.createElement('span');
        line.className = 'rhythm-sheet-barline';
        line.style.left = `${bar * sheetBarWidth()}rem`;
        line.textContent = bar === sheetMusic.bars ? '𝄂' : '𝄀';

        lane.append(line);
    }
    const heading = document.createElement('span');
    heading.className = 'rhythm-sheet-score-heading';
    heading.style.left = `${sheetWrittenPosition(-units)}rem`;
    const clef = document.createElement('span');
    clef.className = `rhythm-sheet-clef rhythm-sheet-clef-${sheetMusic.clef}`;
    clef.textContent = clefDefinition.symbol;
    const signature = document.createElement('span');
    signature.className = 'rhythm-sheet-signature';
    if (RHYTHM_SIGNATURE_SYMBOLS[sheetMusic.signature]) {
        signature.textContent = RHYTHM_SIGNATURE_SYMBOLS[sheetMusic.signature];
    } else {
        signature.classList.add('is-numeric');
        const [top, bottom] = sheetMusic.signature.split('/');
        for (const number of [top, bottom]) {
            const row = document.createElement('span');
            row.textContent = number;
            signature.append(row);
        }
    }
    heading.append(clef, signature);
    lane.append(heading);

    const writtenNotes = sheetMusic.phrase.flatMap((note, noteIndex) =>
        rhythmSegments(note).map((segment, segmentIndex) => ({
            note,
            noteIndex,
            segment,
            segmentIndex,
            staffStep: note.rest
                ? null
                : midiToDiatonicPosition(note.midi) -
                  clefDefinition.bottomLineDiatonic,
            value: rhythmNoteValue(segment),
        }))
    );
    const beamMembership = new Map();
    const beamGroups = rhythmBeamGroups(writtenNotes);
    const beamLayouts = new Map();

    for (const group of beamGroups) {
        const averageStaffStep =
            group.reduce((sum, note) => sum + note.staffStep, 0) / group.length;
        const stemDown = averageStaffStep >= 4;
        const geometry = beamGeometry[stemDown ? 'down' : 'up'];
        const noteYOffset = geometry.noteY;
        const xStart =
            sheetWrittenPosition(group[0].segment.beat) + geometry.beamX;
        const xEnd =
            sheetWrittenPosition(group.at(-1).segment.beat) + geometry.beamX;
        const firstNoteY = noteheadY - group[0].staffStep * 0.375 + noteYOffset;
        const lastNoteY =
            noteheadY - group.at(-1).staffStep * 0.375 + noteYOffset;
        const naturalStemLength = stemDown ? stemLength : -stemLength;
        let yStart = firstNoteY + naturalStemLength;
        let yEnd =
            yStart +
            (stemDown
                ? lastNoteY - firstNoteY
                : clamp(lastNoteY - firstNoteY, -0.375, 0.375));
        const slope = (yEnd - yStart) / (xEnd - xStart);
        const requiredOffset = stemDown
            ? Math.max(
                  0,
                  ...group.map((note) => {
                      const x =
                          sheetWrittenPosition(note.segment.beat) +
                          geometry.stemX;
                      const beamY = yStart + (x - xStart) * slope;
                      const naturalY =
                          noteheadY -
                          note.staffStep * 0.375 +
                          noteYOffset +
                          naturalStemLength;
                      return naturalY - beamY;
                  })
              )
            : Math.min(
                  0,
                  ...group.map((note) => {
                      const x =
                          sheetWrittenPosition(note.segment.beat) +
                          geometry.stemX;
                      const beamY = yStart + (x - xStart) * slope;
                      const naturalY =
                          noteheadY -
                          note.staffStep * 0.375 +
                          noteYOffset +
                          naturalStemLength;
                      return naturalY - beamY;
                  })
              );
        yStart += requiredOffset;
        yEnd += requiredOffset;
        yStart += geometry.layoutY;
        yEnd += geometry.layoutY;
        const layout = {
            stemDown,
            noteYOffset,
            xStart,
            xEnd,
            yStart,
            yEnd,
        };
        beamLayouts.set(group, layout);

        for (const writtenNote of group) {
            beamMembership.set(writtenNote, layout);
        }
    }

    for (const writtenNote of writtenNotes) {
        const { note, noteIndex, segment, segmentIndex, staffStep, value } =
            writtenNote;
        const beam = beamMembership.get(writtenNote);

        const x = sheetWrittenPosition(segment.beat);
        const width =
            sheetWrittenPosition(segment.beat + segment.duration, 'end') - x;
        const element = document.createElement('span');
        element.id = `rhythm-note-${noteIndex}-${segmentIndex}`;
        element.className = `rhythm-sheet-lane-note${note.rest ? ' is-rest' : ''}`;
        element.dataset.rhythmSheetNoteIndex = String(noteIndex);
        element.style.left = `${x}rem`;
        element.style.width = `${width}rem`;
        const pitchName = note.rest ? '' : `${midiToTunerNoteName(note.midi)} `;
        const tied = rhythmSegments(note).length > 1 ? ' tied' : '';
        element.title = `${pitchName}${rhythmNoteName(segment)} ${note.rest ? 'rest' : `note${tied}`} - ${rhythmDurationLabel(segment.duration)} ${rhythmDurationUnit()}`;
        const symbol = document.createElement('span');
        symbol.className = 'rhythm-sheet-note-symbol';
        symbol.setAttribute('aria-hidden', 'true');
        symbol.classList.add(`is-${value.name}`);
        symbol.textContent = `${note.rest ? value.rest : value.symbol}${value.dotted ? '.' : ''}`;
        if (!note.rest) {
            symbol.style.setProperty('--staff-step', String(staffStep));
            symbol.classList.toggle(
                'is-stem-down',
                (beam?.stemDown ?? staffStep >= 4) && value.name !== 'whole'
            );
            if (beam) {
                symbol.classList.add('is-beamed');
                symbol.textContent = '𝅘';
            } else {
                symbol.textContent = value.symbol;
            }
            if (value.dotted) {
                const dot = document.createElement('span');
                dot.className = 'rhythm-sheet-note-dot';
                dot.style.setProperty(
                    '--staff-step',
                    String(staffStep % 2 === 0 ? staffStep + 1 : staffStep)
                );
                element.append(dot);
            }
            const ledgerSteps = [];
            for (let step = -2; step >= staffStep; step -= 2) {
                ledgerSteps.push(step);
            }
            for (let step = 10; step <= staffStep; step += 2) {
                ledgerSteps.push(step);
            }
            for (const ledgerStep of ledgerSteps) {
                const ledger = document.createElement('span');
                ledger.className = 'rhythm-sheet-ledger-line';
                ledger.style.setProperty('--staff-step', String(ledgerStep));
                element.append(ledger);
            }
        }
        const track = document.createElement('span');
        track.className = 'rhythm-sheet-duration-track';
        element.append(symbol, track);
        lane.append(element);
    }

    for (const group of beamGroups) {
        const layout = beamLayouts.get(group);
        const { stemDown, noteYOffset, xStart, xEnd, yStart, yEnd } = layout;
        const geometry = beamGeometry[stemDown ? 'down' : 'up'];
        const slope = (yEnd - yStart) / (xEnd - xStart);
        const beamYAt = (x) => yStart + (x - xStart) * slope;
        const appendBeam = (start, end, secondary = false) => {
            const stemStartX =
                sheetWrittenPosition(start.segment.beat) + geometry.beamX;
            const stemEndX =
                sheetWrittenPosition(end.segment.beat) + geometry.beamX;
            const startX = stemStartX;
            const endX = stemEndX + beamWidthExtension;
            const offset = secondary ? (stemDown ? -0.35 : 0.35) : 0;
            const beamInset = stemDown ? -beamThickness : beamThickness;
            const startY = beamYAt(startX) + offset + beamInset;
            const endY = beamYAt(endX) + offset + beamInset;
            const top = Math.min(startY, endY);
            const leftTop = startY - top;
            const rightTop = endY - top;
            const beam = document.createElement('span');
            beam.className = `rhythm-sheet-beam${secondary ? ' is-secondary' : ''}`;
            beam.style.left = `${startX}rem`;
            beam.style.top = `${top}rem`;
            beam.style.width = `${endX - startX}rem`;
            beam.style.height = `${Math.abs(endY - startY) + beamThickness}rem`;
            beam.style.clipPath = `polygon(0 ${leftTop}rem, 100% ${rightTop}rem, 100% ${rightTop + beamThickness}rem, 0 ${leftTop + beamThickness}rem)`;
            lane.append(beam);
        };

        appendBeam(group[0], group.at(-1));

        for (const writtenNote of group) {
            const x =
                sheetWrittenPosition(writtenNote.segment.beat) + geometry.stemX;
            const noteY =
                noteheadY -
                writtenNote.staffStep * 0.375 +
                noteYOffset +
                geometry.stemAtNoteInset;
            const beamY =
                beamYAt(x) +
                (stemDown ? -beamStemInset : beamThickness + beamStemInset);
            const stem = document.createElement('span');
            stem.className = 'rhythm-sheet-beam-stem';
            stem.style.left = `${x}rem`;
            stem.style.top = `${Math.min(noteY, beamY)}rem`;
            stem.style.height = `${Math.abs(noteY - beamY)}rem`;
            lane.append(stem);
        }

        let secondaryGroup = [];
        const appendSecondaryBeam = () => {
            if (secondaryGroup.length < 2) {
                secondaryGroup = [];
                return;
            }
            appendBeam(secondaryGroup[0], secondaryGroup.at(-1), true);
            secondaryGroup = [];
        };

        for (const writtenNote of group) {
            if (writtenNote.value.value >= 16) {
                secondaryGroup.push(writtenNote);
            } else {
                appendSecondaryBeam();
            }
        }
        appendSecondaryBeam();
    }

    sheetMusic.phrase.forEach((note, noteIndex) => {
        const segments = rhythmSegments(note);
        const staffStep = note.rest
            ? null
            : midiToDiatonicPosition(note.midi) -
              clefDefinition.bottomLineDiatonic;

        if (segments.length > 1) {
            const tie = document.createElement('span');
            const start = sheetWrittenPosition(segments[0].beat) + 0.9;
            const end = sheetWrittenPosition(segments[1].beat) + 0.9;
            tie.className = `rhythm-sheet-tie ${staffStep >= 4 ? 'is-above' : 'is-below'}`;
            tie.dataset.rhythmSheetNoteIndex = String(noteIndex);
            tie.style.left = `${start}rem`;
            tie.style.width = `${end - start}rem`;
            tie.style.setProperty('--staff-step', String(staffStep));
            tie.setAttribute('aria-hidden', 'true');
            lane.append(tie);
        }
    });
    const playLine = document.createElement('span');
    playLine.className = 'rhythm-sheet-play-line';
    score.replaceChildren(staff, lane, playLine);
    lane.style.transform = `translateX(${SHEET_PLAY_LINE_REM - sheetPlaybackPosition(-units - 1)}rem)`;
    document.getElementById('rhythm-sheet-description').textContent =
        sheetMusic.phrase
            .map(
                (note) =>
                    `${rhythmNotePosition(note)}: ${note.rest ? '' : `${midiToTunerNoteName(note.midi)} `}${rhythmWrittenName(note)} ${note.rest ? 'rest' : 'note'}, ${rhythmDurationLabel(note.duration)} ${rhythmDurationUnit()}.`
            )
            .join(' ');
    document.getElementById('rhythm-sheet-meter-help').textContent = compound
        ? `${sheetMusic.signature}: BPM counts dotted-quarter beats; each beat has three eighth-note subdivisions (1 & a). A dotted quarter lasts three subdivisions, a quarter two, and an eighth one.`
        : `${sheetMusic.signature}: BPM counts ${denominator === 2 ? 'half' : denominator === 8 ? 'eighth' : 'quarter'} notes, with ${units} beats per bar.`;
    document.getElementById('rhythm-sheet-count-label').textContent =
        `Ready - durations in ${rhythmDurationUnit()}`;
}

function playRhythmInputSound() {
    // A rounded tone distinct from the metronome, with enough duration to hear.
    audio.playTransient(520, 'triangle', 0.055, 0.5);
}

function pauseSheetMic() {
    const mic = sheetMusic.mic;

    if (mic.frame !== null) {
        cancelAnimationFrame(mic.frame);
        mic.frame = null;
    }

    if (sheetMusic.input === 'microphone') {
        releaseRhythm('microphone');
    }

    mic.lastAnalysisTime = 0;
    mic.stableFrames = 0;
    mic.silentFrames = 0;
    mic.frequencies = [];
    mic.voiceStartedAt = null;
    mic.silenceStartedAt = null;
}

function stopSheetMic() {
    pauseSheetMic();
    pauseMicrophoneInput(sheetMusic.mic);
}

function addSheetPitchSample(frequencyHz) {
    if (!sheetMusic.held || !Number.isFinite(frequencyHz)) {
        return;
    }

    sheetMusic.held.pitchSamples.push(frequencyHz);
}

function analyzeSheetMic(time) {
    const mic = sheetMusic.mic;

    if (!mic.analyser) {
        return;
    }

    if (time - mic.lastAnalysisTime >= SHEET_ANALYSIS_INTERVAL_MS) {
        mic.lastAnalysisTime = time;
        mic.analyser.getFloatTimeDomainData(mic.buffer);
        const frequencyHz = detectPitchYin(
            mic.buffer,
            mic.sampleRate,
            55,
            1100,
            TUNER_YIN_THRESHOLD,
            TUNER_ANALYSIS_SAMPLE_STRIDE
        );
        const position = sheetMusic.active
            ? (audio.currentTime() - sheetMusic.origin) / sheetMusic.interval
            : -Infinity;

        if (frequencyHz === null) {
            mic.stableFrames = 0;
            mic.frequencies = [];
            mic.voiceStartedAt = null;
            mic.silentFrames += 1;
            mic.silenceStartedAt ??= audio.currentTime();

            if (mic.silentFrames >= 2 && sheetMusic.input === 'microphone') {
                releaseRhythm('microphone', mic.silenceStartedAt);
            }
        } else {
            if (mic.stableFrames === 0) {
                mic.voiceStartedAt = audio.currentTime();
            }
            mic.silentFrames = 0;
            mic.silenceStartedAt = null;
            mic.stableFrames += 1;
            mic.frequencies.push(frequencyHz);
            mic.frequencies = mic.frequencies.slice(-3);
            const stableFrequency = median(mic.frequencies);

            if (
                sheetMusic.input === null &&
                position >= -0.25 &&
                mic.stableFrames >= 2
            ) {
                pressRhythm('microphone', stableFrequency, mic.voiceStartedAt);
            } else if (sheetMusic.input === 'microphone') {
                addSheetPitchSample(stableFrequency);
            }
        }
    }

    mic.frame = requestAnimationFrame(analyzeSheetMic);
}

async function startSheetMic() {
    const mic = sheetMusic.mic;
    if (microphoneInputConnected(mic)) {
        if (
            (await setMicrophoneState(MICROPHONE_STATES.LISTENING)) !==
            MICROPHONE_STATES.LISTENING
        ) {
            return false;
        }
        if (mic.frame === null) {
            mic.frame = requestAnimationFrame(analyzeSheetMic);
        }

        return true;
    }

    const started = await startMicrophoneInput(mic, TUNER_ANALYSIS_FFT_SIZE);
    if (!started) {
        return false;
    }
    mic.lastAnalysisTime = 0;
    mic.frame = requestAnimationFrame(analyzeSheetMic);

    return true;
}

function updateRhythmMode() {
    const mode = sectionModes.rhythm;
    for (const panel of getModePanels('rhythm')) {
        panel.hidden = panel.dataset.modePanel !== mode;
    }
    stopGeneratedAudio();
    if (!sheetMusicEnabled()) {
        stopSheetMic();
    } else if (requestedMicrophoneState === MICROPHONE_STATES.LISTENING) {
        void startSheetMic();
    }
    if (
        sheetMusicEnabled() &&
        (!sheetMusic.phrase.length ||
            sheetMusic.signature !== getControl('shared-time-signature').value)
    ) {
        newRhythmPhrase();
    }
}

function startSheetMusic() {
    renderRhythmScore();
    sheetMusic.interval = rhythmClickInterval(rhythm.signature, rhythm.bpm);
    sheetMusic.origin =
        rhythm.nextBeatTime + sheetMusic.meter.units * sheetMusic.interval;
    sheetMusic.nextNoteIndex = 0;
    sheetMusic.extra = 0;
    sheetMusic.active = true;
    for (const note of sheetMusic.phrase) {
        note.attack = null;
        note.release = null;
        note.pitchHz = null;
        note.pitchError = null;
        note.pitchSamples = [];
    }
    document
        .getElementById('rhythm-sheet-score')
        .setAttribute('aria-disabled', 'false');
    document.getElementById('rhythm-sheet-hold').disabled = false;
    document.getElementById('rhythm-sheet-hold').focus();
    drawSheetMusic();
}

function rhythmOffset(value) {
    const rounded = Math.round(value);
    return `${rounded >= 0 ? '+' : ''}${rounded} ms`;
}

function updateRhythmHold(position, released = false) {
    const hold = sheetMusic.currentHold;
    if (!hold) {
        return;
    }
    hold.end = Math.max(hold.start, position);
    hold.element.style.width = `${sheetPlaybackPosition(hold.end) - sheetPlaybackPosition(hold.start)}rem`;
    if (released) {
        sheetMusic.currentHold = null;
    }
}

function beginRhythmHold(position) {
    const element = document.createElement('span');
    element.className = 'rhythm-sheet-held-section';
    element.style.left = `${sheetPlaybackPosition(position)}rem`;
    element.style.width = '0rem';
    document.getElementById('rhythm-sheet-lane').append(element);
    const hold = { start: position, end: position, element, spurious: false };
    sheetMusic.holdSpans.push(hold);
    sheetMusic.currentHold = hold;
}

function pressRhythm(
    input,
    frequencyHz = null,
    inputTime = audio.currentTime()
) {
    if (!sheetMusic.active || sheetMusic.input !== null) {
        return;
    }
    const position = (inputTime - sheetMusic.origin) / sheetMusic.interval;
    sheetMusic.input = input;
    beginRhythmHold(position);
    if (position < -0.5 || position >= sheetMusic.total) {
        return;
    }
    const note = sheetMusic.phrase
        .filter((candidate) => !candidate.rest)
        .reduce(
            (nearest, candidate) =>
                !nearest ||
                Math.abs(position - candidate.beat) <
                    Math.abs(position - nearest.beat)
                    ? candidate
                    : nearest,
            null
        );
    document.getElementById('rhythm-sheet-hold').classList.add('is-held');
    if (
        !note ||
        note.attack !== null ||
        Math.abs(position - note.beat) >=
            Math.max(0.35, Math.min(0.5, note.duration / 2))
    ) {
        sheetMusic.extra += 1;
        sheetMusic.currentHold.spurious = true;
        showRhythmSheetResult(
            'Spurious hold - follow the notes and leave rests silent.'
        );
        return;
    }
    note.attack = (position - note.beat) * sheetMusic.interval * 1000;
    sheetMusic.held = note;
    addSheetPitchSample(frequencyHz);
    showRhythmSheetResult(
        `Attack: ${rhythmOffset(note.attack)} - target ${midiToTunerNoteName(note.midi)}.`
    );
}

function releaseRhythm(input, inputTime = audio.currentTime()) {
    if (sheetMusic.input !== input) {
        return;
    }
    updateRhythmHold(
        (inputTime - sheetMusic.origin) / sheetMusic.interval,
        true
    );
    const note = sheetMusic.held;
    if (note) {
        note.release =
            (inputTime -
                sheetMusic.origin -
                (note.beat + note.duration) * sheetMusic.interval) *
            1000;
        if (note.pitchSamples.length) {
            note.pitchHz = median(note.pitchSamples);
            note.pitchError = centsBetween(
                note.pitchHz,
                midiFrequency(note.midi)
            );
        }
        const pitchResult =
            note.pitchError === null
                ? ''
                : ` - Pitch: ${signed(note.pitchError, 0)} cents`;
        showRhythmSheetResult(
            `Attack: ${rhythmOffset(note.attack)} - Release: ${rhythmOffset(note.release)}${pitchResult}`
        );
    }
    sheetMusic.input = null;
    sheetMusic.held = null;
    document.getElementById('rhythm-sheet-hold').classList.remove('is-held');
}

function finishSheetMusic() {
    if (sheetMusic.input !== null) {
        releaseRhythm(sheetMusic.input);
    }

    const notes = sheetMusic.phrase.filter((note) => !note.rest);
    const attacks = notes.filter((note) => note.attack !== null);
    const releases = notes.filter((note) => note.release !== null);
    const pitched = notes.filter((note) => note.pitchError !== null);

    const average = (items, key) =>
        items.length
            ? Math.round(
                  items.reduce((sum, note) => sum + Math.abs(note[key]), 0) /
                      items.length
              )
            : '0';

    const bias = (items, key) =>
        items.length
            ? rhythmOffset(
                  items.reduce((sum, note) => sum + note[key], 0) / items.length
              )
            : '-';

    const stats = document.getElementById('rhythm-sheet-stats');
    stats.replaceChildren();
    for (const [label, value] of [
        [
            'Average attack error',
            `-${average(
                attacks.filter((attack) => attack.attack < 0),
                'attack'
            )} ms, +${average(
                attacks.filter((attack) => attack.attack >= 0),
                'attack'
            )} ms = ±${average(attacks, 'attack')} ms`,
        ],
        [
            'Average release error',
            `-${average(
                releases.filter((release) => release.release < 0),
                'release'
            )} ms, +${average(
                releases.filter((release) => release.release >= 0),
                'release'
            )} ms = ±${average(releases, 'release')} ms`,
        ],
        ['Attack bias', bias(attacks, 'attack')],
        ['Release bias', bias(releases, 'release')],
        ['Missed notes', notes.length - attacks.length],
        ['Unreleased notes', attacks.length - releases.length],
        ['Spurious holds', sheetMusic.extra],
        [
            'Average pitch error',
            pitched.length
                ? `${Math.round(
                      pitched.reduce(
                          (sum, note) => sum + Math.abs(note.pitchError),
                          0
                      ) / pitched.length
                  )} cents`
                : 'Not scored',
        ],
        [
            'Notes in tune',
            pitched.length
                ? `${pitched.filter((note) => Math.abs(note.pitchError) <= SHEET_CORRECT_CENTS).length} / ${pitched.length}`
                : 'Not scored',
        ],
    ]) {
        const row = document.createElement('div');
        const term = document.createElement('dt');
        const detail = document.createElement('dd');
        term.textContent = label;
        detail.textContent = String(value);
        row.append(term, detail);
        stats.append(row);
    }
    const results = document.getElementById('rhythm-sheet-results');
    results.replaceChildren();
    for (const note of sheetMusic.phrase) {
        const spurious = sheetMusic.holdSpans.filter(
            (hold) =>
                hold.spurious &&
                ((hold.start >= note.beat &&
                    hold.start < note.beat + note.duration) ||
                    (note.beat === 0 && hold.start < 0))
        );
        if (note.rest && !spurious.length) {
            continue;
        }

        const item = document.createElement('li');
        item.textContent = rhythmNotePosition(note);

        const holds = document.createElement('ul');
        if (note.rest) {
            const rest = document.createElement('li');
            rest.textContent = 'Rest';
            holds.append(rest);
        } else {
            const attack =
                note.attack === null
                    ? 'Missed'
                    : `Attack: ${rhythmOffset(note.attack)}`;
            const release =
                note.release === null
                    ? 'not released'
                    : `release: ${rhythmOffset(note.release)}`;

            const detail = document.createElement('li');
            const timing =
                note.attack === null ? 'Missed' : `${attack}, ${release}`;
            const pitch =
                note.pitchError === null
                    ? ''
                    : `, ${signed(note.pitchError, 0)} cents`;
            detail.textContent = `${midiToTunerNoteName(note.midi)} - ${timing}${pitch}`;
            holds.append(detail);
        }

        if (spurious.length) {
            for (const hold of spurious) {
                const detail = document.createElement('li');
                const offset = Math.round(
                    (hold.start - note.beat) * sheetMusic.interval * 1000
                );
                const duration = Math.round(
                    (hold.end - hold.start) * sheetMusic.interval * 1000
                );
                detail.textContent = `Spurious hold: ${offset} ms, held ${duration} ms`;
                holds.append(detail);
            }
        }

        item.append(holds);
        results.append(item);
    }
    showRhythmSheetReport();
    sheetMusic.active = false;
    stopGeneratedAudio();
    const { units } = sheetMusic.meter;
    document.getElementById('rhythm-sheet-lane').style.transform =
        `translateX(${SHEET_PLAY_LINE_REM - sheetPlaybackPosition(-units - 1)}rem)`;
    document.getElementById('rhythm-sheet-count-label').textContent =
        `Complete - durations in ${rhythmDurationUnit()}`;
}

function drawSheetMusic() {
    const position =
        (audio.currentTime() - sheetMusic.origin) / sheetMusic.interval;
    const { units } = sheetMusic.meter;
    const label = document.getElementById('rhythm-sheet-count-label');
    if (position < -units) {
        label.textContent = 'Get ready';
    } else if (position < 0) {
        const click = clamp(units + 1 + Math.floor(position), 1, units);
        label.textContent = `Count-in ${click} / ${units}`;
    } else {
        label.textContent = `Play - durations in ${rhythmDurationUnit()}`;
    }
    document.getElementById('rhythm-sheet-lane').style.transform =
        `translateX(${SHEET_PLAY_LINE_REM - sheetPlaybackPosition(position)}rem)`;
    updateRhythmHold(position);
    sheetMusic.phrase.forEach((note, index) => {
        const active =
            position >= note.beat && position < note.beat + note.duration;
        for (const element of document.querySelectorAll(
            `[data-rhythm-sheet-note-index="${index}"]`
        )) {
            element.classList.toggle('is-current', active);
        }
    });
    if (position >= sheetMusic.total + 0.5) {
        finishSheetMusic();
        return;
    }
    sheetMusic.frame = requestAnimationFrame(drawSheetMusic);
}

function stopSheetMusic() {
    if (sheetMusic.currentHold) {
        updateRhythmHold(
            (audio.currentTime() - sheetMusic.origin) / sheetMusic.interval,
            true
        );
    }
    pauseSheetMic();
    cancelAnimationFrame(sheetMusic.frame);
    sheetMusic.frame = null;
    if (sheetMusic.active) {
        document.getElementById('rhythm-sheet-count-label').textContent =
            `Stopped - durations in ${rhythmDurationUnit()}`;
    }
    sheetMusic.active = false;
    sheetMusic.input = null;
    sheetMusic.held = null;
    document
        .getElementById('rhythm-sheet-score')
        .setAttribute('aria-disabled', 'true');
    document.getElementById('rhythm-sheet-hold').disabled = true;
    document.getElementById('rhythm-sheet-hold').classList.remove('is-held');
}

// Rhythm: timing

function rhythmTimingEnabled() {
    return sectionModes.rhythm === 'timing';
}

function rhythmMetronomeEnabled() {
    return sectionModes.rhythm === 'metronome';
}

function rhythmVisualPosition() {
    const phase = Math.max(
        -0.5,
        (performance.now() - rhythmTiming.originMs) /
            (rhythmTiming.interval * 1000)
    );

    return {
        phase,
        position: (((phase + 0.5) % 1) + 1) % 1,
    };
}

function drawRhythmMetronome() {
    const { position } = rhythmVisualPosition();
    document.getElementById('rhythm-metronome-dot').style.left =
        `${position * 100}%`;
    rhythm.frame = requestAnimationFrame(drawRhythmMetronome);
}

function drawRhythmTiming() {
    const { phase, position } = rhythmVisualPosition();
    document.getElementById('rhythm-timing-dot').style.left =
        `${position * 100}%`;
    if (
        rhythmTiming.markBeat !== null &&
        phase >= rhythmTiming.markBeat + 0.5
    ) {
        clearRhythmTimingMark();
    }
    rhythmTiming.frame = requestAnimationFrame(drawRhythmTiming);
}

function clearRhythmTimingMark() {
    const mark = document.getElementById('rhythm-timing-mark');
    document
        .getElementById('rhythm-timing-feedback')
        .classList.remove('is-correct', 'is-incorrect');
    mark.hidden = true;
    delete mark.dataset.label;
    rhythmTiming.markBeat = null;
}

function recordRhythmTimingTap() {
    if (!rhythm.running || !rhythmTimingEnabled()) {
        return;
    }
    const now = performance.now();
    const beat = Math.round(
        (now - rhythmTiming.originMs) / (rhythmTiming.interval * 1000)
    );
    if (beat < 0 || beat <= rhythmTiming.lastBeat) {
        return;
    }
    rhythmTiming.lastBeat = beat;
    playRhythmInputSound();
    const error =
        now - (rhythmTiming.originMs + beat * rhythmTiming.interval * 1000);
    rhythmTiming.errors.push(error);
    rhythmTiming.errors = rhythmTiming.errors.slice(-20);
    const signed = (value) => `${value > 0 ? '+' : ''}${Math.round(value)}`;
    const count = rhythmTiming.errors.length;
    const average =
        rhythmTiming.errors.reduce((sum, value) => sum + Math.abs(value), 0) /
        count;
    const bias =
        rhythmTiming.errors.reduce((sum, value) => sum + value, 0) / count;
    document.getElementById('rhythm-timing-result').textContent =
        `${signed(error)} ms - ${Math.abs(error) <= 20 ? 'On beat' : error < 0 ? 'Early' : 'Late'} - ${count} tap${count === 1 ? '' : 's'} - Average error: ${Math.round(average)} ms - Bias: ${signed(bias)} ms`;
    const mark = document.getElementById('rhythm-timing-mark');
    const feedback = document.getElementById('rhythm-timing-feedback');
    mark.hidden = false;
    mark.dataset.label = `${signed(error)} ms`;
    feedback.classList.toggle('is-correct', Math.abs(error) <= 20);
    feedback.classList.toggle('is-incorrect', Math.abs(error) > 20);
    mark.style.left = `${50 + (error / (rhythmTiming.interval * 1000)) * 100}%`;
    rhythmTiming.markBeat = beat;
}

// Rhythm: playback

function restartRhythm() {
    if (rhythm.running) {
        stopGeneratedAudio();
        startRhythm();
    }
}

function scheduleSheetNoteCues(now) {
    if (!sheetMusicEnabled() || !sheetMusic.active) {
        return;
    }

    while (sheetMusic.nextNoteIndex < sheetMusic.phrase.length) {
        const note = sheetMusic.phrase[sheetMusic.nextNoteIndex];
        const startTime = sheetMusic.origin + note.beat * sheetMusic.interval;

        if (startTime >= now + RHYTHM_SCHEDULE_AHEAD_SECONDS) {
            break;
        }

        if (!note.rest) {
            audio.playTransient(
                midiFrequency(note.midi),
                'triangle',
                SHEET_NOTE_CUE_DURATION,
                SHEET_NOTE_CUE_VOLUME,
                Math.max(0, startTime - now)
            );
        }

        sheetMusic.nextNoteIndex += 1;
    }
}

function scheduleRhythm() {
    if (!rhythm.running) {
        return;
    }

    const bpm = rhythm.bpm;

    const signature = rhythm.signature;

    const pattern = RHYTHM_METERS[signature] || RHYTHM_METERS['4/4'];

    const secondsPerClick = rhythmClickInterval(signature, bpm);

    rhythmTiming.interval = secondsPerClick;
    const now = audio.currentTime();

    scheduleSheetNoteCues(now);

    while (rhythm.nextBeatTime < now + RHYTHM_SCHEDULE_AHEAD_SECONDS) {
        if (
            sheetMusicEnabled() &&
            rhythm.nextBeatTime >=
                sheetMusic.origin +
                    sheetMusic.total * sheetMusic.interval -
                    0.001
        ) {
            break;
        }
        const accent = pattern[rhythm.beatIndex];

        const frequency =
            accent === 2
                ? RHYTHM_FIRST_HZ
                : accent === 1
                  ? RHYTHM_GROUP_HZ
                  : RHYTHM_NORMAL_HZ;

        const volume = accent === 2 ? 0.9 : accent === 1 ? 0.75 : 0.6;

        audio.playTransient(
            frequency,
            'sine',
            RHYTHM_CLICK_DURATION,
            volume,
            Math.max(0, rhythm.nextBeatTime - now)
        );

        rhythm.nextBeatTime += secondsPerClick;

        rhythm.beatIndex = (rhythm.beatIndex + 1) % pattern.length;
    }
}

async function startRhythm() {
    if (rhythm.running || sheetMusic.starting) {
        return;
    }
    if (
        sheetMusicEnabled() &&
        (!sheetMusic.phrase.length ||
            sheetMusic.signature !== getControl('shared-time-signature').value)
    ) {
        newRhythmPhrase();
    }

    if (sheetMusicEnabled() && !sheetMusic.phrase.length) {
        return;
    }

    stopAllAudio();
    sheetMusic.starting = true;

    if (sheetMusicEnabled()) {
        clearRhythmSheetResults();
        document.getElementById('rhythm-sheet-count-label').textContent =
            'Requesting microphone access...';
        try {
            const started = await startSheetMic();
            if (
                !started ||
                !sheetMusicEnabled() ||
                document.getElementById('rhythm-panel').hidden
            ) {
                sheetMusic.starting = false;
                stopSheetMic();
                if (microphoneState === MICROPHONE_STATES.DENIED) {
                    document.getElementById(
                        'rhythm-sheet-count-label'
                    ).textContent = `${microphoneFailureMessage}.`;
                }
                return;
            }
        } catch {
            document.getElementById('rhythm-sheet-count-label').textContent =
                `${MICROPHONE_FAILURE_MESSAGES.FAILED}.`;
        }
    }

    rhythm.bpm = clamp(readNumber(getControl('shared-bpm'), 100), 30, 240);
    rhythm.signature = getControl('shared-time-signature').value;
    rhythm.running = true;
    sheetMusic.starting = false;
    rhythm.beatIndex = 0;
    rhythm.nextBeatTime =
        audio.currentTime() +
        (rhythmTimingEnabled() || sheetMusicEnabled() ? 1 : 0.05);
    rhythmTiming.originMs =
        performance.now() + (rhythm.nextBeatTime - audio.currentTime()) * 1000;
    rhythmTiming.lastBeat = -1;
    rhythmTiming.errors = [];
    clearRhythmTimingMark();
    if (rhythmTimingEnabled()) {
        document.getElementById('rhythm-timing-result').textContent = '';
    }
    document.getElementById('rhythm-timing-tap').disabled =
        !rhythmTimingEnabled();

    if (sheetMusicEnabled()) {
        startSheetMusic();
    }
    scheduleRhythm();
    if (rhythmTimingEnabled()) {
        drawRhythmTiming();
        document.getElementById('rhythm-timing-tap').focus();
    } else if (rhythmMetronomeEnabled()) {
        drawRhythmMetronome();
    }

    rhythm.timer = window.setInterval(scheduleRhythm, RHYTHM_LOOKAHEAD_MS);
}

function stopRhythm() {
    stopSheetMusic();
    cancelAnimationFrame(rhythm.frame);
    rhythm.frame = null;
    cancelAnimationFrame(rhythmTiming.frame);
    rhythmTiming.frame = null;
    document.getElementById('rhythm-timing-tap').disabled = true;
    rhythm.running = false;
    sheetMusic.starting = false;
    rhythm.beatIndex = 0;

    if (rhythm.timer !== null) {
        clearInterval(rhythm.timer);
        rhythm.timer = null;
    }
}

function tapTempo() {
    const now = performance.now();
    const previous = rhythm.tapTimes.at(-1);

    if (previous !== undefined && now - previous > 2000) {
        rhythm.tapTimes = [];
    }

    rhythm.tapTimes.push(now);
    rhythm.tapTimes = rhythm.tapTimes.slice(-5);

    if (rhythm.tapTimes.length < 3) {
        return;
    }

    const intervals = [];

    for (let index = 1; index < rhythm.tapTimes.length; index += 1) {
        intervals.push(rhythm.tapTimes[index] - rhythm.tapTimes[index - 1]);
    }

    const averageInterval =
        intervals.reduce((total, interval) => total + interval, 0) /
        intervals.length;

    const bpmInput = getControl('shared-bpm');

    const bpm = clamp(
        Math.round(60000 / averageInterval),
        Number(bpmInput.min),
        Number(bpmInput.max)
    );

    bpmInput.value = String(bpm);
    synchronizeSharedControl(bpmInput);
    restartRhythm();
}

// Pitch

function defaultPitchTypeStats() {
    return {
        streak: 0,
        trials: 0,
        correct: 0,
        errorTotal: 0,
        best: null,
    };
}

function defaultPitchStats() {
    return {
        placement: defaultPitchTypeStats(),
        'memory|novel': defaultPitchTypeStats(),
        'memory|interference': defaultPitchTypeStats(),
    };
}

function loadPitchTypeStats(stored) {
    if (!stored || typeof stored !== 'object') {
        return defaultPitchTypeStats();
    }

    return {
        streak: Number.isFinite(stored.streak) ? stored.streak : 0,
        trials: Number.isFinite(stored.trials) ? stored.trials : 0,
        correct: Number.isFinite(stored.correct) ? stored.correct : 0,
        errorTotal: Number.isFinite(stored.errorTotal) ? stored.errorTotal : 0,
        best: Number.isFinite(stored.best) ? stored.best : null,
    };
}

function loadPitchStats() {
    const stored = loadStats('pitch');

    if (!stored || typeof stored !== 'object') {
        return defaultPitchStats();
    }

    return {
        placement: loadPitchTypeStats(stored.placement),
        'memory|novel': loadPitchTypeStats(stored['memory|novel']),
        'memory|interference': loadPitchTypeStats(
            stored['memory|interference']
        ),
    };
}

function savePitchStats() {
    saveStats('pitch');
}

stats.pitch = loadPitchStats();

const pitch = {
    trial: null,
    adaptiveResults: [],
};

function newPitchTrial() {
    if (sectionModes.pitch === 'memory') {
        newPitchMemoryTrial();
    } else {
        newPitchPlacementTrial(true);
    }
}

const pitchAdvance = createAutoAdvance(
    getModuleActions('pitch', 'new'),
    newPitchTrial
);

function cancelPitchAdvance() {
    pitchAdvance.cancel();
}

function schedulePitchAdvance() {
    pitchAdvance.schedule();
}

function pitchStatsType(mode, type = null) {
    return mode === 'memory' ? `memory|${type}` : mode;
}

function renderPitchStats() {
    const mode = sectionModes.pitch;
    const type =
        mode === 'memory' ? getControl('pitch-memory-type').value : null;
    const { streak, trials, errorTotal, best } =
        stats.pitch[pitchStatsType(mode, type)];
    const meanError = trials > 0 ? errorTotal / trials : null;

    getOutput(`pitch-${mode}-streak`).textContent = String(streak);
    getOutput(`pitch-${mode}-mean-error`).textContent =
        meanError === null ? '--' : `${meanError.toFixed(1)} cents`;
    getOutput(`pitch-${mode}-best`).textContent =
        best === null ? '--' : `${best.toFixed(2)} cents`;
}

function clearPitchStats() {
    const mode = sectionModes.pitch;
    const type =
        mode === 'memory' ? getControl('pitch-memory-type').value : null;

    stats.pitch[pitchStatsType(mode, type)] = defaultPitchTypeStats();

    savePitchStats();
    renderPitchStats();
}

function setPitchPlacementAnswerState({
    disabled,
    selected = null,
    correct = null,
}) {
    for (const button of document.querySelectorAll(
        '[data-pitch-placement-answers] [data-answer]'
    )) {
        button.disabled = disabled;
        setAnswerOptionState(button, button.dataset.answer, selected, correct);
    }
}

function writeNumberIfChanged(input, value) {
    const rawValue = input.value.trim();
    const currentValue = rawValue === '' ? NaN : Number(rawValue);

    if (!Number.isFinite(currentValue) || currentValue !== value) {
        input.value = String(value);
    }
}

function normalizeNumberInput(input, fallback) {
    const value = readNumber(input, fallback);

    writeNumberIfChanged(input, value);

    return value;
}

function readRange(minimumInput, maximumInput, defaultMinimum, defaultMaximum) {
    let minimum = readNumber(minimumInput, defaultMinimum);
    let maximum = readNumber(maximumInput, defaultMaximum);

    if (minimum > maximum) {
        [minimum, maximum] = [maximum, minimum];
    }

    writeNumberIfChanged(minimumInput, minimum);
    writeNumberIfChanged(maximumInput, maximum);

    return {
        minimum,
        maximum,
    };
}

function updateAdaptiveDifficulty(exercise, correct) {
    const state = getAdaptiveState(exercise);
    const status = getOutput(`${exercise}-adaptive-status`);

    if (getControl('shared-adaptive').value !== 'on') {
        state.adaptiveResults.length = 0;
        return;
    }

    state.adaptiveResults.push(correct);

    if (state.adaptiveResults.length < ADAPTIVE_WINDOW_SIZE) {
        status.textContent =
            `${state.adaptiveResults.length} of ` +
            `${ADAPTIVE_WINDOW_SIZE} answers`;
        return;
    }

    const correctCount = state.adaptiveResults.filter(Boolean).length;
    state.adaptiveResults.length = 0;
    let factor = 1;
    let direction = '';

    if (correctCount >= 4) {
        factor = ADAPTIVE_NARROW_FACTOR;
        direction = 'Narrowed';
    } else if (correctCount <= 2) {
        factor = ADAPTIVE_WIDEN_FACTOR;
        direction = 'Widened';
    }

    if (factor === 1) {
        status.textContent = `Unchanged ${correctCount}/${ADAPTIVE_WINDOW_SIZE}`;
        return;
    }

    let result;

    if (
        exercise === 'interval-recognition' ||
        exercise === 'interval-construction'
    ) {
        const level = getControl('shared-interval-set');

        level.selectedIndex = clamp(
            level.selectedIndex + (factor < 1 ? 1 : -1),
            0,
            level.options.length - 1
        );
        synchronizeSharedControl(level);
        for (const intervalExercise of [
            'interval-recognition',
            'interval-construction',
        ]) {
            resetAdaptiveProgress(intervalExercise);
        }
        result = level.value;
    } else {
        const minimumInput = getControl(`${exercise}-range-min`);
        const maximumInput = getControl(`${exercise}-range-max`);
        const minimum = clamp(
            Math.round(Number(minimumInput.value) * factor * 10) / 10,
            Number(minimumInput.min),
            Number(minimumInput.max)
        );
        const maximum = clamp(
            Math.round(Number(maximumInput.value) * factor * 10) / 10,
            Number(maximumInput.min),
            Number(maximumInput.max)
        );

        writeNumberIfChanged(minimumInput, minimum);
        writeNumberIfChanged(maximumInput, maximum);

        result = `${minimum} - ${maximum}¢`;
    }

    status.textContent = `${direction} to ${result}`;
}

function getAdaptiveState(exercise) {
    return {
        'pitch-placement': pitch,
        'match-target': matchTarget,
        'interval-recognition': interval.recognition,
        'interval-construction': interval.construction,
    }[exercise];
}

function renderAdaptiveProgress(exercise) {
    const state = getAdaptiveState(exercise);
    const enabled = getControl('shared-adaptive').value === 'on';

    getOutput(`${exercise}-adaptive-status`).textContent = enabled
        ? `${state.adaptiveResults.length} of ${ADAPTIVE_WINDOW_SIZE} answers`
        : '';
}

function resetAdaptiveProgress(exercise) {
    const state = getAdaptiveState(exercise);

    state.adaptiveResults.length = 0;
    renderAdaptiveProgress(exercise);
}

// Pitch: placement

function clearPitchPlacementResult() {
    clearPracticeResult('pitch-placement-result');
}

function createPitchPlacementTrial() {
    const rootHz = selectedNoteFrequency(getNote('pitch-placement'));

    const semitones = Number(getControl('pitch-placement-interval').value);

    const { minimum: minimumCents, maximum: maximumCents } = readRange(
        getControl('pitch-placement-range-min'),
        getControl('pitch-placement-range-max'),
        10,
        50
    );

    const magnitude =
        minimumCents + Math.random() * (maximumCents - minimumCents);

    const correctTargetHz = rootHz * 2 ** (semitones / 12);

    return {
        rootHz,
        correctTargetHz,

        mistuneCents: Math.random() < 0.5 ? -magnitude : magnitude,

        committed: false,
    };
}

function newPitchPlacementTrial(playImmediately = false) {
    cancelPitchAdvance();
    stopAllAudio();

    pitch.trial = createPitchPlacementTrial();

    setPitchPlacementAnswerState({
        disabled: true,
    });

    clearPitchPlacementResult();

    if (playImmediately) {
        playPitchPlacementTrial();
    }
}

function playPitchPlacementTrial() {
    cancelPitchAdvance();

    if (!pitch.trial) {
        newPitchPlacementTrial();
    }

    stopAllAudio();

    if (!pitch.trial.committed) {
        setPitchPlacementAnswerState({
            disabled: false,
        });
    }

    const { rootHz, correctTargetHz, mistuneCents } = pitch.trial;

    const waveform = getWaveform('pitch-placement').value;

    const duration = readNumber(getControl('pitch-placement-duration'), 1);

    const targetHz = frequencyFromCents(correctTargetHz, mistuneCents);

    audio.playTransient(rootHz, waveform, duration);

    audio.playTransient(targetHz, waveform, duration, 1, duration + 0.1);
}

function commitPitchPlacement(answer) {
    const trial = pitch.trial;

    if (!trial || trial.committed) {
        return;
    }

    audio.stopTransient();

    trial.committed = true;

    const distance = Math.abs(trial.mistuneCents);

    const direction = trial.mistuneCents < 0 ? 'flat' : 'sharp';

    const correct = answer === direction;

    const mistunedHz = frequencyFromCents(
        trial.correctTargetHz,
        trial.mistuneCents
    );

    const errorHz = mistunedHz - trial.correctTargetHz;

    setPitchPlacementAnswerState({
        disabled: true,
        selected: answer,
        correct: direction,
    });

    stats.pitch.placement.trials += 1;
    stats.pitch.placement.correct += correct ? 1 : 0;

    stats.pitch.placement.errorTotal += correct ? 0 : distance;

    stats.pitch.placement.streak = correct
        ? stats.pitch.placement.streak + 1
        : 0;

    if (
        correct &&
        (stats.pitch.placement.best === null ||
            distance < stats.pitch.placement.best)
    ) {
        stats.pitch.placement.best = distance;
    }

    savePitchStats();
    renderPitchStats();
    updateAdaptiveDifficulty('pitch-placement', correct);

    renderPracticeResult(
        'pitch-placement-result',
        correct,
        `${direction} - ` +
            `${signed(trial.mistuneCents, 2)} cents ` +
            `(${signed(errorHz, 3)} Hz)`
    );

    schedulePitchAdvance();
}

// Pitch: memory

const pitchMemory = {
    trial: storage.load(PITCH_MEMORY_TRIAL_KEY, null),
    timer: null,
    countdown: null,
    replayTimer: null,
    responseVoice: null,
    responseMethod: 'oscillator',
    mic: {
        stream: null,
        source: null,
        analyser: null,
        sampleRate: 0,
        buffer: null,
        frame: null,
        lastAnalysis: 0,
        frequencies: [],
        detectedHz: null,
        requestId: 0,
    },
};

function savePitchMemoryState() {
    if (pitchMemory.trial && pitchMemory.trial.state !== 'complete') {
        storage.save(PITCH_MEMORY_TRIAL_KEY, pitchMemory.trial);
    } else {
        storage.remove(PITCH_MEMORY_TRIAL_KEY);
    }
}

function randomSeed() {
    if (window.crypto?.getRandomValues) {
        const values = new Uint32Array(1);

        window.crypto.getRandomValues(values);

        return values[0];
    }

    return Math.floor(Math.random() * 0x100000000);
}

function seededRandom(seed) {
    let state = seed >>> 0;

    return () => {
        state += 0x6d2b79f5;

        let value = state;

        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    };
}

function randomPitchMemoryFrequency(random = Math.random) {
    return (
        PITCH_MEMORY_MIN_HZ *
        (PITCH_MEMORY_MAX_HZ / PITCH_MEMORY_MIN_HZ) ** random()
    );
}

function getPitchMemoryFrequencyFromSlider() {
    const cents = Number(getControl('pitch-memory-frequency').value);

    return PITCH_MEMORY_MIN_HZ * 2 ** (cents / 1200);
}

function getPitchMemoryRefreshButton() {
    return document.querySelector(
        '[data-mode-panel="memory"] [data-action="pitch-memory-new"]'
    );
}

function hidePitchMemoryResponses() {
    document.getElementById('pitch-memory-frequency-response').hidden =
        !pitchMemory.trial;
    const response = document.getElementById('pitch-memory-response-actions');

    response.hidden = true;
    getAction('pitch-memory-submit', response).disabled = true;
}

function pitchMemoryFrequencyToSliderValue(frequencyHz) {
    return clamp(
        1200 * Math.log2(frequencyHz / PITCH_MEMORY_MIN_HZ),
        0,
        PITCH_MEMORY_RANGE_CENTS
    );
}

function initializePitchMemoryFrequencySlider() {
    const slider = getControl('pitch-memory-frequency');
    slider.min = '0';
    slider.max = String(PITCH_MEMORY_RANGE_CENTS);
    slider.value = String(PITCH_MEMORY_RANGE_CENTS / 2);
}

function renderPitchMemoryResponseFrequency() {
    getOutput('pitch-memory-response-frequency').textContent =
        `${getPitchMemoryFrequencyFromSlider().toFixed(3)} Hz`;
}

function clearPitchMemoryFrequencyMarkers() {
    getControl('pitch-memory-frequency').classList.remove('has-result');

    for (const name of [
        'pitch-memory-target-marker',
        'pitch-memory-response-marker',
    ]) {
        const marker = getOutput(name);

        marker.hidden = true;
        marker.classList.remove('is-correct', 'is-incorrect');
    }
}

function showPitchMemoryFrequencyMarkers(result) {
    const targetMarker = getOutput('pitch-memory-target-marker');
    const responseMarker = getOutput('pitch-memory-response-marker');
    const responseHz =
        result.method === 'microphone'
            ? result.scoredResponseHz
            : result.responseHz;
    const position = (frequency) =>
        clamp(
            Math.log2(frequency / PITCH_MEMORY_MIN_HZ) /
                Math.log2(PITCH_MEMORY_MAX_HZ / PITCH_MEMORY_MIN_HZ),
            0,
            1
        );

    targetMarker.style.left = `${position(result.targetHz) * 100}%`;
    responseMarker.style.left = `${position(responseHz) * 100}%`;
    const correct = result.absoluteErrorCents < PITCH_MEMORY_CORRECT_CENTS;
    responseMarker.classList.toggle('is-correct', correct);
    responseMarker.classList.toggle('is-incorrect', !correct);
    getControl('pitch-memory-frequency').classList.add('has-result');
    targetMarker.hidden = false;
    responseMarker.hidden = false;
}

function setPitchMemoryStatus(text) {
    getOutput('pitch-memory-status').textContent = text;
}

function clearPitchMemoryTimers() {
    if (pitchMemory.timer !== null) {
        clearTimeout(pitchMemory.timer);
        pitchMemory.timer = null;
    }

    if (pitchMemory.countdown !== null) {
        clearInterval(pitchMemory.countdown);
        pitchMemory.countdown = null;
    }
}

function stopPitchMemoryResponseTone() {
    if (pitchMemory.responseVoice) {
        pitchMemory.responseVoice.stop();
        pitchMemory.responseVoice = null;
    }
}

function stopPitchMemoryMic() {
    if (!pitchMemory?.mic) {
        return;
    }

    const mic = pitchMemory.mic;

    if (mic.frame !== null) {
        cancelAnimationFrame(mic.frame);
        mic.frame = null;
    }

    pauseMicrophoneInput(mic);
    mic.frequencies = [];
    mic.detectedHz = null;
}

function analyzePitchMemoryMic(time) {
    const mic = pitchMemory.mic;

    if (!mic.analyser || !mic.buffer) {
        return;
    }

    if (
        pitchMemory.trial?.state === 'responding' &&
        time - mic.lastAnalysis >= TUNER_ANALYSIS_INTERVAL_MS
    ) {
        mic.lastAnalysis = time;
        mic.analyser.getFloatTimeDomainData(mic.buffer);

        const frequencyHz = detectPitchYin(
            mic.buffer,
            mic.sampleRate,
            80,
            1400
        );

        if (frequencyHz === null) {
            mic.frequencies = [];
        } else {
            mic.frequencies.push(frequencyHz);

            if (mic.frequencies.length > 9) {
                mic.frequencies.shift();
            }

            mic.detectedHz = median(mic.frequencies);
            pitchMemory.responseMethod = 'microphone';

            getOutput('pitch-memory-response-frequency').textContent =
                `${mic.detectedHz.toFixed(3)} Hz`;
            getControl('pitch-memory-frequency').value = String(
                pitchMemoryFrequencyToSliderValue(mic.detectedHz)
            );
        }
    }

    mic.frame = requestAnimationFrame(analyzePitchMemoryMic);
}

async function startPitchMemoryMic() {
    const refreshButton = getPitchMemoryRefreshButton();

    stopTunerMic();

    const mic = pitchMemory.mic;

    if (microphoneInputConnected(mic)) {
        if (
            (await setMicrophoneState(MICROPHONE_STATES.LISTENING)) !==
            MICROPHONE_STATES.LISTENING
        ) {
            return;
        }
        if (mic.frame === null) {
            mic.frame = requestAnimationFrame(analyzePitchMemoryMic);
        }
        refreshButton.disabled = false;
        setPitchMemoryStatus('Microphone enabled.');
        return;
    }

    refreshButton.disabled = false;
    setPitchMemoryStatus('Requesting microphone access...');

    try {
        if (!(await startMicrophoneInput(mic, 4096))) {
            if (microphoneState === MICROPHONE_STATES.DENIED) {
                setPitchMemoryStatus(
                    `${microphoneFailureMessage}; adjust the tone manually.`
                );
            }
            return;
        }

        mic.lastAnalysis = 0;
        mic.frequencies = [];
        mic.detectedHz = null;
        refreshButton.disabled = false;

        getOutput('pitch-memory-response-frequency').textContent =
            'No stable pitch';
        setPitchMemoryStatus('Microphone enabled.');
        mic.frame = requestAnimationFrame(analyzePitchMemoryMic);
    } catch {
        refreshButton.disabled = false;
        setPitchMemoryStatus(
            `${MICROPHONE_FAILURE_MESSAGES.FAILED}; adjust the tone manually.`
        );
    }
}

function showPitchMemoryResponse() {
    if (!pitchMemory.trial || pitchMemory.trial.state === 'responding') {
        return;
    }

    clearPitchMemoryTimers();
    audio.stopTransient();

    pitchMemory.trial.state = 'responding';
    pitchMemory.trial.responseStartedAt = Date.now();

    const response = document.getElementById('pitch-memory-response-actions');

    hidePitchMemoryResponses();
    document.getElementById('pitch-memory-frequency-response').hidden = false;
    response.hidden = false;
    const random = seededRandom(pitchMemory.trial.seed ^ 0xa55a5aa5);
    const targetCents = pitchMemoryFrequencyToSliderValue(
        pitchMemory.trial.targetHz
    );
    const direction = random() < 0.5 ? -1 : 1;
    const offset = direction * (300 + random() * 900);

    pitchMemory.responseMethod = 'oscillator';
    pitchMemory.mic.detectedHz = null;
    pitchMemory.mic.frequencies = [];
    getControl('pitch-memory-frequency').value = String(
        clamp(targetCents + offset, 0, PITCH_MEMORY_RANGE_CENTS)
    );
    renderPitchMemoryResponseFrequency();
    clearPitchMemoryFrequencyMarkers();
    getControl('pitch-memory-frequency').disabled = false;
    getAction('pitch-memory-response-play').disabled = false;
    getAction('pitch-memory-response-stop').disabled = false;
    getAction('pitch-memory-submit', response).disabled = false;
    setPitchMemoryStatus(
        'Produce the remembered pitch or adjust the tone, then submit.'
    );

    savePitchMemoryState();
}

function renderPitchMemoryCountdown() {
    if (!pitchMemory.trial || pitchMemory.trial.state !== 'waiting') {
        return;
    }

    const remaining = Math.max(0, pitchMemory.trial.availableAt - Date.now());

    if (remaining <= 0) {
        showPitchMemoryResponse();
        return;
    }

    const seconds = Math.ceil(remaining / 1000);
    const display =
        seconds < 60
            ? `${seconds} second${seconds === 1 ? '' : 's'}`
            : `${Math.ceil(seconds / 60)} minute${seconds <= 60 ? '' : 's'}`;

    setPitchMemoryStatus(
        `Recall opens in ${display}. Do not use a pitch reference.`
    );
}

function schedulePitchMemoryResponse() {
    clearPitchMemoryTimers();
    renderPitchMemoryCountdown();

    if (!pitchMemory.trial || pitchMemory.trial.state !== 'waiting') {
        return;
    }

    const remaining = Math.max(0, pitchMemory.trial.availableAt - Date.now());

    pitchMemory.timer = window.setTimeout(showPitchMemoryResponse, remaining);
    pitchMemory.countdown = window.setInterval(
        renderPitchMemoryCountdown,
        1000
    );
}

function playInterferenceSequence(random, count) {
    for (let index = 0; index < count; index += 1) {
        let frequencyHz = randomPitchMemoryFrequency(random);

        while (
            Math.abs(centsBetween(frequencyHz, pitchMemory.trial.targetHz)) <
            200
        ) {
            frequencyHz = randomPitchMemoryFrequency(random);
        }

        audio.playTransient(
            frequencyHz,
            'sine',
            0.12,
            0.7,
            1.45 + index * 0.18
        );
    }
}

function playNovelPitchMemoryMelody(random, startingHz) {
    const intervals = [0];
    let semitones = 0;

    for (let index = 1; index < 8; index += 1) {
        const steps = [-5, -3, -2, 2, 3, 5];
        const step = steps[Math.floor(random() * steps.length)];

        semitones = clamp(semitones + step, -7, 12);
        intervals.push(semitones);
    }

    intervals.forEach((interval, index) => {
        audio.playTransient(
            startingHz * 2 ** (interval / 12),
            'sine',
            0.3,
            0.75,
            index * 0.38
        );
    });
}

function setPitchMemoryReplayEnabled(enabled) {
    getAction('pitch-memory-start').disabled = !enabled;
}

function playPitchMemoryStimulus() {
    cancelPitchAdvance();

    if (
        !pitchMemory.trial ||
        pitchMemory.trial.state === 'complete' ||
        pitchMemory.trial.stimulusPlayed
    ) {
        return;
    }

    audio.stopTransient();

    const random = seededRandom(pitchMemory.trial.seed);
    const startedAt = Date.now();
    const conditionValue = Number.parseInt(pitchMemory.trial.condition, 10);
    const sequenceSeconds = 1.45 + conditionValue * 0.18;

    pitchMemory.trial.state = 'waiting';
    pitchMemory.trial.encodedAt = startedAt;
    pitchMemory.trial.encodingEndsAt =
        startedAt + (pitchMemory.trial.type === 'novel' ? 3000 : 1200);
    pitchMemory.trial.availableAt =
        startedAt +
        (pitchMemory.trial.type === 'novel'
            ? conditionValue + 3
            : sequenceSeconds) *
            1000;
    getAction('pitch-memory-stop').disabled = false;

    // Consume the value originally used to select targetHz.
    randomPitchMemoryFrequency(random);

    if (pitchMemory.trial.type === 'novel') {
        playNovelPitchMemoryMelody(random, pitchMemory.trial.targetHz);
    } else {
        audio.playTransient(pitchMemory.trial.targetHz, 'sine', 1.2, 0.8);
        playInterferenceSequence(random, conditionValue);
    }

    const trialSeed = pitchMemory.trial.seed;
    const playbackSeconds =
        pitchMemory.trial.type === 'novel'
            ? 3
            : Math.max(1.2, 1.45 + conditionValue * 0.18);

    if (pitchMemory.replayTimer !== null) {
        clearTimeout(pitchMemory.replayTimer);
    }

    pitchMemory.replayTimer = window.setTimeout(() => {
        pitchMemory.replayTimer = null;

        if (pitchMemory.trial?.seed !== trialSeed) {
            return;
        }

        pitchMemory.trial.stimulusPlayed = true;
        setPitchMemoryReplayEnabled(false);
        getAction('pitch-memory-stop').disabled = true;
        savePitchMemoryState();
    }, playbackSeconds * 1000);

    savePitchMemoryState();
    schedulePitchMemoryResponse();
}

function newPitchMemoryTrial() {
    cancelPitchAdvance();
    cancelPitchMemoryTrial(false);

    const type = getControl('pitch-memory-type').value;
    void startPitchMemoryMic();

    const seed = randomSeed();
    const random = seededRandom(seed);
    const distractors = Number(getControl('pitch-memory-distractors').value);
    const delaySeconds = Number(getControl('pitch-memory-delay').value);
    const sequenceSeconds = 1.45 + distractors * 0.18;

    pitchMemory.trial = {
        type,
        condition:
            type === 'novel'
                ? `${delaySeconds}s delay`
                : `${distractors} distractors`,
        targetHz: randomPitchMemoryFrequency(random),
        seed,
        encodedAt: Date.now(),
        encodingEndsAt: Date.now() + (type === 'novel' ? 3000 : 1200),
        availableAt:
            Date.now() +
            (type === 'novel' ? delaySeconds + 3 : sequenceSeconds) * 1000,
        state: 'waiting',
        stimulusPlayed: false,
    };

    hidePitchMemoryResponses();
    clearPitchMemoryFrequencyMarkers();
    getOutput('pitch-memory-result').textContent = '';
    setPitchMemoryReplayEnabled(true);
    getAction('pitch-memory-stop').disabled = false;

    playPitchMemoryStimulus();
}

function cancelPitchMemoryTrial(showStatus = true) {
    cancelPitchAdvance();
    clearPitchMemoryTimers();

    if (pitchMemory.replayTimer !== null) {
        clearTimeout(pitchMemory.replayTimer);
        pitchMemory.replayTimer = null;
    }

    stopPitchMemoryResponseTone();
    audio.stopTransient();

    pitchMemory.trial = null;

    const startButton = getAction('pitch-memory-start');

    if (!startButton) {
        return;
    }

    startButton.disabled = true;
    getAction('pitch-memory-stop').disabled = true;
    hidePitchMemoryResponses();

    if (showStatus) {
        setPitchMemoryStatus('Trial cancelled.');
    }

    savePitchMemoryState();
}

function stopPitchMemoryAudio() {
    cancelPitchAdvance();
    clearPitchMemoryTimers();
    audio.stopTransient();
    stopPitchMemoryResponseTone();

    if (pitchMemory.replayTimer !== null) {
        clearTimeout(pitchMemory.replayTimer);
        pitchMemory.replayTimer = null;
    }

    if (pitchMemory.trial?.state !== 'complete') {
        pitchMemory.trial.state = 'stopped';
        getAction('pitch-memory-stop').disabled = true;
        hidePitchMemoryResponses();
        setPitchMemoryStatus('Trial paused.');
        savePitchMemoryState();
    }
}

function playPitchMemoryResponse() {
    if (
        document.getElementById('pitch-memory-response-actions').hidden ||
        !pitchMemory.trial ||
        pitchMemory.trial.state !== 'responding'
    ) {
        return;
    }

    stopPitchMemoryResponseTone();
    pitchMemory.responseMethod = 'oscillator';
    pitchMemory.responseVoice = audio.playContinuous(
        getPitchMemoryFrequencyFromSlider(),
        'sine',
        0.8
    );
}

function updatePitchMemoryResponseTone() {
    const responseHz = getPitchMemoryFrequencyFromSlider();
    const detectedHz = pitchMemory.mic.detectedHz;
    pitchMemory.responseMethod =
        Number.isFinite(detectedHz) &&
        Math.abs(centsBetween(responseHz, detectedHz)) <=
            PITCH_MEMORY_MIC_ADJUSTMENT_CENTS
            ? 'microphone'
            : 'oscillator';
    renderPitchMemoryResponseFrequency();
    pitchMemory.responseVoice?.setFrequency(responseHz);
}

function submitPitchMemoryResponse() {
    if (!pitchMemory.trial || pitchMemory.trial.state !== 'responding') {
        return;
    }

    const method = pitchMemory.responseMethod;
    const responseHz = getPitchMemoryFrequencyFromSlider();

    if (!Number.isFinite(responseHz) || responseHz <= 0) {
        return;
    }

    const scoredResponseHz =
        method === 'microphone'
            ? nearestOctaveFrequency(responseHz, pitchMemory.trial.targetHz)
            : responseHz;
    const errorCents = centsBetween(
        scoredResponseHz,
        pitchMemory.trial.targetHz
    );
    const result = {
        timestamp: new Date().toISOString(),
        type: pitchMemory.trial.type,
        method,
        condition: pitchMemory.trial.condition,
        targetHz: pitchMemory.trial.targetHz,
        responseHz,
        scoredResponseHz,
        errorCents,
        absoluteErrorCents: Math.abs(errorCents),
        responseTimeMs: Date.now() - pitchMemory.trial.responseStartedAt,
        waveform: 'sine',
        seed: pitchMemory.trial.seed,
    };

    const correct = result.absoluteErrorCents < PITCH_MEMORY_CORRECT_CENTS;

    const typeStats = stats.pitch[pitchStatsType('memory', result.type)];

    typeStats.trials += 1;
    typeStats.correct += correct ? 1 : 0;
    typeStats.errorTotal += result.absoluteErrorCents;
    typeStats.streak = correct ? typeStats.streak + 1 : 0;

    if (typeStats.best === null || result.absoluteErrorCents < typeStats.best) {
        typeStats.best = result.absoluteErrorCents;
    }

    savePitchStats();
    stopPitchMemoryResponseTone();

    getOutput('pitch-memory-result').textContent =
        result.method === 'microphone'
            ? `Target ${result.targetHz.toFixed(3)} Hz; response ${result.responseHz.toFixed(3)} Hz; octave-adjusted ${result.scoredResponseHz.toFixed(3)} Hz; error ${signed(result.errorCents, 1)} cents.`
            : `Target ${result.targetHz.toFixed(3)} Hz; response ${result.responseHz.toFixed(3)} Hz; error ${signed(result.errorCents, 1)} cents.`;

    showPitchMemoryFrequencyMarkers(result);

    getControl('pitch-memory-frequency').disabled = true;
    getAction('pitch-memory-response-play').disabled = true;
    getAction('pitch-memory-response-stop').disabled = true;
    getAction(
        'pitch-memory-submit',
        document.getElementById('pitch-memory-response-actions')
    ).disabled = true;

    pitchMemory.trial.state = 'complete';

    setPitchMemoryReplayEnabled(true);
    getAction('pitch-memory-stop').disabled = false;

    savePitchMemoryState();
    renderPitchStats();
    setPitchMemoryStatus('Trial complete.');
    schedulePitchAdvance();
}

function updatePitchMemoryControls() {
    const novel = getControl('pitch-memory-type').value === 'novel';

    document.querySelector('[data-pitch-memory-type="novel"]').hidden = !novel;
    document.querySelector('[data-pitch-memory-type="interference"]').hidden =
        novel;
    renderPitchStats();
}

function updatePitchMode() {
    const mode = sectionModes.pitch;

    for (const panel of getModePanels('pitch')) {
        panel.hidden = panel.dataset.modePanel !== mode;
    }

    stopAllAudio();
    cancelPitchAdvance();

    if (mode === 'memory') {
        updatePitchMemoryControls();
        if (
            pitchMemory.trial &&
            requestedMicrophoneState === MICROPHONE_STATES.LISTENING
        ) {
            void startPitchMemoryMic();
        }
        return;
    }

    if (
        pitchMemory.trial?.state === 'waiting' &&
        (pitchMemory.trial.type === 'interference' ||
            Date.now() < pitchMemory.trial.encodingEndsAt)
    ) {
        cancelPitchMemoryTrial();
    }

    stopPitchMemoryMic();
    newPitchPlacementTrial();
    renderPitchStats();
}

function restorePitchMemoryTrial() {
    const trial = pitchMemory.trial;

    if (
        !trial ||
        !['novel', 'interference'].includes(trial.type) ||
        !['waiting', 'responding'].includes(trial.state) ||
        !Number.isFinite(trial.targetHz) ||
        trial.targetHz < PITCH_MEMORY_MIN_HZ ||
        trial.targetHz > PITCH_MEMORY_MAX_HZ
    ) {
        pitchMemory.trial = null;
        storage.remove(PITCH_MEMORY_TRIAL_KEY);
        updatePitchMemoryControls();
        return;
    }

    getControl('pitch-memory-type').value = trial.type;

    const conditionValue = String(Number.parseInt(trial.condition, 10));

    if (trial.type === 'novel') {
        getControl('pitch-memory-delay').value = conditionValue;
    } else {
        getControl('pitch-memory-distractors').value = conditionValue;
    }

    updatePitchMemoryControls();

    if (trial.state === 'responding') {
        trial.state = 'waiting';
        showPitchMemoryResponse();
        return;
    }

    if (!trial.stimulusPlayed) {
        trial.state = 'ready';
        playPitchMemoryStimulus();
        return;
    }

    setPitchMemoryReplayEnabled(!trial.stimulusPlayed);
    getAction('pitch-memory-stop').disabled = true;
    schedulePitchMemoryResponse();
}

// Match

function defaultMatchStats() {
    return {
        identification: defaultMatchIdentificationStats(),
        target: defaultMatchTargetStats(),
    };
}

function loadMatchStats() {
    const stored = loadStats('match');

    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        return defaultMatchStats();
    }

    return {
        identification: loadMatchIdentificationStats(stored.identification),
        target: loadMatchTargetStats(stored.target),
    };
}

function saveMatchStats() {
    saveStats('match');
}

stats.match = loadMatchStats();

function newMatchTrial(playImmediately = false) {
    if (sectionModes.match === 'identification') {
        newMatchIdentificationTrial(playImmediately);
    } else {
        newMatchTargetTrial();
    }
}

function playMatchTrial() {
    if (sectionModes.match === 'identification') {
        playMatchIdentificationTrial();
    }
}

const matchAdvance = createAutoAdvance(getModuleActions('match', 'new'), () =>
    newMatchTrial(true)
);

function cancelMatchAdvance() {
    matchAdvance.cancel();
}

function scheduleMatchAdvance() {
    matchAdvance.schedule();
}

function renderMatchStats() {
    if (sectionModes.match === 'identification') {
        renderMatchIdentificationStats();
    } else {
        renderMatchTargetStats();
    }
}

function clearMatchStats() {
    if (sectionModes.match === 'identification') {
        stats.match.identification = defaultMatchIdentificationStats();
    } else {
        stats.match.target = defaultMatchTargetStats();
    }

    saveMatchStats();
    renderMatchStats();
}

function updateMatchMode() {
    const mode = sectionModes.match;

    for (const panel of getModePanels('match')) {
        panel.hidden = panel.dataset.modePanel !== mode;
    }

    stopAllAudio();
    cancelMatchAdvance();

    if (mode === 'identification') {
        newMatchIdentificationTrial();
    } else {
        newMatchTargetTrial();
    }

    renderMatchStats();
}

// Match: target

function defaultMatchTargetStats() {
    return {
        streak: 0,
        trials: 0,
        correct: 0,
        errorTotal: 0,
        best: null,
    };
}

function loadMatchTargetStats(stored) {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        return defaultMatchTargetStats();
    }

    return {
        streak: Number.isFinite(stored.streak) ? stored.streak : 0,
        trials: Number.isFinite(stored.trials) ? stored.trials : 0,
        correct: Number.isFinite(stored.correct) ? stored.correct : 0,
        errorTotal: Number.isFinite(stored.errorTotal) ? stored.errorTotal : 0,
        best: Number.isFinite(stored.best) ? stored.best : null,
    };
}

const matchTarget = {
    answers: [],
    committed: false,
    selectedAnswerIndex: null,
    adaptiveResults: [],
};

function spreadMagnitudes(count, minimum, maximum) {
    if (count === 0) {
        return [];
    }

    if (count === 1) {
        return [minimum + Math.random() * (maximum - minimum)];
    }

    const bandSize = (maximum - minimum) / count;

    return Array.from({ length: count }, (_, index) => {
        const lower = minimum + bandSize * index;

        const upper =
            index === count - 1 ? maximum : minimum + bandSize * (index + 1);

        return lower + Math.random() * (upper - lower);
    });
}

function matchTargetAnswerOffsets(count, minimum, maximum) {
    const nonTargetCount = count - 1;

    let negativeCount = Math.floor(nonTargetCount / 2);

    let positiveCount = nonTargetCount - negativeCount;

    /*
     * When there's an odd number of
     * non-target answers, randomly
     * choose which side gets the extra.
     */
    if (Math.random() < 0.5) {
        [negativeCount, positiveCount] = [positiveCount, negativeCount];
    }

    const negativeOffsets = spreadMagnitudes(
        negativeCount,
        minimum,
        maximum
    ).map((magnitude) => -magnitude);

    const positiveOffsets = spreadMagnitudes(positiveCount, minimum, maximum);

    return [0, ...negativeOffsets, ...positiveOffsets];
}

function newMatchTargetTrial() {
    cancelMatchAdvance();
    stopAllAudio();

    const targetHz = selectedNoteFrequency(getNote('match-target'));

    const { minimum: minimumCents, maximum: maximumCents } = readRange(
        getControl('match-target-range-min'),
        getControl('match-target-range-max'),
        10,
        50
    );

    const count = Math.round(readNumber(getControl('match-target-count'), 7));

    matchTarget.answers = shuffle(
        matchTargetAnswerOffsets(count, minimumCents, maximumCents).map(
            (cents) => ({
                cents,

                frequencyHz: frequencyFromCents(targetHz, cents),

                isTarget: Math.abs(cents) < 0.000001,

                played: false,
            })
        )
    );

    matchTarget.committed = false;
    matchTarget.selectedAnswerIndex = null;

    renderMatchTargetAnswers();
}

function getMatchTargetAnswerResult(index) {
    if (!matchTarget.committed) {
        return null;
    }

    const targetIndex = matchTarget.answers.findIndex(
        (answer) => answer.isTarget
    );
    const className = answerStateClass(
        index,
        matchTarget.selectedAnswerIndex,
        targetIndex
    );

    return {
        icon:
            {
                'is-correct': '✓',
                'is-incorrect': '✕',
                'is-target': '◎',
            }[className] ?? '',
        className,
    };
}

function createMatchTargetAnswerRow(answer, index) {
    const row = document.createElement('div');

    row.className = 'practice-row';

    row.dataset.matchTargetAnswer = String(index);

    const buttons = document.createElement('div');

    buttons.className = 'answer-actions';

    const playButton = document.createElement('button');

    playButton.type = 'button';

    playButton.className = 'icon-button answer-play';

    playButton.dataset.action = 'match-target-answer-play';

    playButton.setAttribute('aria-label', `Play answer ${index + 1}`);

    playButton.title = `Play answer ${index + 1}`;

    playButton.textContent = '▶';

    const chooseButton = document.createElement('button');

    chooseButton.type = 'button';

    chooseButton.className = 'answer-option answer-select';

    chooseButton.dataset.action = 'match-target-answer-select';

    chooseButton.textContent = `Choose #${index + 1}`;

    chooseButton.disabled = matchTarget.committed || !answer.played;

    buttons.append(playButton, chooseButton);

    row.append(buttons);

    const result = getMatchTargetAnswerResult(index);

    if (!result) {
        return row;
    }

    const details = document.createElement('span');

    details.className = 'practice-result';

    if (result.className) {
        chooseButton.classList.add(result.className);
        details.classList.add(result.className);
    }

    if (result.icon) {
        const icon = document.createElement('span');

        icon.className = 'result-icon';

        icon.textContent = result.icon;

        details.append(icon);
    }

    details.append(
        document.createTextNode(
            `${answer.frequencyHz.toFixed(3)} Hz, ` +
                `${signed(answer.cents, 2)} cents`
        )
    );

    row.append(details);

    return row;
}

function renderMatchTargetAnswers() {
    const rows = matchTarget.answers.map(createMatchTargetAnswerRow);

    document
        .querySelector('[data-match-target-answers]')
        .replaceChildren(...rows);
}

function playMatchTargetAnswer(index) {
    const answer = matchTarget.answers[index];

    if (!answer) {
        return;
    }

    cancelMatchAdvance();
    stopAllAudio();

    answer.played = true;

    audio.playTransient(
        answer.frequencyHz,

        getWaveform('match-target').value,

        readNumber(getControl('match-target-duration'), 1)
    );

    if (matchTarget.committed) {
        return;
    }

    const row = document.querySelector(`[data-match-target-answer="${index}"]`);

    const chooseButton = row
        ? getAction('match-target-answer-select', row)
        : null;

    if (chooseButton) {
        chooseButton.disabled = false;
    }
}

function renderMatchTargetStats() {
    const { streak, trials, errorTotal, best } = stats.match.target;
    const meanError = trials > 0 ? errorTotal / trials : 0;

    getOutput('match-target-streak').textContent = String(streak);

    getOutput('match-target-mean-error').textContent =
        `${meanError.toFixed(1)} cents`;

    getOutput('match-target-best').textContent =
        best === null ? '--' : String(best);
}

function commitMatchTargetAnswer(index) {
    if (matchTarget.committed) {
        return;
    }

    const selected = matchTarget.answers[index];

    const target = matchTarget.answers.find((answer) => answer.isTarget);

    if (!selected || !target) {
        return;
    }

    audio.stopTransient();

    matchTarget.committed = true;
    matchTarget.selectedAnswerIndex = index;

    const correct = selected.isTarget;
    const errorCents = Math.abs(
        centsBetween(selected.frequencyHz, target.frequencyHz)
    );

    stats.match.target.trials += 1;
    stats.match.target.correct += correct ? 1 : 0;
    stats.match.target.errorTotal += errorCents;
    stats.match.target.streak = correct ? stats.match.target.streak + 1 : 0;

    if (
        correct &&
        (stats.match.target.best === null ||
            stats.match.target.streak > stats.match.target.best)
    ) {
        stats.match.target.best = stats.match.target.streak;
    }

    saveMatchStats();

    renderMatchTargetAnswers();
    renderMatchTargetStats();
    updateAdaptiveDifficulty('match-target', correct);

    const newMatchButton = [...getModuleActions('match', 'new')].find(
        (button) => !button.closest('[hidden]')
    );

    newMatchButton?.focus();

    scheduleMatchAdvance();
}

// Match: identification

function defaultMatchIdentificationStats() {
    return {
        streak: 0,
        trials: 0,
        correct: 0,
        best: null,
    };
}

function loadMatchIdentificationStats(stored) {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        return defaultMatchIdentificationStats();
    }

    return {
        streak: Number.isFinite(stored.streak) ? stored.streak : 0,
        trials: Number.isFinite(stored.trials) ? stored.trials : 0,
        correct: Number.isFinite(stored.correct) ? stored.correct : 0,
        best: Number.isFinite(stored.best) ? stored.best : null,
    };
}

const matchIdentification = { trial: null };

function renderMatchIdentificationAnswers(selected = null) {
    const trial = matchIdentification.trial;
    const buttons = NOTE_NAMES.map((name, pitchClass) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'answer-option';
        button.dataset.matchIdentificationAnswer = String(pitchClass);
        button.textContent = name;
        button.disabled = !trial?.played || trial.committed;
        setAnswerOptionState(button, pitchClass, selected, trial?.midi % 12);
        return button;
    });
    document
        .querySelector('[data-match-identification-answers]')
        .replaceChildren(...buttons);
}

function newMatchIdentificationTrial(playImmediately = false) {
    cancelMatchAdvance();
    stopAllAudio();
    const octaveValue = getControl('match-identification-octave').value;
    const octave =
        octaveValue === 'random'
            ? 3 + Math.floor(Math.random() * 3)
            : Number(octaveValue);
    matchIdentification.trial = {
        midi: (octave + 1) * 12 + Math.floor(Math.random() * 12),
        played: false,
        committed: false,
    };
    clearPracticeResult('match-identification-result');
    renderMatchIdentificationAnswers();
    if (playImmediately) {
        playMatchIdentificationTrial();
    }
}

function playMatchIdentificationTrial() {
    cancelMatchAdvance();

    if (!matchIdentification.trial) {
        newMatchIdentificationTrial();
    }
    stopAllAudio();
    const trial = matchIdentification.trial;
    audio.playTransient(
        midiFrequency(trial.midi),
        getWaveform('match-identification').value,
        readNumber(getControl('match-identification-duration'), 1)
    );
    trial.played = true;
    if (!trial.committed) {
        renderMatchIdentificationAnswers();
    }
}

function renderMatchIdentificationStats() {
    const { streak, trials, correct, best } = stats.match.identification;
    const accuracy = trials > 0 ? (correct / trials) * 100 : 0;
    getOutput('match-identification-streak').textContent = String(streak);
    getOutput('match-identification-accuracy').textContent =
        `${accuracy.toFixed(0)}%`;
    getOutput('match-identification-best').textContent =
        best === null ? '--' : String(best);
}

function commitMatchIdentification(pitchClass) {
    const trial = matchIdentification.trial;
    if (
        !trial?.played ||
        trial.committed ||
        !Number.isInteger(pitchClass) ||
        pitchClass < 0 ||
        pitchClass >= NOTE_NAMES.length
    ) {
        return;
    }
    audio.stopTransient();
    trial.committed = true;
    const correct = pitchClass === trial.midi % 12;
    const typeStats = stats.match.identification;
    typeStats.trials += 1;
    typeStats.correct += correct ? 1 : 0;
    typeStats.streak = correct ? typeStats.streak + 1 : 0;
    if (
        correct &&
        (typeStats.best === null || typeStats.streak > typeStats.best)
    ) {
        typeStats.best = typeStats.streak;
    }
    saveMatchStats();
    renderMatchIdentificationStats();
    renderMatchIdentificationAnswers(pitchClass);
    renderPracticeResult(
        'match-identification-result',
        correct,
        midiToNoteName(trial.midi)
    );
    scheduleMatchAdvance();
}

// Intervals

function defaultIntervalTypeStats() {
    return {
        streak: 0,
        trials: 0,
        correct: 0,
        best: null,
    };
}

function defaultIntervalStats() {
    return {
        recognition: defaultIntervalTypeStats(),
        construction: defaultIntervalTypeStats(),
    };
}

function loadIntervalTypeStats(stored) {
    if (!stored || typeof stored !== 'object') {
        return defaultIntervalTypeStats();
    }

    return {
        streak: Number.isFinite(stored.streak) ? stored.streak : 0,
        trials: Number.isFinite(stored.trials) ? stored.trials : 0,
        correct: Number.isFinite(stored.correct) ? stored.correct : 0,
        best: Number.isFinite(stored.best) ? stored.best : null,
    };
}

function loadIntervalStats() {
    const stored = loadStats('interval');

    if (!stored || typeof stored !== 'object') {
        return defaultIntervalStats();
    }

    return {
        recognition: loadIntervalTypeStats(stored.recognition),
        construction: loadIntervalTypeStats(stored.construction),
    };
}

function saveIntervalStats() {
    saveStats('interval');
}

stats.interval = loadIntervalStats();

const interval = {
    trial: null,
    recognition: {
        adaptiveResults: [],
    },
    construction: {
        adaptiveResults: [],
    },
};

function getIntervalExercise() {
    return `interval-${sectionModes.intervals}`;
}

const intervalAdvance = createAutoAdvance(
    getModuleActions('interval', 'new'),
    () => newIntervalTrial(true)
);

function cancelIntervalAdvance() {
    intervalAdvance.cancel();
}

function scheduleIntervalAdvance() {
    intervalAdvance.schedule();
}

function enabledIntervals() {
    const level = getControl('shared-interval-set').value;
    const enabledSemitones = INTERVAL_LEVELS[level] || INTERVAL_LEVELS.starter;

    return INTERVALS.filter(({ semitones }) =>
        enabledSemitones.includes(semitones)
    );
}

function updateIntervalMode() {
    const mode = sectionModes.intervals;

    for (const panel of getModePanels('intervals')) {
        panel.hidden = panel.dataset.modePanel !== mode;
    }

    renderAdaptiveProgress(getIntervalExercise());
    newIntervalTrial();
    renderIntervalStats();
}

function renderIntervalAnswers(selected = null, enabled = false) {
    const answerSemitones = interval.trial?.answerSemitones || [];
    const buttons = answerSemitones.map((semitones) => {
        const answer = INTERVALS.find(
            (candidate) => candidate.semitones === semitones
        );
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'answer-option';
        button.dataset.intervalAnswer = String(answer.semitones);
        button.textContent =
            interval.trial.mode === 'construction'
                ? midiToNoteName(
                      interval.trial.rootMidi +
                          interval.trial.direction * answer.semitones
                  )
                : answer.shortName || answer.name;
        button.setAttribute(
            'aria-label',
            interval.trial.mode === 'construction'
                ? `Choose ${button.textContent}`
                : answer.name
        );
        button.disabled = interval.trial?.committed || !enabled;

        setAnswerOptionState(
            button,
            answer.semitones,
            selected,
            interval.trial.semitones
        );

        return button;
    });

    if (interval.trial?.mode === 'construction') {
        const prompt = getOutput('interval-construction-prompt');
        const intervalName = INTERVALS.find(
            ({ semitones }) => semitones === interval.trial.semitones
        ).name;
        const direction =
            interval.trial.semitones === 0
                ? ''
                : ` ${interval.trial.direction > 0 ? 'ascending' : 'descending'}`;

        prompt.replaceChildren(
            document.createTextNode(
                `Start: ${midiToNoteName(interval.trial.rootMidi)}.`
            ),
            document.createElement('br'),
            document.createTextNode(`Build: ${intervalName}${direction}.`)
        );
    }

    document
        .querySelector(`[data-interval-answers="${sectionModes.intervals}"]`)
        .replaceChildren(...buttons);
}

function clearIntervalResult() {
    clearPracticeResult(`${getIntervalExercise()}-result`);
}

// Intervals: recognition and construction

function newIntervalTrial(playImmediately = false) {
    if (sectionModes.intervals === 'construction') {
        newIntervalConstructionTrial(playImmediately);
    } else {
        newIntervalRecognitionTrial(playImmediately);
    }
}

function newIntervalRecognitionTrial(playImmediately = false) {
    createIntervalTrial('recognition', playImmediately);
}

function newIntervalConstructionTrial(playImmediately = false) {
    createIntervalTrial('construction', playImmediately);
}

function createIntervalTrial(mode, playImmediately) {
    cancelIntervalAdvance();
    stopAllAudio();

    const choices = enabledIntervals();
    const target = choices[Math.floor(Math.random() * choices.length)];
    const directionControl = getControl('shared-interval-direction').value;
    const ascending =
        directionControl === 'random'
            ? Math.random() < 0.5
            : directionControl === 'ascending';
    const answerSemitones =
        mode === 'construction'
            ? shuffle(INTERVALS).map(({ semitones }) => semitones)
            : shuffle([
                  ...shuffle(
                      choices.filter((candidate) => candidate !== target)
                  ).slice(0, 3),
                  target,
              ]).map(({ semitones }) => semitones);
    const rootMidi = ascending
        ? 48 + Math.floor(Math.random() * 24)
        : 60 + Math.floor(Math.random() * 24);

    interval.trial = {
        mode,
        semitones: target.semitones,
        answerSemitones,
        rootMidi,
        direction: ascending ? 1 : -1,
        targetMidi: rootMidi + (ascending ? 1 : -1) * target.semitones,
        committed: false,
        played: false,
    };

    clearIntervalResult();
    renderIntervalAnswers();

    if (playImmediately) {
        playIntervalTrial();
    }
}

function playIntervalTrial() {
    if (!interval.trial) {
        newIntervalTrial();
    }

    cancelIntervalAdvance();
    stopAllAudio();

    const trial = interval.trial;
    const duration = readNumber(getControl('shared-interval-duration'), 0.7);
    const waveform = getWaveform(`interval-${sectionModes.intervals}`).value;

    audio.playTransient(midiFrequency(trial.rootMidi), waveform, duration);
    audio.playTransient(
        midiFrequency(trial.targetMidi),
        waveform,
        duration,
        1,
        duration + 0.15
    );

    trial.played = true;

    if (!trial.committed) {
        renderIntervalAnswers(null, true);
    }
}

function renderIntervalStats() {
    const mode = sectionModes.intervals;
    const { streak, trials, correct, best } = stats.interval[mode];

    const accuracy = trials > 0 ? (correct / trials) * 100 : 0;
    getOutput(`interval-${mode}-streak`).textContent = String(streak);

    getOutput(`interval-${mode}-accuracy`).textContent =
        `${accuracy.toFixed(0)}%`;

    getOutput(`interval-${mode}-best`).textContent =
        best === null ? '--' : String(best);
}

function clearIntervalStats() {
    const mode = sectionModes.intervals;

    stats.interval[mode] = defaultIntervalTypeStats();
    saveIntervalStats();
    renderIntervalStats();
}

function commitInterval(semitones) {
    const trial = interval.trial;

    if (!trial || !trial.played || trial.committed) {
        return;
    }

    audio.stopTransient();
    trial.committed = true;

    const correct = semitones === trial.semitones;
    const correctInterval = INTERVALS.find(
        (candidate) => candidate.semitones === trial.semitones
    );

    stats.interval[trial.mode].trials += 1;
    stats.interval[trial.mode].correct += correct ? 1 : 0;
    stats.interval[trial.mode].streak = correct
        ? stats.interval[trial.mode].streak + 1
        : 0;

    if (
        correct &&
        (stats.interval[trial.mode].best === null ||
            stats.interval[trial.mode].streak > stats.interval[trial.mode].best)
    ) {
        stats.interval[trial.mode].best = stats.interval[trial.mode].streak;
    }

    saveIntervalStats();
    renderIntervalStats();
    renderIntervalAnswers(semitones, true);
    renderPracticeResult(
        `${getIntervalExercise()}-result`,
        correct,
        correctInterval.name
    );
    updateAdaptiveDifficulty(`interval-${trial.mode}`, correct);

    const playedNotes = document.createElement('div');

    playedNotes.className = 'played-notes';
    playedNotes.textContent =
        `${midiToNoteName(trial.rootMidi)} → ` +
        midiToNoteName(trial.targetMidi);
    getOutput(`${getIntervalExercise()}-result`).append(playedNotes);

    scheduleIntervalAdvance();
}

// Chords: quality

function defaultChordQualityStats() {
    return {
        streak: 0,
        trials: 0,
        correct: 0,
        best: null,
    };
}

function defaultChordStats() {
    return {
        quality: defaultChordQualityStats(),
    };
}

function loadChordQualityStats(stored) {
    if (!stored || typeof stored !== 'object') {
        return defaultChordQualityStats();
    }

    return {
        streak: Number.isFinite(stored.streak) ? stored.streak : 0,
        trials: Number.isFinite(stored.trials) ? stored.trials : 0,
        correct: Number.isFinite(stored.correct) ? stored.correct : 0,
        best: Number.isFinite(stored.best) ? stored.best : null,
    };
}

function loadChordStats() {
    const stored = loadStats('chord');

    if (!stored || typeof stored !== 'object') {
        return defaultChordStats();
    }

    return {
        quality: loadChordQualityStats(stored.quality ?? stored.recognition),
    };
}

function saveChordStats() {
    saveStats('chord');
}

stats.chord = loadChordStats();

const chord = {
    quality: null,
    rootMidi: null,
    committed: false,
    playedNotes: [],
};

function newChordTrial(playImmediately = false) {
    newChordQualityTrial(playImmediately);
}

const chordAdvance = createAutoAdvance(getModuleActions('chord', 'new'), () =>
    newChordTrial(true)
);

function cancelChordAdvance() {
    chordAdvance.cancel();
}

function scheduleChordAdvance() {
    chordAdvance.schedule();
}

function renderChordQualityAnswers(selected = null, answersEnabled = false) {
    const buttons = Object.keys(CHORD_QUALITIES).map((quality) => {
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'answer-option';
        button.dataset.chordAnswer = quality;
        button.textContent = quality[0].toUpperCase() + quality.slice(1);
        button.disabled = chord.committed || !answersEnabled;

        setAnswerOptionState(button, quality, selected, chord.quality);

        return button;
    });

    document.querySelector('[data-chord-answers]').replaceChildren(...buttons);
}

function clearChordQualityResult() {
    clearPracticeResult('chord-result');
}

function newChordQualityTrial(playImmediately = false) {
    cancelChordAdvance();
    stopAllAudio();

    const qualities = Object.keys(CHORD_QUALITIES);

    chord.quality = qualities[Math.floor(Math.random() * qualities.length)];
    chord.rootMidi = 48 + Math.floor(Math.random() * 24);
    chord.committed = false;
    chord.playedNotes = [];

    clearChordQualityResult();
    renderChordQualityAnswers();

    if (playImmediately) {
        playChordQualityTrial();
    }
}

function playChordQualityTrial() {
    if (!chord.quality) {
        newChordQualityTrial();

        if (!chord.quality) {
            return;
        }
    }

    cancelChordAdvance();
    stopAllAudio();

    const waveform = getWaveform('chords').value;
    const playback = getControl('chord-playback').value;
    const sequential = playback !== 'together';
    const intervals = [...CHORD_QUALITIES[chord.quality]];

    if (playback === 'descending') {
        intervals.reverse();
    }

    chord.playedNotes = intervals.map(
        (semitones) => chord.rootMidi + semitones
    );

    intervals.forEach((semitones, index) => {
        audio.playTransient(
            midiFrequency(chord.rootMidi + semitones),
            waveform,
            sequential ? 0.7 : 1.2,
            0.55,
            sequential ? index * 0.35 : 0
        );
    });

    if (!chord.committed) {
        renderChordQualityAnswers(null, true);
    }
}

function renderChordQualityStats() {
    const { streak, trials, correct, best } = stats.chord.quality;

    const accuracy = trials > 0 ? (correct / trials) * 100 : 0;

    getOutput('chord-streak').textContent = String(streak);

    getOutput('chord-accuracy').textContent = `${accuracy.toFixed(0)}%`;

    getOutput('chord-best').textContent = best === null ? '--' : String(best);
}

function clearChordQualityStats() {
    stats.chord.quality = defaultChordQualityStats();

    clearStats('chord');

    renderChordQualityStats();
}

function commitChordQuality(quality) {
    if (chord.committed || !CHORD_QUALITIES[quality]) {
        return;
    }

    audio.stopTransient();
    chord.committed = true;

    const correct = quality === chord.quality;

    stats.chord.quality.trials += 1;
    stats.chord.quality.correct += correct ? 1 : 0;
    stats.chord.quality.streak = correct ? stats.chord.quality.streak + 1 : 0;

    if (
        correct &&
        (stats.chord.quality.best === null ||
            stats.chord.quality.streak > stats.chord.quality.best)
    ) {
        stats.chord.quality.best = stats.chord.quality.streak;
    }

    saveChordStats();
    renderChordQualityStats();
    renderChordQualityAnswers(quality, true);

    renderPracticeResult(
        'chord-result',
        correct,
        `${chord.quality[0].toUpperCase()}${chord.quality.slice(1)}`
    );

    const playedNotes = document.createElement('div');

    playedNotes.className = 'played-notes';
    playedNotes.textContent = `Notes: ${chord.playedNotes
        .map(midiToNoteName)
        .join(', ')}`;
    getOutput('chord-result').append(playedNotes);

    scheduleChordAdvance();
}

// Events

function resetForReferenceChange() {
    stopGeneratedAudio();
    cancelPitchAdvance();
    cancelIntervalAdvance();

    resetTunerTracking(true);

    updateNoteReadouts();

    if (tunerTargetMidi !== null) {
        renderTunerString();
    }

    newPitchPlacementTrial();
    newMatchTrial();
    newIntervalTrial();
}

function initializeEvents() {
    const synchronizeChangedSharedControl = (event) => {
        synchronizeSharedControl(event.target);
    };
    document.addEventListener('input', synchronizeChangedSharedControl, true);
    document.addEventListener('change', synchronizeChangedSharedControl, true);

    for (const control of getControls('shared-note')) {
        control.addEventListener('change', () => {
            updateNoteReadouts();

            if (tunerTargetMidi !== null) {
                stopTuner();
                clearTunerTarget();
            }

            if (tunerVoice) {
                tunerVoice.setFrequency(
                    selectedNoteFrequency(getNote('tuner'))
                );
            }

            newPitchPlacementTrial();
            newMatchTrial();
        });
    }

    for (const control of getControls(
        'shared-time-signature',
        'rhythm-sheet-bars',
        'rhythm-sheet-note-values',
        'rhythm-sheet-clef'
    )) {
        control.addEventListener('change', () => {
            if (sheetMusicEnabled()) {
                const wasRunning = rhythm.running;
                newRhythmPhrase();
                if (wasRunning) {
                    startRhythm();
                }
            } else {
                restartRhythm();
            }
        });
    }
    for (const control of getControls('shared-bpm')) {
        control.addEventListener('change', restartRhythm);
    }
    const rhythmHold = document.getElementById('rhythm-sheet-hold');
    getAction('rhythm-sheet-new').addEventListener('click', () => {
        newRhythmPhrase();
        startRhythm();
    });
    const rhythmLane = document.getElementById('rhythm-sheet-score');
    for (const target of [rhythmHold, rhythmLane]) {
        target.addEventListener('pointerdown', (event) => {
            if (
                event.button !== 0 ||
                event.pointerType !== 'mouse' ||
                !event.isPrimary ||
                !sheetMusic.active
            ) {
                return;
            }
            event.preventDefault();
            target.setPointerCapture(event.pointerId);
            pressRhythm(event.pointerId);
        });
        target.addEventListener('pointerup', (event) => {
            releaseRhythm(event.pointerId);
        });
        target.addEventListener('pointercancel', (event) => {
            if (sheetMusic.active && sheetMusic.input === event.pointerId) {
                stopGeneratedAudio();
            }
        });
        target.addEventListener('lostpointercapture', (event) => {
            releaseRhythm(event.pointerId);
        });
    }
    document.addEventListener('keydown', (event) => {
        if (
            event.code !== 'Space' ||
            !sheetMusicEnabled() ||
            !sheetMusic.active ||
            document.getElementById('rhythm-panel').hidden ||
            event.target.closest(
                'input, select, textarea, [contenteditable="true"]'
            ) ||
            (event.target.closest('button, a') && event.target !== rhythmHold)
        ) {
            return;
        }
        event.preventDefault();
        if (!event.repeat) {
            pressRhythm('keyboard');
        }
    });
    document.addEventListener('keyup', (event) => {
        if (event.code === 'Space' && sheetMusic.input === 'keyboard') {
            event.preventDefault();
            releaseRhythm('keyboard');
        }
    });
    window.addEventListener('blur', () => {
        if (sheetMusic.active) {
            stopGeneratedAudio();
        }
    });
    const rhythmTimingTap = document.getElementById('rhythm-timing-tap');
    rhythmTimingTap.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || !event.isPrimary) {
            return;
        }
        event.preventDefault();
        recordRhythmTimingTap();
    });
    rhythmTimingTap.addEventListener('click', (event) => {
        if (event.detail === 0) {
            recordRhythmTimingTap();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (
            event.code !== 'Space' ||
            !rhythmTimingEnabled() ||
            !rhythm.running ||
            document.getElementById('rhythm-panel').hidden ||
            event.target.closest(
                'input, select, textarea, [contenteditable="true"]'
            ) ||
            (event.target.closest('button, a') &&
                event.target !== rhythmTimingTap)
        ) {
            return;
        }
        event.preventDefault();
        if (!event.repeat) {
            recordRhythmTimingTap();
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && rhythm.running) {
            stopGeneratedAudio();
        }
    });

    for (const button of getModuleActions('rhythm', 'play')) {
        button.addEventListener('click', startRhythm);
    }
    for (const button of getModuleActions('rhythm', 'tempo-tap')) {
        button.addEventListener('click', tapTempo);
    }

    for (const control of getControls('shared-interval-set')) {
        control.addEventListener('change', () => {
            for (const exercise of [
                'interval-recognition',
                'interval-construction',
            ]) {
                resetAdaptiveProgress(exercise);
            }
            newIntervalTrial();
        });
    }
    for (const control of getControls('shared-interval-direction')) {
        control.addEventListener('change', newIntervalTrial);
    }

    for (const control of getControls(
        'pitch-placement-range-min',
        'pitch-placement-range-max',
        'pitch-placement-interval'
    )) {
        control.addEventListener('change', () => {
            resetAdaptiveProgress('pitch-placement');
            newPitchPlacementTrial();
        });
    }

    for (const control of getControls(
        'match-target-range-min',
        'match-target-range-max',
        'match-target-count'
    )) {
        control.addEventListener('change', () => {
            resetAdaptiveProgress('match-target');
            newMatchTrial();
        });
    }

    for (const control of getControls('shared-adaptive')) {
        control.addEventListener('change', () => {
            for (const exercise of [
                'pitch-placement',
                'match-target',
                'interval-recognition',
                'interval-construction',
            ]) {
                resetAdaptiveProgress(exercise);
            }
        });
    }
    getControl('global-volume').addEventListener('input', updateVolume);
    getAction('global-volume-toggle').addEventListener('click', toggleVolume);

    const referenceA4Input = getControl('global-reference-a4');

    referenceA4Input.addEventListener('input', () => {
        resetForReferenceChange();

        const a4 = Number(referenceA4Input.value);

        if (
            Number.isFinite(a4) &&
            a4 >= Number(referenceA4Input.min) &&
            a4 <= Number(referenceA4Input.max)
        ) {
            savePreferences();
        }
    });
    referenceA4Input.addEventListener('change', () => {
        normalizeNumberInput(referenceA4Input, DEFAULT_REFERENCE_A4);
        resetForReferenceChange();
        savePreferences();
    });

    getControl('pitch-placement-duration').addEventListener(
        'change',
        (event) => {
            normalizeNumberInput(event.currentTarget, 1);
        }
    );

    getControl('match-target-duration').addEventListener('change', (event) => {
        normalizeNumberInput(event.currentTarget, 1);
    });

    for (const control of getControls('shared-interval-duration')) {
        control.addEventListener('change', (event) => {
            normalizeNumberInput(event.currentTarget, 0.7);
            synchronizeSharedControl(event.currentTarget);
        });
    }

    getAction('global-reference-reset').addEventListener('click', () => {
        getControl('global-reference-a4').value =
            DEFAULT_REFERENCE_A4.toFixed(3);

        resetForReferenceChange();
        savePreferences();
    });

    getControl('tuner-instrument').addEventListener(
        'change',
        updateTunerInstrument
    );
    getControl('tuner-variation').addEventListener(
        'change',
        updateTunerStrings
    );

    getAction('tuner-play').addEventListener('click', playTuner);

    getAction('global-microphone-toggle').addEventListener(
        'click',
        toggleGlobalMicrophone
    );

    getControl('match-identification-octave').addEventListener(
        'change',
        newMatchIdentificationTrial
    );
    getControl('match-identification-duration').addEventListener(
        'change',
        (event) => normalizeNumberInput(event.currentTarget, 1)
    );
    document
        .querySelector('[data-match-identification-answers]')
        .addEventListener('click', (event) => {
            const button = event.target.closest(
                'button[data-match-identification-answer]'
            );
            if (button && !button.disabled) {
                commitMatchIdentification(
                    Number(button.dataset.matchIdentificationAnswer)
                );
            }
        });

    for (const button of getActions('pitch-placement-play')) {
        button.addEventListener('click', playPitchPlacementTrial);
    }

    getAction('match-identification-play').addEventListener(
        'click',
        playMatchTrial
    );

    for (const button of getModuleActions('pitch', 'new')) {
        button.addEventListener('click', newPitchTrial);
    }

    for (const button of getModuleActions('match', 'new')) {
        button.addEventListener('click', () => newMatchTrial(true));
    }

    for (const button of getModuleActions('interval', 'play')) {
        button.addEventListener('click', playIntervalTrial);
    }

    for (const button of getModuleActions('interval', 'new')) {
        button.addEventListener('click', () => newIntervalTrial(true));
    }

    getAction('chord-play').addEventListener('click', playChordQualityTrial);

    getAction('chord-new').addEventListener('click', () => newChordTrial(true));

    for (const answers of document.querySelectorAll(
        '[data-interval-answers]'
    )) {
        answers.addEventListener('click', (event) => {
            const button = event.target.closest('[data-interval-answer]');

            if (button) {
                commitInterval(Number(button.dataset.intervalAnswer));
            }
        });
    }

    document
        .querySelector('[data-chord-answers]')
        .addEventListener('click', (event) => {
            const button = event.target.closest('[data-chord-answer]');

            if (button) {
                commitChordQuality(button.dataset.chordAnswer);
            }
        });

    getControl('chord-playback').addEventListener('change', stopGeneratedAudio);

    for (const control of getControls(
        'pitch-memory-type',
        'pitch-memory-delay',
        'pitch-memory-distractors'
    )) {
        control.addEventListener('change', () => {
            if (pitchMemory.trial) {
                cancelPitchMemoryTrial();
            }

            updatePitchMemoryControls();
        });
    }

    getAction('pitch-memory-start').addEventListener(
        'click',
        playPitchMemoryStimulus
    );

    getAction('pitch-memory-stop').addEventListener('click', () => {
        stopPitchMemoryAudio();
        pauseMicrophone();
    });

    getAction('pitch-memory-response-play').addEventListener(
        'click',
        playPitchMemoryResponse
    );

    getAction('pitch-memory-response-stop').addEventListener(
        'click',
        stopPitchMemoryResponseTone
    );

    getControl('pitch-memory-frequency').addEventListener(
        'input',
        updatePitchMemoryResponseTone
    );

    for (const button of getActions('pitch-memory-submit')) {
        button.addEventListener('click', submitPitchMemoryResponse);
    }

    for (const button of document.querySelectorAll(
        '[data-pitch-placement-answers] [data-answer]'
    )) {
        button.addEventListener('click', () =>
            commitPitchPlacement(button.dataset.answer)
        );
    }

    for (const button of getActions('global-audio-stop')) {
        button.addEventListener('click', () => {
            pauseMicrophone();
            cancelPitchAdvance();
            cancelMatchAdvance();
            cancelIntervalAdvance();
            cancelChordAdvance();
        });
    }

    for (const waveform of document.querySelectorAll('[data-waveform]')) {
        waveform.addEventListener('change', stopGeneratedAudio);
    }

    document
        .querySelector('[data-match-target-answers]')
        .addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');

            const row = button?.closest('[data-match-target-answer]');

            if (!button || !row) {
                return;
            }

            const index = Number(row.dataset.matchTargetAnswer);

            if (button.dataset.action === 'match-target-answer-play') {
                playMatchTargetAnswer(index);
                return;
            }

            if (button.dataset.action === 'match-target-answer-select') {
                commitMatchTargetAnswer(index);
            }
        });

    for (const button of getModuleActions('pitch', 'stats-clear')) {
        button.addEventListener('click', clearPitchStats);
    }

    for (const button of getModuleActions('match', 'stats-clear')) {
        button.addEventListener('click', clearMatchStats);
    }

    for (const button of getModuleActions('interval', 'stats-clear')) {
        button.addEventListener('click', clearIntervalStats);
    }

    getAction('chord-stats-clear').addEventListener(
        'click',
        clearChordQualityStats
    );
}

// Initialization

function initialize() {
    restorePreferences();
    updateVolume();
    initializePitchMemoryFrequencySlider();
    initializeTooltips();
    initializeNotes();
    initializeTunerInstruments();
    initializeTunerHistory();
    initializeEvents();
    updateRhythmMode();
    updateNoteReadouts();
    initializeNavigation();

    resetTunerDetection();

    clearPitchPlacementResult();
    renderPitchStats();
    updatePitchMode();

    updateMatchMode();
    updateIntervalMode();
    newChordTrial();

    renderChordQualityStats();
    renderMicrophoneState(MICROPHONE_STATES.UNPROMPTED);
    void setMicrophoneState(MICROPHONE_STATES.STOPPED);
    restorePitchMemoryTrial();
    renderPitchMemoryResponseFrequency();
}

initialize();

window.addEventListener('beforeunload', () => {
    stopAllAudio();
    cancelPitchAdvance();
    cancelMatchAdvance();
    cancelIntervalAdvance();
    cancelChordAdvance();
    clearPitchMemoryTimers();

    if (pitchMemory.replayTimer !== null) {
        clearTimeout(pitchMemory.replayTimer);
    }

    stopPitchMemoryResponseTone();

    savePitchMemoryState();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () =>
        navigator.serviceWorker.register('/service-worker.js')
    );
}
