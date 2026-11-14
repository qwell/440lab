'use strict';

const ADAPTIVE_WINDOW_SIZE = 5;
const ADAPTIVE_NARROW_FACTOR = 0.8;
const ADAPTIVE_WIDEN_FACTOR = 1.25;
const SEMITONES_PER_OCTAVE = 12;
const CENTS_PER_SEMITONE = 100;
const CENTS_PER_OCTAVE = SEMITONES_PER_OCTAVE * CENTS_PER_SEMITONE;

const PITCH_CLASS_NAMES = [
    { natural: 'C' },
    { sharp: 'C♯', flat: 'D♭' },
    { natural: 'D' },
    { sharp: 'D♯', flat: 'E♭' },
    { natural: 'E' },
    { natural: 'F' },
    { sharp: 'F♯', flat: 'G♭' },
    { natural: 'G' },
    { sharp: 'G♯', flat: 'A♭' },
    { natural: 'A' },
    { sharp: 'A♯', flat: 'B♭' },
    { natural: 'B' },
];

const MIDI_NOTES = {
    A0: 21,
    'A#0': 22,
    B0: 23,
    C1: 24,
    'C#1': 25,
    D1: 26,
    'D#1': 27,
    E1: 28,
    F1: 29,
    'F#1': 30,
    G1: 31,
    'G#1': 32,
    A1: 33,
    'A#1': 34,
    B1: 35,
    C2: 36,
    'C#2': 37,
    D2: 38,
    'D#2': 39,
    E2: 40,
    F2: 41,
    'F#2': 42,
    G2: 43,
    'G#2': 44,
    A2: 45,
    'A#2': 46,
    B2: 47,
    C3: 48,
    'C#3': 49,
    D3: 50,
    'D#3': 51,
    E3: 52,
    F3: 53,
    'F#3': 54,
    G3: 55,
    'G#3': 56,
    A3: 57,
    'A#3': 58,
    B3: 59,
    C4: 60,
    'C#4': 61,
    D4: 62,
    'D#4': 63,
    E4: 64,
    F4: 65,
    'F#4': 66,
    G4: 67,
    'G#4': 68,
    A4: 69,
    'A#4': 70,
    B4: 71,
    C5: 72,
    'C#5': 73,
    D5: 74,
    'D#5': 75,
    E5: 76,
    F5: 77,
    'F#5': 78,
    G5: 79,
    'G#5': 80,
    A5: 81,
    'A#5': 82,
    B5: 83,
    C6: 84,
    'C#6': 85,
    D6: 86,
    'D#6': 87,
    E6: 88,
    F6: 89,
    'F#6': 90,
    G6: 91,
    'G#6': 92,
    A6: 93,
    'A#6': 94,
    B6: 95,
    C7: 96,
    'C#7': 97,
    D7: 98,
    'D#7': 99,
    E7: 100,
    F7: 101,
    'F#7': 102,
    G7: 103,
    'G#7': 104,
    A7: 105,
    'A#7': 106,
    B7: 107,
};

const DEFAULT_A4_FREQUENCY = 440;
const MINIMUM_SUPPORTED_MIDI = MIDI_NOTES.A0;
const MAXIMUM_SUPPORTED_MIDI = MIDI_NOTES.B7;
const DEFAULT_VOLUME = 0.8;
const VOICE_GAIN = 0.25;

const INTERVAL_LEVELS = {
    starter: 0,
    common: 1,
    all: 2,
};

const INTERVALS = [
    { semitones: 0, name: 'Unison', level: INTERVAL_LEVELS['common'] },
    { semitones: 1, name: 'Minor 2nd', level: INTERVAL_LEVELS['common'] },
    { semitones: 2, name: 'Major 2nd', level: INTERVAL_LEVELS['starter'] },
    { semitones: 3, name: 'Minor 3rd', level: INTERVAL_LEVELS['common'] },
    { semitones: 4, name: 'Major 3rd', level: INTERVAL_LEVELS['starter'] },
    { semitones: 5, name: 'Perfect 4th', level: INTERVAL_LEVELS['starter'] },
    { semitones: 6, name: 'Tritone', level: INTERVAL_LEVELS['common'] },
    { semitones: 7, name: 'Perfect 5th', level: INTERVAL_LEVELS['starter'] },
    { semitones: 8, name: 'Minor 6th', level: INTERVAL_LEVELS['all'] },
    { semitones: 9, name: 'Major 6th', level: INTERVAL_LEVELS['all'] },
    { semitones: 10, name: 'Minor 7th', level: INTERVAL_LEVELS['all'] },
    { semitones: 11, name: 'Major 7th', level: INTERVAL_LEVELS['all'] },
    { semitones: 12, name: 'Octave', level: INTERVAL_LEVELS['all'] },
];

const CHORD_QUALITIES = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    diminished: [0, 3, 6],
    augmented: [0, 4, 8],
};

const TUNER_ANALYSIS_INTERVAL_MS = 50;
const TUNER_CENTS_SMOOTHING = 0.18;
const TUNER_MIN_RMS = 0.006;
const TUNER_STABLE_FRAMES = 3;
const TUNER_YIN_THRESHOLD = 0.15;
const TUNER_FREQUENCY_SAMPLE_LIMIT = 5;
const TUNER_ANALYSIS_SAMPLE_STRIDE = 2;
const TUNER_PLOT_SECONDS = 8;
const TUNER_PLOT_PADDING_SEMITONES = 7;

const TUNER_INSTRUMENTS = [
    {
        name: 'guitar',
        tunings: [
            [
                'standard',
                [
                    MIDI_NOTES.E2,
                    MIDI_NOTES.A2,
                    MIDI_NOTES.D3,
                    MIDI_NOTES.G3,
                    MIDI_NOTES.B3,
                    MIDI_NOTES.E4,
                ],
            ],
            [
                'drop D',
                [
                    MIDI_NOTES.D2,
                    MIDI_NOTES.A2,
                    MIDI_NOTES.D3,
                    MIDI_NOTES.G3,
                    MIDI_NOTES.B3,
                    MIDI_NOTES.E4,
                ],
            ],
            [
                'DADGAD',
                [
                    MIDI_NOTES.D2,
                    MIDI_NOTES.A2,
                    MIDI_NOTES.D3,
                    MIDI_NOTES.G3,
                    MIDI_NOTES.A3,
                    MIDI_NOTES.D4,
                ],
            ],
            [
                'open G',
                [
                    MIDI_NOTES.D2,
                    MIDI_NOTES.G2,
                    MIDI_NOTES.D3,
                    MIDI_NOTES.G3,
                    MIDI_NOTES.B3,
                    MIDI_NOTES.D4,
                ],
            ],
            [
                'open D',
                [
                    MIDI_NOTES.D2,
                    MIDI_NOTES.A2,
                    MIDI_NOTES.D3,
                    MIDI_NOTES['F#3'],
                    MIDI_NOTES.A3,
                    MIDI_NOTES.D4,
                ],
            ],
            [
                'half step down',
                [
                    MIDI_NOTES['D#2'],
                    MIDI_NOTES['G#2'],
                    MIDI_NOTES['C#3'],
                    MIDI_NOTES['F#3'],
                    MIDI_NOTES['A#3'],
                    MIDI_NOTES['D#4'],
                ],
                'flat',
            ],
        ],
    },
    {
        name: 'bass guitar',
        tunings: [
            [
                'standard (4 strings)',
                [MIDI_NOTES.E1, MIDI_NOTES.A1, MIDI_NOTES.D2, MIDI_NOTES.G2],
            ],
            [
                'drop D',
                [MIDI_NOTES.D1, MIDI_NOTES.A1, MIDI_NOTES.D2, MIDI_NOTES.G2],
            ],
            [
                'standard (5 strings)',
                [
                    MIDI_NOTES.B0,
                    MIDI_NOTES.E1,
                    MIDI_NOTES.A1,
                    MIDI_NOTES.D2,
                    MIDI_NOTES.G2,
                ],
            ],
            [
                'standard (6 strings)',
                [
                    MIDI_NOTES.B0,
                    MIDI_NOTES.E1,
                    MIDI_NOTES.A1,
                    MIDI_NOTES.D2,
                    MIDI_NOTES.G2,
                    MIDI_NOTES.C3,
                ],
            ],
        ],
    },
    {
        name: 'violin',
        tunings: [
            [
                'standard',
                [MIDI_NOTES.G3, MIDI_NOTES.D4, MIDI_NOTES.A4, MIDI_NOTES.E5],
            ],
        ],
    },
    {
        name: 'viola',
        tunings: [
            [
                'standard',
                [MIDI_NOTES.C3, MIDI_NOTES.G3, MIDI_NOTES.D4, MIDI_NOTES.A4],
            ],
        ],
    },
    {
        name: 'cello',
        tunings: [
            [
                'standard',
                [MIDI_NOTES.C2, MIDI_NOTES.G2, MIDI_NOTES.D3, MIDI_NOTES.A3],
            ],
        ],
    },
    {
        name: 'double bass',
        tunings: [
            [
                'standard (4 strings)',
                [MIDI_NOTES.E1, MIDI_NOTES.A1, MIDI_NOTES.D2, MIDI_NOTES.G2],
            ],
            [
                'standard (5 strings)',
                [
                    MIDI_NOTES.B0,
                    MIDI_NOTES.E1,
                    MIDI_NOTES.A1,
                    MIDI_NOTES.D2,
                    MIDI_NOTES.G2,
                ],
            ],
        ],
    },
    {
        name: 'ukulele',
        tunings: [
            [
                'standard (high G)',
                [MIDI_NOTES.G4, MIDI_NOTES.C4, MIDI_NOTES.E4, MIDI_NOTES.A4],
            ],
            [
                'low G',
                [MIDI_NOTES.G3, MIDI_NOTES.C4, MIDI_NOTES.E4, MIDI_NOTES.A4],
            ],
            [
                'baritone',
                [MIDI_NOTES.D3, MIDI_NOTES.G3, MIDI_NOTES.B3, MIDI_NOTES.E4],
            ],
        ],
    },
    {
        name: 'banjo',
        tunings: [
            [
                'open G (5 strings)',
                [
                    MIDI_NOTES.G4,
                    MIDI_NOTES.D3,
                    MIDI_NOTES.G3,
                    MIDI_NOTES.B3,
                    MIDI_NOTES.D4,
                ],
            ],
            [
                'double C',
                [
                    MIDI_NOTES.G4,
                    MIDI_NOTES.C3,
                    MIDI_NOTES.G3,
                    MIDI_NOTES.C4,
                    MIDI_NOTES.D4,
                ],
            ],
            [
                'sawmill',
                [
                    MIDI_NOTES.G4,
                    MIDI_NOTES.D3,
                    MIDI_NOTES.G3,
                    MIDI_NOTES.C4,
                    MIDI_NOTES.D4,
                ],
            ],
            [
                'tenor',
                [MIDI_NOTES.C3, MIDI_NOTES.G3, MIDI_NOTES.D4, MIDI_NOTES.A4],
            ],
        ],
    },
    {
        name: 'mandolin',
        tunings: [
            [
                'standard (paired)',
                [
                    MIDI_NOTES.G3,
                    MIDI_NOTES.G3,
                    MIDI_NOTES.D4,
                    MIDI_NOTES.D4,
                    MIDI_NOTES.A4,
                    MIDI_NOTES.A4,
                    MIDI_NOTES.E5,
                    MIDI_NOTES.E5,
                ],
            ],
        ],
    },
];

const PLAYBACK_LOOKAHEAD_MS = 25;
const PLAYBACK_SCHEDULE_AHEAD_SECONDS = 0.1;
const MIDI_GENERATED_TONE_VOLUME = 0.08;

const RHYTHM_CLICK_DURATION = 0.035;
const RHYTHM_CLICK_FREQUENCIES = [800, 1000, 1200];

const RHYTHM_SHEET_EIGHTH_PATTERN_RATE = 0.2;
const RHYTHM_SHEET_SIXTEENTH_PATTERN_RATE = 0.05;
const RHYTHM_SHEET_SIXTEENTH_PAIR_RATE = 0.7;
const RHYTHM_SHEET_SUSTAINED_PATTERN_RATE = 0.6;
const RHYTHM_SHEET_TIE_RATE = 0.35;

const RHYTHM_SHEET_COUNT_IN_LEAD_UNITS = 0.125;

const MIDI_PIANO_ROLL_PROGRAM = 0;
const MIDI_PIANO_ROLL_VELOCITY = 127;
const MIDI_PIANO_ROLL_QUICK_PRESS_MS = 250;
const MIDI_PIANO_ROLL_QUICK_DURATION_MS = 750;
const MIDI_PIANO_ROLL_VOLUME = 1;
const MIDI_PERCUSSION_CHANNEL = 9;
const RHYTHM_SHEET_SCORE_SELECTOR = '#rhythm-sheet-score';

const RHYTHM_SHEET_CORRECT_CENTS = 25;
const RHYTHM_SHEET_ANALYSIS_INTERVAL_MS = 50;
const RHYTHM_SHEET_FREQUENCY_SAMPLE_LIMIT = 3;
const RHYTHM_SHEET_NOTE_RELEASE_GAP_SECONDS = 0.05;
const RHYTHM_SHEET_NOTE_RELEASE_GAP_RATIO = 0.1;
const RHYTHM_SHEET_NOTE_CUE_VOLUME = 0.45;
const RHYTHM_SHEET_NOTE_CUE_VELOCITY = 96;
const RHYTHM_SHEET_MIDI_CHANNEL = 0;
const RHYTHM_SHEET_MIDI_PROGRAM = 3; // Honky-tonk Piano (don't judge me, it sounds good)

const PITCH_MEMORY_CORRECT_CENTS = 25;
const PITCH_MEMORY_MICROPHONE_ADJUSTMENT_CENTS = 50;
const PITCH_MEMORY_FREQUENCY_SAMPLE_LIMIT = 9;
const PITCH_MEMORY_MINIMUM_MIDI = MIDI_NOTES.C3;
const PITCH_MEMORY_MAXIMUM_MIDI = MIDI_NOTES.B6;
const PITCH_MEMORY_RANGE_CENTS =
    (PITCH_MEMORY_MAXIMUM_MIDI - PITCH_MEMORY_MINIMUM_MIDI) *
    CENTS_PER_SEMITONE;

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

function frequencyFromCents(referenceFrequency, cents) {
    return referenceFrequency * 2 ** (cents / CENTS_PER_OCTAVE);
}

function centsBetween(frequency, referenceFrequency) {
    return CENTS_PER_OCTAVE * Math.log2(frequency / referenceFrequency);
}

function nearestOctaveFrequency(frequency, referenceFrequency) {
    const octaveOffset = Math.round(Math.log2(referenceFrequency / frequency));

    return frequency * 2 ** octaveOffset;
}

const music = Object.freeze({
    centsBetween,
    frequencyFromCents,
    nearestOctaveFrequency,
    noteNameFromMidi,
    pitchClassFromMidi,
    pitchClassName,

    CENTS_PER_OCTAVE,
    CENTS_PER_SEMITONE,
    DEFAULT_A4_FREQUENCY,
    MAXIMUM_SUPPORTED_MIDI,
    MIDI_NOTES,
    MINIMUM_SUPPORTED_MIDI,
    PITCH_CLASS_NAMES,
    SEMITONES_PER_OCTAVE,

    DEFAULT_VOLUME,
    PLAYBACK_LOOKAHEAD_MS,
    PLAYBACK_SCHEDULE_AHEAD_SECONDS,
    VOICE_GAIN,

    TUNER_ANALYSIS_INTERVAL_MS,
    TUNER_ANALYSIS_SAMPLE_STRIDE,
    TUNER_CENTS_SMOOTHING,
    TUNER_FREQUENCY_SAMPLE_LIMIT,
    TUNER_INSTRUMENTS,
    TUNER_MIN_RMS,
    TUNER_PLOT_PADDING_SEMITONES,
    TUNER_PLOT_SECONDS,
    TUNER_STABLE_FRAMES,
    TUNER_YIN_THRESHOLD,

    ADAPTIVE_NARROW_FACTOR,
    ADAPTIVE_WIDEN_FACTOR,
    ADAPTIVE_WINDOW_SIZE,
    CHORD_QUALITIES,
    INTERVAL_LEVELS,
    INTERVALS,
    PITCH_MEMORY_CORRECT_CENTS,
    PITCH_MEMORY_FREQUENCY_SAMPLE_LIMIT,
    PITCH_MEMORY_MAXIMUM_MIDI,
    PITCH_MEMORY_MICROPHONE_ADJUSTMENT_CENTS,
    PITCH_MEMORY_MINIMUM_MIDI,
    PITCH_MEMORY_RANGE_CENTS,

    RHYTHM_CLICK_DURATION,
    RHYTHM_CLICK_FREQUENCIES,
    RHYTHM_SHEET_ANALYSIS_INTERVAL_MS,
    RHYTHM_SHEET_CORRECT_CENTS,
    RHYTHM_SHEET_COUNT_IN_LEAD_UNITS,
    RHYTHM_SHEET_EIGHTH_PATTERN_RATE,
    RHYTHM_SHEET_FREQUENCY_SAMPLE_LIMIT,
    RHYTHM_SHEET_MIDI_CHANNEL,
    RHYTHM_SHEET_MIDI_PROGRAM,
    RHYTHM_SHEET_NOTE_CUE_VELOCITY,
    RHYTHM_SHEET_NOTE_CUE_VOLUME,
    RHYTHM_SHEET_NOTE_RELEASE_GAP_RATIO,
    RHYTHM_SHEET_NOTE_RELEASE_GAP_SECONDS,
    RHYTHM_SHEET_SCORE_SELECTOR,
    RHYTHM_SHEET_SIXTEENTH_PAIR_RATE,
    RHYTHM_SHEET_SIXTEENTH_PATTERN_RATE,
    RHYTHM_SHEET_SUSTAINED_PATTERN_RATE,
    RHYTHM_SHEET_TIE_RATE,

    MIDI_GENERATED_TONE_VOLUME,
    MIDI_PERCUSSION_CHANNEL,
    MIDI_PIANO_ROLL_PROGRAM,
    MIDI_PIANO_ROLL_QUICK_DURATION_MS,
    MIDI_PIANO_ROLL_QUICK_PRESS_MS,
    MIDI_PIANO_ROLL_VELOCITY,
    MIDI_PIANO_ROLL_VOLUME,
});
