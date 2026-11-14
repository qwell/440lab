'use strict';

// Sheet music

const SHEET_DOT_MULTIPLIER = 1.5;
const SHEET_COMPOUND_SUBDIVISIONS = 3;
const SHEET_REM_PER_QUARTER = 5.5;
const SHEET_BAR_GLIDE_SECONDS = 0.15;
const MIDI_MAX_LEDGER_LINES = 2;
const MIDI_MAX_DISPLAY_LEDGER_LINES = 3;

const MIDI_PERCUSSION_NOTATION = Object.freeze({
    35: { name: 'Acoustic bass drum', staffStep: 1, voice: 'lower' },
    36: { name: 'Bass drum', staffStep: 1, voice: 'lower' },
    37: { name: 'Side stick', staffStep: 5, notehead: '𝅃', voice: 'lower' },
    38: { name: 'Acoustic snare', staffStep: 5, voice: 'lower' },
    39: { name: 'Hand clap', staffStep: 5, notehead: '𝅃', voice: 'lower' },
    40: { name: 'Electric snare', staffStep: 5, voice: 'lower' },
    41: { name: 'Low floor tom', staffStep: 0, voice: 'lower' },
    42: {
        name: 'Closed hi-hat',
        staffStep: 9,
        notehead: '𝅃',
        voice: 'upper',
    },
    43: { name: 'High floor tom', staffStep: 2, voice: 'lower' },
    44: {
        name: 'Pedal hi-hat',
        staffStep: -1,
        notehead: '𝅃',
        voice: 'lower',
    },
    45: { name: 'Low tom', staffStep: 3, voice: 'lower' },
    46: {
        name: 'Open hi-hat',
        staffStep: 9,
        notehead: '𝅅',
        voice: 'upper',
    },
    47: { name: 'Low-mid tom', staffStep: 4, voice: 'lower' },
    48: { name: 'High-mid tom', staffStep: 6, voice: 'lower' },
    49: {
        name: 'Crash cymbal 1',
        staffStep: 10,
        notehead: '𝅃',
        voice: 'upper',
    },
    50: { name: 'High tom', staffStep: 7, voice: 'lower' },
    51: {
        name: 'Ride cymbal 1',
        staffStep: 8,
        notehead: '𝅃',
        voice: 'upper',
    },
    52: {
        name: 'Chinese cymbal',
        staffStep: 10,
        notehead: '𝅃',
        voice: 'upper',
    },
    53: { name: 'Ride bell', staffStep: 8, voice: 'upper' },
    54: { name: 'Tambourine', staffStep: 9, notehead: '𝅃', voice: 'upper' },
    55: {
        name: 'Splash cymbal',
        staffStep: 10,
        notehead: '𝅃',
        voice: 'upper',
    },
    56: { name: 'Cowbell', staffStep: 7, notehead: '𝅃', voice: 'upper' },
    57: {
        name: 'Crash cymbal 2',
        staffStep: 10,
        notehead: '𝅃',
        voice: 'upper',
    },
    58: { name: 'Vibraslap', staffStep: 7, notehead: '𝅃', voice: 'upper' },
    59: {
        name: 'Ride cymbal 2',
        staffStep: 8,
        notehead: '𝅃',
        voice: 'upper',
    },
    60: { name: 'High bongo', staffStep: 7, voice: 'lower' },
    61: { name: 'Low bongo', staffStep: 5, voice: 'lower' },
    62: {
        name: 'Muted high conga',
        staffStep: 7,
        notehead: '𝅃',
        voice: 'lower',
    },
    63: { name: 'Open high conga', staffStep: 5, voice: 'lower' },
    64: { name: 'Low conga', staffStep: 3, voice: 'lower' },
    65: { name: 'High timbale', staffStep: 7, voice: 'lower' },
    66: { name: 'Low timbale', staffStep: 5, voice: 'lower' },
    67: { name: 'High agogo', staffStep: 7, voice: 'upper' },
    68: { name: 'Low agogo', staffStep: 5, voice: 'upper' },
    69: { name: 'Cabasa', staffStep: 9, notehead: '𝅃', voice: 'upper' },
    70: { name: 'Maracas', staffStep: 9, notehead: '𝅃', voice: 'upper' },
    71: {
        name: 'Short whistle',
        staffStep: 9,
        notehead: '𝅃',
        voice: 'upper',
    },
    72: {
        name: 'Long whistle',
        staffStep: 9,
        notehead: '𝅅',
        voice: 'upper',
    },
    73: {
        name: 'Short guiro',
        staffStep: 7,
        notehead: '𝅃',
        voice: 'upper',
    },
    74: { name: 'Long guiro', staffStep: 7, notehead: '𝅅', voice: 'upper' },
    75: { name: 'Claves', staffStep: 5, notehead: '𝅃', voice: 'upper' },
    76: {
        name: 'High wood block',
        staffStep: 7,
        notehead: '𝅃',
        voice: 'upper',
    },
    77: {
        name: 'Low wood block',
        staffStep: 5,
        notehead: '𝅃',
        voice: 'upper',
    },
    78: {
        name: 'Muted cuica',
        staffStep: 7,
        notehead: '𝅃',
        voice: 'upper',
    },
    79: { name: 'Open cuica', staffStep: 7, notehead: '𝅅', voice: 'upper' },
    80: {
        name: 'Muted triangle',
        staffStep: 10,
        notehead: '𝅃',
        voice: 'upper',
    },
    81: {
        name: 'Open triangle',
        staffStep: 10,
        notehead: '𝅅',
        voice: 'upper',
    },
});
const NOTE_VALUES = [
    { value: 1, name: 'whole', symbol: '𝅝', rest: '𝄻' },
    { value: 2, name: 'half', symbol: '𝅗𝅥', rest: '𝄼' },
    { value: 4, name: 'quarter', symbol: '𝅘𝅥', rest: '𝄽' },
    { value: 8, name: 'eighth', symbol: '𝅘𝅥𝅮', rest: '𝄾' },
    { value: 16, name: 'sixteenth', symbol: '𝅘𝅥𝅯', rest: '𝄿' },
    { value: 32, name: 'thirty-second', symbol: '𝅘𝅥𝅰', rest: '𝅀' },
    { value: 64, name: 'sixty-fourth', symbol: '𝅘𝅥𝅱', rest: '𝅁' },
    { value: 128, name: 'hundred twenty-eighth', symbol: '𝅘𝅥𝅲', rest: '𝅂' },
];

const METERS = {
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
const SIGNATURE_SYMBOLS = {
    '4/4': '𝄴',
    '2/2': '𝄵',
};

const CLEFS = {
    treble: {
        symbol: '𝄞',
        minimumMidi: music.MIDI_NOTES.C4,
        maximumMidi: music.MIDI_NOTES.A5,
        bottomLineMidi: music.MIDI_NOTES.E4,
    },
    bass: {
        symbol: '𝄢',
        minimumMidi: music.MIDI_NOTES.C2,
        maximumMidi: music.MIDI_NOTES.A3,
        bottomLineMidi: music.MIDI_NOTES.G2,
    },
    alto: {
        symbol: '𝄡',
        minimumMidi: music.MIDI_NOTES.C3,
        maximumMidi: music.MIDI_NOTES.A4,
        bottomLineMidi: music.MIDI_NOTES.F3,
    },
    tenor: {
        symbol: '𝄡',
        minimumMidi: music.MIDI_NOTES.G2,
        maximumMidi: music.MIDI_NOTES.E4,
        bottomLineMidi: music.MIDI_NOTES.D3,
    },
    percussion: {
        symbol: '𝄥',
        bottomLineMidi: music.MIDI_NOTES.C4,
    },
};

function isSameSheetPosition(left, right) {
    const magnitude = Math.max(1, Math.abs(left), Math.abs(right));
    return Math.abs(left - right) <= Number.EPSILON * magnitude;
}

function compareSheetPositions(left, right) {
    if (isSameSheetPosition(left, right)) {
        return 0;
    }
    return left < right ? -1 : 1;
}

function sheetPositionFloor(position, unit = 1) {
    const quotient = position / unit;
    const nearest = Math.round(quotient);
    return isSameSheetPosition(quotient, nearest)
        ? nearest
        : Math.floor(quotient);
}

function diatonicPositionFromMidi(midi) {
    const roundedMidi = Math.round(midi);
    const pitchClass = music.pitchClassFromMidi(roundedMidi);
    const naturalIndex =
        music.PITCH_CLASS_NAMES.slice(0, pitchClass + 1).filter(
            ({ natural }) => natural
        ).length - 1;
    const octave = Math.floor(roundedMidi / music.SEMITONES_PER_OCTAVE) - 1;

    return octave * 7 + naturalIndex;
}

function diatonicPositionFromFrequency(frequency) {
    const midi = engine.midiFromFrequency(frequency);
    let lowerMidi = Math.floor(midi);
    let upperMidi = Math.ceil(midi);

    while (
        !music.PITCH_CLASS_NAMES[music.pitchClassFromMidi(lowerMidi)].natural
    ) {
        lowerMidi -= 1;
    }
    while (
        !music.PITCH_CLASS_NAMES[music.pitchClassFromMidi(upperMidi)].natural
    ) {
        upperMidi += 1;
    }

    const lowerPosition = diatonicPositionFromMidi(lowerMidi);
    if (lowerMidi === upperMidi) {
        return lowerPosition;
    }

    const progress = (midi - lowerMidi) / (upperMidi - lowerMidi);

    return (
        lowerPosition +
        (diatonicPositionFromMidi(upperMidi) - lowerPosition) * progress
    );
}

function sheetMeter(signature) {
    const [units, denominator] = signature.split('/').map(Number);
    return {
        units,
        denominator,
        compound:
            denominator === 8 &&
            units >= 6 &&
            units % SHEET_COMPOUND_SUBDIVISIONS === 0,
    };
}

function sheetNoteValue(note, meter) {
    if (note.multiMeasureRest) {
        return {
            value: 1,
            name: 'multiple-measure',
            symbol: '𝄩',
            rest: '𝄩',
            dotted: false,
        };
    }
    if (note.wholeMeasureRest) {
        return {
            ...NOTE_VALUES[0],
            dotted: false,
        };
    }
    const { denominator } = meter;
    for (const noteValue of NOTE_VALUES) {
        const { value } = noteValue;
        const duration = denominator / value;
        if (isSameSheetPosition(note.duration, duration)) {
            return {
                ...noteValue,
                dotted: false,
            };
        }
        if (
            isSameSheetPosition(note.duration, duration * SHEET_DOT_MULTIPLIER)
        ) {
            return {
                ...noteValue,
                dotted: true,
            };
        }
    }
    throw new Error('Unsupported rhythm note duration');
}

function sheetNoteName(note, meter) {
    const { name, dotted } = sheetNoteValue(note, meter);
    return `${dotted ? 'dotted ' : ''}${name}`;
}

function sheetNotePosition(note, meter) {
    const { units, compound } = meter;
    return `Bar ${sheetPositionFloor(note.beat, units) + 1}, ${compound ? 'subdivision' : 'beat'} ${(note.beat % units) + 1}`;
}

function sheetNoteSegments(note) {
    return (
        note.segments ?? [
            {
                beat: note.beat,
                duration: note.duration,
                multiMeasureRest: note.multiMeasureRest,
                wholeMeasureRest: note.wholeMeasureRest,
            },
        ]
    );
}

function sheetWrittenName(note, meter) {
    return sheetNoteSegments(note)
        .map((segment) => sheetNoteName(segment, meter))
        .join(' tied to ');
}

function sheetDurationLabel(duration) {
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

function sheetDurationUnit(meter) {
    return meter.compound ? 'subdivisions' : 'beats';
}

function createSheetLayout(score) {
    const { units, denominator } = score.meter;
    const spacing =
        ((score.remPerQuarter ?? SHEET_REM_PER_QUARTER) * 4) / denominator;
    const barWidth = units * spacing + SHEET_BAR_PADDING_REM * 2;

    function writtenPosition(position, boundarySide = 'start') {
        if (position < 0) {
            return SHEET_BAR_PADDING_REM + position * spacing;
        }

        const bar = sheetPositionFloor(position, units);
        const withinBar = position - bar * units;

        if (
            position > 0 &&
            isSameSheetPosition(withinBar, 0) &&
            boundarySide === 'end'
        ) {
            return bar * barWidth - SHEET_BAR_PADDING_REM;
        }

        return bar * barWidth + SHEET_BAR_PADDING_REM + withinBar * spacing;
    }

    function playbackPosition(position) {
        if (position < 0) {
            return writtenPosition(position);
        }
        if (position >= score.total) {
            return (
                writtenPosition(score.total, 'end') +
                (position - score.total) * spacing
            );
        }

        const bar = sheetPositionFloor(position, units);
        const withinBar = position - bar * units;
        const interval = score.intervalAtPosition?.(position) ?? score.interval;
        const glideBeats = Math.min(0.5, SHEET_BAR_GLIDE_SECONDS / interval);
        const glideStart = units - glideBeats;
        const positionWithoutGlide = writtenPosition(position);

        if (bar >= score.bars - 1 || withinBar <= glideStart) {
            return positionWithoutGlide;
        }

        const progress = (withinBar - glideStart) / glideBeats;
        const easedProgress = progress * progress * (3 - 2 * progress);

        return positionWithoutGlide + SHEET_BAR_PADDING_REM * 2 * easedProgress;
    }

    return { barWidth, playbackPosition, writtenPosition };
}

function sheetBeamGroups(writtenNotes, meter, separateVoices = true) {
    const stemDirections = [
        ...new Set(
            writtenNotes.map(({ note }) => note.stemDirection).filter(Boolean)
        ),
    ];
    if (separateVoices && stemDirections.length) {
        return stemDirections.flatMap((stemDirection) =>
            sheetBeamGroups(
                writtenNotes.filter(
                    ({ note }) => note.stemDirection === stemDirection
                ),
                meter,
                false
            )
        );
    }

    const { units, compound } = meter;
    const beatLength = compound ? SHEET_COMPOUND_SUBDIVISIONS : 1;
    const events = [];

    for (const writtenNote of writtenNotes) {
        let event = events.at(-1);
        if (
            !event ||
            !isSameSheetPosition(event.segment.beat, writtenNote.segment.beat)
        ) {
            event = {
                writtenNotes: [],
                segment: { ...writtenNote.segment },
                value: writtenNote.value,
            };
            events.push(event);
        }
        event.writtenNotes.push(writtenNote);
        if (writtenNote.segment.duration < event.segment.duration) {
            event.segment.duration = writtenNote.segment.duration;
            event.value = writtenNote.value;
        }
    }

    for (const event of events) {
        const pitchedNotes = event.writtenNotes.filter(
            ({ note }) => !note.rest
        );
        event.rest = pitchedNotes.length !== event.writtenNotes.length;
        event.staffStep = pitchedNotes.length
            ? pitchedNotes.reduce((sum, note) => sum + note.staffStep, 0) /
              pitchedNotes.length
            : null;
    }

    const groups = [];
    let group = [];

    function finishGroup() {
        if (group.length > 1) {
            groups.push(group);
        }
        group = [];
    }

    for (const event of events) {
        const { segment, value } = event;
        const bar = sheetPositionFloor(segment.beat, units);
        const withinBar = segment.beat - bar * units;
        const beat = sheetPositionFloor(withinBar, beatLength);
        const previous = group.at(-1);
        const followsPrevious =
            previous &&
            isSameSheetPosition(
                previous.segment.beat + previous.segment.duration,
                segment.beat
            );
        const sameBeat =
            previous && previous.bar === bar && previous.beat === beat;
        if (event.rest || value.value < 8 || !followsPrevious || !sameBeat) {
            finishGroup();
        }

        if (!event.rest && value.value >= 8) {
            event.bar = bar;
            event.beat = beat;
            group.push(event);
        }
    }

    finishGroup();
    return groups;
}

function describeSheetScore(score) {
    return score.phrase
        .map(
            (note) =>
                `${sheetNotePosition(note, score.meter)}: ${note.rest ? '' : `${music.noteNameFromMidi(note.midi, 'sharp')} `}${sheetWrittenName(note, score.meter)} ${note.rest ? 'rest' : 'note'}, ${sheetDurationLabel(note.duration)} ${sheetDurationUnit(score.meter)}.`
        )
        .join(' ');
}

const notation = Object.freeze({
    compareSheetPositions,
    sheetPositionFloor,

    diatonicPositionFromFrequency,
    diatonicPositionFromMidi,

    createSheetLayout,
    describeSheetScore,
    sheetBeamGroups,
    sheetDurationLabel,
    sheetDurationUnit,
    sheetMeter,
    sheetNoteName,
    sheetNotePosition,
    sheetNoteSegments,
    sheetNoteValue,

    CLEFS,
    METERS,
    NOTE_VALUES,
    SHEET_COMPOUND_SUBDIVISIONS,
    SHEET_DOT_MULTIPLIER,
    SIGNATURE_SYMBOLS,

    MIDI_MAX_DISPLAY_LEDGER_LINES,
    MIDI_MAX_LEDGER_LINES,
    MIDI_PERCUSSION_NOTATION,
});
