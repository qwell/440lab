'use strict';

// Tuning

function renderTunerString() {
    musicEngine.getOutput('tuner-closest').textContent = tunerTargetNoteName();
    musicEngine.getOutput('tuner-target').textContent =
        `${musicEngine.frequencyFromMidi(tunerTargetMidi).toFixed(3)} Hz`;
}

function renderTunerHistory(time = performance.now()) {
    const canvas = musicEngine.getOutput('tuner-history');
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

    musicEngine.getOutput('tuner-closest').textContent = nearest.noteName;

    musicEngine.getOutput('tuner-target').textContent =
        `${nearest.targetFrequency.toFixed(3)} Hz`;

    const detectedNote =
        tunerTargetMidi === null
            ? ''
            : `${nearestNoteFromFrequency(frequency).noteName} · `;
    musicEngine.getOutput('tuner-detected').textContent =
        `${detectedNote}${frequency.toFixed(3)} Hz detected`;

    musicEngine.getOutput('tuner-cents').textContent =
        `${musicEngine.signed(cents, 1)} cents`;

    const inTune = Math.abs(cents) <= 3;

    const needle = musicEngine.getOutput('tuner-needle');
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
    for (const key of document.querySelectorAll('[data-midi-piano-roll-key]')) {
        const midi = Number(key.dataset.midiPianoRollKey);
        key.classList.toggle('is-active', activePitches.has(midi));
        if (attackedPitches.has(midi)) {
            key.classList.remove('is-struck');
            void key.offsetWidth;
            key.classList.add('is-struck');
        }
    }
    for (const item of document.querySelectorAll(
        '[data-midi-piano-roll-track-index]'
    )) {
        const trackIndex = Number(item.dataset.midiPianoRollTrackIndex);
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

function renderMidiPianoRoll() {
    const pianoRoll = document.getElementById('midi-piano-roll');
    midiPlayer.pianoRollResizeObserver?.disconnect();
    midiPlayer.pianoRollResizeObserver = null;
    midiPlayer.pianoRollLegendResizeObserver?.disconnect();
    midiPlayer.pianoRollLegendResizeObserver = null;
    midiPlayer.pianoRollSegments = [];
    midiPlayer.pianoRollSegmentElements = new Map();
    midiPlayer.pianoRollMarkers = [];
    midiPlayer.pianoRollMarkerElements = new Map();
    midiPlayer.pianoRollSegmentPrefixEnds = [];
    midiPlayer.pianoRollTimeline = null;
    midiPlayer.pianoRollVisibleDuration = 0;
    midiPlayer.pianoRollWindowEnd = -Infinity;
    midiPlayer.pianoRollWindowStart = Infinity;
    pianoRoll.replaceChildren();
    if (!midiPlayer.notes.length) {
        pianoRoll.hidden = true;
        return;
    }
    pianoRoll.hidden = false;

    const minimumNote = Math.min(...midiPlayer.notes.map((note) => note.midi));
    const maximumNote = Math.max(...midiPlayer.notes.map((note) => note.midi));
    const pitchCount = maximumNote - minimumNote + 1;
    const height = pitchCount * musicEngine.MIDI_PIANO_ROLL_ROW_HEIGHT_REM;
    const stage = document.createElement('div');
    const keyboard = document.createElement('div');
    const viewport = document.createElement('div');
    const rows = document.createElement('div');
    const timeline = document.createElement('div');
    const legend = document.createElement('ul');
    const segments = midiPianoRollSegments(midiPlayer.notes);
    const markers = [];
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
    keyboard.className = 'midi-piano-roll-keyboard';
    keyboard.style.height = `${height}rem`;
    viewport.className = 'midi-piano-roll-viewport';
    viewport.style.height = `${height}rem`;
    rows.className = 'midi-piano-roll-rows';
    timeline.className = 'midi-piano-roll-timeline';
    timeline.style.height = `${height}rem`;
    timeline.style.width = `calc(100% + ${(midiPlayer.total / midiPlayer.unitsPerQuarter) * musicEngine.MIDI_PIANO_ROLL_REM_PER_QUARTER}rem)`;
    timeline.style.setProperty(
        '--midi-piano-roll-quarter-width',
        `${musicEngine.MIDI_PIANO_ROLL_REM_PER_QUARTER}rem`
    );
    legend.className = 'midi-piano-roll-legend';
    legend.setAttribute('aria-label', 'Instrument colors');

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
    markers.sort(
        (left, right) =>
            left.position - right.position ||
            left.className.localeCompare(right.className)
    );
    midiPlayer.pianoRollMarkers = markers;

    const blackPitchClasses = new Set([1, 3, 6, 8, 10]);
    for (let midi = maximumNote; midi >= minimumNote; midi -= 1) {
        const rowIndex = maximumNote - midi;
        const top = rowIndex * musicEngine.MIDI_PIANO_ROLL_ROW_HEIGHT_REM;
        const pitchClass = musicEngine.pitchClassFromMidi(midi);
        const key = document.createElement('button');
        const row = document.createElement('span');
        key.type = 'button';
        key.className = `midi-piano-roll-key${blackPitchClasses.has(pitchClass) ? ' is-black' : ''}`;
        key.dataset.midiPianoRollKey = String(midi);
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
        row.className = `midi-piano-roll-row${blackPitchClasses.has(pitchClass) ? ' is-black' : ''}`;
        row.style.top = `${top}rem`;
        keyboard.append(key);
        rows.append(row);
    }
    initializeMidiPianoRollKeyboard(keyboard);

    for (const track of midiPlayer.tracks) {
        const item = document.createElement('li');
        const toggle = document.createElement('button');
        const swatch = document.createElement('span');
        const instrument = document.createElement('label');
        const label = document.createElement('span');
        const select = document.createElement('select');
        item.dataset.midiPianoRollTrackIndex = String(track.trackIndex);
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

function renderMidiPlayer(position) {
    for (const track of midiPlayer.tracks) {
        for (const score of track.scores) {
            musicEngine.positionSheetLane(score, score.selector, position);
            updateMidiSheetHighlights(score, position);
        }
    }
    updateMidiPianoRoll(position, true);
}

function renderMidiPlayerLeadIn(position) {
    for (const track of midiPlayer.tracks) {
        for (const score of track.scores) {
            musicEngine.positionSheetLane(score, score.selector, position);
        }
    }
}

// Rhythm

function clearRhythmFeedback() {
    const lane = document.querySelector(
        `${musicEngine.RHYTHM_SHEET_SCORE_SELECTOR} .sheet-lane`
    );

    for (const element of lane.querySelectorAll(
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
    musicEngine.renderSheetScore(
        rhythmSheet,
        musicEngine.RHYTHM_SHEET_SCORE_SELECTOR,
        {
            countIn: true,
            durationGuide: true,
            initialPosition: rhythmSheetInitialPosition(),
            pitchGuide: true,
        }
    );
    document.getElementById('rhythm-sheet-description').textContent =
        musicEngine.describeSheetScore(rhythmSheet);
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
    const lane = document.querySelector(
        `${musicEngine.RHYTHM_SHEET_SCORE_SELECTOR} .sheet-lane`
    );
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
    musicEngine.positionSheetLane(
        rhythmSheet,
        musicEngine.RHYTHM_SHEET_SCORE_SELECTOR,
        position
    );
    const activeCount =
        position >= -units && position < 0
            ? Math.floor(position + units)
            : null;
    for (const marker of document.querySelectorAll(
        `${musicEngine.RHYTHM_SHEET_SCORE_SELECTOR} [data-sheet-count-index]`
    )) {
        marker.classList.toggle(
            'is-current',
            Number(marker.dataset.sheetCountIndex) === activeCount
        );
    }
    renderRhythmFeedback(position);
    rhythmSheet.phrase.forEach((note, index) => {
        const active =
            position >= note.beat && position < note.beat + note.duration;
        for (const element of document.querySelectorAll(
            `${musicEngine.RHYTHM_SHEET_SCORE_SELECTOR} [data-sheet-note-index="${index}"]`
        )) {
            element.classList.toggle('is-current', active);
        }
    });
}

function renderRhythmMetronome(position) {
    document.getElementById('rhythm-metronome-dot').style.left =
        `${position * 100}%`;
}

function renderRhythmTiming(position) {
    document.getElementById('rhythm-timing-dot').style.left =
        `${position * 100}%`;
}
