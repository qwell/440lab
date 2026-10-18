'use strict';

// Sheet music

const sheetScoreViews = new WeakMap();

function updateSheetLane(view) {
    if (view.position === null) {
        return;
    }

    view.lane.style.transform = `translateX(${view.playLinePosition - view.layout.playbackPosition(view.position)}rem)`;
    updateSheetWindow(view);
}

function sheetRenderableIndexAtOrAfter(renderables, position) {
    let low = 0;
    let high = renderables.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (renderables[middle].start < position) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
}

function updateSheetWindow(view, force = false) {
    if (!view.virtualized || view.position === null) {
        return;
    }

    const visibleUnits =
        (view.widthRem / view.layout.barWidth) * view.notation.meter.units;
    const leftUnits = visibleUnits * (view.playLinePercentage / 100);
    const rightUnits = visibleUnits - leftUnits;
    const start = view.position - leftUnits - view.notation.meter.units;
    const end = view.position + rightUnits + view.notation.meter.units;
    const refreshMargin = view.notation.meter.units / 4;
    if (
        !force &&
        start >= view.windowStart + refreshMargin &&
        end <= view.windowEnd - refreshMargin
    ) {
        return;
    }

    view.windowStart = start - refreshMargin * 2;
    view.windowEnd = end + refreshMargin * 2;
    const firstIndex = sheetRenderableIndexAtOrAfter(
        view.renderables,
        view.windowStart
    );
    const wanted = new Set();
    for (
        let index = firstIndex - 1;
        index >= 0 && view.renderablePrefixEnds[index] > view.windowStart;
        index -= 1
    ) {
        const renderable = view.renderables[index];
        if (renderable.end > view.windowStart) {
            wanted.add(renderable);
        }
    }
    for (let index = firstIndex; index < view.renderables.length; index += 1) {
        const renderable = view.renderables[index];
        if (renderable.start >= view.windowEnd) {
            break;
        }
        if (renderable.end <= view.windowStart) {
            continue;
        }
        wanted.add(renderable);
    }
    const orderedWanted = [...wanted].sort(
        (left, right) => left.order - right.order
    );
    for (const renderable of orderedWanted) {
        if (view.rendered.has(renderable)) {
            continue;
        }

        const nodes = [renderable.create()].flat();
        const fragment = document.createDocumentFragment();
        for (const node of nodes) {
            if (
                renderable.noteIndex !== null &&
                view.notation.highlightState?.active.has(renderable.noteIndex)
            ) {
                node.classList.add('is-current');
            }
            fragment.append(node);
            if (renderable.noteIndex !== null) {
                view.noteElements[renderable.noteIndex].add(node);
            }
        }
        let reference = null;
        let referenceOrder = Infinity;
        for (const [candidate, candidateNodes] of view.rendered) {
            if (
                candidate.order > renderable.order &&
                candidate.order < referenceOrder
            ) {
                reference = candidateNodes[0];
                referenceOrder = candidate.order;
            }
        }
        view.lane.insertBefore(fragment, reference);
        view.rendered.set(renderable, nodes);
    }

    for (const [renderable, nodes] of view.rendered) {
        if (wanted.has(renderable)) {
            continue;
        }
        for (const node of nodes) {
            node.remove();
            if (renderable.noteIndex !== null) {
                view.noteElements[renderable.noteIndex].delete(node);
            }
        }
        view.rendered.delete(renderable);
    }
}

const sheetScoreResizeObserver = new ResizeObserver((entries) => {
    const rootFontSize = Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize
    );
    for (const entry of entries) {
        const view = sheetScoreViews.get(entry.target);
        if (!view) {
            continue;
        }

        view.rootFontSize = rootFontSize;
        view.playLinePosition =
            (entry.contentRect.width * view.playLinePercentage) /
            100 /
            rootFontSize;
        view.widthRem = entry.contentRect.width / rootFontSize;
        updateSheetWindow(view, true);
        updateSheetLane(view);
    }
});

function cacheSheetScoreView(
    notation,
    scoreElement,
    lane,
    noteElements,
    renderables,
    virtualized
) {
    destroySheetScore(notation);
    const playLinePercentage = Number.parseFloat(
        getComputedStyle(scoreElement).getPropertyValue(
            '--sheet-play-line-position'
        )
    );
    const rootFontSize = Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize
    );
    let maximumRenderableEnd = -Infinity;
    const view = {
        element: scoreElement,
        lane,
        layout: createSheetLayout(notation),
        noteElements,
        notation,
        playLinePercentage,
        playLinePosition:
            (scoreElement.clientWidth * playLinePercentage) /
            100 /
            rootFontSize,
        position: null,
        renderables,
        renderablePrefixEnds: renderables.map((renderable) => {
            maximumRenderableEnd = Math.max(
                maximumRenderableEnd,
                renderable.end
            );
            return maximumRenderableEnd;
        }),
        rendered: new Map(),
        rootFontSize,
        virtualized,
        widthRem: scoreElement.clientWidth / rootFontSize,
        windowEnd: -Infinity,
        windowStart: Infinity,
    };
    notation.sheetView = view;
    sheetScoreViews.set(scoreElement, view);
    sheetScoreResizeObserver.observe(scoreElement);
}

function destroySheetScore(notation) {
    const view = notation.sheetView;
    if (!view) {
        return;
    }

    sheetScoreResizeObserver.unobserve(view.element);
    sheetScoreViews.delete(view.element);
    notation.sheetView = null;
}

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
        if (musicEngine.sheetPositionsEqual(note.duration, duration)) {
            return {
                ...noteValue,
                dotted: false,
            };
        }
        if (
            musicEngine.sheetPositionsEqual(
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
            musicEngine.sheetPositionsEqual(withinBar, 0) &&
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

function positionSheetLane(score, scoreSelector, position) {
    const view = score.sheetView;
    if (!view) {
        throw new Error(`Sheet score is not rendered: ${scoreSelector}`);
    }

    view.position = position;
    updateSheetLane(view);
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
            !musicEngine.sheetPositionsEqual(
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
            musicEngine.sheetPositionsEqual(
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

function renderSheetScore(notation, scoreSelector, options = {}) {
    const {
        barGlide = false,
        countIn = false,
        durationGuide = false,
        pitchGuide = false,
        virtualize = false,
    } = options;
    const scoreElement = document.querySelector(scoreSelector);
    const scoreStyles = getComputedStyle(scoreElement);
    const rem = (property) =>
        Number.parseFloat(scoreStyles.getPropertyValue(property));
    const beamThickness = rem('--sheet-beam-thickness');
    const noteheadY = rem('--sheet-notehead-y');
    const stemLength = rem('--sheet-stem-length');
    const beamWidthExtension = rem('--sheet-beam-width-extension');
    const beamStemInset = rem('--sheet-beam-stem-inset');
    const beamLevelSpacing = 0.35;
    const beamGeometry = Object.fromEntries(
        ['up', 'down'].map((direction) => [
            direction,
            {
                stemX: rem(`--sheet-${direction}-stem-x`),
                beamX: rem(`--sheet-${direction}-beam-x`),
                noteY: rem(`--sheet-${direction}-note-y`),
                layoutY: rem(`--sheet-${direction}-layout-y`),
                stemAtNoteInset: rem(`--sheet-${direction}-stem-note-inset`),
            },
        ])
    );
    const { units } = notation.meter;
    const clefDefinition = musicEngine.CLEFS[notation.clef];
    const layout = createSheetLayout(notation);
    const staff = document.createElement('span');
    staff.className = 'sheet-staff';
    staff.setAttribute('aria-hidden', 'true');
    for (let lineIndex = 0; lineIndex < 5; lineIndex += 1) {
        staff.append(document.createElement('span'));
    }
    const lane = document.createElement('div');
    lane.className = 'sheet-lane';
    const noteElements = Array.from(
        { length: notation.phrase.length },
        () => new Set()
    );
    const renderables = [];
    const addRenderable = (start, end, create, noteIndex = null) => {
        if (!virtualize) {
            const nodes = [create()].flat();
            lane.append(...nodes);
            if (noteIndex !== null) {
                for (const node of nodes) {
                    noteElements[noteIndex].add(node);
                }
            }
            return;
        }
        renderables.push({
            create,
            end,
            noteIndex,
            order: renderables.length,
            start,
        });
    };
    if (countIn) {
        for (let index = 0; index < units; index += 1) {
            addRenderable(index - units, index - units + 1, () => {
                const marker = document.createElement('span');
                marker.className = 'sheet-count-marker';
                marker.dataset.sheetCountIndex = String(index);
                marker.style.left = `${layout.writtenPosition(index - units)}rem`;
                marker.textContent = String(index + 1);
                return marker;
            });
        }
    }
    for (let bar = 0; bar <= notation.bars; bar += 1) {
        addRenderable(bar * units, bar * units + 0.000001, () => {
            const line = document.createElement('span');
            line.className = 'sheet-barline';
            line.style.left = `${bar * layout.barWidth}rem`;
            line.textContent = bar === notation.bars ? '𝄂' : '𝄀';
            return line;
        });

        if ((barGlide || durationGuide) && bar > 0 && bar < notation.bars) {
            addRenderable(bar * units, bar * units + 0.000001, () => {
                const glide = document.createElement('span');
                glide.className = 'sheet-bar-glide';
                glide.style.left = `${bar * layout.barWidth - musicEngine.SHEET_BAR_PADDING_REM}rem`;
                glide.style.width = `${musicEngine.SHEET_BAR_PADDING_REM * 2}rem`;
                glide.setAttribute('aria-hidden', 'true');
                for (let index = 0; index < 5; index += 1) {
                    const chevron = document.createElement('span');
                    chevron.textContent = '›';
                    glide.append(chevron);
                }
                return glide;
            });
        }
    }
    addRenderable(0, 0.000001, () => {
        const heading = document.createElement('span');
        heading.className = 'sheet-score-heading';
        heading.style.left = `${layout.writtenPosition(0)}rem`;
        const clef = document.createElement('span');
        clef.className = `sheet-clef sheet-clef-${notation.clef}`;
        clef.textContent = clefDefinition.symbol;
        clef.title = `${notation.clef[0].toUpperCase()}${notation.clef.slice(1)} clef`;
        const signature = document.createElement('span');
        signature.className = 'sheet-signature';
        signature.title =
            notation.signature === '4/4'
                ? 'Common time (4/4)'
                : notation.signature === '2/2'
                  ? 'Cut time (2/2)'
                  : `${notation.signature} time`;
        if (musicEngine.SIGNATURE_SYMBOLS[notation.signature]) {
            signature.textContent =
                musicEngine.SIGNATURE_SYMBOLS[notation.signature];
        } else {
            signature.classList.add('is-numeric');
            const [top, bottom] = notation.signature.split('/');
            for (const number of [top, bottom]) {
                const row = document.createElement('span');
                row.textContent = number;
                signature.append(row);
            }
        }
        heading.append(clef, signature);
        return heading;
    });

    const writtenNotes = notation.phrase
        .flatMap((note, noteIndex) =>
            sheetNoteSegments(note).map((segment, segmentIndex) => ({
                note,
                noteIndex,
                segment,
                segmentIndex,
                staffStep: note.rest
                    ? null
                    : (note.staffStep ??
                      diatonicPositionFromMidi(note.writtenMidi ?? note.midi) -
                          diatonicPositionFromMidi(
                              clefDefinition.bottomLineMidi
                          )),
                value: sheetNoteValue(segment, notation.meter),
            }))
        )
        .sort(
            (left, right) =>
                left.segment.beat - right.segment.beat ||
                Number(left.segmentIndex === 0) -
                    Number(right.segmentIndex === 0) ||
                left.note.beat - right.note.beat ||
                left.noteIndex - right.noteIndex
        );
    const chordStemDirections = new Map();
    for (const writtenNote of writtenNotes) {
        if (writtenNote.note.rest) {
            continue;
        }
        const key = writtenNote.segment.beat;
        const chord = chordStemDirections.get(key) ?? [];
        chord.push(writtenNote);
        chordStemDirections.set(key, chord);
    }
    for (const chord of chordStemDirections.values()) {
        if (chord.length < 2) {
            continue;
        }
        const averageStaffStep =
            chord.reduce((sum, note) => sum + note.staffStep, 0) / chord.length;
        for (const writtenNote of chord) {
            writtenNote.chordStemDown = averageStaffStep > 4;
        }
    }
    const activeAccidentals = new Map();

    for (const writtenNote of writtenNotes) {
        if (
            writtenNote.note.rest ||
            writtenNote.note.percussionName ||
            writtenNote.segmentIndex > 0
        ) {
            continue;
        }

        const bar = musicEngine.sheetPositionFloor(
            writtenNote.segment.beat,
            units
        );
        const writtenMidi =
            writtenNote.note.writtenMidi ?? writtenNote.note.midi;
        const staffPosition = diatonicPositionFromMidi(writtenMidi);
        const accidentalKey = `${bar}:${staffPosition}`;
        const sharpened =
            !musicEngine.PITCH_CLASS_NAMES[
                musicEngine.pitchClassFromMidi(writtenMidi)
            ].natural;
        const activeAccidental = activeAccidentals.get(accidentalKey) ?? false;

        if (sharpened !== activeAccidental) {
            writtenNote.accidental = sharpened ? '♯' : '♮';
            activeAccidentals.set(accidentalKey, sharpened);
        }
    }
    const beamMembership = new Map();
    const candidateBeamGroups = sheetBeamGroups(writtenNotes, notation.meter);
    const beamGroups = [];
    const beamLayouts = new Map();

    for (const group of candidateBeamGroups) {
        const stemDirection = group[0].writtenNotes[0].note.stemDirection;
        const averageStaffStep =
            group.reduce(
                (sum, event) =>
                    sum +
                    event.writtenNotes.reduce(
                        (eventSum, note) => eventSum + note.staffStep,
                        0
                    ),
                0
            ) /
            group.reduce(
                (count, event) => count + event.writtenNotes.length,
                0
            );
        const stemDown =
            stemDirection === 'down' ||
            (stemDirection !== 'up' && averageStaffStep > 4);
        const geometry = beamGeometry[stemDown ? 'down' : 'up'];
        const noteYOffset = geometry.noteY;
        const stemStaffStep = (event) =>
            stemDown
                ? Math.max(...event.writtenNotes.map((note) => note.staffStep))
                : Math.min(...event.writtenNotes.map((note) => note.staffStep));
        const chordSpan = (event) =>
            (Math.max(...event.writtenNotes.map((note) => note.staffStep)) -
                Math.min(...event.writtenNotes.map((note) => note.staffStep))) *
            0.375;
        const xStart =
            layout.writtenPosition(group[0].segment.beat) + geometry.beamX;
        const xEnd =
            layout.writtenPosition(group.at(-1).segment.beat) + geometry.beamX;
        const firstNoteY =
            noteheadY - stemStaffStep(group[0]) * 0.375 + noteYOffset;
        const lastNoteY =
            noteheadY - stemStaffStep(group.at(-1)) * 0.375 + noteYOffset;
        const firstNaturalStemLength = stemLength + chordSpan(group[0]);
        const naturalStemLength = stemDown
            ? firstNaturalStemLength
            : -firstNaturalStemLength;
        let yStart = firstNoteY + naturalStemLength;
        const maximumSlopeRise = group.length === 2 ? 0.75 : 0.375;
        let yEnd =
            yStart +
            musicEngine.clamp(
                lastNoteY - firstNoteY,
                -maximumSlopeRise,
                maximumSlopeRise
            );
        yStart += geometry.layoutY;
        yEnd += geometry.layoutY;
        const slope = (yEnd - yStart) / (xEnd - xStart);
        const maximumBeamValue = Math.max(
            ...group.map((event) => event.value.value)
        );
        const additionalBeamLevels = Math.log2(maximumBeamValue / 8);
        const minimumStemExtension = Math.max(
            stemLength * 0.75,
            additionalBeamLevels * beamLevelSpacing + beamThickness * 2
        );
        const minimumStemLengths = group.map(
            (event) => chordSpan(event) + minimumStemExtension
        );
        const maximumStemLengths = group.map(
            (event) => chordSpan(event) + stemLength * 1.5
        );
        const stemLengths = group.map((event) => {
            const x =
                layout.writtenPosition(event.segment.beat) + geometry.stemX;
            const noteY =
                noteheadY -
                stemStaffStep(event) * 0.375 +
                noteYOffset +
                geometry.stemAtNoteInset;
            const beamY =
                yStart +
                (x - xStart) * slope +
                (stemDown ? -beamStemInset : beamThickness + beamStemInset);
            return stemDown ? beamY - noteY : noteY - beamY;
        });
        const minimumOffset = stemDown
            ? Math.max(
                  ...stemLengths.map(
                      (length, index) => minimumStemLengths[index] - length
                  )
              )
            : Math.max(
                  ...stemLengths.map(
                      (length, index) => length - maximumStemLengths[index]
                  )
              );
        const maximumOffset = stemDown
            ? Math.min(
                  ...stemLengths.map(
                      (length, index) => maximumStemLengths[index] - length
                  )
              )
            : Math.min(
                  ...stemLengths.map(
                      (length, index) => length - minimumStemLengths[index]
                  )
              );
        const stemOffset =
            minimumOffset <= maximumOffset
                ? musicEngine.clamp(0, minimumOffset, maximumOffset)
                : stemDown
                  ? Math.max(0, minimumOffset)
                  : Math.min(0, maximumOffset);
        yStart += stemOffset;
        yEnd += stemOffset;
        const beamLayout = {
            stemDown,
            noteYOffset,
            xStart,
            xEnd,
            yStart,
            yEnd,
        };
        beamGroups.push(group);
        beamLayouts.set(group, beamLayout);

        for (const event of group) {
            event.stemStaffStep = stemStaffStep(event);
            for (const writtenNote of event.writtenNotes) {
                beamMembership.set(writtenNote, beamLayout);
            }
        }
    }

    for (const writtenNote of writtenNotes) {
        if (writtenNote.note.rest) {
            continue;
        }
        writtenNote.stemDown =
            beamMembership.get(writtenNote)?.stemDown ??
            (writtenNote.note.stemDirection
                ? writtenNote.note.stemDirection === 'down'
                : undefined) ??
            writtenNote.chordStemDown ??
            writtenNote.staffStep >= 4;
    }
    const writtenNotesBySegment = new Map(
        writtenNotes.map((writtenNote) => [
            `${writtenNote.noteIndex}:${writtenNote.segmentIndex}`,
            writtenNote,
        ])
    );

    for (const writtenNote of writtenNotes) {
        const { note, noteIndex, segment, staffStep, value } = writtenNote;
        const beam = beamMembership.get(writtenNote);

        const x = layout.writtenPosition(segment.beat);
        const width =
            layout.writtenPosition(segment.beat + segment.duration, 'end') - x;
        addRenderable(
            segment.beat,
            segment.beat + segment.duration,
            () => {
                const element = document.createElement('span');
                element.className = `sheet-lane-note${note.rest ? ' is-rest' : ''}`;
                element.dataset.sheetNoteIndex = String(noteIndex);
                element.style.left = `${x}rem`;
                element.style.width = `${width}rem`;
                const pitchName = note.rest
                    ? ''
                    : `${note.percussionName ?? musicEngine.noteNameFromMidi(note.midi, 'sharp')} `;
                const tied = sheetNoteSegments(note).length > 1 ? ' tied' : '';
                element.title = `${pitchName}${sheetNoteName(segment, notation.meter)} ${note.rest ? 'rest' : `note${tied}`} - ${sheetDurationLabel(segment.duration)} ${sheetDurationUnit(notation.meter)}`;
                const symbol = document.createElement('span');
                symbol.className = 'sheet-note-symbol';
                symbol.setAttribute('aria-hidden', 'true');
                symbol.classList.add(`is-${value.name}`);
                symbol.textContent = `${note.rest ? value.rest : value.symbol}${value.dotted ? '.' : ''}`;
                if (!note.rest) {
                    symbol.style.setProperty('--staff-step', String(staffStep));
                    symbol.classList.toggle(
                        'is-stem-down',
                        writtenNote.stemDown && value.name !== 'whole'
                    );
                    if (beam) {
                        symbol.classList.add('is-beamed');
                        symbol.textContent = note.percussionNotehead ?? '𝅘';
                    } else if (note.percussionNotehead) {
                        const flag =
                            value.value >= 8
                                ? String.fromCodePoint(
                                      0x1d16d + Math.log2(value.value / 4)
                                  )
                                : '';
                        symbol.textContent = `${note.percussionNotehead}${value.value > 1 ? '𝅥' : ''}${flag}`;
                    } else {
                        symbol.textContent = value.symbol;
                    }
                    if (writtenNote.accidental) {
                        const accidental = document.createElement('span');
                        accidental.className = 'sheet-note-accidental';
                        accidental.setAttribute('aria-hidden', 'true');
                        accidental.style.setProperty(
                            '--staff-step',
                            String(staffStep)
                        );
                        accidental.textContent = writtenNote.accidental;
                        element.append(accidental);
                    }
                    if (value.dotted) {
                        const dot = document.createElement('span');
                        dot.className = 'sheet-note-dot';
                        dot.style.setProperty(
                            '--staff-step',
                            String(
                                staffStep % 2 === 0 ? staffStep + 1 : staffStep
                            )
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
                        ledger.className = 'sheet-ledger-line';
                        ledger.style.setProperty(
                            '--staff-step',
                            String(ledgerStep)
                        );
                        element.append(ledger);
                    }
                    if (note.octaveSymbol && writtenNote.segmentIndex === 0) {
                        const octave = document.createElement('span');
                        octave.className = `sheet-note-octave is-${note.octaveBelow ? 'below' : 'above'}`;
                        octave.textContent = note.octaveSymbol;
                        element.append(octave);
                    }
                } else {
                    symbol.textContent = `${value.rest}${value.dotted ? '.' : ''}`;
                }
                element.append(symbol);
                if (durationGuide) {
                    const track = document.createElement('span');
                    track.className = 'rhythm-sheet-duration-track';
                    element.append(track);
                }
                return element;
            },
            noteIndex
        );
    }

    for (const group of beamGroups) {
        addRenderable(
            group[0].segment.beat,
            group.at(-1).segment.beat + group.at(-1).segment.duration,
            () => {
                const elements = [];
                const beamLayout = beamLayouts.get(group);
                const { stemDown, noteYOffset, xStart, xEnd, yStart, yEnd } =
                    beamLayout;
                const geometry = beamGeometry[stemDown ? 'down' : 'up'];
                const slope = (yEnd - yStart) / (xEnd - xStart);
                const beamYAt = (x) => yStart + (x - xStart) * slope;
                const appendBeamAt = (startX, endX, level = 0) => {
                    const offset =
                        level *
                        (stemDown ? -beamLevelSpacing : beamLevelSpacing);
                    const beamInset = stemDown ? -beamThickness : beamThickness;
                    const startY = beamYAt(startX) + offset + beamInset;
                    const endY = beamYAt(endX) + offset + beamInset;
                    const top = Math.min(startY, endY);
                    const leftTop = startY - top;
                    const rightTop = endY - top;
                    const beam = document.createElement('span');
                    beam.className = `sheet-beam${level > 0 ? ' is-secondary' : ''}`;
                    beam.style.left = `${startX}rem`;
                    beam.style.top = `${top}rem`;
                    beam.style.width = `${endX - startX}rem`;
                    beam.style.height = `${Math.abs(endY - startY) + beamThickness}rem`;
                    beam.style.clipPath = `polygon(0 ${leftTop}rem, 100% ${rightTop}rem, 100% ${rightTop + beamThickness}rem, 0 ${leftTop + beamThickness}rem)`;
                    elements.push(beam);
                };
                const beamX = (event) =>
                    layout.writtenPosition(event.segment.beat) + geometry.beamX;
                const appendBeam = (start, end, level = 0) => {
                    appendBeamAt(
                        beamX(start),
                        beamX(end) + beamWidthExtension,
                        level
                    );
                };

                appendBeam(group[0], group.at(-1));

                for (const event of group) {
                    const x =
                        layout.writtenPosition(event.segment.beat) +
                        geometry.stemX;
                    const noteY =
                        noteheadY -
                        event.stemStaffStep * 0.375 +
                        noteYOffset +
                        geometry.stemAtNoteInset;
                    const beamY =
                        beamYAt(x) +
                        (stemDown
                            ? -beamStemInset
                            : beamThickness + beamStemInset);
                    const stem = document.createElement('span');
                    stem.className = 'sheet-beam-stem';
                    stem.style.left = `${x}rem`;
                    stem.style.top = `${Math.min(noteY, beamY)}rem`;
                    stem.style.height = `${Math.abs(noteY - beamY)}rem`;
                    elements.push(stem);
                }

                const appendAdditionalBeams = (beamValue, level) => {
                    let levelGroup = [];
                    const finishLevelGroup = () => {
                        if (levelGroup.length > 1) {
                            appendBeam(levelGroup[0], levelGroup.at(-1), level);
                        } else if (levelGroup.length === 1) {
                            const note = levelGroup[0];
                            const index = group.indexOf(note);
                            const previous = group[index - 1];
                            const next = group[index + 1];
                            const previousDistance = previous
                                ? note.segment.beat - previous.segment.beat
                                : Infinity;
                            const nextDistance = next
                                ? next.segment.beat - note.segment.beat
                                : Infinity;
                            const pointsRight =
                                nextDistance <= previousDistance;
                            const neighbor = pointsRight ? next : previous;
                            const noteX = beamX(note);
                            const hookLength =
                                Math.abs(beamX(neighbor) - noteX) / 2;
                            appendBeamAt(
                                pointsRight ? noteX : noteX - hookLength,
                                pointsRight ? noteX + hookLength : noteX,
                                level
                            );
                        }
                        levelGroup = [];
                    };

                    for (const event of group) {
                        if (event.value.value >= beamValue) {
                            levelGroup.push(event);
                        } else {
                            finishLevelGroup();
                        }
                    }
                    finishLevelGroup();
                };

                const maximumBeamValue = Math.max(
                    ...group.map((event) => event.value.value)
                );
                for (
                    let beamValue = 16, level = 1;
                    beamValue <= maximumBeamValue;
                    beamValue *= 2, level += 1
                ) {
                    appendAdditionalBeams(beamValue, level);
                }
                return elements;
            }
        );
    }

    notation.phrase.forEach((note, noteIndex) => {
        const segments = sheetNoteSegments(note);
        const staffStep = note.rest
            ? null
            : (note.staffStep ??
              diatonicPositionFromMidi(note.writtenMidi ?? note.midi) -
                  diatonicPositionFromMidi(clefDefinition.bottomLineMidi));

        for (
            let segmentIndex = 0;
            segmentIndex < segments.length - 1;
            segmentIndex += 1
        ) {
            const continuation = writtenNotesBySegment.get(
                `${noteIndex}:${segmentIndex + 1}`
            );
            const start =
                layout.writtenPosition(segments[segmentIndex].beat) + 1.1;
            const end =
                layout.writtenPosition(segments[segmentIndex + 1].beat) + 0.55;
            addRenderable(
                segments[segmentIndex].beat,
                segments[segmentIndex + 1].beat,
                () => {
                    const tie = document.createElement('span');
                    tie.className = `sheet-tie ${continuation?.stemDown ? 'is-above' : 'is-below'}`;
                    tie.dataset.sheetNoteIndex = String(noteIndex);
                    tie.style.left = `${start}rem`;
                    tie.style.width = `${end - start}rem`;
                    tie.style.setProperty('--staff-step', String(staffStep));
                    tie.setAttribute('aria-hidden', 'true');
                    return tie;
                },
                noteIndex
            );
        }
    });
    renderables.sort(
        (left, right) => left.start - right.start || left.end - right.end
    );
    const playLine = document.createElement('span');
    playLine.className = 'sheet-play-line';
    const scoreElements = [staff, lane, playLine];
    if (pitchGuide) {
        const pitchLine = document.createElement('span');
        pitchLine.className = 'sheet-pitch-line';
        pitchLine.hidden = true;
        pitchLine.setAttribute('aria-hidden', 'true');
        scoreElements.push(pitchLine);
    }
    scoreElement.replaceChildren(...scoreElements);
    cacheSheetScoreView(
        notation,
        scoreElement,
        lane,
        noteElements,
        renderables,
        virtualize
    );
    const initialPosition = countIn ? -units - 1 : 0;
    positionSheetLane(notation, scoreSelector, initialPosition);
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
    positionSheetLane,
    destroySheetScore,
    sheetBeamGroups,
    renderSheetScore,
    describeSheetScore,
});
