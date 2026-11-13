'use strict';

// Sheet music

function diatonicPositionFromMidi(midi) {
    const roundedMidi = Math.round(midi);
    const pitchClass = musicEngine.pitchClassFromMidi(roundedMidi);
    const naturalIndex =
        musicEngine.PITCH_CLASS_NAMES.slice(0, pitchClass + 1).filter(
            ({ natural }) => natural
        ).length - 1;
    const octave =
        Math.floor(roundedMidi / musicEngine.SEMITONES_PER_OCTAVE) - 1;

    return octave * 7 + naturalIndex;
}

function diatonicPositionFromFrequency(frequency) {
    const midi = musicEngine.midiFromFrequency(frequency);
    let lowerMidi = Math.floor(midi);
    let upperMidi = Math.ceil(midi);

    while (
        !musicEngine.PITCH_CLASS_NAMES[
            musicEngine.pitchClassFromMidi(lowerMidi)
        ].natural
    ) {
        lowerMidi -= 1;
    }
    while (
        !musicEngine.PITCH_CLASS_NAMES[
            musicEngine.pitchClassFromMidi(upperMidi)
        ].natural
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
            units % musicEngine.SHEET_COMPOUND_SUBDIVISIONS === 0,
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
            ...musicEngine.NOTE_VALUES[0],
            dotted: false,
        };
    }
    const { denominator } = meter;
    for (const noteValue of musicEngine.NOTE_VALUES) {
        const { value } = noteValue;
        const duration = denominator / value;
        if (musicEngine.isSameSheetPosition(note.duration, duration)) {
            return {
                ...noteValue,
                dotted: false,
            };
        }
        if (
            musicEngine.isSameSheetPosition(
                note.duration,
                duration * musicEngine.SHEET_DOT_MULTIPLIER
            )
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
    return `Bar ${musicEngine.sheetPositionFloor(note.beat, units) + 1}, ${compound ? 'subdivision' : 'beat'} ${(note.beat % units) + 1}`;
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
        ((score.remPerQuarter ?? musicEngine.SHEET_REM_PER_QUARTER) * 4) /
        denominator;
    const barWidth = units * spacing + musicEngine.SHEET_BAR_PADDING_REM * 2;

    function writtenPosition(position, boundarySide = 'start') {
        if (position < 0) {
            return musicEngine.SHEET_BAR_PADDING_REM + position * spacing;
        }

        const bar = musicEngine.sheetPositionFloor(position, units);
        const withinBar = position - bar * units;

        if (
            position > 0 &&
            musicEngine.isSameSheetPosition(withinBar, 0) &&
            boundarySide === 'end'
        ) {
            return bar * barWidth - musicEngine.SHEET_BAR_PADDING_REM;
        }

        return (
            bar * barWidth +
            musicEngine.SHEET_BAR_PADDING_REM +
            withinBar * spacing
        );
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

        const bar = musicEngine.sheetPositionFloor(position, units);
        const withinBar = position - bar * units;
        const interval = score.intervalAtPosition?.(position) ?? score.interval;
        const glideBeats = Math.min(
            0.5,
            musicEngine.SHEET_BAR_GLIDE_SECONDS / interval
        );
        const glideStart = units - glideBeats;
        const positionWithoutGlide = writtenPosition(position);

        if (bar >= score.bars - 1 || withinBar <= glideStart) {
            return positionWithoutGlide;
        }

        const progress = (withinBar - glideStart) / glideBeats;
        const easedProgress = progress * progress * (3 - 2 * progress);

        return (
            positionWithoutGlide +
            musicEngine.SHEET_BAR_PADDING_REM * 2 * easedProgress
        );
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
    const beatLength = compound ? musicEngine.SHEET_COMPOUND_SUBDIVISIONS : 1;
    const events = [];

    for (const writtenNote of writtenNotes) {
        let event = events.at(-1);
        if (
            !event ||
            !musicEngine.isSameSheetPosition(
                event.segment.beat,
                writtenNote.segment.beat
            )
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
        const bar = musicEngine.sheetPositionFloor(segment.beat, units);
        const withinBar = segment.beat - bar * units;
        const beat = musicEngine.sheetPositionFloor(withinBar, beatLength);
        const previous = group.at(-1);
        const followsPrevious =
            previous &&
            musicEngine.isSameSheetPosition(
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

function describeSheetScore(notation) {
    return notation.phrase
        .map(
            (note) =>
                `${sheetNotePosition(note, notation.meter)}: ${note.rest ? '' : `${musicEngine.noteNameFromMidi(note.midi, 'sharp')} `}${sheetWrittenName(note, notation.meter)} ${note.rest ? 'rest' : 'note'}, ${sheetDurationLabel(note.duration)} ${sheetDurationUnit(notation.meter)}.`
        )
        .join(' ');
}

const musicNotation = Object.freeze({
    diatonicPositionFromMidi,
    diatonicPositionFromFrequency,
    sheetMeter,
    sheetNoteValue,
    sheetNoteName,
    sheetNotePosition,
    sheetNoteSegments,
    sheetWrittenName,
    sheetDurationLabel,
    sheetDurationUnit,
    createSheetLayout,
    sheetBeamGroups,
    describeSheetScore,
});
