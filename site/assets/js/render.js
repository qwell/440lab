'use strict';

// Sheet rendering

const sheetScoreViews = new WeakMap();
const sheetNotationViews = new WeakMap();

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
                view.highlighted.has(renderable.noteIndex)
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
        highlighted: new Set(),
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
    sheetNotationViews.set(notation, view);
    sheetScoreViews.set(scoreElement, view);
    sheetScoreResizeObserver.observe(scoreElement);
}

function destroySheetScore(notation) {
    const view = sheetNotationViews.get(notation);
    if (!view) {
        return;
    }

    sheetScoreResizeObserver.unobserve(view.element);
    sheetScoreViews.delete(view.element);
    sheetNotationViews.delete(notation);
}

function positionSheetLane(score, scoreSelector, position) {
    const view = sheetNotationViews.get(score);
    if (!view) {
        throw new Error(`Sheet score is not rendered: ${scoreSelector}`);
    }

    view.position = position;
    updateSheetLane(view);
}

function renderSheetScore(notation, scoreSelector, options = {}) {
    const {
        barGlide = false,
        countIn = false,
        durationGuide = false,
        initialPosition = countIn ? -notation.meter.units : 0,
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
    positionSheetLane(notation, scoreSelector, initialPosition);
}
// Practice

function createAutoAdvance(module, advance) {
    const elements = getModuleActions(module, 'new');
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

function focusVisibleModuleAction(module, action) {
    focusElement(
        [...getModuleActions(module, action)].find(
            (button) => !button.closest('[hidden]')
        )
    );
}

function syncSharedField(field) {
    const name = field?.dataset?.setting ?? field?.dataset?.input;
    if (!name?.startsWith('shared-')) {
        return;
    }
    const peers = field.dataset.setting ? getSettings(name) : getInputs(name);
    for (const peer of peers) {
        if (field instanceof HTMLInputElement && field.type === 'radio') {
            peer.checked = peer.value === field.value;
        } else if (
            field instanceof HTMLInputElement &&
            field.type === 'checkbox'
        ) {
            peer.checked = field.checked;
        } else {
            peer.value = field.value;
        }
    }
}

function renderSetting(name, value) {
    for (const element of getSettings(name)) {
        if (
            element instanceof HTMLInputElement &&
            ['checkbox', 'radio'].includes(element.type)
        ) {
            element.checked = Boolean(value);
            continue;
        }

        if (
            element instanceof HTMLSelectElement &&
            ![...element.options].some(
                (option) => option.value === String(value)
            )
        ) {
            continue;
        }

        element.value = String(value);
    }
}

function renderSettings(settings) {
    for (const [group, groupSettings] of Object.entries(settings)) {
        if (groupSettings && typeof groupSettings === 'object') {
            for (const [setting, value] of Object.entries(groupSettings)) {
                renderSetting(`${group}-${setting}`, value);
            }
        }
    }
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

function renderPlayedNotes(outputName, text) {
    const playedNotes = document.createElement('div');
    playedNotes.className = 'played-notes';
    playedNotes.textContent = text;
    getOutput(outputName).append(playedNotes);
}

function setAnswerOptionState(button, answer, selected, correct) {
    button.classList.remove('is-correct', 'is-incorrect', 'is-target');
    const stateClass = musicEngine.answerStateClass(answer, selected, correct);
    if (stateClass) {
        button.classList.add(stateClass);
    }
}

function renderMicrophoneState() {
    const state = musicEngine.microphoneState;
    const label = {
        [musicEngine.MICROPHONE_STATES.UNPROMPTED]: 'Enable microphone',
        [musicEngine.MICROPHONE_STATES.DENIED]: 'Retry microphone access',
        [musicEngine.MICROPHONE_STATES.LISTENING]: 'Pause microphone',
        [musicEngine.MICROPHONE_STATES.PAUSED]: 'Start microphone',
    }[state];
    for (const button of getActions('global-microphone-toggle')) {
        button.dataset.microphoneState = state;
        button.setAttribute(
            'aria-pressed',
            String(state === musicEngine.MICROPHONE_STATES.LISTENING)
        );
        button.setAttribute('aria-label', label);
        button.title = label;
    }
}

function renderVolume(volume, icon) {
    getOutput('global-volume-percent').textContent =
        `${Math.round(volume * 100)}%`;
    getOutput('global-volume-icon').textContent = icon;
    const button = getAction('global-volume-toggle');
    const label = volume === 0 ? 'Restore volume' : 'Mute volume';
    button.setAttribute('aria-label', label);
    button.title = label;
}

function renderSettingValue(settingName, value) {
    for (const setting of getSettings(settingName)) {
        setting.value = String(value);
    }
}

function renderInputValue(inputName, value) {
    for (const input of getInputs(inputName)) {
        input.value = String(value);
    }
}

function renderSettingSelectedIndex(settingName, index) {
    for (const setting of getSettings(settingName)) {
        setting.selectedIndex = index;
    }
}

function renderSettingError(setting, message) {
    setting.setCustomValidity(message);
    setting.reportValidity();
}

function clearSettingError(setting) {
    setting.setCustomValidity('');
}

function clearSettingErrors(settings) {
    for (const setting of settings) {
        clearSettingError(setting);
    }
}

function focusElement(element) {
    element?.focus();
}

function setNumberIfChanged(input, value) {
    const rawValue = input.value.trim();
    const currentValue = rawValue === '' ? NaN : Number(rawValue);
    if (!Number.isFinite(currentValue) || currentValue !== value) {
        renderSettingValue(input.dataset.setting, value);
    }
}

function createNoteOption(midi) {
    const option = document.createElement('option');
    option.value = String(midi);
    option.textContent = musicEngine.noteNameFromMidi(midi);
    return option;
}

function populateNoteSelector(select) {
    const options = [];
    for (
        let midi = musicEngine.MIDI_NOTES.C2;
        midi <= musicEngine.MIDI_NOTES.C6;
        midi += 1
    ) {
        options.push(createNoteOption(midi));
    }
    select.replaceChildren(...options);
    select.value = String(musicEngine.MIDI_NOTES.A4);
}

function initializeNotes() {
    for (const select of document.querySelectorAll('[data-note]')) {
        populateNoteSelector(select);
    }
}

function updateNoteReadout(select) {
    getOutput(`${select.dataset.note}-note-frequency`).textContent =
        `${selectedNoteFrequency(select.dataset.note).toFixed(3)} Hz`;
}

function updateNoteReadouts() {
    for (const select of document.querySelectorAll('[data-note]')) {
        updateNoteReadout(select);
    }
}

function updateModePanels(sectionName) {
    const mode = sectionView(sectionName);
    for (const panel of getModePanels(sectionName)) {
        panel.hidden = panel.dataset.modePanel !== mode;
    }
}

function renderActiveSection(activeButton, sectionName) {
    for (const navItem of document.querySelectorAll('.nav-item')) {
        navItem.classList.toggle('is-active', navItem === activeButton);
        navItem.removeAttribute('aria-current');
    }
    for (const panel of document.querySelectorAll('.section-panel')) {
        panel.hidden = panel.dataset.panel !== sectionName;
    }
}

function renderNavigationInitialized(siteNavigation) {
    siteNavigation.hidden = false;
}

function renderNavigationOpen(
    siteNavigation,
    navToggle,
    open,
    restoreFocus = false
) {
    document.body.classList.toggle('nav-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute(
        'aria-label',
        open ? 'Close navigation' : 'Open navigation'
    );
    siteNavigation.setAttribute('aria-hidden', String(!open));
    siteNavigation.inert = !open;
    if (restoreFocus) {
        navToggle.focus();
    }
}

function renderModeNavigation(navItems) {
    const activeNavItem = navItems.find((item) =>
        item.classList.contains('is-active')
    );
    if (activeNavItem && !(activeSection in sectionViewOptions)) {
        activeNavItem.setAttribute('aria-current', 'page');
    }
    for (const modeButton of document.querySelectorAll('[data-nav-mode]')) {
        const active =
            modeButton.dataset.navSection === activeSection &&
            activeView === modeButton.dataset.navMode;
        modeButton.classList.toggle('is-active', active);
        if (active) {
            modeButton.setAttribute('aria-current', 'page');
        } else {
            modeButton.removeAttribute('aria-current');
        }
    }
}

function initializeTooltips() {
    const keepInsideViewport = (event) => {
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
        const boundedLeft = musicEngine.clamp(
            centeredLeft,
            12,
            Math.max(12, viewportWidth - tooltipWidth - 12)
        );
        tip.style.setProperty(
            '--tooltip-shift-x',
            `${boundedLeft - centeredLeft}px`
        );
    };
    for (const tip of document.querySelectorAll('.info-tip')) {
        tip.addEventListener('pointerenter', keepInsideViewport);
        tip.addEventListener('focus', keepInsideViewport);
    }
}

function setTunerStatus(text) {
    if (tunerVoice !== null && tunerTargetMidi !== null) {
        text = `Playing string tone · ${text}`;
    }
    getOutput('tuner-tuning-status').textContent = text;
}

function renderSoundFontOptions() {
    for (const select of getSettings('shared-soundfont')) {
        const selected = select.value;
        const options = bundledSoundFonts.map((name) => new Option(name, name));
        for (const [name, soundFont] of localSoundFonts) {
            options.push(new Option(soundFont.label, name));
        }
        select.replaceChildren(...options);
        if ([...select.options].some((option) => option.value === selected)) {
            select.value = selected;
        }
    }
}

function renderSoundFontSelection(soundFont) {
    for (const select of getSettings('shared-soundfont')) {
        select.value = soundFont;
    }
}

function renderMidiPianoRollSelection(state) {
    for (const select of getInputs('shared-midi-library')) {
        select.value = state.file;
    }
}

function initializeMidiLibrary() {
    const files = globalThis.midiFiles ?? [];
    for (const select of getInputs('shared-midi-library')) {
        const selected = select.value;
        const placeholder = new Option('Choose MIDI file', '');
        placeholder.disabled = true;
        const options = files.map((file) => new Option(assetName(file), file));
        for (const [name] of localMidiFiles) {
            options.push(new Option(`Custom (${name})`, name));
        }
        select.replaceChildren(placeholder, ...options);
        if ([...select.options].some((option) => option.value === selected)) {
            select.value = selected;
        }
    }
}

function setSharedSelectOption(fieldName, value, label) {
    for (const select of getFields(fieldName)) {
        let option = [...select.options].find(
            (candidate) => candidate.value === value
        );
        if (!option) {
            option = new Option();
            option.value = value;
            select.append(option);
        }
        option.textContent = label;
        select.value = value;
        select.setCustomValidity('');
    }
}

function removeSharedSelectOption(fieldName, value) {
    for (const select of getFields(fieldName)) {
        for (const option of select.options) {
            if (option.value === value) {
                option.remove();
                break;
            }
        }
    }
}

function showSoundFontLoading(name) {
    const statuses = getOutputs('soundfont-status');
    const request = String(++soundFontStatusRequest);
    for (const status of statuses) {
        status.dataset.request = request;
        status.textContent = `Loading SoundFont: ${name}...`;
        status.hidden = false;
    }
    return () => {
        for (const status of statuses) {
            if (status.dataset.request !== request) {
                continue;
            }
            delete status.dataset.request;
            status.textContent = '';
            status.hidden = true;
        }
    };
}

function setMidiPlayerStatus(status, loading = false) {
    for (const output of getOutputs('midi-player-status')) {
        output.textContent = status;
        output.classList.toggle('is-loading', loading);
    }
}

function setPlayPauseButtonState(button, playing) {
    const action = playing ? 'Pause' : 'Play';
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', action);
    button.title = action;
}

function setPlaybackTransportState(
    rewindButtons,
    playButtons,
    playing,
    rewindDisabled,
    playDisabled
) {
    for (const rewind of rewindButtons) {
        rewind.disabled = rewindDisabled;
    }
    for (const play of playButtons) {
        play.disabled = playDisabled;
        setPlayPauseButtonState(play, playing);
    }
}

function updateMidiInstrumentControl(track) {
    const select = document.querySelector(
        `[data-midi-piano-roll-track-index="${track.trackIndex}"] .midi-piano-roll-instrument-select`
    );
    if (!select) {
        return;
    }
    const presets = midiInstrumentPresets(track);
    const names = new Map();
    for (const preset of presets) {
        names.set(preset.name, (names.get(preset.name) ?? 0) + 1);
    }
    const options = [new Option('Reset', '')];
    for (const preset of presets) {
        const duplicate = names.get(preset.name) > 1;
        const suffix = duplicate
            ? ` — bank ${preset.bankMSB}:${preset.bankLSB}, program ${preset.program + 1}`
            : '';
        options.push(
            new Option(`${preset.name}${suffix}`, midiPresetValue(preset))
        );
    }
    select.replaceChildren(...options);
    select.value = track.instrumentOverride
        ? midiPresetValue(track.instrumentOverride)
        : midiOriginalPresetValue(track, presets);
    select.disabled = presets.length === 0;
}

function syncMidiInstrumentSelections() {
    for (const track of midiPlayer.tracks) {
        const select = document.querySelector(
            `[data-midi-piano-roll-track-index="${track.trackIndex}"] .midi-piano-roll-instrument-select`
        );
        if (select) {
            select.value = track.instrumentOverride
                ? midiPresetValue(track.instrumentOverride)
                : midiOriginalPresetValue(track);
        }
    }
}

function updateMidiTrackLabels() {
    for (const track of midiPlayer.tracks) {
        const heading = document.querySelector(
            `[data-midi-track-index="${track.trackIndex}"] .midi-sheet-track-heading`
        );
        if (heading) {
            heading.textContent = midiTrackLabel(track);
        }
        const pianoRollLabel = document.querySelector(
            `[data-midi-piano-roll-track-index="${track.trackIndex}"] .midi-piano-roll-legend-label`
        );
        if (pianoRollLabel) {
            pianoRollLabel.textContent = midiTrackLabel(track);
        }
    }
    const legend = document.querySelector('.midi-piano-roll-legend');
    if (legend) {
        balanceMidiPianoRollLegend(legend);
    }
}

function updateMidiTrackToggle(track) {
    const toggle = document.querySelector(
        `[data-midi-track-index="${track.trackIndex}"] .midi-sheet-track-toggle`
    );
    if (toggle) {
        toggle.setAttribute('aria-pressed', String(track.enabled));
        toggle.setAttribute(
            'aria-label',
            `${track.enabled ? 'Disable' : 'Enable'} ${track.name}`
        );
        toggle.title = `${track.enabled ? 'Disable' : 'Enable'} ${track.name}`;
    }
    const legendToggle = document.querySelector(
        `[data-midi-piano-roll-track-index="${track.trackIndex}"] .midi-piano-roll-legend-toggle`
    );
    if (legendToggle) {
        legendToggle.setAttribute('aria-pressed', String(track.enabled));
        legendToggle.setAttribute(
            'aria-label',
            `${track.enabled ? 'Mute' : 'Unmute'} ${track.name}`
        );
        legendToggle.title = `${track.enabled ? 'Mute' : 'Unmute'} ${track.name}`;
        legendToggle
            .closest('li')
            ?.classList.toggle('is-disabled', !track.enabled);
    }
    for (const note of document.querySelectorAll(
        `.midi-piano-roll-note[data-midi-track-index="${track.trackIndex}"]`
    )) {
        note.classList.toggle('is-disabled', !track.enabled);
    }
}

function renderMidiPianoRollKey(key, auditioned) {
    key.classList.toggle('is-auditioned', auditioned);
}

function setMidiTrackPreviewed(track, previewed) {
    track.previewed = previewed;
    for (const note of document.querySelectorAll(
        `.midi-piano-roll-note[data-midi-track-index="${track.trackIndex}"]`
    )) {
        note.classList.toggle('is-previewed', previewed);
    }
}

function createMidiSheetTrack(track) {
    const section = document.createElement('section');
    const body = document.createElement('div');
    const content = document.createElement('div');
    const toggle = document.createElement('button');
    const header = document.createElement('div');
    const heading = document.createElement('h4');
    const minimize = document.createElement('button');
    const minimizeIcon = document.createElement('span');
    const scoresElement = document.createElement('div');
    section.className = 'midi-sheet-track';
    section.dataset.midiTrackIndex = String(track.trackIndex);
    body.className = 'midi-sheet-track-body';
    content.className = 'midi-sheet-track-content';
    toggle.className = 'midi-sheet-track-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', 'true');
    toggle.setAttribute('aria-label', `Disable ${track.name}`);
    toggle.title = `Disable ${track.name}`;
    toggle.addEventListener('click', () => {
        setMidiTrackEnabled(track, !track.enabled);
    });
    header.className = 'midi-sheet-track-header';
    heading.className = 'midi-sheet-track-heading';
    heading.textContent = midiTrackLabel(track);
    minimize.className = 'icon-button midi-sheet-track-minimize';
    minimize.type = 'button';
    minimizeIcon.textContent = '−';
    minimize.append(minimizeIcon);
    minimize.setAttribute('aria-label', `Minimize ${track.name}`);
    minimize.title = `Minimize ${track.name}`;
    minimize.addEventListener('click', () => {
        track.minimized = !track.minimized;
        body.hidden = track.minimized;
        minimizeIcon.textContent = track.minimized ? '+' : '−';
        minimize.setAttribute(
            'aria-label',
            `${track.minimized ? 'Restore' : 'Minimize'} ${track.name}`
        );
        minimize.title = `${track.minimized ? 'Restore' : 'Minimize'} ${track.name}`;
    });
    header.append(minimize, heading);
    scoresElement.className = 'midi-sheet-track-scores';
    for (const score of track.scores) {
        const scoreElement = document.createElement('div');
        scoreElement.id = score.selector.slice(1);
        scoreElement.className = 'sheet-score';
        scoreElement.setAttribute('role', 'img');
        scoreElement.setAttribute(
            'aria-label',
            `${track.name} ${score.clef} score`
        );
        scoresElement.append(scoreElement);
    }
    content.append(scoresElement);
    body.append(...(track.scores.length ? [toggle, content] : [content]));
    section.append(header, body);
    return section;
}

function renderMidiFile(hasSignatureChanges) {
    const tracksElement = document.getElementById('midi-sheet-tracks');
    if (hasSignatureChanges) {
        const message = document.createElement('p');
        const pianoRollLink = document.createElement('a');
        message.className = 'practice-note';
        pianoRollLink.href = '#midi/piano-roll';
        pianoRollLink.textContent = 'Piano Roll';
        message.append(
            'Sheet music does not yet support time-signature changes. Use ',
            pianoRollLink,
            ' for this MIDI file.'
        );
        tracksElement.replaceChildren(message);
    } else {
        tracksElement.replaceChildren(
            ...midiPlayer.tracks.map(createMidiSheetTrack)
        );
    }
    tracksElement.hidden = false;
    if (!hasSignatureChanges) {
        for (const track of midiPlayer.tracks) {
            for (const score of track.scores) {
                renderSheetScore(score, score.selector, {
                    barGlide: true,
                    initialPosition:
                        -midiPlayer.unitsPerQuarter *
                        musicEngine.MIDI_SHEET_LEAD_IN_QUARTERS,
                    virtualize: true,
                });
            }
        }
    }
    renderMidiPianoRoll();
}

function clearMidiFile() {
    const tracksElement = document.getElementById('midi-sheet-tracks');
    tracksElement.replaceChildren();
    tracksElement.hidden = true;
    clearMidiPianoRoll();
}

function updateMidiPlayerTransport() {
    const hasFile = midiPlayer.notes.length > 0;
    const loading = midiPlayer.loading || playbackControlLoadingCount > 0;
    for (const row of document.querySelectorAll('.midi-player-time-row')) {
        row.hidden = !hasFile;
    }
    for (const seek of getInputs('shared-midi-seek')) {
        seek.disabled = !hasFile || loading;
    }
    setPlaybackTransportState(
        getActions('midi-rewind'),
        getActions('midi-play'),
        midiPlayer.playing,
        !hasFile ||
            loading ||
            (!midiPlayer.playing && midiPlayer.position === 0),
        !hasFile || loading
    );
    updateMidiPlayerTimer();
}

function updatePlaybackControls() {
    updateMidiPlayerTransport();
    updateRhythmSheetTransport();
    const loading = playbackControlLoadingCount > 0;
    for (const control of getSettings('shared-soundfont')) {
        control.disabled = loading;
    }
}

function formatMidiTime(seconds) {
    const wholeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const remainder = wholeSeconds % 60;
    return hours
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
        : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function updateMidiPlayerTimer() {
    const current = formatMidiTime(midiPlayer.elapsed);
    const total = formatMidiTime(midiPlayer.duration);
    for (const output of getOutputs('midi-player-current-time')) {
        output.textContent = current;
    }
    for (const output of getOutputs('midi-player-total-time')) {
        output.textContent = total;
    }
    for (const seek of getInputs('shared-midi-seek')) {
        seek.max = String(midiPlayer.duration);
        seek.value = String(midiPlayer.elapsed);
        seek.setAttribute('aria-valuetext', `${current} of ${total}`);
    }
}

function setMidiSheetNoteHighlighted(notation, state, index, highlighted) {
    if (state.active.has(index) === highlighted) {
        return;
    }
    if (highlighted) {
        state.active.add(index);
    } else {
        state.active.delete(index);
    }
    const view = sheetNotationViews.get(notation);
    if (highlighted) {
        view?.highlighted.add(index);
    } else {
        view?.highlighted.delete(index);
    }
    for (const element of view?.noteElements[index] ?? []) {
        element.classList.toggle('is-current', highlighted);
    }
}

function resetMidiSheetHighlights(notation) {
    const state = midiSheetHighlightState(notation);
    for (const index of [...state.active]) {
        setMidiSheetNoteHighlighted(notation, state, index, false);
    }
    state.nextEnd = 0;
    state.nextStart = 0;
    state.position = -Infinity;
}

function updateMidiSheetHighlights(notation, position) {
    const state = midiSheetHighlightState(notation);
    if (position < state.position) {
        for (const index of [...state.active]) {
            setMidiSheetNoteHighlighted(notation, state, index, false);
        }
        state.nextStart = midiEventUpperBound(state.starts, position, 'start');
        state.nextEnd = midiEventUpperBound(state.ends, position, 'end');
        for (
            let index = state.nextStart - 1;
            index >= 0 && state.prefixEnds[index] > position;
            index -= 1
        ) {
            const event = state.starts[index];
            if (event.end > position) {
                setMidiSheetNoteHighlighted(notation, state, event.index, true);
            }
        }
        state.position = position;
        return;
    }
    while (
        state.nextEnd < state.ends.length &&
        state.ends[state.nextEnd].end <= position
    ) {
        setMidiSheetNoteHighlighted(
            notation,
            state,
            state.ends[state.nextEnd].index,
            false
        );
        state.nextEnd += 1;
    }
    while (
        state.nextStart < state.starts.length &&
        state.starts[state.nextStart].start <= position
    ) {
        const event = state.starts[state.nextStart];
        if (event.end > position) {
            setMidiSheetNoteHighlighted(notation, state, event.index, true);
        }
        state.nextStart += 1;
    }
    state.position = position;
}

function updateRhythmSheetTransport() {
    const rewind = getAction('rhythm-sheet-rewind');
    const play = getAction('rhythm-sheet-play');
    const newPhrase = getAction('rhythm-sheet-new');
    const loading = playbackControlLoadingCount > 0;
    setPlaybackTransportState(
        [rewind],
        [play],
        rhythmPlayer.playing && isRhythmSheetEnabled(),
        loading || (!rhythmPlayer.playing && !rhythmSheet.paused),
        loading
    );
    newPhrase.disabled = loading;
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

function renderRhythmSheetReport(
    notes,
    attacks,
    releases,
    pitched,
    average,
    bias
) {
    const stats = document.getElementById('rhythm-sheet-stats');
    stats.replaceChildren();
    for (const [label, value] of [
        [
            'Average attack error',
            `-${average(
                attacks.filter(({ attack }) => attack < 0),
                'attack'
            )} ms, +${average(
                attacks.filter(({ attack }) => attack >= 0),
                'attack'
            )} ms = ±${average(attacks, 'attack')} ms`,
        ],
        [
            'Average release error',
            `-${average(
                releases.filter(({ release }) => release < 0),
                'release'
            )} ms, +${average(
                releases.filter(({ release }) => release >= 0),
                'release'
            )} ms = ±${average(releases, 'release')} ms`,
        ],
        ['Attack bias', bias(attacks, 'attack')],
        ['Release bias', bias(releases, 'release')],
        ['Missed notes', notes.length - attacks.length],
        ['Unreleased notes', attacks.length - releases.length],
        ['Spurious holds', rhythmSheet.extra],
        [
            'Average pitch error',
            pitched.length
                ? `${Math.round(pitched.reduce((sum, note) => sum + Math.abs(note.pitchError), 0) / pitched.length)} cents`
                : 'Not scored',
        ],
        [
            'Notes in tune',
            pitched.length
                ? `${pitched.filter((note) => Math.abs(note.pitchError) <= musicEngine.RHYTHM_SHEET_CORRECT_CENTS).length} / ${pitched.length}`
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
    for (const note of rhythmSheet.phrase) {
        const spurious = rhythmSheet.holdSpans.filter(
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
        item.textContent = musicEngine.sheetNotePosition(
            note,
            rhythmSheet.meter
        );
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
                    : `, ${musicEngine.signed(note.pitchError, 0)} cents`;
            detail.textContent = `${musicEngine.noteNameFromMidi(note.midi, 'sharp')} - ${timing}${pitch}`;
            holds.append(detail);
        }
        for (const hold of spurious) {
            const detail = document.createElement('li');
            const offset = Math.round(
                (hold.start - note.beat) * rhythmSheet.interval * 1000
            );
            const duration = Math.round(
                (hold.end - hold.start) * rhythmSheet.interval * 1000
            );
            detail.textContent = `Spurious hold: ${offset} ms, held ${duration} ms`;
            holds.append(detail);
        }
        item.append(holds);
        results.append(item);
    }
    showRhythmSheetReport();
}

function renderRhythmSheetStatus(status) {
    document.getElementById('rhythm-sheet-count-label').textContent =
        `${status} - durations in ${musicEngine.sheetDurationUnit(rhythmSheet.meter)}`;
}

function renderRhythmSheetMessage(message, loading = false) {
    const label = document.getElementById('rhythm-sheet-count-label');
    label.textContent = message;
    label.classList.toggle('is-loading', loading);
}

function renderRhythmSheetMessageLoading(loading) {
    document
        .getElementById('rhythm-sheet-count-label')
        .classList.toggle('is-loading', loading);
}

function renderRhythmSheetActive(active) {
    document
        .querySelector(musicEngine.RHYTHM_SHEET_SCORE_SELECTOR)
        .setAttribute('aria-disabled', String(!active));
    const hold = document.getElementById('rhythm-sheet-hold');
    hold.disabled = !active;
    hold.classList.remove('is-held');
    if (active) {
        hold.focus();
    }
}

function renderRhythmHold(held) {
    document
        .getElementById('rhythm-sheet-hold')
        .classList.toggle('is-held', held);
}

function clearRhythmSheetCurrentNotes() {
    for (const element of document.querySelectorAll(
        `${musicEngine.RHYTHM_SHEET_SCORE_SELECTOR} .is-current`
    )) {
        element.classList.remove('is-current');
    }
}

function renderRhythmMetronomeMark() {
    const mark = document.getElementById('rhythm-metronome-mark');
    document
        .getElementById('rhythm-metronome-feedback')
        .classList.remove('is-correct', 'is-incorrect');
    mark.hidden = true;
    delete mark.dataset.label;
}

function renderRhythmMetronomeTap({
    error,
    correct,
    count,
    average,
    bias,
    signed,
}) {
    const status = correct ? 'on beat' : error < 0 ? 'early' : 'late';
    const latest = document.createElement('span');
    const responseCount = document.createElement('span');
    const averageError = document.createElement('span');
    const averageBias = document.createElement('span');
    latest.textContent = `${signed(error)} ms (${status})`;
    responseCount.textContent = `Rolling samples: ${count}/${RHYTHM_METRONOME_RESPONSE_LIMIT}`;
    averageError.textContent = `Average error: +/- ${Math.round(average)} ms`;
    averageBias.textContent = `Bias: ${signed(bias)} ms`;
    document
        .getElementById('rhythm-metronome-result')
        .replaceChildren(latest, responseCount, averageError, averageBias);
    const mark = document.getElementById('rhythm-metronome-mark');
    const feedback = document.getElementById('rhythm-metronome-feedback');
    mark.hidden = false;
    mark.dataset.label = `${signed(error)} ms`;
    feedback.classList.toggle('is-correct', correct);
    feedback.classList.toggle('is-incorrect', !correct);
    mark.style.left = `${50 + (error / (rhythmPlayer.clickInterval * 1000)) * 100}%`;
}

function renderRhythmMetronomeStarted(enabled) {
    if (enabled) {
        document.getElementById('rhythm-metronome-result').textContent = '';
    }
    document.getElementById('rhythm-metronome-tap').disabled = !enabled;
}

function focusRhythmMetronomeTap() {
    document.getElementById('rhythm-metronome-tap').focus();
}

function renderRhythmMetronomeStopped() {
    document.getElementById('rhythm-metronome-tap').disabled = true;
}

function renderFileDragSurface(surface, active) {
    surface.classList.toggle('is-drag-over', active);
}

function renderStatsView(stats, path = []) {
    if (!Object.hasOwn(stats, 'trials')) {
        for (const [name, child] of Object.entries(stats)) {
            renderStatsView(child, [...path, name]);
        }
        return;
    }

    const [module, mode, type] = path;
    if (type !== undefined && readStatsType(module, mode) !== type) {
        return;
    }

    const name = `${module}-${mode}`;
    const best = 'bestError' in stats ? stats.bestError : stats.bestStreak;
    getOutput(`${name}-streak`).textContent = String(stats.streak);

    if ('errorTotal' in stats) {
        const meanError =
            stats.trials > 0 ? stats.errorTotal / stats.trials : null;
        const output = getOutput(`${name}-mean-error`);
        output.textContent =
            meanError === null
                ? '--'
                : `${meanError.toFixed(1)} ${output.dataset.unit}`;
    } else {
        const accuracy =
            stats.trials > 0 ? (stats.correct / stats.trials) * 100 : 0;
        getOutput(`${name}-accuracy`).textContent = `${accuracy.toFixed(0)}%`;
    }

    const bestOutput = getOutput(`${name}-best`);
    bestOutput.textContent =
        best === null
            ? '--'
            : 'bestError' in stats
              ? `${best.toFixed(2)} ${bestOutput.dataset.unit}`
              : String(best);
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

function renderAdaptiveStatus(exercise, text) {
    getOutput(`${exercise}-adaptive-status`).textContent = text;
}

function renderAdaptiveProgress(exercise, answerCount, enabled) {
    getOutput(`${exercise}-adaptive-status`).textContent = enabled
        ? `${answerCount} of ${musicEngine.ADAPTIVE_WINDOW_SIZE} answers`
        : '';
}

function renderPitchMemoryResponsePitch(frequency) {
    getOutput('pitch-memory-response-pitch').textContent =
        formatPitchAndCents(frequency);
}

function hidePitchMemoryResponses() {
    document.getElementById('pitch-memory-pitch-response').hidden =
        !musicEngine.state.pitch.memory;
    const response = document.getElementById('pitch-memory-response-actions');
    response.hidden = true;
    getAction('pitch-memory-submit', response).disabled = true;
}

function clearPitchMemoryPitchMarkers() {
    getInput('pitch-memory-pitch').classList.remove('has-result');
    for (const name of [
        'pitch-memory-target-marker',
        'pitch-memory-response-marker',
    ]) {
        const marker = getOutput(name);
        marker.hidden = true;
        marker.classList.remove('is-correct', 'is-incorrect');
    }
}

function showPitchMemoryPitchMarkers(result) {
    const targetMarker = getOutput('pitch-memory-target-marker');
    const responseMarker = getOutput('pitch-memory-response-marker');
    const responseFrequency =
        result.method === 'microphone'
            ? result.scoredResponseFrequency
            : result.responseFrequency;
    const minimumFrequency = musicEngine.frequencyFromMidi(
        musicEngine.PITCH_MEMORY_MINIMUM_MIDI
    );
    const maximumFrequency = musicEngine.frequencyFromMidi(
        musicEngine.PITCH_MEMORY_MAXIMUM_MIDI
    );
    const position = (frequency) =>
        musicEngine.clamp(
            Math.log2(frequency / minimumFrequency) /
                Math.log2(maximumFrequency / minimumFrequency),
            0,
            1
        );

    targetMarker.style.left = `${position(result.targetFrequency) * 100}%`;
    responseMarker.style.left = `${position(responseFrequency) * 100}%`;
    const correct =
        result.absoluteErrorCents < musicEngine.PITCH_MEMORY_CORRECT_CENTS;
    responseMarker.classList.toggle('is-correct', correct);
    responseMarker.classList.toggle('is-incorrect', !correct);
    getInput('pitch-memory-pitch').classList.add('has-result');
    targetMarker.hidden = false;
    responseMarker.hidden = false;
}

function setPitchMemoryStatus(text) {
    getOutput('pitch-memory-status').textContent = text;
}

function setPitchMemoryReplayEnabled(enabled) {
    getAction('pitch-memory-play').disabled = !enabled;
}

function setPitchMemoryRefreshEnabled(enabled) {
    document.querySelector(
        '[data-mode-panel="memory"] [data-action="pitch-memory-new"]'
    ).disabled = !enabled;
}

function renderPitchMemorySliderInitialized() {
    const slider = getInput('pitch-memory-pitch');
    slider.min = '0';
    slider.max = String(musicEngine.PITCH_MEMORY_RANGE_CENTS);
    slider.value = String(musicEngine.PITCH_MEMORY_RANGE_CENTS / 2);
}

function renderPitchMemoryStoredSettings(type, conditionValue) {
    getSetting('pitch-memory-type').value = type;
    getSetting(
        type === 'novel' ? 'pitch-memory-delay' : 'pitch-memory-distractors'
    ).value = conditionValue;
}

function setPitchMemoryStopEnabled(enabled) {
    getAction('pitch-memory-stop').disabled = !enabled;
}

function renderPitchMemoryDetectedFrequency(frequency) {
    getOutput('pitch-memory-response-pitch').textContent =
        formatPitchAndCents(frequency);
    getInput('pitch-memory-pitch').value = String(
        pitchMemorySliderValueForFrequency(frequency)
    );
}

function renderPitchMemoryNoStablePitch() {
    getOutput('pitch-memory-response-pitch').textContent =
        musicEngine.MICROPHONE_MESSAGES.NO_STABLE_PITCH;
}

function renderPitchMemoryResponse(sliderValue, frequency) {
    hidePitchMemoryResponses();
    document.getElementById('pitch-memory-pitch-response').hidden = false;
    const response = document.getElementById('pitch-memory-response-actions');
    response.hidden = false;
    const slider = getInput('pitch-memory-pitch');
    slider.value = String(sliderValue);
    slider.disabled = false;
    renderPitchMemoryResponsePitch(frequency);
    clearPitchMemoryPitchMarkers();
    getAction('pitch-memory-response-play').disabled = false;
    getAction('pitch-memory-response-stop').disabled = false;
    getAction('pitch-memory-submit', response).disabled = false;
    setPitchMemoryStatus(
        'Produce the remembered pitch or adjust the tone, then submit.'
    );
}

function renderPitchMemoryTrialStarted() {
    hidePitchMemoryResponses();
    clearPitchMemoryPitchMarkers();
    getOutput('pitch-memory-result').textContent = '';
    setPitchMemoryReplayEnabled(true);
    setPitchMemoryStopEnabled(true);
}

function renderPitchMemoryTrialCancelled(showStatus) {
    setPitchMemoryReplayEnabled(false);
    setPitchMemoryStopEnabled(false);
    hidePitchMemoryResponses();
    if (showStatus) {
        setPitchMemoryStatus('Trial cancelled.');
    }
}

function renderPitchMemoryTrialStopped() {
    setPitchMemoryStopEnabled(false);
    hidePitchMemoryResponses();
    setPitchMemoryStatus('Trial stopped.');
}

function isPitchMemoryResponseVisible() {
    return !document.getElementById('pitch-memory-response-actions').hidden;
}

function renderPitchMemoryResult(result) {
    getOutput('pitch-memory-result').textContent =
        result.method === 'microphone'
            ? `Target ${formatPitchAndCents(result.targetFrequency)}; response ${formatPitchAndCents(result.responseFrequency)}; octave-adjusted ${formatPitchAndCents(result.scoredResponseFrequency)}; error ${musicEngine.signed(result.errorCents, 1)} cents.`
            : `Target ${formatPitchAndCents(result.targetFrequency)}; response ${formatPitchAndCents(result.responseFrequency)}; error ${musicEngine.signed(result.errorCents, 1)} cents.`;
    showPitchMemoryPitchMarkers(result);
    getInput('pitch-memory-pitch').disabled = true;
    getAction('pitch-memory-response-play').disabled = true;
    getAction('pitch-memory-response-stop').disabled = true;
    getAction(
        'pitch-memory-submit',
        document.getElementById('pitch-memory-response-actions')
    ).disabled = true;
}

function renderPitchMemoryType(novel) {
    document.querySelector('[data-pitch-memory-type="novel"]').hidden = !novel;
    document.querySelector('[data-pitch-memory-type="interference"]').hidden =
        novel;
}

function enableMatchTargetAnswer(index) {
    const row = document.querySelector(`[data-match-target-answer="${index}"]`);
    const chooseButton = row
        ? getAction('match-target-answer-select', row)
        : null;
    if (chooseButton) {
        chooseButton.disabled = false;
    }
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
            `${answer.frequency.toFixed(3)} Hz, ` +
                `${musicEngine.signed(answer.cents, 2)} cents`
        )
    );
    row.append(details);
    return row;
}

function renderMatchTargetAnswers() {
    document
        .querySelector('[data-match-target-answers]')
        .replaceChildren(
            ...matchTarget.answers.map(createMatchTargetAnswerRow)
        );
}

function renderMatchIdentificationAnswers(selected = null) {
    const trial = matchIdentification.trial;
    const buttons = musicEngine.PITCH_CLASS_NAMES.map((_, pitchClass) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'answer-option';
        button.dataset.matchIdentificationAnswer = String(pitchClass);
        button.textContent = musicEngine.pitchClassName(pitchClass);
        button.disabled = !trial?.played || trial.committed;
        setAnswerOptionState(
            button,
            pitchClass,
            selected,
            trial?.midi % musicEngine.SEMITONES_PER_OCTAVE
        );
        return button;
    });
    document
        .querySelector('[data-match-identification-answers]')
        .replaceChildren(...buttons);
}

function renderIntervalAnswers(selected = null, enabled = false) {
    const answerSemitones = interval.trial?.answerSemitones || [];
    const buttons = answerSemitones.map((semitones) => {
        const answer = musicEngine.INTERVALS.find(
            (candidate) => candidate.semitones === semitones
        );
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'answer-option';
        button.dataset.intervalAnswer = String(answer.semitones);
        button.textContent =
            interval.trial.mode === 'construction'
                ? musicEngine.noteNameFromMidi(
                      interval.trial.rootMidi +
                          interval.trial.direction * answer.semitones
                  )
                : answer.name;
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
        const intervalName = musicEngine.INTERVALS.find(
            ({ semitones }) => semitones === interval.trial.semitones
        ).name;
        const direction =
            interval.trial.semitones === 0
                ? ''
                : ` ${interval.trial.direction > 0 ? 'ascending' : 'descending'}`;
        prompt.replaceChildren(
            document.createTextNode(
                `Start: ${musicEngine.noteNameFromMidi(interval.trial.rootMidi)}.`
            ),
            document.createElement('br'),
            document.createTextNode(`Build: ${intervalName}${direction}.`)
        );
    }
    document
        .querySelector(`[data-interval-answers="${sectionView('interval')}"]`)
        .replaceChildren(...buttons);
}

function renderChordAnswers(selected = null, answersEnabled = false) {
    const buttons = Object.keys(musicEngine.CHORD_QUALITIES).map((quality) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'answer-option';
        button.dataset.chordQualityAnswer = quality;
        button.textContent = quality[0].toUpperCase() + quality.slice(1);
        button.disabled = chord.committed || !answersEnabled;
        setAnswerOptionState(button, quality, selected, chord.quality);
        return button;
    });

    document
        .querySelector('[data-chord-quality-answers]')
        .replaceChildren(...buttons);
}

// Tuning

function renderTunerInstruments(instruments) {
    const select = getSetting('tuner-tuning-instrument');

    const emptyOption = document.createElement('option');
    emptyOption.type = 'option';
    emptyOption.textContent = 'none';

    select.replaceChildren(
        emptyOption,
        ...instruments
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((instrument) => new Option(instrument.name, instrument.name))
    );
}

function renderTunerTunings(instrument) {
    const select = getSetting('tuner-tuning-tuning');
    select.replaceChildren();
    select.disabled = !instrument || instrument.tunings.length === 1;
    if (instrument) {
        instrument.tunings.forEach(([name]) => {
            select.add(new Option(name, name));
        });
    } else {
        select.add(new Option('select an instrument', ''));
    }
}

function renderTunerTargetCleared() {
    for (const button of getOutput('tuner-tuning-strings').children) {
        button.setAttribute('aria-pressed', 'false');
    }
}

function renderTunerStrings(notes = null, accidental = 'sharp', play) {
    const container = getOutput('tuner-tuning-strings');
    container.replaceChildren();
    container.hidden = !notes;
    if (!notes) {
        return;
    }
    notes.forEach((midi, index) => {
        const button = document.createElement('button');
        const noteName = musicEngine.noteNameFromMidi(midi, accidental);
        button.type = 'button';
        button.textContent = noteName;
        button.setAttribute(
            'aria-label',
            `String ${notes.length - index}: ${noteName}`
        );
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => play(midi, button));
        container.append(button);
    });
}

function renderTunerStringSelection(selected) {
    for (const button of getOutput('tuner-tuning-strings').children) {
        button.setAttribute('aria-pressed', String(button === selected));
    }
}

function renderTunerStringPlaying(button) {
    button.classList.add('is-playing');
}

function renderTunerStopped() {
    for (const button of getOutput('tuner-tuning-strings').children) {
        button.classList.remove('is-playing');
    }
}

function renderTunerReset(status) {
    if (tunerTargetMidi !== null) {
        renderTunerString();
    } else {
        getOutput('tuner-tuning-closest').textContent = '--';
        getOutput('tuner-tuning-target').textContent = '-- Hz';
    }
    getOutput('tuner-tuning-detected').textContent = '-- Hz detected';
    getOutput('tuner-tuning-cents').textContent = '--';
    getOutput('tuner-tuning-needle').classList.remove(
        'is-visible',
        'is-in-tune'
    );
    setTunerStatus(status);
}

function renderTunerTarget(noteName, frequency) {
    getOutput('tuner-tuning-closest').textContent = noteName;
    getOutput('tuner-tuning-target').textContent = `${frequency.toFixed(3)} Hz`;
}

function renderTunerString() {
    renderTunerTarget(
        tunerTargetNoteName(),
        musicEngine.frequencyFromMidi(tunerTargetMidi)
    );
}

function renderTunerHistory(time = performance.now()) {
    const canvas = getOutput('tuner-tuning-history');
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

    const cutoff = time - musicEngine.TUNER_PLOT_SECONDS * 1000;
    const visibleMidis = tunerMicrophoneInput.plotSamples.map((sample) =>
        musicEngine.midiFromFrequency(sample.frequency)
    );
    const minimumMidi =
        Math.floor(
            visibleMidis.length
                ? Math.min(...visibleMidis)
                : tunerMicrophoneInput.plotCenterMidi
        ) - musicEngine.TUNER_PLOT_PADDING_SEMITONES;
    const maximumMidi =
        Math.ceil(
            visibleMidis.length
                ? Math.max(...visibleMidis)
                : tunerMicrophoneInput.plotCenterMidi
        ) + musicEngine.TUNER_PLOT_PADDING_SEMITONES;
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
            ((midi % musicEngine.SEMITONES_PER_OCTAVE) +
                musicEngine.SEMITONES_PER_OCTAVE) %
                musicEngine.SEMITONES_PER_OCTAVE ===
            0;
        if (octaveBoundary) {
            context.fillStyle = mutedColor;
            context.fillText(
                musicEngine.noteNameFromMidi(midi),
                labelWidth - 6,
                y
            );
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
    for (const sample of tunerMicrophoneInput.plotSamples) {
        const exactMidi = musicEngine.midiFromFrequency(sample.frequency);
        const x =
            labelWidth +
            ((sample.time - cutoff) / (musicEngine.TUNER_PLOT_SECONDS * 1000)) *
                plotWidth;
        const y = yForMidi(exactMidi);
        const inRange = exactMidi >= minimumMidi && exactMidi <= maximumMidi;
        if (
            !inRange ||
            !previousInRange ||
            sample.time - previousTime >
                musicEngine.TUNER_ANALYSIS_INTERVAL_MS * 3
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

function renderTunerDetection({ cents, frequency, nearest }) {
    const limitedCents = musicEngine.clamp(cents, -50, 50);

    const percent = limitedCents + 50;

    renderTunerTarget(nearest.noteName, nearest.targetFrequency);

    const detectedNote =
        tunerTargetMidi === null
            ? ''
            : `${nearestNoteFromFrequency(frequency).noteName} · `;
    getOutput('tuner-tuning-detected').textContent =
        `${detectedNote}${frequency.toFixed(3)} Hz detected`;

    getOutput('tuner-tuning-cents').textContent =
        `${musicEngine.signed(cents, 1)} cents`;

    const inTune = Math.abs(cents) <= 3;

    const needle = getOutput('tuner-tuning-needle');
    needle.style.left = `${percent}%`;
    needle.classList.add('is-visible');
    needle.classList.toggle('is-in-tune', inTune);
    setTunerStatus(musicEngine.MICROPHONE_MESSAGES.LISTENING);
}

// MIDI

function createMidiPianoRollNote(segment) {
    const track = midiPlayer.tracks.find(
        (candidate) => candidate.trackIndex === segment.trackIndex
    );
    const laneHeight =
        musicEngine.MIDI_PIANO_ROLL_ROW_HEIGHT_REM / segment.count;
    const inset = Math.min(0.06, laneHeight * 0.12);
    const bar = document.createElement('span');
    const rowIndex = midiPlayer.pianoRollMaximumNote - segment.midi;
    const left =
        (segment.start / midiPlayer.unitsPerQuarter) *
        musicEngine.MIDI_PIANO_ROLL_REM_PER_QUARTER;
    const baseWidth = Math.max(
        0.125,
        (segment.duration / midiPlayer.unitsPerQuarter) *
            musicEngine.MIDI_PIANO_ROLL_REM_PER_QUARTER
    );
    const requestedLeftInset = segment.gapStart
        ? musicEngine.MIDI_PIANO_ROLL_NOTE_GAP_REM / 2
        : 0;
    const requestedRightInset = segment.gapEnd
        ? musicEngine.MIDI_PIANO_ROLL_NOTE_GAP_REM / 2
        : 0;
    const requestedInset = requestedLeftInset + requestedRightInset;
    const insetScale = requestedInset
        ? Math.min(1, (baseWidth - 0.0625) / requestedInset)
        : 1;
    const leftInset = requestedLeftInset * insetScale;
    const rightInset = requestedRightInset * insetScale;
    bar.className = `midi-piano-roll-note${track.enabled ? '' : ' is-disabled'}${track.previewed ? ' is-previewed' : ''}`;
    bar.dataset.midiTrackIndex = String(track.trackIndex);
    bar.style.setProperty('--midi-track-color', track.color);
    bar.style.left = `${left + leftInset}rem`;
    bar.style.width = `${baseWidth - leftInset - rightInset}rem`;
    bar.style.top = `${rowIndex * musicEngine.MIDI_PIANO_ROLL_ROW_HEIGHT_REM + segment.lane * laneHeight + inset}rem`;
    bar.style.height = `${laneHeight - inset * 2}rem`;
    const noteLabel = track.channels.every(
        (channel) => channel === musicEngine.MIDI_PERCUSSION_CHANNEL
    )
        ? (musicEngine.MIDI_PERCUSSION_NOTATION[segment.midi]?.name ??
          'Percussion')
        : musicEngine.noteNameFromMidi(segment.midi, 'sharp');
    bar.title = `${midiTrackLabel(track)}: ${noteLabel}`;
    return bar;
}

function renderMidiPianoRollNotes(
    position = midiPlayer.position,
    force = false
) {
    const timeline = midiPlayer.pianoRollTimeline;
    const visibleDuration = midiPlayer.pianoRollVisibleDuration;
    if (!timeline || !visibleDuration) {
        return;
    }

    const measureDuration = midiMeasureDurationAtPosition(position);
    const wantedStart = position - measureDuration;
    const wantedEnd = position + visibleDuration + measureDuration;
    const refreshMargin = measureDuration / 4;
    if (
        !force &&
        wantedStart >= midiPlayer.pianoRollWindowStart + refreshMargin &&
        wantedEnd <= midiPlayer.pianoRollWindowEnd - refreshMargin
    ) {
        return;
    }
    const renderStart = wantedStart - refreshMargin * 2;
    const renderEnd = wantedEnd + refreshMargin * 2;
    midiPlayer.pianoRollWindowStart = renderStart;
    midiPlayer.pianoRollWindowEnd = renderEnd;
    const firstIndex = midiPianoRollSegmentIndexAtOrAfter(renderStart);
    const renderedIndexes = new Set();
    for (
        let index = firstIndex - 1;
        index >= 0 &&
        midiPlayer.pianoRollSegmentPrefixEnds[index] > renderStart;
        index -= 1
    ) {
        const segment = midiPlayer.pianoRollSegments[index];
        if (segment.start + segment.duration > renderStart) {
            renderedIndexes.add(index);
        }
    }
    for (
        let index = firstIndex;
        index < midiPlayer.pianoRollSegments.length;
        index += 1
    ) {
        const segment = midiPlayer.pianoRollSegments[index];
        if (segment.start >= renderEnd) {
            break;
        }
        if (segment.start + segment.duration <= renderStart) {
            continue;
        }
        renderedIndexes.add(index);
    }
    for (const index of renderedIndexes) {
        if (!midiPlayer.pianoRollSegmentElements.has(index)) {
            const segment = midiPlayer.pianoRollSegments[index];
            const bar = createMidiPianoRollNote(segment);
            midiPlayer.pianoRollSegmentElements.set(index, bar);
            timeline.append(bar);
        }
    }

    for (const [index, bar] of midiPlayer.pianoRollSegmentElements) {
        if (!renderedIndexes.has(index)) {
            bar.remove();
            midiPlayer.pianoRollSegmentElements.delete(index);
        }
    }

    const firstMarkerIndex = midiPianoRollMarkerIndexAtOrAfter(renderStart);
    const renderedMarkerIndexes = new Set();
    for (
        let index = firstMarkerIndex;
        index < midiPlayer.pianoRollMarkers.length;
        index += 1
    ) {
        const marker = midiPlayer.pianoRollMarkers[index];
        if (marker.position >= renderEnd) {
            break;
        }
        renderedMarkerIndexes.add(index);
        if (!midiPlayer.pianoRollMarkerElements.has(index)) {
            const element = document.createElement('span');
            element.className = marker.className;
            element.style.left = `${(marker.position / midiPlayer.unitsPerQuarter) * musicEngine.MIDI_PIANO_ROLL_REM_PER_QUARTER}rem`;
            element.textContent = marker.textContent;
            element.setAttribute('aria-hidden', 'true');
            midiPlayer.pianoRollMarkerElements.set(index, element);
            timeline.append(element);
        }
    }
    for (const [index, marker] of midiPlayer.pianoRollMarkerElements) {
        if (!renderedMarkerIndexes.has(index)) {
            marker.remove();
            midiPlayer.pianoRollMarkerElements.delete(index);
        }
    }
}

function updateMidiPianoRoll(
    position = midiPlayer.position,
    flashAttacks = false
) {
    const timeline = midiPlayer.pianoRollTimeline;
    if (!timeline) {
        return;
    }
    const quarterPosition = position / midiPlayer.unitsPerQuarter;
    timeline.style.transform = `translateX(${-quarterPosition * musicEngine.MIDI_PIANO_ROLL_REM_PER_QUARTER}rem)`;
    renderMidiPianoRollNotes(position);

    const enabledTrackIndexes = new Set(
        midiPlayer.tracks
            .filter((track) => track.enabled)
            .map((track) => track.trackIndex)
    );
    const activePitches = new Set();
    const activeTrackIndexes = new Set();
    const activeTrackStates = new Map();
    const attackedPitches = new Set();
    for (const index of midiPlayer.pianoRollSegmentElements.keys()) {
        const segment = midiPlayer.pianoRollSegments[index];
        if (!enabledTrackIndexes.has(segment.trackIndex)) {
            continue;
        }
        if (
            position >= segment.start &&
            position < segment.start + segment.duration
        ) {
            activePitches.add(segment.midi);
            if (midiPlayer.playing) {
                activeTrackIndexes.add(segment.trackIndex);
                const state = activeTrackStates.get(segment.trackIndex) ?? [];
                state.push(index);
                activeTrackStates.set(segment.trackIndex, state);
            }
        }
        if (
            flashAttacks &&
            musicEngine.compareSheetPositions(
                segment.start,
                midiPlayer.pianoRollPosition
            ) > 0 &&
            musicEngine.compareSheetPositions(segment.start, position) <= 0
        ) {
            attackedPitches.add(segment.midi);
        }
    }
    for (const [midi, key] of midiPlayer.pianoRollKeyElements) {
        key.classList.toggle('is-active', activePitches.has(midi));
        if (attackedPitches.has(midi)) {
            key.classList.remove('is-struck');
            void key.offsetWidth;
            key.classList.add('is-struck');
        }
    }
    for (const [trackIndex, item] of midiPlayer.pianoRollTrackElements) {
        const activeState = (activeTrackStates.get(trackIndex) ?? [])
            .sort((left, right) => left - right)
            .join(',');
        const stateChanged =
            item.dataset.midiPianoRollActiveState !== activeState;
        item.dataset.midiPianoRollActiveState = activeState;
        item.classList.toggle('is-playing', activeTrackIndexes.has(trackIndex));
        if (flashAttacks && stateChanged) {
            item.classList.remove('is-switching');
            void item.offsetWidth;
            item.classList.add('is-switching');
        }
    }
    midiPlayer.pianoRollPosition = position;
}

function balanceMidiPianoRollLegend(legend) {
    const items = [
        ...legend.querySelectorAll(
            ':scope > li:not(.midi-piano-roll-legend-break)'
        ),
    ];
    const styles = getComputedStyle(legend);
    const availableWidth =
        legend.clientWidth -
        Number.parseFloat(styles.paddingLeft) -
        Number.parseFloat(styles.paddingRight);
    const gap = Number.parseFloat(styles.columnGap) || 0;
    const widths = items.map((item) => item.getBoundingClientRect().width);
    const layoutKey = `${availableWidth}:${widths.join(',')}`;
    if (legend.dataset.layoutKey === layoutKey) {
        return;
    }
    legend.dataset.layoutKey = layoutKey;
    for (const breaker of legend.querySelectorAll(
        ':scope > .midi-piano-roll-legend-break'
    )) {
        breaker.remove();
    }
    if (items.length < 2 || availableWidth <= 0) {
        return;
    }

    const layouts = Array(items.length + 1).fill(null);
    layouts[0] = { rows: 0, raggedness: 0, breaks: [] };
    for (let end = 1; end <= items.length; end += 1) {
        let rowWidth = 0;
        for (let start = end - 1; start >= 0; start -= 1) {
            rowWidth += widths[start] + (start === end - 1 ? 0 : gap);
            if (rowWidth > availableWidth && start < end - 1) {
                break;
            }
            const previous = layouts[start];
            const candidate = {
                rows: previous.rows + 1,
                raggedness:
                    previous.raggedness + (availableWidth - rowWidth) ** 2,
                breaks: start ? [...previous.breaks, start] : [],
            };
            const current = layouts[end];
            if (
                !current ||
                candidate.rows < current.rows ||
                (candidate.rows === current.rows &&
                    candidate.raggedness < current.raggedness)
            ) {
                layouts[end] = candidate;
            }
        }
    }
    for (const index of layouts.at(-1).breaks) {
        const breaker = document.createElement('li');
        breaker.className = 'midi-piano-roll-legend-break';
        breaker.setAttribute('aria-hidden', 'true');
        legend.insertBefore(breaker, items[index]);
    }
}

function balanceMidiPianoRollLegends() {
    for (const legend of document.querySelectorAll('.midi-piano-roll-legend')) {
        balanceMidiPianoRollLegend(legend);
    }
}

function clearMidiPianoRoll() {
    const pianoRoll = document.getElementById('midi-piano-roll');
    midiPlayer.pianoRollResizeObserver?.disconnect();
    midiPlayer.pianoRollResizeObserver = null;
    midiPlayer.pianoRollLegendResizeObserver?.disconnect();
    midiPlayer.pianoRollLegendResizeObserver = null;
    midiPlayer.pianoRollSegments = [];
    midiPlayer.pianoRollSegmentElements = new Map();
    midiPlayer.pianoRollKeyElements = new Map();
    midiPlayer.pianoRollMarkers = [];
    midiPlayer.pianoRollMarkerElements = new Map();
    midiPlayer.pianoRollTrackElements = new Map();
    midiPlayer.pianoRollSegmentPrefixEnds = [];
    midiPlayer.pianoRollTimeline = null;
    midiPlayer.pianoRollVisibleDuration = 0;
    midiPlayer.pianoRollWindowEnd = -Infinity;
    midiPlayer.pianoRollWindowStart = Infinity;
    pianoRoll.replaceChildren();
    pianoRoll.hidden = true;
}

function createMidiPianoRollMarkers() {
    const markers = [];
    let barlineCount = 0;
    for (let index = 0; index < midiPlayer.signatureMap.length; index += 1) {
        const signature = midiPlayer.signatureMap[index];
        const nextSignature = midiPlayer.signatureMap[index + 1];
        const end = nextSignature?.position ?? midiPlayer.total;
        const measureDuration =
            (signature.numerator * midiPlayer.unitsPerQuarter * 4) /
            signature.denominator;
        for (
            let position = signature.position;
            musicEngine.compareSheetPositions(position, end) < 0 &&
            barlineCount < musicEngine.MIDI_PIANO_ROLL_MAX_BARLINES;
            position += measureDuration
        ) {
            markers.push({
                className: 'midi-piano-roll-barline',
                position,
                textContent: '',
            });
            barlineCount += 1;
        }

        markers.push({
            className: 'midi-piano-roll-signature',
            position: signature.position,
            textContent: `${signature.numerator}/${signature.denominator}`,
        });
    }
    return markers.sort(
        (left, right) =>
            left.position - right.position ||
            left.className.localeCompare(right.className)
    );
}

function createMidiPianoRollKeyboard(minimumNote, maximumNote, height) {
    const keyboard = document.createElement('div');
    const rows = document.createElement('div');
    const blackPitchClasses = new Set([1, 3, 6, 8, 10]);
    keyboard.className = 'midi-piano-roll-keyboard';
    keyboard.style.height = `${height}rem`;
    rows.className = 'midi-piano-roll-rows';

    for (let midi = maximumNote; midi >= minimumNote; midi -= 1) {
        const rowIndex = maximumNote - midi;
        const top = rowIndex * musicEngine.MIDI_PIANO_ROLL_ROW_HEIGHT_REM;
        const pitchClass = musicEngine.pitchClassFromMidi(midi);
        const isBlack = blackPitchClasses.has(pitchClass);
        const key = document.createElement('button');
        const row = document.createElement('span');
        key.type = 'button';
        key.className = `midi-piano-roll-key${isBlack ? ' is-black' : ''}`;
        key.dataset.midiPianoRollKey = String(midi);
        midiPlayer.pianoRollKeyElements.set(midi, key);
        key.style.top = `${top}rem`;
        key.title = musicEngine.noteNameFromMidi(midi, 'sharp');
        key.setAttribute('aria-label', `Play ${key.title}`);
        key.addEventListener('keydown', (event) => {
            if (!event.repeat && ['Enter', ' '].includes(event.key)) {
                event.preventDefault();
                strikeMidiPianoRollKey(key);
            }
        });
        key.addEventListener('keyup', (event) => {
            if (['Enter', ' '].includes(event.key)) {
                event.preventDefault();
                releaseMidiPianoRollKey(midi);
            }
        });
        key.addEventListener('blur', () => {
            releaseMidiPianoRollKey(midi);
        });
        key.addEventListener('animationend', () => {
            key.classList.remove('is-struck');
        });
        if (pitchClass === 0) {
            key.textContent = musicEngine.noteNameFromMidi(midi);
        }
        row.className = `midi-piano-roll-row${isBlack ? ' is-black' : ''}`;
        row.style.top = `${top}rem`;
        keyboard.append(key);
        rows.append(row);
    }
    initializeMidiPianoRollKeyboard(keyboard);
    return { keyboard, rows };
}

function createMidiPianoRollLegend() {
    const legend = document.createElement('ul');
    legend.className = 'midi-piano-roll-legend';
    legend.setAttribute('aria-label', 'Instrument colors');

    for (const track of midiPlayer.tracks) {
        const item = document.createElement('li');
        const toggle = document.createElement('button');
        const swatch = document.createElement('span');
        const instrument = document.createElement('label');
        const label = document.createElement('span');
        const select = document.createElement('select');
        item.dataset.midiPianoRollTrackIndex = String(track.trackIndex);
        midiPlayer.pianoRollTrackElements.set(track.trackIndex, item);
        item.dataset.midiPianoRollActiveState = '';
        toggle.type = 'button';
        toggle.className = 'midi-piano-roll-legend-toggle';
        toggle.setAttribute('aria-pressed', String(track.enabled));
        toggle.addEventListener('click', () => {
            setMidiTrackEnabled(track, !track.enabled);
        });
        item.addEventListener('pointerenter', () => {
            setMidiTrackPreviewed(track, true);
        });
        item.addEventListener('pointerleave', () => {
            setMidiTrackPreviewed(track, false);
        });
        item.addEventListener('animationend', () => {
            item.classList.remove('is-switching');
        });
        swatch.className = 'midi-piano-roll-legend-swatch';
        swatch.style.setProperty('--midi-track-color', track.color);
        swatch.setAttribute('aria-hidden', 'true');
        instrument.className = 'midi-piano-roll-instrument';
        instrument.title = `Choose an instrument for ${track.name}`;
        label.className = 'midi-piano-roll-legend-label';
        label.textContent = midiTrackLabel(track);
        select.className = 'midi-piano-roll-instrument-select';
        select.setAttribute('aria-label', `Instrument for ${track.name}`);
        select.addEventListener('change', () => {
            changeMidiTrackInstrument(track, select.value);
        });
        toggle.append(swatch);
        instrument.append(label, select);
        item.append(toggle, instrument);
        legend.append(item);
    }
    return legend;
}

function renderMidiPianoRoll() {
    const pianoRoll = document.getElementById('midi-piano-roll');
    clearMidiPianoRoll();
    if (!midiPlayer.notes.length) {
        return;
    }
    pianoRoll.hidden = false;

    const minimumNote = Math.min(...midiPlayer.notes.map((note) => note.midi));
    const maximumNote = Math.max(...midiPlayer.notes.map((note) => note.midi));
    const pitchCount = maximumNote - minimumNote + 1;
    const height = pitchCount * musicEngine.MIDI_PIANO_ROLL_ROW_HEIGHT_REM;
    const stage = document.createElement('div');
    const viewport = document.createElement('div');
    const timeline = document.createElement('div');
    const segments = midiPianoRollSegments(midiPlayer.notes);
    const { keyboard, rows } = createMidiPianoRollKeyboard(
        minimumNote,
        maximumNote,
        height
    );
    const legend = createMidiPianoRollLegend();
    midiPlayer.pianoRollSegments = segments;
    midiPlayer.pianoRollMaximumNote = maximumNote;
    let maximumSegmentEnd = -Infinity;
    midiPlayer.pianoRollSegmentPrefixEnds = segments.map((segment) => {
        maximumSegmentEnd = Math.max(
            maximumSegmentEnd,
            segment.start + segment.duration
        );
        return maximumSegmentEnd;
    });
    stage.className = 'midi-piano-roll-stage';
    stage.setAttribute('role', 'group');
    stage.setAttribute(
        'aria-label',
        'Interactive piano roll with notes moving from right to left'
    );
    viewport.className = 'midi-piano-roll-viewport';
    viewport.style.height = `${height}rem`;
    timeline.className = 'midi-piano-roll-timeline';
    timeline.style.height = `${height}rem`;
    timeline.style.width = `calc(100% + ${(midiPlayer.total / midiPlayer.unitsPerQuarter) * musicEngine.MIDI_PIANO_ROLL_REM_PER_QUARTER}rem)`;
    timeline.style.setProperty(
        '--midi-piano-roll-quarter-width',
        `${musicEngine.MIDI_PIANO_ROLL_REM_PER_QUARTER}rem`
    );
    midiPlayer.pianoRollMarkers = createMidiPianoRollMarkers();

    viewport.append(rows, timeline);
    stage.append(keyboard, viewport, legend);
    pianoRoll.append(stage);
    updateMidiInstrumentControls();
    midiPlayer.pianoRollLegendResizeObserver = new ResizeObserver(() => {
        balanceMidiPianoRollLegend(legend);
    });
    midiPlayer.pianoRollLegendResizeObserver.observe(legend);
    midiPlayer.pianoRollTimeline = timeline;
    const updateVisibleDuration = (width) => {
        const remPixels = Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize
        );
        midiPlayer.pianoRollVisibleDuration =
            (width / remPixels / musicEngine.MIDI_PIANO_ROLL_REM_PER_QUARTER) *
            midiPlayer.unitsPerQuarter;
        renderMidiPianoRollNotes(midiPlayer.position, true);
    };
    updateVisibleDuration(viewport.clientWidth);
    midiPlayer.pianoRollResizeObserver = new ResizeObserver(([entry]) => {
        updateVisibleDuration(entry.contentRect.width);
    });
    midiPlayer.pianoRollResizeObserver.observe(viewport);
    for (const track of midiPlayer.tracks) {
        updateMidiTrackToggle(track);
    }
    updateMidiPianoRoll();
}

function applyToMidiSheetScores(callback) {
    for (const track of midiPlayer.tracks) {
        for (const score of track.scores) {
            callback(score);
        }
    }
}

function renderMidiPlayer(position) {
    applyToMidiSheetScores((score) => {
        positionSheetLane(score, score.selector, position);
        updateMidiSheetHighlights(score, position);
    });
    updateMidiPianoRoll(position, true);
}

function renderMidiPlayerLeadIn(position) {
    applyToMidiSheetScores((score) => {
        positionSheetLane(score, score.selector, position);
    });
}

// Rhythm

function rhythmSheetLane() {
    return document.querySelector(
        `${musicEngine.RHYTHM_SHEET_SCORE_SELECTOR} .sheet-lane`
    );
}

function clearRhythmFeedback() {
    for (const element of rhythmSheetLane().querySelectorAll(
        '.rhythm-sheet-feedback-section'
    )) {
        element.remove();
    }
}

function renderRhythmSheet() {
    rhythmSheet.holdSpans = [];
    rhythmSheet.currentHold = null;
    clearRhythmSheetResults();
    document.getElementById('rhythm-sheet-stats').replaceChildren();
    document.getElementById('rhythm-sheet-results').replaceChildren();
    renderSheetScore(rhythmSheet, musicEngine.RHYTHM_SHEET_SCORE_SELECTOR, {
        countIn: true,
        durationGuide: true,
        initialPosition: rhythmSheetInitialPosition(),
        pitchGuide: true,
    });
    document.getElementById('rhythm-sheet-description').textContent =
        musicEngine.describeSheetScore(rhythmSheet);
    rhythmSheet.countMarkerElements = [
        ...document.querySelectorAll(
            `${musicEngine.RHYTHM_SHEET_SCORE_SELECTOR} [data-sheet-count-index]`
        ),
    ];
    rhythmSheet.noteElements = rhythmSheet.phrase.map((_, index) => [
        ...document.querySelectorAll(
            `${musicEngine.RHYTHM_SHEET_SCORE_SELECTOR} [data-sheet-note-index="${index}"]`
        ),
    ]);
    const { units, denominator, compound } = rhythmSheet.meter;
    document.getElementById('rhythm-sheet-meter-help').textContent = compound
        ? `${rhythmSheet.signature}: BPM counts dotted-quarter beats; each beat has three eighth-note subdivisions (1 & a). A dotted quarter lasts three subdivisions, a quarter two, and an eighth one.`
        : `${rhythmSheet.signature}: BPM counts ${denominator === 2 ? 'half' : denominator === 8 ? 'eighth' : 'quarter'} notes, with ${units} beats per bar.`;
    document.getElementById('rhythm-sheet-count-label').textContent =
        `Ready - durations in ${musicEngine.sheetDurationUnit(rhythmSheet.meter)}`;
}

function renderRhythmSheetPitch(frequency = null) {
    const line = document.querySelector(
        `${musicEngine.RHYTHM_SHEET_SCORE_SELECTOR} .sheet-pitch-line`
    );
    if (!line) {
        return;
    }

    const midi = Number.isFinite(frequency)
        ? musicEngine.midiFromFrequency(frequency)
        : null;
    const clef = musicEngine.CLEFS[rhythmSheet.clef];
    const visible = midi !== null;
    line.hidden = !visible;

    if (visible) {
        const visibleFrequency = musicEngine.frequencyFromMidi(
            musicEngine.clamp(midi, clef.minimumMidi, clef.maximumMidi)
        );
        const staffStep =
            musicEngine.diatonicPositionFromFrequency(visibleFrequency) -
            musicEngine.diatonicPositionFromMidi(clef.bottomLineMidi);
        line.style.setProperty('--staff-step', String(staffStep));
    }
}

function renderRhythmFeedback(position) {
    const lane = rhythmSheetLane();
    const layout = musicEngine.createSheetLayout(rhythmSheet);
    clearRhythmFeedback();

    const appendSection = (start, end, state, endsNote) => {
        if (end <= start) {
            return;
        }

        const element = document.createElement('span');
        const width =
            layout.playbackPosition(end) - layout.playbackPosition(start);
        element.className = `rhythm-sheet-feedback-section is-${state}`;
        element.style.left = `${layout.playbackPosition(start)}rem`;
        element.style.width = endsNote
            ? `calc(${width}rem - 1px)`
            : `${width}rem`;
        lane.append(element);
    };

    for (const note of rhythmSheet.phrase) {
        if (note.rest || position <= note.beat) {
            continue;
        }

        const noteEnd = note.beat + note.duration;
        const elapsedEnd = Math.min(position, noteEnd);
        const holds = rhythmSheet.holdSpans
            .filter((hold) => hold.note === note)
            .sort((left, right) => left.start - right.start);
        const detectedFrequency = note.pitchSamples.length
            ? musicEngine.median(note.pitchSamples)
            : note.pitchFrequency;
        const pitchMissed =
            Number.isFinite(detectedFrequency) &&
            Math.abs(
                musicEngine.centsBetween(
                    detectedFrequency,
                    musicEngine.frequencyFromMidi(note.midi)
                )
            ) > musicEngine.RHYTHM_SHEET_CORRECT_CENTS;
        let cursor = note.beat;

        for (const hold of holds) {
            const holdStart = musicEngine.clamp(
                hold.start,
                note.beat,
                elapsedEnd
            );
            const holdEnd = musicEngine.clamp(hold.end, note.beat, elapsedEnd);

            appendSection(cursor, holdStart, 'missed', false);
            appendSection(
                Math.max(cursor, holdStart),
                holdEnd,
                pitchMissed ? 'pitch-missed' : 'correct',
                holdEnd === noteEnd
            );
            cursor = Math.max(cursor, holdEnd);
        }

        appendSection(cursor, elapsedEnd, 'missed', elapsedEnd === noteEnd);
    }
}

function renderRhythmSheetPosition(position) {
    const { units } = rhythmSheet.meter;
    const label = document.getElementById('rhythm-sheet-count-label');
    if (position < -units) {
        label.textContent = 'Get ready';
    } else if (position < 0) {
        const click = musicEngine.clamp(
            units + 1 + Math.floor(position),
            1,
            units
        );
        label.textContent = `Count-in ${click} / ${units}`;
    } else {
        label.textContent = `Play - durations in ${musicEngine.sheetDurationUnit(rhythmSheet.meter)}`;
    }
    positionSheetLane(
        rhythmSheet,
        musicEngine.RHYTHM_SHEET_SCORE_SELECTOR,
        position
    );
    const activeCount =
        position >= -units && position < 0
            ? Math.floor(position + units)
            : null;
    for (const marker of rhythmSheet.countMarkerElements) {
        marker.classList.toggle(
            'is-current',
            Number(marker.dataset.sheetCountIndex) === activeCount
        );
    }
    renderRhythmFeedback(position);
    rhythmSheet.phrase.forEach((note, index) => {
        const active =
            position >= note.beat && position < note.beat + note.duration;
        for (const element of rhythmSheet.noteElements[index]) {
            element.classList.toggle('is-current', active);
        }
    });
}

function renderRhythmMetronome(position) {
    document.getElementById('rhythm-metronome-dot').style.left =
        `${position * 100}%`;
}
