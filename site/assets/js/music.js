'use strict';

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
const INTERVALS = [
    { semitones: 0, name: 'Unison' },
    { semitones: 1, name: 'Minor 2nd' },
    { semitones: 2, name: 'Major 2nd' },
    { semitones: 3, name: 'Minor 3rd' },
    { semitones: 4, name: 'Major 3rd' },
    { semitones: 5, name: 'Perfect 4th' },
    { semitones: 6, name: 'Tritone' },
    { semitones: 7, name: 'Perfect 5th' },
    { semitones: 8, name: 'Minor 6th' },
    { semitones: 9, name: 'Major 6th' },
    { semitones: 10, name: 'Minor 7th' },
    { semitones: 11, name: 'Major 7th' },
    { semitones: 12, name: 'Octave' },
];

const CHORD_QUALITIES = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    diminished: [0, 3, 6],
    augmented: [0, 4, 8],
};

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

const MIDI_PERCUSSION_CHANNEL = 9;

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

function nearestNoteFromFrequency(
    frequency,
    referenceFrequency = DEFAULT_A4_FREQUENCY
) {
    const exactMidi =
        MIDI_NOTES.A4 +
        SEMITONES_PER_OCTAVE * Math.log2(frequency / referenceFrequency);
    const midi = Math.round(exactMidi);
    const targetFrequency =
        referenceFrequency *
        2 ** ((midi - MIDI_NOTES.A4) / SEMITONES_PER_OCTAVE);

    return {
        midi,
        noteName: noteNameFromMidi(midi),
        targetFrequency,
        cents: centsBetween(frequency, targetFrequency),
    };
}

const music = Object.freeze({
    centsBetween,
    frequencyFromCents,
    nearestNoteFromFrequency,
    nearestOctaveFrequency,
    noteNameFromMidi,
    pitchClassFromMidi,
    pitchClassName,

    CENTS_PER_OCTAVE,
    DEFAULT_A4_FREQUENCY,
    MAXIMUM_SUPPORTED_MIDI,
    MIDI_NOTES,
    MINIMUM_SUPPORTED_MIDI,
    PITCH_CLASS_NAMES,
    SEMITONES_PER_OCTAVE,

    CHORD_QUALITIES,
    INTERVALS,
    MIDI_PERCUSSION_CHANNEL,
    TUNER_INSTRUMENTS,
});
