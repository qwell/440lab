'use strict';

function tunerTargetNoteName() {
    const instrument =
        musicEngine.TUNER_INSTRUMENTS[
            musicEngine.getControl('tuner-instrument').value
        ];
    const tuning =
        instrument?.tunings[musicEngine.getControl('tuner-variation').value];
    const accidental = tuning?.[2] ?? 'sharp';

    return musicEngine.noteNameFromMidi(tunerTargetMidi, accidental);
}

function selectedNoteFrequency(noteControl) {
    return musicEngine.frequencyFromMidi(Number(noteControl.value));
}

function toggleGlobalMicrophone() {
    if (
        musicEngine.microphoneRequestState ===
        musicEngine.MICROPHONE_STATES.LISTENING
    ) {
        musicEngine.stopMicrophone();
        return;
    }

    void activateCurrentPracticeMicrophone();
}

let tunerTargetMidi = null;

function initializeTunerInstruments() {
    const select = musicEngine.getControl('tuner-instrument');
    musicEngine.TUNER_INSTRUMENTS.forEach((instrument, index) => {
        select.add(new Option(instrument.name, String(index)));
    });
    updateTunerInstrument();
}

function updateTunerInstrument() {
    const select = musicEngine.getControl('tuner-variation');
    const instrument =
        musicEngine.TUNER_INSTRUMENTS[
            musicEngine.getControl('tuner-instrument').value
        ];
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
    for (const button of musicEngine.getOutput('tuner-strings').children) {
        button.setAttribute('aria-pressed', 'false');
    }
    resetTunerTracking(true);
    tunerMicrophoneInput.lastValidTime = 0;
    resetTunerDetection(
        tunerMicrophoneInput.active()
            ? musicEngine.MICROPHONE_MESSAGES.LISTENING
            : musicEngine.MICROPHONE_MESSAGES.PAUSED
    );
}

function updateTunerStrings() {
    stopTuner();
    clearTunerTarget();
    const container = musicEngine.getOutput('tuner-strings');
    container.replaceChildren();
    const instrument =
        musicEngine.TUNER_INSTRUMENTS[
            musicEngine.getControl('tuner-instrument').value
        ];
    container.hidden = !instrument;
    if (!instrument) {
        return;
    }
    const [, notes, accidental = 'sharp'] =
        instrument.tunings[musicEngine.getControl('tuner-variation').value];
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
        button.addEventListener('click', () => {
            const wasPlaying = tunerVoice !== null && tunerTargetMidi === midi;
            stopAllAudio();

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

            tunerVoice = musicEngine.audio.playContinuous(
                musicEngine.frequencyFromMidi(midi),
                musicEngine.getWaveform('tuner').value
            );
            button.classList.add('is-playing');
            resetTunerTracking(true);
            tunerMicrophoneInput.lastValidTime = 0;
            resetTunerDetection(
                tunerMicrophoneInput.active()
                    ? musicEngine.MICROPHONE_MESSAGES.LISTENING
                    : musicEngine.MICROPHONE_MESSAGES.PAUSED
            );
        });
        container.append(button);
    });
}

function renderTunerString() {
    musicEngine.getOutput('tuner-closest').textContent = tunerTargetNoteName();
    musicEngine.getOutput('tuner-target').textContent =
        `${musicEngine.frequencyFromMidi(tunerTargetMidi).toFixed(3)} Hz`;
}

let tunerVoice = null;

function playTuner() {
    stopAllAudio();
    clearTunerTarget();

    tunerVoice = musicEngine.audio.playContinuous(
        selectedNoteFrequency(musicEngine.getNoteControl('tuner')),
        musicEngine.getWaveform('tuner').value
    );
}

function stopTuner() {
    if (!tunerVoice) {
        return;
    }

    tunerVoice.stop();
    tunerVoice = null;

    for (const button of musicEngine.getOutput('tuner-strings').children) {
        button.classList.remove('is-playing');
    }

    if (tunerTargetMidi !== null) {
        setTunerStatus(
            tunerMicrophoneInput.active()
                ? musicEngine.MICROPHONE_MESSAGES.LISTENING
                : musicEngine.MICROPHONE_MESSAGES.PAUSED
        );
    }
}

function stopAllAudio() {
    stopTuner();
    stopRhythm();
    stopMidiVisualization();
    stopMidiTrackerPianoVoices();
    musicEngine.audio.stopTransient();
}

// Notes

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
    musicEngine.getOutput(`${select.dataset.note}-note-frequency`).textContent =
        `${selectedNoteFrequency(select).toFixed(3)} Hz`;
}

function updateNoteReadouts() {
    for (const select of document.querySelectorAll('[data-note]')) {
        updateNoteReadout(select);
    }
}

// Navigation

let activeSection =
    document.querySelector('.nav-item.is-active')?.dataset.section ?? 'about';

const sectionViewOptions = {
    rhythm: ['metronome', 'timing', 'sheet'],
    midi: ['sheet', 'tracker'],
    pitch: ['placement', 'memory'],
    match: ['target', 'identification'],
    intervals: ['recognition', 'construction'],
};

let activeView = sectionViewOptions[activeSection]?.[0] ?? null;

function sectionView(sectionName) {
    return activeSection === sectionName
        ? activeView
        : sectionViewOptions[sectionName]?.[0];
}

function isPitchMemoryActive(sectionName) {
    return sectionName === 'pitch' && sectionView('pitch') === 'memory';
}

async function activateCurrentPracticeMicrophone() {
    if (activeSection === 'tuner') {
        await activateTunerMicrophone();
    } else if (activeSection === 'rhythm' && rhythmSheetEnabled()) {
        await activateRhythmSheetMicrophone();
    } else if (isPitchMemoryActive(activeSection)) {
        await activatePitchMemoryMicrophone();
    } else {
        await musicEngine.setMicrophoneState(
            musicEngine.MICROPHONE_STATES.LISTENING
        );
    }
}

function sectionHash(sectionName) {
    switch (sectionName) {
        case 'pitch':
        case 'intervals':
        case 'rhythm':
        case 'midi':
        case 'match': {
            return `#${sectionName}/${sectionView(sectionName)}`;
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

function activateSection(
    button,
    updateUrl = true,
    view = sectionViewOptions[button.dataset.section]?.[0] ?? null
) {
    const sectionName = button.dataset.section;

    cancelAdvance();
    activeSection = sectionName;
    activeView = view;

    const pitchMemoryActive = isPitchMemoryActive(sectionName);

    if (sectionName === 'midi') {
        void loadMidiAssets().catch(() => {});
    } else if (sectionName === 'rhythm') {
        void loadSoundFontCatalog().catch(() => {});
    }

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
    musicEngine.deactivateActiveMicrophoneInput('page-changed');

    if (
        pitchMemoryActive &&
        pitchMemory.trial &&
        musicEngine.microphoneRequestState ===
            musicEngine.MICROPHONE_STATES.LISTENING
    ) {
        void activatePitchMemoryMicrophone();
    } else if (
        sectionName === 'tuner' &&
        musicEngine.microphoneRequestState ===
            musicEngine.MICROPHONE_STATES.LISTENING
    ) {
        void activateTunerMicrophone();
    } else if (
        sectionName === 'rhythm' &&
        rhythmSheetEnabled() &&
        musicEngine.microphoneRequestState ===
            musicEngine.MICROPHONE_STATES.LISTENING
    ) {
        void activateRhythmSheetMicrophone();
    }

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

    function activateHashSection() {
        const hash = window.location.hash.slice(1);
        const [sectionName, hashMode] = hash.split('/');

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

        const resolvedSection = navItem.dataset.section;
        const view = sectionViewOptions[resolvedSection]?.includes(hashMode)
            ? hashMode
            : (sectionViewOptions[resolvedSection]?.[0] ?? null);

        if (!navItem.classList.contains('is-active')) {
            activateSection(navItem, false, view);
        } else {
            activeSection = resolvedSection;
            activeView = view;
        }

        switch (sectionName) {
            case 'rhythm':
                updateRhythmMode();
                break;

            case 'midi':
                updateMidiMode();
                break;
        }

        updatePracticeMode();

        musicEngine.savePreferences();
        syncModeNavigation();
    }

    navItems.forEach((navItem) => {
        navItem.addEventListener('click', () => {
            activateSection(navItem);
            syncModeNavigation();
            if (document.body.classList.contains('nav-open')) {
                closeNavigation();
            }
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
            const view = modeButton.dataset.navMode;
            const navItem = navItems.find(
                (candidate) => candidate.dataset.section === sectionName
            );

            activateSection(navItem, true, view);

            switch (sectionName) {
                case 'rhythm':
                    updateRhythmMode();
                    break;
                case 'midi':
                    updateMidiMode();
                    break;
            }

            updatePracticeMode();
            syncModeNavigation();
            if (document.body.classList.contains('nav-open')) {
                closeNavigation();
            }
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
        const boundedLeft = musicEngine.clamp(
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

const tunerMicrophoneInput = musicEngine.createMicrophoneInput({
    minimumMidi: musicEngine.MINIMUM_SUPPORTED_MIDI,
    maximumMidi: musicEngine.MAXIMUM_SUPPORTED_MIDI,
    sampleIntervalMs: musicEngine.TUNER_ANALYSIS_INTERVAL_MS,
    processFrame: processTunerMicrophoneFrame,
    onDeactivate: handleTunerMicrophoneDeactivation,
    initialState: {
        smoothedCents: null,
        smoothedNoteMidi: null,

        pendingMidi: null,
        pendingFrames: 0,

        lastValidTime: 0,

        detectedFrequencies: [],
        plotSamples: [],
        plotCenterMidi: musicEngine.MIDI_NOTES.A4,
    },
});

function setTunerStatus(text) {
    if (tunerVoice !== null && tunerTargetMidi !== null) {
        text = `Playing string tone · ${text}`;
    }
    musicEngine.getOutput('tuner-status').textContent = text;
}

function resetTunerTracking(resetPending) {
    tunerMicrophoneInput.detectedFrequencies = [];

    tunerMicrophoneInput.smoothedCents = null;
    tunerMicrophoneInput.smoothedNoteMidi = null;

    if (resetPending) {
        tunerMicrophoneInput.pendingMidi = null;
        tunerMicrophoneInput.pendingFrames = 0;
    }
}

function resetTunerDetection(status = musicEngine.MICROPHONE_MESSAGES.PAUSED) {
    if (tunerTargetMidi !== null) {
        renderTunerString();
    } else {
        musicEngine.getOutput('tuner-closest').textContent = '--';
        musicEngine.getOutput('tuner-target').textContent = '-- Hz';
    }

    musicEngine.getOutput('tuner-detected').textContent = '-- Hz detected';

    musicEngine.getOutput('tuner-cents').textContent = '--';

    const needle = musicEngine.getOutput('tuner-needle');
    needle.classList.remove('is-visible', 'is-in-tune');

    setTunerStatus(status);
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
    tunerMicrophoneInput.plotSamples = tunerMicrophoneInput.plotSamples.filter(
        (sample) => sample.time >= cutoff
    );
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

function initializeTunerHistory() {
    const canvas = musicEngine.getOutput('tuner-history');
    const observer = new ResizeObserver(() => renderTunerHistory());
    observer.observe(canvas);
}

function handleTunerMicrophoneDeactivation({ reason }) {
    tunerMicrophoneInput.lastValidTime = 0;

    resetTunerTracking(true);

    resetTunerDetection();

    if (reason === 'microphone-paused') {
        stopTuner();
    }
}

function detectPitchYin(
    samples,
    sampleRate,
    minimumFrequency,
    maximumFrequency,
    threshold = musicEngine.TUNER_YIN_THRESHOLD,
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

    if (rms < musicEngine.TUNER_MIN_RMS) {
        return null;
    }

    const minimumPeriod = Math.max(
        2,
        Math.floor(analysisSampleRate / maximumFrequency)
    );

    const maximumPeriod = Math.min(
        Math.floor(analysisSampleRate / minimumFrequency),
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

function nearestNoteFromFrequency(frequency) {
    /*
     * MIDI 69 is A4.
     * The user's global A4 reference is
     * respected here.
     */
    const exactMidi = musicEngine.midiFromFrequency(frequency);

    const midi = Math.round(exactMidi);

    const targetFrequency = musicEngine.frequencyFromMidi(midi);

    return {
        midi,

        noteName: musicEngine.noteNameFromMidi(midi),

        targetFrequency,

        cents: musicEngine.centsBetween(frequency, targetFrequency),
    };
}

function renderTunerDetection(frequency) {
    const targetFrequency =
        tunerTargetMidi === null
            ? null
            : musicEngine.frequencyFromMidi(tunerTargetMidi);
    const scoredFrequency =
        targetFrequency === null
            ? frequency
            : musicEngine.nearestOctaveFrequency(frequency, targetFrequency);
    const nearest =
        targetFrequency === null
            ? nearestNoteFromFrequency(frequency)
            : {
                  midi: tunerTargetMidi,
                  noteName: tunerTargetNoteName(),
                  targetFrequency,
                  cents: musicEngine.centsBetween(
                      scoredFrequency,
                      targetFrequency
                  ),
              };

    if (tunerMicrophoneInput.smoothedNoteMidi !== nearest.midi) {
        tunerMicrophoneInput.smoothedNoteMidi = nearest.midi;

        tunerMicrophoneInput.smoothedCents = nearest.cents;
    } else {
        tunerMicrophoneInput.smoothedCents +=
            (nearest.cents - tunerMicrophoneInput.smoothedCents) *
            musicEngine.TUNER_CENTS_SMOOTHING;
    }

    const cents = tunerMicrophoneInput.smoothedCents;

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

function processTunerMicrophoneFrame({
    time,
    samples,
    sampleRate,
    samplesUpdated,
}) {
    if (samplesUpdated) {
        const frequency = detectPitchYin(
            samples,
            sampleRate,
            musicEngine.frequencyFromMidi(tunerMicrophoneInput.minimumMidi),
            musicEngine.frequencyFromMidi(tunerMicrophoneInput.maximumMidi),
            musicEngine.TUNER_YIN_THRESHOLD,
            musicEngine.TUNER_ANALYSIS_SAMPLE_STRIDE
        );

        if (frequency !== null) {
            const nearest = nearestNoteFromFrequency(frequency);

            if (nearest.midi !== tunerMicrophoneInput.pendingMidi) {
                tunerMicrophoneInput.pendingMidi = nearest.midi;

                tunerMicrophoneInput.pendingFrames = 1;

                tunerMicrophoneInput.detectedFrequencies = [];
            } else {
                tunerMicrophoneInput.pendingFrames += 1;
            }

            if (
                tunerMicrophoneInput.pendingFrames >=
                musicEngine.TUNER_STABLE_FRAMES
            ) {
                tunerMicrophoneInput.lastValidTime = time;

                musicEngine.addRollingSample(
                    tunerMicrophoneInput.detectedFrequencies,
                    frequency,
                    musicEngine.TUNER_FREQUENCY_SAMPLE_LIMIT
                );

                const detectedFrequency = musicEngine.median(
                    tunerMicrophoneInput.detectedFrequencies
                );
                const exactMidi =
                    musicEngine.midiFromFrequency(detectedFrequency);
                tunerMicrophoneInput.plotCenterMidi = exactMidi;
                tunerMicrophoneInput.plotSamples.push({
                    time,
                    frequency: detectedFrequency,
                });
                renderTunerDetection(detectedFrequency);
            }
        }

        if (time - tunerMicrophoneInput.lastValidTime > 400) {
            resetTunerTracking(frequency === null);

            resetTunerDetection(
                musicEngine.MICROPHONE_MESSAGES.NO_STABLE_PITCH
            );
        }
    }

    renderTunerHistory(time);
}

async function activateTunerMicrophone() {
    const active = tunerMicrophoneInput.active();
    if (!active) {
        resetTunerDetection(musicEngine.MICROPHONE_MESSAGES.REQUESTING);
    }

    try {
        if (!(await tunerMicrophoneInput.activate())) {
            if (
                musicEngine.microphoneState ===
                musicEngine.MICROPHONE_STATES.DENIED
            ) {
                resetTunerDetection(musicEngine.microphoneFailureMessage);
            }
            return false;
        }

        if (active) {
            setTunerStatus(musicEngine.MICROPHONE_MESSAGES.LISTENING);
            return true;
        }

        tunerMicrophoneInput.lastValidTime = performance.now();

        tunerMicrophoneInput.plotSamples = [];
        renderTunerHistory();

        resetTunerTracking(true);

        setTunerStatus(musicEngine.MICROPHONE_MESSAGES.LISTENING);

        return true;
    } catch {
        resetTunerDetection(musicEngine.MICROPHONE_MESSAGES.FAILED);
        return false;
    }
}

// SoundFonts

let bundledSoundFontFiles = [];
let bundledSoundFonts = [];
const localSoundFonts = new Map();
const vendorScripts = new Map();
let midiAssetsPromise = null;
let soundFontCatalogPromise = null;
let soundFontStatusRequest = 0;

function assetFileName(file) {
    return file.slice(file.lastIndexOf('/') + 1);
}

function assetName(file) {
    return assetFileName(file).replace(/\.[^./]+$/u, '');
}

function assetPath(file, extension) {
    return file?.replace(/\.[^./]+$/u, `.${extension}`);
}

function assetExtension(file) {
    return file?.match(/\.([^./]+)$/u)?.[1];
}

function bundledSoundFontFile(name) {
    return bundledSoundFontFiles.find((file) => assetName(file) === name);
}

function soundFontPath(name, extension) {
    return assetPath(bundledSoundFontFile(name), extension);
}

function soundFontExtension(name) {
    return assetExtension(bundledSoundFontFile(name));
}

function initializeSoundFonts() {
    bundledSoundFontFiles = globalThis.soundFontFiles ?? [];
    bundledSoundFonts = bundledSoundFontFiles.map(assetName);

    for (const select of musicEngine.getControls('shared-soundfont')) {
        const selected = select.value;
        const options = bundledSoundFonts.map((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            return option;
        });
        for (const [name, soundFont] of localSoundFonts) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = soundFont.label;
            options.push(option);
        }
        select.replaceChildren(...options);
        if ([...select.options].some((option) => option.value === selected)) {
            select.value = selected;
        }
    }
}

function initializeMidiLibrary() {
    const files = globalThis.midiFiles ?? [];
    for (const select of musicEngine.getControls('shared-midi-library')) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Included MIDI file';
        const options = files.map((file) => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = assetName(file);
            return option;
        });
        select.replaceChildren(placeholder, ...options);
    }
}

function addSoundFontOption(name, label) {
    for (const select of musicEngine.getControls('shared-soundfont')) {
        let option = [...select.options].find(
            (candidate) => candidate.value === name
        );
        if (!option) {
            option = document.createElement('option');
            option.value = name;
            select.append(option);
        }
        option.textContent = label;
        select.value = name;
        select.setCustomValidity('');
    }
}

function removeSoundFontOption(name) {
    for (const select of musicEngine.getControls('shared-soundfont')) {
        for (const option of select.options) {
            if (option.value === name) {
                option.remove();
                break;
            }
        }
    }
}

function showSoundFontLoading(name, root = document) {
    const statuses = musicEngine.getOutputs('soundfont-status', root);
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

function loadScript(source) {
    if (!vendorScripts.has(source)) {
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = source;
            script.addEventListener('load', resolve, { once: true });
            script.addEventListener(
                'error',
                () => reject(new Error(`Unable to load ${source}.`)),
                { once: true }
            );
            document.head.append(script);
        }).catch((error) => {
            if (vendorScripts.get(source) === promise) {
                vendorScripts.delete(source);
            }
            throw error;
        });
        vendorScripts.set(source, promise);
    }

    return vendorScripts.get(source);
}

function loadSoundFontCatalog() {
    soundFontCatalogPromise ??= loadScript('assets/soundfonts/files.js')
        .then(initializeSoundFonts)
        .catch((error) => {
            soundFontCatalogPromise = null;
            throw error;
        });

    return soundFontCatalogPromise;
}

function loadMidiAssets() {
    midiAssetsPromise ??= Promise.all([
        loadSoundFontCatalog(),
        loadScript('assets/midi/files.js').then(initializeMidiLibrary),
    ]).catch((error) => {
        midiAssetsPromise = null;
        setMidiStatus(error.message);
        throw error;
    });

    return midiAssetsPromise;
}

function base64ToArrayBuffer(encoded) {
    const decoded = atob(encoded);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
        bytes[index] = decoded.charCodeAt(index);
    }
    return bytes.buffer;
}

function readFourCC(view, offset) {
    if (offset + 4 > view.byteLength) {
        return '';
    }
    return String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
    );
}

function soundFontName(buffer) {
    const view = new DataView(buffer);
    if (
        readFourCC(view, 0) !== 'RIFF' ||
        !['sfbk', 'sfpk', 'sfen'].includes(readFourCC(view, 8)) ||
        readFourCC(view, 12) !== 'LIST' ||
        readFourCC(view, 20) !== 'INFO'
    ) {
        return null;
    }

    const infoEnd = Math.min(view.byteLength, 20 + view.getUint32(16, true));
    for (let offset = 24; offset + 8 <= infoEnd;) {
        const size = view.getUint32(offset + 4, true);
        const dataOffset = offset + 8;
        const dataEnd = dataOffset + size;
        if (dataEnd > infoEnd) {
            return null;
        }
        if (readFourCC(view, offset) === 'INAM') {
            const name = new TextDecoder()
                .decode(new Uint8Array(buffer, dataOffset, size))
                .replace(/\0.*$/su, '')
                .trim();
            return name || null;
        }
        offset = dataEnd + (size % 2);
    }
    return null;
}

// MIDI: visualizer

const midiVisualizer = {
    tracks: [],
    notes: [],
    total: 0,
    active: false,
    loading: false,
    loadRequest: 0,
    playRequest: 0,
    frame: null,
    position: 0,
    elapsed: 0,
    duration: 0,
    fileName: '',
    summary: '',
    buffer: null,
    tempoMap: [],
    signatureMap: [],
    ticksPerQuarter: 0,
    unitsPerQuarter: 1,
    trackerPosition: 0,
    trackerSegments: [],
    trackerSegmentElements: new Map(),
    trackerMarkers: [],
    trackerMarkerElements: new Map(),
    trackerMaximumNote: 0,
    trackerSegmentPrefixEnds: [],
    trackerResizeObserver: null,
    trackerTimeline: null,
    trackerVisibleDuration: 0,
    trackerWindowEnd: -Infinity,
    trackerWindowStart: Infinity,
};

const midiPlayback = {
    initializePromise: null,
    synth: null,
    sequencer: null,
    soundFontId: null,
    soundFontPromise: null,
    loadedBuffer: null,
    generatedTones: false,
    generatedToneNotes: [],
    generatedToneIndex: 0,
};

const midiTrackerPianoVoices = new Map();

function setMidiStatus(status) {
    for (const output of musicEngine.getOutputs('midi-status')) {
        output.textContent = status;
    }
}

function updateMidiMode() {
    const mode = sectionView('midi');
    for (const panel of musicEngine.getModePanels('midi')) {
        panel.hidden = panel.dataset.modePanel !== mode;
    }
}

function midiPresetName(patch) {
    const presets = midiPlayback.synth?.presetList ?? [];
    const exact = presets.find(
        (preset) =>
            preset.program === patch.program &&
            preset.bankMSB === patch.bankMSB &&
            preset.bankLSB === patch.bankLSB &&
            preset.isDrum === patch.isDrum
    );
    const fallback = presets.find(
        (preset) =>
            preset.program === patch.program && preset.isDrum === patch.isDrum
    );
    return (exact ?? fallback)?.name;
}

function midiTrackLabel(track) {
    const instruments = [
        ...new Set(track.patches.map(midiPresetName).filter(Boolean)),
    ];
    const distinctInstruments = instruments.filter(
        (instrument) =>
            instrument.localeCompare(track.name, undefined, {
                sensitivity: 'accent',
            }) !== 0
    );
    return distinctInstruments.length
        ? `${track.name} (${distinctInstruments.join(', ')})`
        : track.name;
}

function updateMidiTrackLabels() {
    for (const track of midiVisualizer.tracks) {
        const heading = document.querySelector(
            `[data-midi-track-index="${track.trackIndex}"] .midi-visualize-track-heading`
        );
        if (heading) {
            heading.textContent = midiTrackLabel(track);
        }
        const trackerLabel = document.querySelector(
            `[data-midi-tracker-track-index="${track.trackIndex}"] .midi-tracker-legend-label`
        );
        if (trackerLabel) {
            trackerLabel.textContent = midiTrackLabel(track);
        }
    }
}

function updateMidiTrackToggle(track) {
    const toggle = document.querySelector(
        `[data-midi-track-index="${track.trackIndex}"] .midi-visualize-track-toggle`
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
        `[data-midi-tracker-track-index="${track.trackIndex}"]`
    );
    if (legendToggle) {
        legendToggle.setAttribute('aria-pressed', String(track.enabled));
        legendToggle.setAttribute(
            'aria-label',
            `${track.enabled ? 'Disable' : 'Enable'} ${track.name}`
        );
        legendToggle.title = `${track.enabled ? 'Disable' : 'Enable'} ${track.name}`;
    }
    for (const note of document.querySelectorAll(
        `.midi-tracker-note[data-midi-track-index="${track.trackIndex}"]`
    )) {
        note.classList.toggle('is-disabled', !track.enabled);
    }
}

function previewMidiTrack(track, previewed) {
    track.previewed = previewed;
    for (const note of document.querySelectorAll(
        `.midi-tracker-note[data-midi-track-index="${track.trackIndex}"]`
    )) {
        note.classList.toggle('is-previewed', previewed);
    }
}

function midiTrackMuteGroup(selectedTrack) {
    const tracks = new Set([selectedTrack]);
    const channels = new Set(selectedTrack.channels);
    let changed = true;

    while (changed) {
        changed = false;
        for (const track of midiVisualizer.tracks) {
            if (
                tracks.has(track) ||
                !track.channels.some((channel) => channels.has(channel))
            ) {
                continue;
            }
            tracks.add(track);
            for (const channel of track.channels) {
                channels.add(channel);
            }
            changed = true;
        }
    }

    return tracks;
}

function setMidiTrackEnabled(selectedTrack, enabled) {
    for (const track of midiTrackMuteGroup(selectedTrack)) {
        track.enabled = enabled;
        updateMidiTrackToggle(track);
    }
    synchronizeMidiTrackMutes();
    if (midiPlayback.generatedTones) {
        musicEngine.audio.stopTransient();
        midiPlayback.generatedToneIndex = 0;
    }
    updateMidiTracker();
}

function synchronizeMidiTrackMutes() {
    if (!midiPlayback.synth) {
        return;
    }
    const usedChannels = new Set(
        midiVisualizer.tracks.flatMap((track) => track.channels)
    );
    for (const [
        channel,
        midiChannel,
    ] of midiPlayback.synth.midiChannels.entries()) {
        const enabled =
            !midiPlayback.generatedTones &&
            midiVisualizer.tracks.some(
                (track) => track.enabled && track.channels.includes(channel)
            );
        midiChannel.setSystemParameter(
            'isMuted',
            usedChannels.has(channel) && !enabled
        );
    }
}

function midiTrackColor(trackIndex) {
    const hue = (210 + trackIndex * 137.51) % 360;
    //return `hsl(${hue} 72% 62%)`;
    return `oklch(70% 0.15 ${hue})`;
}

// MIDI: tracker

function midiTrackerNoteTiming(note) {
    return {
        start: note.performanceBeat ?? note.beat,
        duration:
            note.soundingDuration ?? note.performanceDuration ?? note.duration,
    };
}

function midiTrackerPianoChannel() {
    const usedChannels = new Set(
        midiVisualizer.tracks.flatMap((track) => track.channels)
    );
    for (let channel = 15; channel >= 0; channel -= 1) {
        if (
            channel !== musicEngine.MIDI_PERCUSSION_CHANNEL &&
            !usedChannels.has(channel)
        ) {
            return channel;
        }
    }
    return null;
}

function stopMidiTrackerPianoVoice(midi, voice) {
    window.clearTimeout(voice.timeout);
    voice.cancelled = true;
    voice.stop?.();
    if (midiTrackerPianoVoices.get(midi) === voice) {
        voice.key.classList.remove('is-auditioned');
        midiTrackerPianoVoices.delete(midi);
    }
}

function stopMidiTrackerPianoVoices() {
    for (const [midi, voice] of midiTrackerPianoVoices) {
        stopMidiTrackerPianoVoice(midi, voice);
    }
}

function scheduleMidiTrackerPianoRelease(midi, voice) {
    const heldMilliseconds = voice.releasedAt - voice.pressedAt;
    const delay =
        heldMilliseconds < musicEngine.MIDI_TRACKER_PIANO_QUICK_PRESS_MS
            ? Math.max(
                  0,
                  voice.startedAt +
                      musicEngine.MIDI_TRACKER_PIANO_QUICK_DURATION_MS -
                      performance.now()
              )
            : 0;
    voice.timeout = window.setTimeout(
        () => stopMidiTrackerPianoVoice(midi, voice),
        delay
    );
}

function releaseMidiTrackerKey(midi) {
    const voice = midiTrackerPianoVoices.get(midi);
    if (!voice || voice.releasedAt !== null) {
        return;
    }
    voice.releasedAt = performance.now();
    if (!voice.stop) {
        return;
    }
    scheduleMidiTrackerPianoRelease(midi, voice);
}

async function startMidiTrackerKey(midi, key) {
    const previousVoice = midiTrackerPianoVoices.get(midi);
    if (previousVoice) {
        stopMidiTrackerPianoVoice(midi, previousVoice);
    }
    const voice = {
        cancelled: false,
        key,
        pressedAt: performance.now(),
        releasedAt: null,
        startedAt: 0,
        stop: null,
        timeout: null,
    };
    midiTrackerPianoVoices.set(midi, voice);
    key.classList.add('is-auditioned');

    let soundFontChannel = null;
    try {
        const context = musicEngine.audio.getContext();
        if (context.state === 'suspended') {
            await context.resume();
        }
        await Promise.all([
            loadSoundFontCatalog(),
            initializeMidiSynthesizer(),
        ]);
        const channel = midiTrackerPianoChannel();
        if ((await loadSoundFont()) && channel !== null) {
            soundFontChannel = channel;
        }
    } catch {
        // Use a generated tone below.
    }

    if (voice.cancelled || midiTrackerPianoVoices.get(midi) !== voice) {
        return;
    }

    if (soundFontChannel !== null) {
        const synth = midiPlayback.synth;
        synth.midiChannels[soundFontChannel]?.setSystemParameter(
            'isMuted',
            false
        );
        synth.programChange(
            soundFontChannel,
            musicEngine.MIDI_TRACKER_PIANO_PROGRAM
        );
        synth.noteOn(
            soundFontChannel,
            midi,
            musicEngine.MIDI_TRACKER_PIANO_VELOCITY
        );
        voice.stop = () => synth.noteOff(soundFontChannel, midi);
    } else {
        const oscillator = musicEngine.audio.playContinuous(
            musicEngine.frequencyFromMidi(midi),
            'triangle',
            musicEngine.MIDI_TRACKER_PIANO_VOLUME
        );
        voice.stop = () => oscillator.stop();
    }
    voice.startedAt = performance.now();

    if (voice.releasedAt !== null) {
        scheduleMidiTrackerPianoRelease(midi, voice);
    }
}

function strikeMidiTrackerKey(key) {
    const midi = Number(key.dataset.midiTrackerKey);
    void startMidiTrackerKey(midi, key);
}

function initializeMidiTrackerKeyboard(keyboard) {
    const activePointers = new Set();
    const pointerKeys = new Map();
    const keyAtPointer = (event) => {
        const key = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest('.midi-tracker-key');
        return key && keyboard.contains(key) ? key : null;
    };
    const movePointerToKey = (event, key) => {
        const previousKey = pointerKeys.get(event.pointerId);
        if (key === previousKey) {
            return;
        }
        if (previousKey) {
            releaseMidiTrackerKey(Number(previousKey.dataset.midiTrackerKey));
        }
        if (key) {
            strikeMidiTrackerKey(key);
            pointerKeys.set(event.pointerId, key);
        } else {
            pointerKeys.delete(event.pointerId);
        }
    };
    const releasePointer = (event) => {
        movePointerToKey(event, null);
        activePointers.delete(event.pointerId);
    };

    keyboard.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        activePointers.add(event.pointerId);
        keyboard.setPointerCapture(event.pointerId);
        movePointerToKey(event, keyAtPointer(event));
    });
    keyboard.addEventListener('pointermove', (event) => {
        if (activePointers.has(event.pointerId)) {
            movePointerToKey(event, keyAtPointer(event));
        }
    });
    keyboard.addEventListener('pointerup', releasePointer);
    keyboard.addEventListener('pointercancel', releasePointer);
    keyboard.addEventListener('lostpointercapture', releasePointer);
}

function midiTrackerSegments(notes) {
    const eventsByPitch = new Map();
    for (const note of notes) {
        const timing = midiTrackerNoteTiming(note);
        const events = eventsByPitch.get(note.midi) ?? [];
        events.push(
            {
                position: timing.start,
                trackIndex: note.trackIndex,
                change: 1,
            },
            {
                position: timing.start + timing.duration,
                trackIndex: note.trackIndex,
                change: -1,
            }
        );
        eventsByPitch.set(note.midi, events);
    }

    const segments = [];
    const lastSegments = new Map();
    for (const [midi, events] of eventsByPitch) {
        events.sort((left, right) => left.position - right.position);
        const activeTracks = new Map();
        let previousPosition = events[0].position;
        let previousGapStarts = new Set();
        let index = 0;
        while (index < events.length) {
            const position = events[index].position;
            let groupEnd = index;
            const eventTypes = new Map();
            while (
                groupEnd < events.length &&
                musicEngine.compareSheetPositions(
                    events[groupEnd].position,
                    position
                ) === 0
            ) {
                const event = events[groupEnd];
                const types = eventTypes.get(event.trackIndex) ?? {
                    attack: false,
                    release: false,
                };
                types.attack ||= event.change > 0;
                types.release ||= event.change < 0;
                eventTypes.set(event.trackIndex, types);
                groupEnd += 1;
            }
            const separatesNotes =
                [...eventTypes.values()].some((types) => types.attack) &&
                [...eventTypes.values()].some((types) => types.release);
            const gapStarts = new Set(
                separatesNotes
                    ? [...eventTypes]
                          .filter(([, types]) => types.attack)
                          .map(([trackIndex]) => trackIndex)
                    : []
            );
            const gapEnds = new Set(
                separatesNotes
                    ? [...eventTypes]
                          .filter(([, types]) => types.release)
                          .map(([trackIndex]) => trackIndex)
                    : []
            );
            const trackIndexes = [...activeTracks.keys()].sort(
                (left, right) => left - right
            );
            if (
                musicEngine.compareSheetPositions(position, previousPosition) >
                    0 &&
                trackIndexes.length
            ) {
                for (const [lane, trackIndex] of trackIndexes.entries()) {
                    const gapStart = previousGapStarts.has(trackIndex);
                    const gapEnd = gapEnds.has(trackIndex);
                    const key = `${midi}:${trackIndex}:${lane}:${trackIndexes.length}`;
                    const lastSegment = lastSegments.get(key);
                    if (
                        lastSegment &&
                        !lastSegment.gapEnd &&
                        !gapStart &&
                        musicEngine.compareSheetPositions(
                            lastSegment.start + lastSegment.duration,
                            previousPosition
                        ) === 0
                    ) {
                        lastSegment.duration = position - lastSegment.start;
                        lastSegment.gapEnd = gapEnd;
                    } else {
                        const segment = {
                            midi,
                            trackIndex,
                            start: previousPosition,
                            duration: position - previousPosition,
                            lane,
                            count: trackIndexes.length,
                            gapStart,
                            gapEnd,
                        };
                        segments.push(segment);
                        lastSegments.set(key, segment);
                    }
                }
            }

            while (index < groupEnd) {
                const event = events[index];
                const count =
                    (activeTracks.get(event.trackIndex) ?? 0) + event.change;
                if (count > 0) {
                    activeTracks.set(event.trackIndex, count);
                } else {
                    activeTracks.delete(event.trackIndex);
                }
                index += 1;
            }
            previousPosition = position;
            previousGapStarts = gapStarts;
        }
    }
    return segments.sort(
        (left, right) => left.start - right.start || left.midi - right.midi
    );
}

function midiTrackerSegmentIndexAtOrAfter(position) {
    let low = 0;
    let high = midiVisualizer.trackerSegments.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (midiVisualizer.trackerSegments[middle].start < position) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
}

function midiTrackerMarkerIndexAtOrAfter(position) {
    let low = 0;
    let high = midiVisualizer.trackerMarkers.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (midiVisualizer.trackerMarkers[middle].position < position) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
}

function midiMeasureDurationAtPosition(position) {
    let signature = midiVisualizer.signatureMap[0];
    for (const candidate of midiVisualizer.signatureMap) {
        if (candidate.position > position) {
            break;
        }
        signature = candidate;
    }
    return signature
        ? (signature.numerator * midiVisualizer.unitsPerQuarter * 4) /
              signature.denominator
        : midiVisualizer.unitsPerQuarter * 4;
}

function createMidiTrackerNote(segment) {
    const track = midiVisualizer.tracks.find(
        (candidate) => candidate.trackIndex === segment.trackIndex
    );
    const laneHeight = musicEngine.MIDI_TRACKER_ROW_HEIGHT_REM / segment.count;
    const inset = Math.min(0.06, laneHeight * 0.12);
    const bar = document.createElement('span');
    const rowIndex = midiVisualizer.trackerMaximumNote - segment.midi;
    const left =
        (segment.start / midiVisualizer.unitsPerQuarter) *
        musicEngine.MIDI_TRACKER_REM_PER_QUARTER;
    const baseWidth = Math.max(
        0.125,
        (segment.duration / midiVisualizer.unitsPerQuarter) *
            musicEngine.MIDI_TRACKER_REM_PER_QUARTER
    );
    const requestedLeftInset = segment.gapStart
        ? musicEngine.MIDI_TRACKER_NOTE_GAP_REM / 2
        : 0;
    const requestedRightInset = segment.gapEnd
        ? musicEngine.MIDI_TRACKER_NOTE_GAP_REM / 2
        : 0;
    const requestedInset = requestedLeftInset + requestedRightInset;
    const insetScale = requestedInset
        ? Math.min(1, (baseWidth - 0.0625) / requestedInset)
        : 1;
    const leftInset = requestedLeftInset * insetScale;
    const rightInset = requestedRightInset * insetScale;
    bar.className = `midi-tracker-note${track.enabled ? '' : ' is-disabled'}${track.previewed ? ' is-previewed' : ''}`;
    bar.dataset.midiTrackIndex = String(track.trackIndex);
    bar.style.setProperty('--midi-track-color', track.color);
    bar.style.left = `${left + leftInset}rem`;
    bar.style.width = `${baseWidth - leftInset - rightInset}rem`;
    bar.style.top = `${rowIndex * musicEngine.MIDI_TRACKER_ROW_HEIGHT_REM + segment.lane * laneHeight + inset}rem`;
    bar.style.height = `${laneHeight - inset * 2}rem`;
    bar.title = `${midiTrackLabel(track)}: ${musicEngine.noteNameFromMidi(segment.midi, 'sharp')}`;
    return bar;
}

function renderMidiTrackerNotes(
    position = midiVisualizer.position,
    force = false
) {
    const timeline = midiVisualizer.trackerTimeline;
    const visibleDuration = midiVisualizer.trackerVisibleDuration;
    if (!timeline || !visibleDuration) {
        return;
    }

    const measureDuration = midiMeasureDurationAtPosition(position);
    const wantedStart = position - measureDuration;
    const wantedEnd = position + visibleDuration + measureDuration;
    const refreshMargin = measureDuration / 4;
    if (
        !force &&
        wantedStart >= midiVisualizer.trackerWindowStart + refreshMargin &&
        wantedEnd <= midiVisualizer.trackerWindowEnd - refreshMargin
    ) {
        return;
    }
    const renderStart = wantedStart - refreshMargin * 2;
    const renderEnd = wantedEnd + refreshMargin * 2;
    midiVisualizer.trackerWindowStart = renderStart;
    midiVisualizer.trackerWindowEnd = renderEnd;
    const firstIndex = midiTrackerSegmentIndexAtOrAfter(renderStart);
    const renderedIndexes = new Set();
    for (
        let index = firstIndex - 1;
        index >= 0 &&
        midiVisualizer.trackerSegmentPrefixEnds[index] > renderStart;
        index -= 1
    ) {
        const segment = midiVisualizer.trackerSegments[index];
        if (segment.start + segment.duration > renderStart) {
            renderedIndexes.add(index);
        }
    }
    for (
        let index = firstIndex;
        index < midiVisualizer.trackerSegments.length;
        index += 1
    ) {
        const segment = midiVisualizer.trackerSegments[index];
        if (segment.start >= renderEnd) {
            break;
        }
        if (segment.start + segment.duration <= renderStart) {
            continue;
        }
        renderedIndexes.add(index);
    }
    for (const index of renderedIndexes) {
        if (!midiVisualizer.trackerSegmentElements.has(index)) {
            const segment = midiVisualizer.trackerSegments[index];
            const bar = createMidiTrackerNote(segment);
            midiVisualizer.trackerSegmentElements.set(index, bar);
            timeline.append(bar);
        }
    }

    for (const [index, bar] of midiVisualizer.trackerSegmentElements) {
        if (!renderedIndexes.has(index)) {
            bar.remove();
            midiVisualizer.trackerSegmentElements.delete(index);
        }
    }

    const firstMarkerIndex = midiTrackerMarkerIndexAtOrAfter(renderStart);
    const renderedMarkerIndexes = new Set();
    for (
        let index = firstMarkerIndex;
        index < midiVisualizer.trackerMarkers.length;
        index += 1
    ) {
        const marker = midiVisualizer.trackerMarkers[index];
        if (marker.position >= renderEnd) {
            break;
        }
        renderedMarkerIndexes.add(index);
        if (!midiVisualizer.trackerMarkerElements.has(index)) {
            const element = document.createElement('span');
            element.className = marker.className;
            element.style.left = `${(marker.position / midiVisualizer.unitsPerQuarter) * musicEngine.MIDI_TRACKER_REM_PER_QUARTER}rem`;
            element.textContent = marker.textContent;
            element.setAttribute('aria-hidden', 'true');
            midiVisualizer.trackerMarkerElements.set(index, element);
            timeline.append(element);
        }
    }
    for (const [index, marker] of midiVisualizer.trackerMarkerElements) {
        if (!renderedMarkerIndexes.has(index)) {
            marker.remove();
            midiVisualizer.trackerMarkerElements.delete(index);
        }
    }
}

function updateMidiTracker(
    position = midiVisualizer.position,
    flashAttacks = false
) {
    const timeline = midiVisualizer.trackerTimeline;
    if (!timeline) {
        return;
    }
    const quarterPosition = position / midiVisualizer.unitsPerQuarter;
    timeline.style.transform = `translateX(${-quarterPosition * musicEngine.MIDI_TRACKER_REM_PER_QUARTER}rem)`;
    renderMidiTrackerNotes(position);

    const enabledTrackIndexes = new Set(
        midiVisualizer.tracks
            .filter((track) => track.enabled)
            .map((track) => track.trackIndex)
    );
    const activePitches = new Set();
    const attackedPitches = new Set();
    for (const index of midiVisualizer.trackerSegmentElements.keys()) {
        const segment = midiVisualizer.trackerSegments[index];
        if (!enabledTrackIndexes.has(segment.trackIndex)) {
            continue;
        }
        if (
            position >= segment.start &&
            position < segment.start + segment.duration
        ) {
            activePitches.add(segment.midi);
        }
        if (
            flashAttacks &&
            musicEngine.compareSheetPositions(
                segment.start,
                midiVisualizer.trackerPosition
            ) > 0 &&
            musicEngine.compareSheetPositions(segment.start, position) <= 0
        ) {
            attackedPitches.add(segment.midi);
        }
    }
    for (const key of document.querySelectorAll('[data-midi-tracker-key]')) {
        const midi = Number(key.dataset.midiTrackerKey);
        key.classList.toggle('is-active', activePitches.has(midi));
        if (attackedPitches.has(midi)) {
            key.classList.remove('is-struck');
            void key.offsetWidth;
            key.classList.add('is-struck');
        }
    }
    midiVisualizer.trackerPosition = position;
}

function renderMidiTracker() {
    const tracker = document.getElementById('midi-tracker');
    midiVisualizer.trackerResizeObserver?.disconnect();
    midiVisualizer.trackerResizeObserver = null;
    midiVisualizer.trackerSegments = [];
    midiVisualizer.trackerSegmentElements = new Map();
    midiVisualizer.trackerMarkers = [];
    midiVisualizer.trackerMarkerElements = new Map();
    midiVisualizer.trackerSegmentPrefixEnds = [];
    midiVisualizer.trackerTimeline = null;
    midiVisualizer.trackerVisibleDuration = 0;
    midiVisualizer.trackerWindowEnd = -Infinity;
    midiVisualizer.trackerWindowStart = Infinity;
    tracker.replaceChildren();
    if (!midiVisualizer.notes.length) {
        tracker.hidden = true;
        return;
    }
    tracker.hidden = false;

    const minimumNote = Math.min(
        ...midiVisualizer.notes.map((note) => note.midi)
    );
    const maximumNote = Math.max(
        ...midiVisualizer.notes.map((note) => note.midi)
    );
    const pitchCount = maximumNote - minimumNote + 1;
    const height = pitchCount * musicEngine.MIDI_TRACKER_ROW_HEIGHT_REM;
    const stage = document.createElement('div');
    const keyboard = document.createElement('div');
    const roll = document.createElement('div');
    const rows = document.createElement('div');
    const timeline = document.createElement('div');
    const legend = document.createElement('ul');
    const segments = midiTrackerSegments(midiVisualizer.notes);
    const markers = [];
    midiVisualizer.trackerSegments = segments;
    midiVisualizer.trackerMaximumNote = maximumNote;
    let maximumSegmentEnd = -Infinity;
    midiVisualizer.trackerSegmentPrefixEnds = segments.map((segment) => {
        maximumSegmentEnd = Math.max(
            maximumSegmentEnd,
            segment.start + segment.duration
        );
        return maximumSegmentEnd;
    });
    stage.className = 'midi-tracker-stage';
    stage.setAttribute('role', 'img');
    stage.setAttribute(
        'aria-label',
        'Piano-roll tracker with notes moving from right to left'
    );
    keyboard.className = 'midi-tracker-keyboard';
    keyboard.style.height = `${height}rem`;
    roll.className = 'midi-tracker-roll';
    roll.style.height = `${height}rem`;
    rows.className = 'midi-tracker-rows';
    timeline.className = 'midi-tracker-timeline';
    timeline.style.height = `${height}rem`;
    timeline.style.width = `calc(100% + ${(midiVisualizer.total / midiVisualizer.unitsPerQuarter) * musicEngine.MIDI_TRACKER_REM_PER_QUARTER}rem)`;
    timeline.style.setProperty(
        '--midi-tracker-quarter-width',
        `${musicEngine.MIDI_TRACKER_REM_PER_QUARTER}rem`
    );
    legend.className = 'midi-tracker-legend';
    legend.setAttribute('aria-label', 'Instrument colors');

    let barlineCount = 0;
    for (
        let index = 0;
        index < midiVisualizer.signatureMap.length;
        index += 1
    ) {
        const signature = midiVisualizer.signatureMap[index];
        const nextSignature = midiVisualizer.signatureMap[index + 1];
        const end = nextSignature?.position ?? midiVisualizer.total;
        const measureDuration =
            (signature.numerator * midiVisualizer.unitsPerQuarter * 4) /
            signature.denominator;
        for (
            let position = signature.position;
            musicEngine.compareSheetPositions(position, end) < 0 &&
            barlineCount < musicEngine.MIDI_TRACKER_MAX_BARLINES;
            position += measureDuration
        ) {
            markers.push({
                className: 'midi-tracker-barline',
                position,
                textContent: '',
            });
            barlineCount += 1;
        }

        markers.push({
            className: 'midi-tracker-signature',
            position: signature.position,
            textContent: `${signature.numerator}/${signature.denominator}`,
        });
    }
    markers.sort(
        (left, right) =>
            left.position - right.position ||
            left.className.localeCompare(right.className)
    );
    midiVisualizer.trackerMarkers = markers;

    const blackPitchClasses = new Set([1, 3, 6, 8, 10]);
    for (let midi = maximumNote; midi >= minimumNote; midi -= 1) {
        const rowIndex = maximumNote - midi;
        const top = rowIndex * musicEngine.MIDI_TRACKER_ROW_HEIGHT_REM;
        const pitchClass = musicEngine.pitchClassFromMidi(midi);
        const key = document.createElement('button');
        const row = document.createElement('span');
        key.type = 'button';
        key.className = `midi-tracker-key${blackPitchClasses.has(pitchClass) ? ' is-black' : ''}`;
        key.dataset.midiTrackerKey = String(midi);
        key.style.top = `${top}rem`;
        key.title = musicEngine.noteNameFromMidi(midi, 'sharp');
        key.setAttribute('aria-label', `Play ${key.title}`);
        key.addEventListener('keydown', (event) => {
            if (!event.repeat && ['Enter', ' '].includes(event.key)) {
                event.preventDefault();
                strikeMidiTrackerKey(key);
            }
        });
        key.addEventListener('keyup', (event) => {
            if (['Enter', ' '].includes(event.key)) {
                event.preventDefault();
                releaseMidiTrackerKey(midi);
            }
        });
        key.addEventListener('blur', () => {
            releaseMidiTrackerKey(midi);
        });
        key.addEventListener('animationend', () => {
            key.classList.remove('is-struck');
        });
        if (pitchClass === 0) {
            key.textContent = musicEngine.noteNameFromMidi(midi);
        }
        row.className = `midi-tracker-row${blackPitchClasses.has(pitchClass) ? ' is-black' : ''}`;
        row.style.top = `${top}rem`;
        keyboard.append(key);
        rows.append(row);
    }
    initializeMidiTrackerKeyboard(keyboard);

    for (const track of midiVisualizer.tracks) {
        const item = document.createElement('li');
        const toggle = document.createElement('button');
        const swatch = document.createElement('span');
        const label = document.createElement('span');
        toggle.type = 'button';
        toggle.dataset.midiTrackerTrackIndex = String(track.trackIndex);
        toggle.setAttribute('aria-pressed', String(track.enabled));
        toggle.addEventListener('click', () => {
            setMidiTrackEnabled(track, !track.enabled);
        });
        toggle.addEventListener('pointerenter', () => {
            previewMidiTrack(track, true);
        });
        toggle.addEventListener('pointerleave', () => {
            previewMidiTrack(track, false);
        });
        swatch.className = 'midi-tracker-legend-swatch';
        swatch.style.setProperty('--midi-track-color', track.color);
        swatch.setAttribute('aria-hidden', 'true');
        label.className = 'midi-tracker-legend-label';
        label.textContent = midiTrackLabel(track);
        toggle.append(swatch, label);
        item.append(toggle);
        legend.append(item);
    }

    roll.append(rows, timeline);
    stage.append(keyboard, roll, legend);
    tracker.append(stage);
    midiVisualizer.trackerTimeline = timeline;
    const updateVisibleDuration = (width) => {
        const remPixels = Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize
        );
        midiVisualizer.trackerVisibleDuration =
            (width / remPixels / musicEngine.MIDI_TRACKER_REM_PER_QUARTER) *
            midiVisualizer.unitsPerQuarter;
        renderMidiTrackerNotes(midiVisualizer.position, true);
    };
    updateVisibleDuration(roll.clientWidth);
    midiVisualizer.trackerResizeObserver = new ResizeObserver(([entry]) => {
        updateVisibleDuration(entry.contentRect.width);
    });
    midiVisualizer.trackerResizeObserver.observe(roll);
    for (const track of midiVisualizer.tracks) {
        updateMidiTrackToggle(track);
    }
    updateMidiTracker();
}

// MIDI: parsing

function readMidiVariableLength(view, state, limit) {
    let value = 0;

    for (let index = 0; index < 4; index += 1) {
        if (state.offset >= limit) {
            throw new Error('The MIDI file ended unexpectedly.');
        }

        const byte = view.getUint8(state.offset);
        state.offset += 1;
        value = (value << 7) | (byte & 0x7f);

        if ((byte & 0x80) === 0) {
            return value;
        }
    }

    throw new Error('The MIDI file contains an invalid variable-length value.');
}

function midiChunkName(view, offset) {
    return String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
    );
}

function parseMidiFile(arrayBuffer) {
    const view = new DataView(arrayBuffer);

    if (view.byteLength < 14 || midiChunkName(view, 0) !== 'MThd') {
        throw new Error('Choose a Standard MIDI file.');
    }

    const headerLength = view.getUint32(4);
    if (headerLength < 6 || 8 + headerLength > view.byteLength) {
        throw new Error('The MIDI header is invalid.');
    }

    const format = view.getUint16(8);
    const trackCount = view.getUint16(10);
    const division = view.getUint16(12);

    if (format > 1) {
        throw new Error('MIDI format 2 is not supported.');
    }
    if ((division & 0x8000) !== 0) {
        throw new Error('SMPTE-timed MIDI files are not supported.');
    }
    if (division === 0 || trackCount === 0) {
        throw new Error('The MIDI file has no playable tracks.');
    }

    const channelEvents = [];
    const trackNames = Array.from(
        { length: trackCount },
        (_, index) => `Track ${index + 1}`
    );
    const tempoEvents = [];
    const signatureEvents = [];
    let durationTicks = 0;
    let offset = 8 + headerLength;

    for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
        if (
            offset + 8 > view.byteLength ||
            midiChunkName(view, offset) !== 'MTrk'
        ) {
            throw new Error('A MIDI track is missing or invalid.');
        }

        const trackLength = view.getUint32(offset + 4);
        const trackEnd = offset + 8 + trackLength;
        if (trackEnd > view.byteLength) {
            throw new Error('A MIDI track is incomplete.');
        }

        const state = { offset: offset + 8 };
        let tick = 0;
        let runningStatus = null;
        let eventIndex = 0;

        while (state.offset < trackEnd) {
            tick += readMidiVariableLength(view, state, trackEnd);
            const trackEventIndex = eventIndex;
            eventIndex += 1;

            let status = view.getUint8(state.offset);
            let firstData = null;
            if (status < 0x80) {
                if (runningStatus === null) {
                    throw new Error('The MIDI running status is invalid.');
                }
                status = runningStatus;
                firstData = view.getUint8(state.offset);
                state.offset += 1;
            } else {
                state.offset += 1;
            }

            if (status === 0xff) {
                runningStatus = null;
                if (state.offset >= trackEnd) {
                    throw new Error('A MIDI meta event is incomplete.');
                }
                const type = view.getUint8(state.offset);
                state.offset += 1;
                const length = readMidiVariableLength(view, state, trackEnd);
                const eventEnd = state.offset + length;
                if (eventEnd > trackEnd) {
                    throw new Error('A MIDI meta event is incomplete.');
                }
                if (type === 0x03 && length > 0) {
                    const name = new TextDecoder()
                        .decode(
                            new Uint8Array(arrayBuffer, state.offset, length)
                        )
                        .trim();
                    if (name) {
                        trackNames[trackIndex] = name;
                    }
                } else if (type === 0x51 && length === 3) {
                    tempoEvents.push({
                        tick,
                        trackIndex,
                        eventIndex: trackEventIndex,
                        microseconds:
                            (view.getUint8(state.offset) << 16) |
                            (view.getUint8(state.offset + 1) << 8) |
                            view.getUint8(state.offset + 2),
                    });
                } else if (type === 0x58 && length >= 2) {
                    signatureEvents.push({
                        tick,
                        trackIndex,
                        eventIndex: trackEventIndex,
                        numerator: view.getUint8(state.offset),
                        denominator: 2 ** view.getUint8(state.offset + 1),
                    });
                }
                state.offset = eventEnd;
                continue;
            }

            if (status === 0xf0 || status === 0xf7) {
                runningStatus = null;
                const length = readMidiVariableLength(view, state, trackEnd);
                state.offset += length;
                if (state.offset > trackEnd) {
                    throw new Error('A MIDI system event is incomplete.');
                }
                continue;
            }

            runningStatus = status;
            const command = status & 0xf0;
            const channel = status & 0x0f;
            const dataLength = command === 0xc0 || command === 0xd0 ? 1 : 2;
            const data1 =
                firstData ??
                (state.offset < trackEnd
                    ? view.getUint8(state.offset++)
                    : null);
            const data2 =
                dataLength === 2 && state.offset < trackEnd
                    ? view.getUint8(state.offset++)
                    : null;

            if (data1 === null || (dataLength === 2 && data2 === null)) {
                throw new Error('A MIDI channel event is incomplete.');
            }

            if (
                command === 0x80 ||
                command === 0x90 ||
                command === 0xb0 ||
                command === 0xc0
            ) {
                channelEvents.push({
                    tick,
                    trackIndex,
                    eventIndex: trackEventIndex,
                    channel,
                    command,
                    data1,
                    data2,
                });
            }
        }

        durationTicks = Math.max(durationTicks, tick);
        offset = trackEnd;
    }

    channelEvents.sort(
        (left, right) =>
            left.tick - right.tick ||
            left.trackIndex - right.trackIndex ||
            left.eventIndex - right.eventIndex
    );
    const channelPatches = Array.from({ length: 16 }, () => ({
        bankMSB: 0,
        bankLSB: 0,
        program: 0,
    }));
    const sustainPedals = Array(16).fill(false);
    const sustainedNotes = Array.from({ length: 16 }, () => []);
    const activeNotes = new Map();
    const notes = [];

    function releaseSustainedNotes(channel, tick) {
        for (const note of sustainedNotes[channel]) {
            note.soundingEndTick = Math.max(note.endTick, tick);
        }
        sustainedNotes[channel] = [];
    }

    for (const event of channelEvents) {
        const { channel, command, data1, data2, tick } = event;
        const patch = channelPatches[channel];
        if (command === 0xb0) {
            if (data1 === 0) {
                patch.bankMSB = data2;
            } else if (data1 === 32) {
                patch.bankLSB = data2;
            } else if (data1 === 64) {
                const sustained = data2 >= 64;
                if (sustainPedals[channel] && !sustained) {
                    releaseSustainedNotes(channel, tick);
                }
                sustainPedals[channel] = sustained;
            }
            continue;
        }
        if (command === 0xc0) {
            patch.program = data1;
            continue;
        }

        const midi = data1;
        const noteOn = command === 0x90 && data2 > 0;
        const key = `${channel}:${midi}`;
        const starts = activeNotes.get(key) ?? [];
        if (noteOn) {
            starts.push({
                ...event,
                midi,
                patch: {
                    ...patch,
                    isDrum: channel === musicEngine.MIDI_PERCUSSION_CHANNEL,
                },
            });
            activeNotes.set(key, starts);
        } else if (starts.length) {
            // MIDI note-off events do not identify one of several overlapping
            // same-key note-ons. Pair them oldest-first deterministically.
            const start = starts.shift();
            if (tick > start.tick) {
                const note = {
                    startTick: start.tick,
                    endTick: tick,
                    soundingEndTick: sustainPedals[channel] ? null : tick,
                    midi,
                    trackIndex: start.trackIndex,
                    channel,
                    patch: start.patch,
                };
                notes.push(note);
                if (sustainPedals[channel]) {
                    sustainedNotes[channel].push(note);
                }
            }
        }
    }

    for (let channel = 0; channel < sustainedNotes.length; channel += 1) {
        releaseSustainedNotes(channel, durationTicks);
    }

    if (!notes.length) {
        throw new Error('The MIDI file contains no complete notes.');
    }

    const tempoMapByTick = [{ tick: 0, microseconds: 500000 }];
    for (const event of tempoEvents.sort(
        (left, right) =>
            left.tick - right.tick ||
            left.trackIndex - right.trackIndex ||
            left.eventIndex - right.eventIndex
    )) {
        if (event.microseconds <= 0) {
            throw new Error('The MIDI file contains an invalid tempo.');
        }
        const previous = tempoMapByTick.at(-1);
        if (event.tick === previous.tick) {
            previous.microseconds = event.microseconds;
        } else {
            tempoMapByTick.push(event);
        }
    }
    const tempoMap = tempoMapByTick.filter(
        (event, index) =>
            index === 0 ||
            event.microseconds !== tempoMapByTick[index - 1].microseconds
    );

    let seconds = 0;
    for (let index = 0; index < tempoMap.length; index += 1) {
        const event = tempoMap[index];
        const previous = tempoMap[index - 1];
        if (previous) {
            seconds +=
                ((event.tick - previous.tick) / division) *
                (previous.microseconds / 1000000);
        }
        event.seconds = seconds;
    }
    const finalTempo = tempoMap.at(-1);
    const durationSeconds =
        finalTempo.seconds +
        ((durationTicks - finalTempo.tick) / division) *
            (finalTempo.microseconds / 1000000);

    const signatureMapByTick = [{ tick: 0, numerator: 4, denominator: 4 }];
    for (const event of signatureEvents.sort(
        (left, right) =>
            left.tick - right.tick ||
            left.trackIndex - right.trackIndex ||
            left.eventIndex - right.eventIndex
    )) {
        if (!event.numerator || !Number.isFinite(event.denominator)) {
            throw new Error(
                'The MIDI file contains an invalid time signature.'
            );
        }
        const previous = signatureMapByTick.at(-1);
        if (event.tick === previous.tick) {
            Object.assign(previous, event);
        } else {
            signatureMapByTick.push(event);
        }
    }
    const signatureMap = signatureMapByTick.filter(
        (event, index) =>
            index === 0 ||
            event.numerator !== signatureMapByTick[index - 1].numerator ||
            event.denominator !== signatureMapByTick[index - 1].denominator
    );
    const [signature] = signatureMap;

    return {
        notes,
        ticksPerQuarter: division,
        tempoMap: tempoMap.map(({ tick, microseconds, seconds }) => ({
            tick,
            microseconds,
            seconds,
        })),
        signatureMap: signatureMap.map(({ tick, numerator, denominator }) => ({
            tick,
            numerator,
            denominator,
        })),
        tempoMicroseconds: tempoMap[0].microseconds,
        durationSeconds,
        durationTicks,
        numerator: signature.numerator,
        denominator: signature.denominator,
        trackNames,
    };
}

// MIDI: sheet music

function midiDurationCandidates(denominator) {
    return musicEngine.NOTE_VALUES.flatMap((noteValue) => {
        const duration = denominator / noteValue.value;
        return [duration * musicEngine.SHEET_DOT_MULTIPLIER, duration];
    }).sort((left, right) => right - left);
}

function midiNoteSegments(beat, duration, meter) {
    const candidates = midiDurationCandidates(meter.denominator);
    const minimum = candidates.at(-1);
    const segments = [];
    let cursor = beat;
    let remaining = duration;

    while (remaining >= minimum / 2) {
        const withinBar = cursor % meter.units;
        const barRemaining = meter.units - withinBar || meter.units;
        const maximum = Math.min(remaining, barRemaining);
        const segmentDuration =
            candidates.find(
                (candidate) =>
                    musicEngine.compareSheetPositions(candidate, maximum) <= 0
            ) ?? minimum;
        segments.push({ beat: cursor, duration: segmentDuration });
        cursor += segmentDuration;
        remaining -= segmentDuration;
    }

    return segments;
}

function midiLedgerLines(note, clef) {
    const bottomLine = musicEngine.diatonicPositionFromMidi(
        musicEngine.CLEFS[clef].bottomLineMidi
    );
    const staffStep =
        musicEngine.diatonicPositionFromMidi(note.writtenMidi ?? note.midi) -
        bottomLine;
    return staffStep < 0
        ? Math.ceil(-staffStep / 2)
        : Math.ceil(Math.max(0, staffStep - 8) / 2);
}

function midiReadableNote(note, clef) {
    if (
        midiLedgerLines(note, clef) <= musicEngine.MIDI_MAX_DISPLAY_LEDGER_LINES
    ) {
        return note;
    }

    const bottomLine = musicEngine.diatonicPositionFromMidi(
        musicEngine.CLEFS[clef].bottomLineMidi
    );
    const staffStep =
        musicEngine.diatonicPositionFromMidi(note.midi) - bottomLine;
    const below = staffStep < 0;
    let writtenMidi = note.midi;
    let octaves = 0;

    do {
        writtenMidi += below ? 12 : -12;
        octaves += 1;
    } while (
        midiLedgerLines({ ...note, writtenMidi }, clef) >
        musicEngine.MIDI_MAX_DISPLAY_LEDGER_LINES
    );

    return {
        ...note,
        writtenMidi,
        octaveSymbol:
            octaves === 1
                ? below
                    ? '𝄷'
                    : '𝄶'
                : `${octaves * 7 + 1}${below ? 'mb' : 'ma'}`,
        octaveBelow: below,
    };
}

function midiClefFit(phrase, clef) {
    const ledgerLines = phrase.map((note) => midiLedgerLines(note, clef));
    return {
        clef,
        maximum: Math.max(...ledgerLines),
        total: ledgerLines.reduce((sum, count) => sum + count ** 2, 0),
    };
}

function midiTrackClef(phrase) {
    return ['treble', 'bass']
        .map((clef) => midiClefFit(phrase, clef))
        .sort(
            (left, right) =>
                left.maximum - right.maximum || left.total - right.total
        )[0];
}

function midiRestNotes(start, duration, meter) {
    const rests = [];
    let cursor = start;
    let remaining = duration;
    const withinBar = cursor % meter.units;
    if (withinBar > 0) {
        const leadingDuration = Math.min(remaining, meter.units - withinBar);
        rests.push(
            ...midiNoteSegments(cursor, leadingDuration, meter).map(
                (segment) => ({ ...segment, rest: true })
            )
        );
        cursor += leadingDuration;
        remaining -= leadingDuration;
    }
    if (musicEngine.compareSheetPositions(remaining, meter.units) >= 0) {
        const measures = musicEngine.sheetPositionFloor(remaining, meter.units);
        const restDuration = measures * meter.units;
        rests.push({
            beat: cursor,
            duration: restDuration,
            rest: true,
            multiMeasureRest: measures > 1,
            wholeMeasureRest: measures === 1,
        });
        cursor += restDuration;
        remaining -= restDuration;
    }
    if (musicEngine.compareSheetPositions(remaining, 0) > 0) {
        rests.push(
            ...midiNoteSegments(cursor, remaining, meter).map((segment) => ({
                ...segment,
                rest: true,
            }))
        );
    }
    return rests;
}

function midiPhraseWithRests(phrase, total, meter) {
    const intervals = phrase
        .map((note) => ({ start: note.beat, end: note.beat + note.duration }))
        .sort((left, right) => left.start - right.start);
    const rests = [];
    let cursor = 0;

    for (const interval of intervals) {
        if (interval.start > cursor) {
            rests.push(
                ...midiRestNotes(cursor, interval.start - cursor, meter)
            );
        }
        cursor = Math.max(cursor, interval.end);
    }
    if (cursor < total) {
        rests.push(...midiRestNotes(cursor, total - cursor, meter));
    }

    return [...phrase, ...rests].sort(
        (left, right) =>
            left.beat - right.beat || Number(left.rest) - Number(right.rest)
    );
}

function midiTrackScores(phrase, trackIndex, score) {
    const bestFit = midiTrackClef(phrase);
    const phrases = new Map();

    if (bestFit.maximum <= musicEngine.MIDI_MAX_LEDGER_LINES) {
        phrases.set(bestFit.clef, phrase);
    } else {
        for (const note of phrase) {
            const trebleLines = midiLedgerLines(note, 'treble');
            const bassLines = midiLedgerLines(note, 'bass');
            const clef =
                trebleLines === bassLines
                    ? note.midi < musicEngine.MIDI_NOTES.C4
                        ? 'bass'
                        : 'treble'
                    : trebleLines < bassLines
                      ? 'treble'
                      : 'bass';
            const clefPhrase = phrases.get(clef) ?? [];
            clefPhrase.push(note);
            phrases.set(clef, clefPhrase);
        }
    }

    return [...phrases]
        .sort(
            ([left], [right]) =>
                (left === 'treble' ? 0 : 1) - (right === 'treble' ? 0 : 1)
        )
        .map(([clef, clefPhrase]) => ({
            ...score,
            phrase: midiPhraseWithRests(
                clefPhrase.map((note) => midiReadableNote(note, clef)),
                score.total,
                score.meter
            ),
            clef,
            highlightState: null,
            selector: `#midi-visualize-track-${trackIndex + 1}-${clef}`,
        }));
}

function midiPercussionScore(phrase, trackIndex, score) {
    return {
        ...score,
        phrase: midiPhraseWithRests(
            phrase.map((note) => {
                const notation = musicEngine.MIDI_PERCUSSION_NOTATION[
                    note.midi
                ] ?? {
                    name: `Percussion ${note.midi}`,
                    staffStep: 5,
                    voice: 'lower',
                };
                return {
                    ...note,
                    percussionName: notation.name,
                    staffStep: notation.staffStep,
                    percussionNotehead: notation.notehead,
                    stemDirection: notation.voice === 'upper' ? 'up' : 'down',
                };
            }),
            score.total,
            score.meter
        ),
        clef: 'percussion',
        highlightState: null,
        selector: `#midi-visualize-track-${trackIndex + 1}-percussion`,
    };
}

function midiWrittenNotes(notes, meter) {
    return notes.map((note) => ({
        ...note,
        segments: midiNoteSegments(note.beat, note.duration, meter),
    }));
}

function midiWrittenArticulation(notes, meter) {
    const sixteenthDuration = meter.denominator / 16;
    const voices = new Map();
    const writtenNotes = notes.map((note) => ({ ...note }));

    for (const note of writtenNotes) {
        const percussionVoice =
            note.channel === musicEngine.MIDI_PERCUSSION_CHANNEL
                ? musicEngine.MIDI_PERCUSSION_NOTATION[note.midi]?.voice
                : null;
        const key = `${note.trackIndex}:${note.channel}:${percussionVoice ?? ''}`;
        const onsets = voices.get(key) ?? new Map();
        const onset = onsets.get(note.beat) ?? [];
        onset.push(note);
        onsets.set(note.beat, onset);
        voices.set(key, onsets);
    }

    for (const onsets of voices.values()) {
        const beats = [...onsets.keys()].sort((left, right) => left - right);
        for (let index = 0; index < beats.length - 1; index += 1) {
            const beat = beats[index];
            const onsetDuration = beats[index + 1] - beat;
            const notesAtOnset = onsets.get(beat);
            const notesAtNextOnset = onsets.get(beats[index + 1]);
            if (
                notesAtOnset.length !== 1 ||
                notesAtNextOnset.length !== 1 ||
                musicEngine.compareSheetPositions(
                    onsetDuration,
                    sixteenthDuration
                ) > 0
            ) {
                continue;
            }
            const [note] = notesAtOnset;
            const overlap = note.beat + note.duration - beats[index + 1];
            const shortArticulation =
                musicEngine.compareSheetPositions(
                    note.duration,
                    onsetDuration
                ) < 0;
            const shortOverlap =
                musicEngine.compareSheetPositions(overlap, 0) > 0 &&
                musicEngine.compareSheetPositions(overlap, sixteenthDuration) <=
                    0;
            if (shortArticulation || shortOverlap) {
                note.duration = onsetDuration;
                note.inferredWrittenDuration = true;
            }
        }
    }

    return writtenNotes;
}

function midiIntervalAtPosition(parsed, unitsPerQuarter, position) {
    const tick = (position / unitsPerQuarter) * parsed.ticksPerQuarter;
    let tempo = parsed.tempoMap[0];
    for (const event of parsed.tempoMap) {
        if (event.tick > tick) {
            break;
        }
        tempo = event;
    }
    return (tempo.microseconds / 1000000) * (4 / parsed.denominator);
}

function destroyMidiSheetViews() {
    for (const track of midiVisualizer.tracks) {
        for (const score of track.scores) {
            musicEngine.destroySheetScore(score);
        }
    }
}

function setMidiVisualization(parsed, fileName) {
    const signature = `${parsed.numerator}/${parsed.denominator}`;
    const meter = musicEngine.sheetMeter(signature);
    const unitsPerQuarter = parsed.denominator / 4;
    const quantum = parsed.denominator / 32;
    const signatureMap = parsed.signatureMap.map((event) => ({
        ...event,
        position: (event.tick / parsed.ticksPerQuarter) * unitsPerQuarter,
    }));
    const hasSignatureChanges = signatureMap.length > 1;
    const notes = midiWrittenNotes(
        midiWrittenArticulation(
            parsed.notes
                .map((note) => {
                    const start =
                        (note.startTick / parsed.ticksPerQuarter) *
                        unitsPerQuarter;
                    const end =
                        (note.endTick / parsed.ticksPerQuarter) *
                        unitsPerQuarter;
                    const soundingEnd =
                        ((note.soundingEndTick ?? note.endTick) /
                            parsed.ticksPerQuarter) *
                        unitsPerQuarter;
                    const beat = Math.round(start / quantum) * quantum;
                    const endBeat = Math.round(end / quantum) * quantum;
                    const duration = Math.max(quantum, endBeat - beat);

                    return {
                        beat,
                        duration,
                        performanceBeat: start,
                        performanceDuration: end - start,
                        soundingDuration: soundingEnd - start,
                        midi: note.midi,
                        rest: false,
                        trackIndex: note.trackIndex,
                        channel: note.channel,
                        patch: note.patch,
                    };
                })
                .sort(
                    (left, right) =>
                        left.beat - right.beat || left.midi - right.midi
                ),
            meter
        ),
        meter
    );
    const total = Math.max(...notes.map((note) => note.beat + note.duration));
    const playbackTotal = Math.max(
        total,
        (parsed.durationTicks / parsed.ticksPerQuarter) * unitsPerQuarter,
        ...notes.map((note) => note.performanceBeat + note.performanceDuration)
    );
    const bars = Math.max(1, Math.ceil(total / meter.units));
    const interval =
        (parsed.tempoMicroseconds / 1000000) * (4 / parsed.denominator);
    const bpm = Math.round(60000000 / parsed.tempoMicroseconds);
    const tempoLabel =
        parsed.tempoMap.length > 1 ? 'variable tempo' : `${bpm} BPM`;
    const tracks = parsed.trackNames.flatMap((name, trackIndex) => {
        const phrase = notes.filter((note) => note.trackIndex === trackIndex);
        if (!phrase.length) {
            return [];
        }
        const pitchedPhrase = phrase.filter(
            (note) => note.channel !== musicEngine.MIDI_PERCUSSION_CHANNEL
        );
        const percussionPhrase = phrase.filter(
            (note) => note.channel === musicEngine.MIDI_PERCUSSION_CHANNEL
        );
        const score = {
            signature,
            meter,
            bars,
            total,
            interval,
            intervalAtPosition: (position) =>
                midiIntervalAtPosition(parsed, unitsPerQuarter, position),
            remPerQuarter: musicEngine.MIDI_SHEET_REM_PER_QUARTER,
        };

        return [
            {
                name,
                trackIndex,
                color: midiTrackColor(trackIndex),
                channels: [...new Set(phrase.map((note) => note.channel))],
                patches: [
                    ...new Map(
                        phrase.map((note) => [
                            JSON.stringify(note.patch),
                            note.patch,
                        ])
                    ).values(),
                ],
                enabled: true,
                minimized: false,
                scores: hasSignatureChanges
                    ? []
                    : [
                          ...(pitchedPhrase.length
                              ? midiTrackScores(
                                    pitchedPhrase,
                                    trackIndex,
                                    score
                                )
                              : []),
                          ...(percussionPhrase.length
                              ? [
                                    midiPercussionScore(
                                        percussionPhrase,
                                        trackIndex,
                                        score
                                    ),
                                ]
                              : []),
                      ],
            },
        ];
    });
    tracks.sort(
        (left, right) =>
            Number(left.scores.length === 0) - Number(right.scores.length === 0)
    );
    const summaryParts = [
        `${tracks.length} track${tracks.length === 1 ? '' : 's'}`,
        `${notes.length} note${notes.length === 1 ? '' : 's'}`,
    ];
    if (hasSignatureChanges) {
        const meterChanges = signatureMap.length - 1;
        summaryParts.push(
            `${meterChanges} meter change${meterChanges === 1 ? '' : 's'}`
        );
    } else {
        summaryParts.push(signature);
    }
    summaryParts.push(tempoLabel);
    const summary = `${fileName}\n${summaryParts.join(', ')}`;

    destroyMidiSheetViews();
    Object.assign(midiVisualizer, {
        tracks,
        notes,
        total: playbackTotal,
        fileName,
        summary,
        position: 0,
        elapsed: 0,
        duration: parsed.durationSeconds,
        tempoMap: parsed.tempoMap,
        signatureMap,
        ticksPerQuarter: parsed.ticksPerQuarter,
        unitsPerQuarter,
        trackerPosition: 0,
    });
    synchronizeMidiTrackMutes();

    const tracksElement = document.getElementById('midi-visualize-tracks');
    const trackElements = tracks.map((track) => {
        const section = document.createElement('section');
        const body = document.createElement('div');
        const content = document.createElement('div');
        const toggle = document.createElement('button');
        const header = document.createElement('div');
        const heading = document.createElement('h4');
        const minimize = document.createElement('button');
        const minimizeIcon = document.createElement('span');
        const scoresElement = document.createElement('div');
        section.className = 'midi-visualize-track';
        section.dataset.midiTrackIndex = String(track.trackIndex);
        body.className = 'midi-visualize-track-body';
        content.className = 'midi-visualize-track-content';
        toggle.className = 'midi-visualize-track-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-pressed', 'true');
        toggle.setAttribute('aria-label', `Disable ${track.name}`);
        toggle.title = `Disable ${track.name}`;
        toggle.addEventListener('click', () => {
            setMidiTrackEnabled(track, !track.enabled);
        });
        header.className = 'midi-visualize-track-header';
        heading.className = 'midi-visualize-track-heading';
        heading.textContent = midiTrackLabel(track);
        minimize.className = 'icon-button midi-visualize-track-minimize';
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
        scoresElement.className = 'midi-visualize-track-scores';
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
        if (track.scores.length) {
            body.append(toggle, content);
        } else {
            body.append(content);
        }
        section.append(header, body);
        return section;
    });
    if (hasSignatureChanges) {
        const message = document.createElement('p');
        const trackerLink = document.createElement('a');
        message.className = 'practice-note';
        trackerLink.href = '#midi/tracker';
        trackerLink.textContent = 'Tracker';
        message.append(
            `Sheet music does not yet support time-signature changes. Use ${trackerLink} for this MIDI file.`
        );
        tracksElement.replaceChildren(message);
    } else {
        tracksElement.replaceChildren(...trackElements);
    }
    tracksElement.hidden = false;
    if (!hasSignatureChanges) {
        for (const track of tracks) {
            for (const score of track.scores) {
                musicEngine.renderSheetScore(score, score.selector, {
                    barGlide: true,
                    virtualize: true,
                });
            }
        }
    }
    renderMidiTracker();
    updateMidiMode();
    updateMidiTransport();
    setMidiStatus(summary);
}

function updateMidiTransport() {
    const hasFile = midiVisualizer.notes.length > 0;
    for (const row of document.querySelectorAll('.midi-visualize-time-row')) {
        row.hidden = !hasFile;
    }
    for (const seek of musicEngine.getControls('shared-midi-seek')) {
        seek.disabled = !hasFile || midiVisualizer.loading;
    }
    for (const play of musicEngine.getModuleActions('midi', 'play')) {
        play.disabled = !hasFile || midiVisualizer.loading;
        play.setAttribute('aria-pressed', String(midiVisualizer.active));
        play.setAttribute(
            'aria-label',
            midiVisualizer.active ? 'Pause MIDI' : 'Play MIDI'
        );
        play.title = midiVisualizer.active ? 'Pause' : 'Play';
    }
    for (const stop of musicEngine.getModuleActions('midi', 'stop')) {
        stop.disabled =
            !hasFile ||
            midiVisualizer.loading ||
            (!midiVisualizer.active && midiVisualizer.position === 0);
    }
    updateMidiTimer();
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

function updateMidiTimer() {
    const current = formatMidiTime(midiVisualizer.elapsed);
    const total = formatMidiTime(midiVisualizer.duration);
    for (const output of musicEngine.getOutputs('midi-current-time')) {
        output.textContent = current;
    }
    for (const output of musicEngine.getOutputs('midi-total-time')) {
        output.textContent = total;
    }
    for (const seek of musicEngine.getControls('shared-midi-seek')) {
        seek.max = String(midiVisualizer.duration);
        seek.value = String(midiVisualizer.elapsed);
        seek.setAttribute('aria-valuetext', `${current} of ${total}`);
    }
}

function seekMidiVisualization(event) {
    if (!midiVisualizer.notes.length) {
        return;
    }

    midiVisualizer.elapsed = musicEngine.clamp(
        Number(event.currentTarget.value),
        0,
        midiVisualizer.duration
    );
    midiVisualizer.position = musicEngine.clamp(
        midiPositionAtTime(midiVisualizer.elapsed),
        0,
        midiVisualizer.total
    );
    if (midiPlayback.loadedBuffer === midiVisualizer.buffer) {
        midiPlayback.sequencer.currentTime = midiVisualizer.elapsed;
    }
    if (midiPlayback.generatedTones) {
        musicEngine.audio.stopTransient();
        midiPlayback.generatedToneIndex = 0;
    }
    resetMidiScores(midiVisualizer.position);
    updateMidiTimer();
}

function midiPositionAtTime(seconds) {
    let tempo = midiVisualizer.tempoMap[0];
    for (const event of midiVisualizer.tempoMap) {
        if (event.seconds > seconds) {
            break;
        }
        tempo = event;
    }

    const ticks =
        tempo.tick +
        ((seconds - tempo.seconds) * 1000000 * midiVisualizer.ticksPerQuarter) /
            tempo.microseconds;
    return (
        (ticks / midiVisualizer.ticksPerQuarter) *
        midiVisualizer.unitsPerQuarter
    );
}

function midiTimeAtPosition(position) {
    const tick =
        (position / midiVisualizer.unitsPerQuarter) *
        midiVisualizer.ticksPerQuarter;
    let tempo = midiVisualizer.tempoMap[0];
    for (const event of midiVisualizer.tempoMap) {
        if (event.tick > tick) {
            break;
        }
        tempo = event;
    }

    return (
        tempo.seconds +
        ((tick - tempo.tick) / midiVisualizer.ticksPerQuarter) *
            (tempo.microseconds / 1000000)
    );
}

function midiSheetHighlightState(notation) {
    if (notation.highlightState) {
        return notation.highlightState;
    }

    const starts = notation.phrase
        .map((note, index) => {
            const start = note.performanceBeat ?? note.beat;
            const duration = note.soundingDuration ?? note.duration;

            return { end: start + duration, index, start };
        })
        .sort(
            (left, right) =>
                left.start - right.start || left.index - right.index
        );
    let maximumEnd = -Infinity;
    const prefixEnds = starts.map(({ end }) => {
        maximumEnd = Math.max(maximumEnd, end);
        return maximumEnd;
    });
    const ends = [...starts].sort(
        (left, right) => left.end - right.end || left.index - right.index
    );
    notation.highlightState = {
        active: new Set(),
        ends,
        nextEnd: 0,
        nextStart: 0,
        position: -Infinity,
        prefixEnds,
        starts,
    };

    return notation.highlightState;
}

function midiEventUpperBound(events, position, property) {
    let low = 0;
    let high = events.length;

    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (events[middle][property] <= position) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    return low;
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
    for (const element of notation.sheetView.noteElements[index]) {
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

function resetMidiScores(position = 0) {
    for (const track of midiVisualizer.tracks) {
        for (const score of track.scores) {
            musicEngine.positionSheetLane(score, score.selector, position);
            resetMidiSheetHighlights(score);
        }
    }
    updateMidiTracker(position);
}

// MIDI: playback

async function initializeMidiSynthesizer() {
    if (!midiPlayback.initializePromise) {
        midiPlayback.initializePromise = (async () => {
            const context = musicEngine.audio.getContext();
            let spessaSynth;
            if (window.location.protocol === 'file:') {
                await loadScript('assets/vendor/spessasynth_lib/js/browser.js');
                spessaSynth = globalThis.SpessaSynth;
                await loadScript(
                    'assets/vendor/spessasynth_lib/js/processor.js'
                );
                await context.audioWorklet.addModule(
                    `data:text/javascript;base64,${btoa(globalThis.spessaSynthProcessorSource)}`
                );
            } else {
                spessaSynth =
                    await import('../vendor/spessasynth_lib/js/index.js');
                await context.audioWorklet.addModule(
                    'assets/vendor/spessasynth_lib/js/spessasynth_processor.min.js'
                );
            }
            const { Sequencer, WorkletSynthesizer } = spessaSynth;
            const synth = new WorkletSynthesizer(context);
            synth.connect(musicEngine.audio.getDestination());
            await synth.isReady;

            const sequencer = new Sequencer(synth, {
                skipToFirstNoteOn: false,
            });
            sequencer.eventHandler.addEvent(
                'songEnded',
                'midi-visualize',
                () => {
                    if (midiVisualizer.active) {
                        pauseMidiVisualization('Complete');
                    }
                }
            );
            midiPlayback.synth = synth;
            midiPlayback.sequencer = sequencer;
            synchronizeMidiTrackMutes();
        })().catch((error) => {
            midiPlayback.initializePromise = null;
            throw error;
        });
    }

    await midiPlayback.initializePromise;
}

async function loadSoundFont() {
    const control = musicEngine.getControl('shared-soundfont');
    const soundFontId = control.value;
    if (midiPlayback.soundFontId === soundFontId) {
        return true;
    }
    if (midiPlayback.soundFontPromise) {
        const loaded = await midiPlayback.soundFontPromise;
        if (midiPlayback.soundFontId === soundFontId) {
            return loaded;
        }
        return loadSoundFont();
    }

    const name = control.selectedOptions[0]?.textContent ?? soundFontId;
    const hideLoading = showSoundFontLoading(name);
    midiPlayback.soundFontPromise = (async () => {
        const localSoundFont = localSoundFonts.get(soundFontId);
        if (!localSoundFont && !bundledSoundFonts.includes(soundFontId)) {
            return false;
        }

        let soundFontBuffer;
        if (localSoundFont) {
            soundFontBuffer = await localSoundFont.file.arrayBuffer();
        } else if (window.location.protocol === 'file:') {
            await loadScript(soundFontPath(soundFontId, 'js'));
            soundFontBuffer = base64ToArrayBuffer(
                globalThis.soundFontData[soundFontId]
            );
        } else {
            const response = await fetch(
                soundFontPath(soundFontId, soundFontExtension(soundFontId))
            );
            if (!response.ok) {
                throw new Error(`Unable to load ${soundFontId}.`);
            }
            soundFontBuffer = await response.arrayBuffer();
        }

        const soundBankManager = midiPlayback.synth.soundBankManager;
        const previousSoundFontId = midiPlayback.soundFontId;
        await soundBankManager.addSoundBank(soundFontBuffer, soundFontId);
        if (previousSoundFontId && previousSoundFontId !== soundFontId) {
            await soundBankManager.deleteSoundBank(previousSoundFontId);
        }
        soundBankManager.priorityOrder = [
            soundFontId,
            ...soundBankManager.priorityOrder.filter(
                (id) => id !== soundFontId
            ),
        ];
        midiPlayback.soundFontId = soundFontId;
        updateMidiTrackLabels();
        return true;
    })();

    try {
        return await midiPlayback.soundFontPromise;
    } finally {
        midiPlayback.soundFontPromise = null;
        hideLoading();
    }
}

async function loadLocalSoundFont(file, reportControl) {
    const soundFontId = file.name;
    const previousSoundFontId =
        musicEngine.getControl('shared-soundfont').value;
    const previousLocalSoundFont = localSoundFonts.get(soundFontId);
    const soundFont = {
        file,
        label: `Custom (${file.name})`,
    };
    const resumeMidi = pauseForSoundFontChange();
    const hideLoading = showSoundFontLoading(
        file.name,
        reportControl.closest('.field')
    );

    localSoundFonts.set(soundFontId, soundFont);
    addSoundFontOption(soundFontId, soundFont.label);
    midiPlayback.loadedBuffer = null;

    try {
        const buffer = await file.arrayBuffer();
        soundFont.label = `Custom (${soundFontName(buffer) ?? file.name})`;
        addSoundFontOption(soundFontId, soundFont.label);
        await initializeMidiSynthesizer();
        if (midiPlayback.soundFontPromise) {
            await midiPlayback.soundFontPromise;
        }
        await loadSoundFont();
        await reloadLoadedMidiSequence();
    } catch (error) {
        if (previousLocalSoundFont) {
            localSoundFonts.set(soundFontId, previousLocalSoundFont);
            addSoundFontOption(soundFontId, previousLocalSoundFont.label);
        } else {
            localSoundFonts.delete(soundFontId);
            removeSoundFontOption(soundFontId);
        }
        for (const select of musicEngine.getControls('shared-soundfont')) {
            select.value = previousSoundFontId;
        }
        try {
            await loadSoundFont();
            await reloadLoadedMidiSequence();
        } catch {
            // Preserve the original SoundFont error below.
        }
        const message =
            error instanceof Error
                ? error.message
                : 'Unable to load the SoundFont.';
        reportControl.setCustomValidity(message);
        reportControl.reportValidity();
    } finally {
        if (resumeMidi) {
            await playMidiVisualization();
        }
        hideLoading();
    }
}

async function loadMidiSequence() {
    if (midiPlayback.loadedBuffer === midiVisualizer.buffer) {
        return;
    }

    const buffer = midiVisualizer.buffer;
    const sequencer = midiPlayback.sequencer;
    await new Promise((resolve) => {
        const eventId = 'midi-visualize-load';
        sequencer.eventHandler.addEvent('songChange', eventId, () => {
            sequencer.eventHandler.removeEvent('songChange', eventId);
            resolve();
        });
        sequencer.loadNewSongList([
            {
                binary: buffer.slice(0),
                fileName: midiVisualizer.fileName,
            },
        ]);
    });
    midiPlayback.loadedBuffer = buffer;
}

async function reloadLoadedMidiSequence() {
    if (!midiVisualizer.buffer) {
        return;
    }
    midiPlayback.loadedBuffer = null;
    await loadMidiSequence();
    synchronizeMidiTrackMutes();
}

function pauseForSoundFontChange() {
    const resumeMidi = midiVisualizer.active;
    if (resumeMidi) {
        pauseMidiVisualization();
    }
    stopMidiTrackerPianoVoices();
    stopTuner();
    stopRhythm();
    musicEngine.audio.stopTransient();
    return resumeMidi;
}

async function changeSoundFont(control) {
    const resumeMidi = pauseForSoundFontChange();
    const name = control.selectedOptions[0]?.textContent ?? control.value;
    const hideLoading = showSoundFontLoading(name, control.closest('.field'));
    midiPlayback.loadedBuffer = null;

    try {
        await initializeMidiSynthesizer();
        await loadSoundFont();
        await reloadLoadedMidiSequence();
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : 'Unable to load the SoundFont.';
        control.setCustomValidity(message);
        control.reportValidity();
    } finally {
        if (resumeMidi) {
            await playMidiVisualization();
        }
        hideLoading();
    }
}

async function prepareMidiPlayback() {
    const context = musicEngine.audio.getContext();
    if (context.state === 'suspended') {
        await context.resume();
    }
    await Promise.all([loadMidiAssets(), initializeMidiSynthesizer()]);
    const soundFontLoaded = await loadSoundFont();
    midiPlayback.generatedTones = !soundFontLoaded;
    midiPlayback.generatedToneNotes = midiPlayback.generatedTones
        ? midiVisualizer.notes
              .map((note) => {
                  const startPosition = note.performanceBeat ?? note.beat;
                  const endPosition =
                      startPosition +
                      (note.soundingDuration ??
                          note.performanceDuration ??
                          note.duration);
                  return {
                      start: midiTimeAtPosition(startPosition),
                      end: midiTimeAtPosition(endPosition),
                      midi: note.midi,
                      channel: note.channel,
                      trackIndex: note.trackIndex,
                  };
              })
              .sort((left, right) => left.start - right.start)
        : [];
    midiPlayback.generatedToneIndex = 0;
    await loadMidiSequence();
    synchronizeMidiTrackMutes();
    return midiPlayback.sequencer;
}

function scheduleMidiGeneratedTones(elapsed) {
    if (!midiPlayback.generatedTones) {
        return;
    }

    const scheduleUntil = elapsed + musicEngine.PLAYBACK_SCHEDULE_AHEAD_SECONDS;
    while (
        midiPlayback.generatedToneIndex <
            midiPlayback.generatedToneNotes.length &&
        midiPlayback.generatedToneNotes[midiPlayback.generatedToneIndex].start <
            scheduleUntil
    ) {
        const note =
            midiPlayback.generatedToneNotes[midiPlayback.generatedToneIndex];
        midiPlayback.generatedToneIndex += 1;
        const track = midiVisualizer.tracks.find(
            (candidate) => candidate.trackIndex === note.trackIndex
        );
        if (!track?.enabled || note.end <= elapsed) {
            continue;
        }

        const delay = Math.max(0, note.start - elapsed);
        const duration = Math.max(
            0.03,
            Math.min(
                note.end - Math.max(note.start, elapsed),
                note.channel === 9 ? 0.08 : Infinity
            )
        );
        musicEngine.audio.playTransient(
            musicEngine.frequencyFromMidi(note.midi),
            'triangle',
            duration,
            musicEngine.MIDI_GENERATED_TONE_VOLUME,
            delay
        );
    }
}

function drawMidiVisualization() {
    if (!midiVisualizer.active) {
        return;
    }

    midiVisualizer.elapsed = musicEngine.clamp(
        midiPlayback.sequencer.currentHighResolutionTime,
        0,
        midiVisualizer.duration
    );
    const position = midiPositionAtTime(midiVisualizer.elapsed);
    midiVisualizer.position = position;
    scheduleMidiGeneratedTones(midiVisualizer.elapsed);
    updateMidiTimer();
    for (const track of midiVisualizer.tracks) {
        for (const score of track.scores) {
            musicEngine.positionSheetLane(score, score.selector, position);
            updateMidiSheetHighlights(score, position);
        }
    }
    updateMidiTracker(position, true);

    if (midiPlayback.sequencer.isFinished) {
        pauseMidiVisualization('Complete');
        return;
    }
    midiVisualizer.frame = requestAnimationFrame(drawMidiVisualization);
}

async function playMidiVisualization() {
    if (!midiVisualizer.notes.length || midiVisualizer.loading) {
        return;
    }

    stopTuner();
    stopRhythm();
    stopMidiTrackerPianoVoices();
    musicEngine.audio.stopTransient();
    midiVisualizer.loading = true;
    const playRequest = ++midiVisualizer.playRequest;
    updateMidiTransport();

    try {
        const buffer = midiVisualizer.buffer;
        const sequencer = await prepareMidiPlayback();
        if (
            buffer !== midiVisualizer.buffer ||
            playRequest !== midiVisualizer.playRequest
        ) {
            return;
        }

        if (
            sequencer.isFinished ||
            midiVisualizer.elapsed >= midiVisualizer.duration
        ) {
            sequencer.currentTime = 0;
            midiVisualizer.position = 0;
            midiVisualizer.elapsed = 0;
            resetMidiScores();
        } else if (midiVisualizer.elapsed > 0) {
            sequencer.currentTime = midiVisualizer.elapsed;
        }
        midiPlayback.generatedToneIndex = 0;
        sequencer.play();
        midiVisualizer.active = true;
        setMidiStatus(midiVisualizer.summary);
        drawMidiVisualization();
    } catch (error) {
        setMidiStatus(
            error instanceof Error
                ? error.message
                : 'Unable to start MIDI playback.'
        );
    } finally {
        midiVisualizer.loading = false;
        updateMidiTransport();
    }
}

function pauseMidiVisualization(status = 'Paused') {
    if (!midiVisualizer.active) {
        return;
    }

    midiPlayback.sequencer?.pause();
    midiVisualizer.position = musicEngine.clamp(
        midiPlayback.sequencer
            ? midiPositionAtTime(
                  midiPlayback.sequencer.currentHighResolutionTime
              )
            : midiVisualizer.position,
        0,
        midiVisualizer.total
    );
    midiVisualizer.elapsed = musicEngine.clamp(
        midiPlayback.sequencer?.currentHighResolutionTime ??
            midiVisualizer.elapsed,
        0,
        midiVisualizer.duration
    );
    if (status === 'Complete') {
        midiVisualizer.position = midiVisualizer.total;
        midiVisualizer.elapsed = midiVisualizer.duration;
    }
    midiVisualizer.active = false;
    if (midiPlayback.generatedTones) {
        musicEngine.audio.stopTransient();
        midiPlayback.generatedToneIndex = 0;
    }
    cancelAnimationFrame(midiVisualizer.frame);
    midiVisualizer.frame = null;
    resetMidiScores(midiVisualizer.position);
    updateMidiTransport();
    setMidiStatus(midiVisualizer.summary);
}

function toggleMidiVisualization() {
    if (midiVisualizer.active) {
        pauseMidiVisualization();
    } else {
        void playMidiVisualization();
    }
}

function stopMidiVisualization() {
    const hadPosition = midiVisualizer.active || midiVisualizer.position > 0;
    midiVisualizer.playRequest += 1;
    midiVisualizer.active = false;
    cancelAnimationFrame(midiVisualizer.frame);
    midiVisualizer.frame = null;
    if (midiPlayback.sequencer) {
        midiPlayback.sequencer.pause();
        midiPlayback.sequencer.currentTime = 0;
    }
    if (midiPlayback.generatedTones) {
        musicEngine.audio.stopTransient();
        midiPlayback.generatedToneIndex = 0;
    }
    if (!midiVisualizer.notes.length) {
        return;
    }

    midiVisualizer.position = 0;
    midiVisualizer.elapsed = 0;
    resetMidiScores();
    updateMidiTransport();
    if (hadPosition) {
        setMidiStatus(midiVisualizer.summary);
    }
}

async function loadMidiVisualization(file, included = false) {
    stopAllAudio();
    if (!included) {
        for (const select of musicEngine.getControls('shared-midi-library')) {
            select.value = '';
        }
    }
    const loadRequest = ++midiVisualizer.loadRequest;
    setMidiStatus(`Loading ${file.name}...`);

    try {
        const buffer = await file.arrayBuffer();
        if (loadRequest !== midiVisualizer.loadRequest) {
            return;
        }
        const parsed = parseMidiFile(buffer);
        midiVisualizer.buffer = buffer;
        midiPlayback.loadedBuffer = null;
        setMidiVisualization(parsed, file.name);
        void Promise.all([loadSoundFontCatalog(), initializeMidiSynthesizer()])
            .then(loadSoundFont)
            .catch(() => undefined);
    } catch (error) {
        if (loadRequest !== midiVisualizer.loadRequest) {
            return;
        }
        destroyMidiSheetViews();
        midiVisualizer.notes = [];
        midiVisualizer.tracks = [];
        const tracksElement = document.getElementById('midi-visualize-tracks');
        tracksElement.replaceChildren();
        tracksElement.hidden = true;
        const tracker = document.getElementById('midi-tracker');
        midiVisualizer.trackerResizeObserver?.disconnect();
        midiVisualizer.trackerResizeObserver = null;
        midiVisualizer.trackerSegments = [];
        midiVisualizer.trackerSegmentElements = new Map();
        midiVisualizer.trackerMarkers = [];
        midiVisualizer.trackerMarkerElements = new Map();
        midiVisualizer.trackerSegmentPrefixEnds = [];
        midiVisualizer.trackerTimeline = null;
        midiVisualizer.trackerVisibleDuration = 0;
        midiVisualizer.trackerWindowEnd = -Infinity;
        midiVisualizer.trackerWindowStart = Infinity;
        tracker.replaceChildren();
        tracker.hidden = true;
        midiVisualizer.position = 0;
        midiVisualizer.total = 0;
        midiVisualizer.trackerPosition = 0;
        midiVisualizer.elapsed = 0;
        midiVisualizer.duration = 0;
        midiVisualizer.active = false;
        midiVisualizer.buffer = null;
        midiVisualizer.signatureMap = [];
        updateMidiMode();
        updateMidiTransport();
        setMidiStatus(
            error instanceof Error
                ? error.message
                : 'Unable to read the MIDI file.'
        );
    }
}

function isMidiFile(file) {
    return (
        /\.(?:mid|midi)$/i.test(file.name) ||
        ['audio/midi', 'audio/x-midi'].includes(file.type)
    );
}

function midiFilePath(file, script = false) {
    return script ? assetPath(file, 'js') : file;
}

async function loadIncludedMidi(filePath) {
    const name = assetFileName(filePath);
    const file = {
        name,
        async arrayBuffer() {
            if (window.location.protocol === 'file:') {
                await loadScript(midiFilePath(filePath, true));
                const encoded = globalThis.midiData?.[assetName(filePath)];
                if (!encoded) {
                    throw new Error(`Unable to load ${name}.`);
                }
                return base64ToArrayBuffer(encoded);
            }

            const response = await fetch(midiFilePath(filePath));
            if (!response.ok) {
                throw new Error(`Unable to load ${name}.`);
            }
            return response.arrayBuffer();
        },
    };
    await loadMidiVisualization(file, true);
}

function isSoundFontFile(file) {
    return /\.(?:sf2|sf3)$/i.test(file.name);
}

async function loadDroppedFiles(dropZone, files) {
    const midiDropZone = dropZone.closest('[data-panel="midi"]');
    const soundFontControl = dropZone.querySelector(
        '[data-control="shared-soundfont"]'
    );
    const soundFontFile = files.find(isSoundFontFile);
    const midiFile = midiDropZone ? files.find(isMidiFile) : null;

    if (!soundFontFile && !midiFile) {
        if (midiDropZone) {
            setMidiStatus(
                'Drop a MIDI file (.mid or .midi) or SoundFont (.sf2 or .sf3).'
            );
        } else {
            soundFontControl.setCustomValidity(
                'Drop a SoundFont file (.sf2 or .sf3).'
            );
            soundFontControl.reportValidity();
        }
        return;
    }

    soundFontControl.setCustomValidity('');
    if (soundFontFile) {
        await loadLocalSoundFont(soundFontFile, soundFontControl);
    }
    if (midiFile) {
        await loadMidiVisualization(midiFile);
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

const rhythmSheet = {
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
    soundFontReady: false,
    soundFontRequest: 0,
    soundFontMutedUntil: 0,
    soundFontNoteOffs: [],
};

const rhythmSheetMicrophoneInput = musicEngine.createMicrophoneInput({
    minimumMidi: musicEngine.MINIMUM_SUPPORTED_MIDI,
    maximumMidi: musicEngine.MAXIMUM_SUPPORTED_MIDI,
    sampleIntervalMs: musicEngine.RHYTHM_SHEET_ANALYSIS_INTERVAL_MS,
    processFrame: processRhythmSheetMicrophoneFrame,
    onDeactivate: handleRhythmSheetMicrophoneDeactivation,
    initialState: {
        stableFrames: 0,
        silentFrames: 0,
        detectedFrequencies: [],
        voiceStartedAt: null,
        silenceStartedAt: null,
    },
});

// Rhythm: sheet music

function rhythmSheetEnabled() {
    return sectionView('rhythm') === 'sheet';
}

function rhythmSheetClef() {
    return musicEngine.CLEFS[musicEngine.getControl('rhythm-sheet-clef').value];
}

function randomRhythmSheetMidi(previousMidi = null) {
    const clef = rhythmSheetClef();
    const chromatic =
        musicEngine.getControl('rhythm-sheet-pitches').value === 'chromatic';
    const pitches = [];

    for (let midi = clef.minimumMidi; midi <= clef.maximumMidi; midi += 1) {
        if (
            chromatic ||
            musicEngine.PITCH_CLASS_NAMES[musicEngine.pitchClassFromMidi(midi)]
                .natural
        ) {
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

function rhythmClickInterval(signature, bpm) {
    return (
        60 /
        bpm /
        (musicEngine.sheetMeter(signature).compound
            ? musicEngine.SHEET_COMPOUND_SUBDIVISIONS
            : 1)
    );
}

function randomRhythmPattern(patterns) {
    return patterns[Math.floor(Math.random() * patterns.length)];
}

function rhythmBeatPattern(denominator, allowSixteenths) {
    const supportedDurations = new Set(
        musicEngine.NOTE_VALUES.map(({ value }) => denominator / value)
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
        ? musicEngine.RHYTHM_SHEET_SIXTEENTH_PATTERN_RATE
        : 0;
    const roll = Math.random();

    if (
        sixteenthPatternSupported &&
        roll < musicEngine.RHYTHM_SHEET_SIXTEENTH_PATTERN_RATE
    ) {
        const paired =
            Math.random() < musicEngine.RHYTHM_SHEET_SIXTEENTH_PAIR_RATE;
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
        roll <
            eighthPatternStart + musicEngine.RHYTHM_SHEET_EIGHTH_PATTERN_RATE &&
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
    const sustainedPatterns = musicEngine.NOTE_VALUES.flatMap(({ value }) => {
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
                duration * (dotted ? musicEngine.SHEET_DOT_MULTIPLIER : 1);
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
        Math.random() < musicEngine.RHYTHM_SHEET_SUSTAINED_PATTERN_RATE
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

function addRhythmTie() {
    if (Math.random() >= musicEngine.RHYTHM_SHEET_TIE_RATE) {
        return;
    }

    const { units, denominator } = rhythmSheet.meter;
    const minimumSegmentDuration = denominator / 8;
    const candidates = [];

    for (
        let boundary = units;
        boundary < rhythmSheet.total;
        boundary += units
    ) {
        const previousIndex = rhythmSheet.phrase.findIndex(
            (note) => note.beat + note.duration === boundary
        );
        const nextIndex = rhythmSheet.phrase.findIndex(
            (note) => note.beat === boundary
        );

        if (previousIndex < 0 || nextIndex < 0) {
            continue;
        }

        const previous = rhythmSheet.phrase[previousIndex];
        const next = rhythmSheet.phrase[nextIndex];
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
    const previous = rhythmSheet.phrase[previousIndex];
    const next = rhythmSheet.phrase[nextIndex];

    previous.segments = [
        { beat: previous.beat, duration: previous.duration },
        { beat: next.beat, duration: next.duration },
    ];
    previous.duration += next.duration;
    rhythmSheet.phrase.splice(nextIndex, 1);
}

function newRhythmPhrase() {
    stopAllAudio();
    rhythmSheet.signature = musicEngine.getControl(
        'shared-time-signature'
    ).value;
    rhythmSheet.meter = musicEngine.sheetMeter(rhythmSheet.signature);
    const { units, denominator } = rhythmSheet.meter;
    rhythmSheet.bars = Number(
        musicEngine.getControl('rhythm-sheet-bars').value
    );
    rhythmSheet.clef = musicEngine.getControl('rhythm-sheet-clef').value;
    rhythmSheet.total = units * rhythmSheet.bars;
    rhythmSheet.phrase = [];
    const includeDots =
        musicEngine.getControl('rhythm-sheet-note-values').value ===
        'all-dotted';
    const groups = rhythmGroups(musicEngine.METERS[rhythmSheet.signature]);
    const limits = { sixteenthGroupUsed: false };
    let previousMidi = null;
    for (let bar = 0; bar < rhythmSheet.bars; bar += 1) {
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
                const midi = rest ? null : randomRhythmSheetMidi(previousMidi);
                previousMidi = midi ?? previousMidi;
                rhythmSheet.phrase.push({
                    beat,
                    duration,
                    rest,
                    midi,
                    attack: null,
                    release: null,
                    pitchFrequency: null,
                    pitchError: null,
                    pitchSamples: [],
                });
                beat += duration;
            }
        }
    }
    addRhythmTie();
    renderRhythmSheet();
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

function playRhythmInputSound() {
    // A rounded tone distinct from the metronome, with enough duration to hear.
    musicEngine.audio.playTransient(520, 'triangle', 0.055, 0.5);
}

function handleRhythmSheetMicrophoneDeactivation({ reason }) {
    if (rhythmSheet.input === 'microphone') {
        releaseRhythm('microphone');
    }

    rhythmSheetMicrophoneInput.stableFrames = 0;
    rhythmSheetMicrophoneInput.silentFrames = 0;
    rhythmSheetMicrophoneInput.detectedFrequencies = [];
    rhythmSheetMicrophoneInput.voiceStartedAt = null;
    rhythmSheetMicrophoneInput.silenceStartedAt = null;
    renderRhythmSheetPitch();

    if (reason === 'microphone-paused' && rhythm.running) {
        stopRhythm();
    }
}

function addRhythmSheetPitchSample(frequency) {
    if (!rhythmSheet.held || !Number.isFinite(frequency)) {
        return;
    }

    rhythmSheet.held.pitchSamples.push(frequency);
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

function processRhythmSheetMicrophoneFrame({
    samples,
    sampleRate,
    samplesUpdated,
}) {
    if (!samplesUpdated) {
        return;
    }

    const microphone = rhythmSheetMicrophoneInput;

    const frequency = detectPitchYin(
        samples,
        sampleRate,
        musicEngine.frequencyFromMidi(rhythmSheetMicrophoneInput.minimumMidi),
        musicEngine.frequencyFromMidi(rhythmSheetMicrophoneInput.maximumMidi),
        musicEngine.TUNER_YIN_THRESHOLD,
        musicEngine.TUNER_ANALYSIS_SAMPLE_STRIDE
    );
    const position = rhythmSheet.active
        ? (musicEngine.audio.currentTime() - rhythmSheet.origin) /
          rhythmSheet.interval
        : -Infinity;

    if (frequency === null) {
        microphone.stableFrames = 0;
        microphone.detectedFrequencies = [];
        microphone.voiceStartedAt = null;
        microphone.silentFrames += 1;
        microphone.silenceStartedAt ??= musicEngine.audio.currentTime();

        if (microphone.silentFrames >= 2) {
            renderRhythmSheetPitch();
            if (rhythmSheet.input === 'microphone') {
                releaseRhythm('microphone', microphone.silenceStartedAt);
            }
        }
    } else {
        if (microphone.stableFrames === 0) {
            microphone.voiceStartedAt = musicEngine.audio.currentTime();
        }
        microphone.silentFrames = 0;
        microphone.silenceStartedAt = null;
        microphone.stableFrames += 1;
        musicEngine.addRollingSample(
            microphone.detectedFrequencies,
            frequency,
            musicEngine.RHYTHM_SHEET_FREQUENCY_SAMPLE_LIMIT
        );
        const stableFrequency = musicEngine.median(
            microphone.detectedFrequencies
        );
        renderRhythmSheetPitch(
            microphone.stableFrames >= 2 ? stableFrequency : null
        );

        if (
            rhythmSheet.input === null &&
            position >= -0.25 &&
            microphone.stableFrames >= 2
        ) {
            pressRhythm(
                'microphone',
                stableFrequency,
                microphone.voiceStartedAt
            );
        } else if (rhythmSheet.input === 'microphone') {
            addRhythmSheetPitchSample(stableFrequency);
        }
    }
}

async function activateRhythmSheetMicrophone() {
    return rhythmSheetMicrophoneInput.activate();
}

function updateRhythmMode() {
    const mode = sectionView('rhythm');
    for (const panel of musicEngine.getModePanels('rhythm')) {
        panel.hidden = panel.dataset.modePanel !== mode;
    }
    stopAllAudio();
    if (!rhythmSheetEnabled()) {
        rhythmSheetMicrophoneInput.deactivate('mode-changed');
    } else if (
        musicEngine.microphoneRequestState ===
        musicEngine.MICROPHONE_STATES.LISTENING
    ) {
        void activateRhythmSheetMicrophone();
    }
    if (
        rhythmSheetEnabled() &&
        (!rhythmSheet.phrase.length ||
            rhythmSheet.signature !==
                musicEngine.getControl('shared-time-signature').value)
    ) {
        newRhythmPhrase();
    }
}

function startRhythmSheet() {
    renderRhythmSheet();
    rhythmSheet.interval = rhythmClickInterval(rhythm.signature, rhythm.bpm);
    rhythmSheet.origin =
        rhythm.nextBeatTime + rhythmSheet.meter.units * rhythmSheet.interval;
    rhythmSheet.nextNoteIndex = 0;
    rhythmSheet.extra = 0;
    rhythmSheet.active = true;
    for (const note of rhythmSheet.phrase) {
        note.attack = null;
        note.release = null;
        note.pitchFrequency = null;
        note.pitchError = null;
        note.pitchSamples = [];
    }
    document
        .querySelector(musicEngine.RHYTHM_SHEET_SCORE_SELECTOR)
        .setAttribute('aria-disabled', 'false');
    document.getElementById('rhythm-sheet-hold').disabled = false;
    document.getElementById('rhythm-sheet-hold').focus();
    drawRhythmSheet();
}

function rhythmOffset(value) {
    const rounded = Math.round(value);
    return `${rounded >= 0 ? '+' : ''}${rounded} ms`;
}

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

function updateRhythmHold(position, released = false) {
    const hold = rhythmSheet.currentHold;
    if (!hold) {
        return;
    }
    hold.end = Math.max(hold.start, position);
    if (released) {
        rhythmSheet.currentHold = null;
    }
}

function beginRhythmHold(position) {
    const hold = {
        start: position,
        end: position,
        note: null,
        spurious: false,
    };
    rhythmSheet.holdSpans.push(hold);
    rhythmSheet.currentHold = hold;
}

function pressRhythm(
    input,
    frequency = null,
    inputTime = musicEngine.audio.currentTime()
) {
    if (!rhythmSheet.active || rhythmSheet.input !== null) {
        return;
    }
    const position = (inputTime - rhythmSheet.origin) / rhythmSheet.interval;
    rhythmSheet.input = input;
    beginRhythmHold(position);
    if (position < -0.5 || position >= rhythmSheet.total) {
        return;
    }
    const note = rhythmSheet.phrase
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
        rhythmSheet.extra += 1;
        rhythmSheet.currentHold.spurious = true;
        showRhythmSheetResult(
            'Spurious hold - follow the notes and leave rests silent.'
        );
        return;
    }
    note.attack = (position - note.beat) * rhythmSheet.interval * 1000;
    rhythmSheet.currentHold.note = note;
    rhythmSheet.held = note;
    addRhythmSheetPitchSample(frequency);
    showRhythmSheetResult(
        `Attack: ${rhythmOffset(note.attack)} - target ${musicEngine.noteNameFromMidi(note.midi, 'sharp')}.`
    );
}

function releaseRhythm(input, inputTime = musicEngine.audio.currentTime()) {
    if (rhythmSheet.input !== input) {
        return;
    }
    updateRhythmHold(
        (inputTime - rhythmSheet.origin) / rhythmSheet.interval,
        true
    );
    const note = rhythmSheet.held;
    if (note) {
        note.release =
            (inputTime -
                rhythmSheet.origin -
                (note.beat + note.duration) * rhythmSheet.interval) *
            1000;
        if (note.pitchSamples.length) {
            note.pitchFrequency = musicEngine.median(note.pitchSamples);
            note.pitchError = musicEngine.centsBetween(
                note.pitchFrequency,
                musicEngine.frequencyFromMidi(note.midi)
            );
        }
        const pitchResult =
            note.pitchError === null
                ? ''
                : ` - Pitch: ${musicEngine.signed(note.pitchError, 0)} cents`;
        showRhythmSheetResult(
            `Attack: ${rhythmOffset(note.attack)} - Release: ${rhythmOffset(note.release)}${pitchResult}`
        );
    }
    rhythmSheet.input = null;
    rhythmSheet.held = null;
    document.getElementById('rhythm-sheet-hold').classList.remove('is-held');
}

function finishRhythmSheet() {
    if (rhythmSheet.input !== null) {
        releaseRhythm(rhythmSheet.input);
    }

    const notes = rhythmSheet.phrase.filter((note) => !note.rest);
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
        ['Spurious holds', rhythmSheet.extra],
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

        if (spurious.length) {
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
        }

        item.append(holds);
        results.append(item);
    }
    showRhythmSheetReport();
    clearRhythmFeedback();
    rhythmSheet.active = false;
    renderRhythmSheetPitch();
    stopAllAudio();
    const { units } = rhythmSheet.meter;
    musicEngine.positionSheetLane(
        rhythmSheet,
        musicEngine.RHYTHM_SHEET_SCORE_SELECTOR,
        -units - 1
    );
    document.getElementById('rhythm-sheet-count-label').textContent =
        `Complete - durations in ${musicEngine.sheetDurationUnit(rhythmSheet.meter)}`;
}

function drawRhythmSheet() {
    const position =
        (musicEngine.audio.currentTime() - rhythmSheet.origin) /
        rhythmSheet.interval;
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
    updateRhythmHold(position);
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
    if (position >= rhythmSheet.total + 0.5) {
        finishRhythmSheet();
        return;
    }
    rhythmSheet.frame = requestAnimationFrame(drawRhythmSheet);
}

function stopRhythmSheet() {
    if (rhythmSheet.currentHold) {
        updateRhythmHold(
            (musicEngine.audio.currentTime() - rhythmSheet.origin) /
                rhythmSheet.interval,
            true
        );
    }
    rhythmSheetMicrophoneInput.deactivate('exercise-stopped');
    cancelAnimationFrame(rhythmSheet.frame);
    rhythmSheet.frame = null;
    if (rhythmSheet.active) {
        document.getElementById('rhythm-sheet-count-label').textContent =
            `Stopped - durations in ${musicEngine.sheetDurationUnit(rhythmSheet.meter)}`;
    }
    rhythmSheet.active = false;
    renderRhythmSheetPitch();
    rhythmSheet.input = null;
    rhythmSheet.held = null;
    document
        .querySelector(musicEngine.RHYTHM_SHEET_SCORE_SELECTOR)
        .setAttribute('aria-disabled', 'true');
    document.getElementById('rhythm-sheet-hold').disabled = true;
    document.getElementById('rhythm-sheet-hold').classList.remove('is-held');
}

// Rhythm: timing

function rhythmTimingEnabled() {
    return sectionView('rhythm') === 'timing';
}

function rhythmMetronomeEnabled() {
    return sectionView('rhythm') === 'metronome';
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
        stopAllAudio();
        startRhythm();
    }
}

function resetRhythmSheetSoundFont() {
    const synth = midiPlayback.synth;
    if (!synth || !midiPlayback.soundFontId) {
        rhythmSheet.soundFontReady = false;
        return false;
    }

    synth.stopAll(true);
    synth.reset();
    synth.midiChannels[
        musicEngine.RHYTHM_SHEET_MIDI_CHANNEL
    ]?.setSystemParameter('isMuted', false);
    synth.programChange(
        musicEngine.RHYTHM_SHEET_MIDI_CHANNEL,
        musicEngine.RHYTHM_SHEET_MIDI_PROGRAM
    );
    rhythmSheet.soundFontNoteOffs = [];
    rhythmSheet.soundFontReady = true;
    return true;
}

async function prepareRhythmSheetSoundFont(request) {
    try {
        await Promise.all([
            loadSoundFontCatalog(),
            initializeMidiSynthesizer(),
        ]);
        if (!(await loadSoundFont())) {
            rhythmSheet.soundFontReady = false;
            return false;
        }
        const muteDelay = Math.max(
            0,
            rhythmSheet.soundFontMutedUntil - performance.now()
        );
        if (muteDelay > 0) {
            await new Promise((resolve) => {
                window.setTimeout(resolve, muteDelay);
            });
        }
        if (request !== rhythmSheet.soundFontRequest) {
            return false;
        }
        return resetRhythmSheetSoundFont();
    } catch {
        if (request === rhythmSheet.soundFontRequest) {
            rhythmSheet.soundFontReady = false;
        }
        return false;
    }
}

function stopRhythmSheetSoundFont() {
    rhythmSheet.soundFontRequest += 1;
    rhythmSheet.soundFontNoteOffs = [];
    const synth = midiPlayback.synth;
    if (rhythmSheet.soundFontReady && synth) {
        synth.stopAll(true);
        synth.midiChannels[
            musicEngine.RHYTHM_SHEET_MIDI_CHANNEL
        ]?.setSystemParameter('isMuted', true);
        rhythmSheet.soundFontMutedUntil =
            performance.now() +
            musicEngine.PLAYBACK_SCHEDULE_AHEAD_SECONDS * 1000 +
            musicEngine.PLAYBACK_LOOKAHEAD_MS;
    }
    rhythmSheet.soundFontReady = false;
}

function playRhythmSheetNoteCue(note, startTime, now) {
    const writtenDuration = note.duration * rhythmSheet.interval;
    const releaseGap = Math.min(
        musicEngine.RHYTHM_SHEET_NOTE_RELEASE_GAP_SECONDS,
        writtenDuration * musicEngine.RHYTHM_SHEET_NOTE_RELEASE_GAP_RATIO
    );
    const duration = writtenDuration - releaseGap;
    if (rhythmSheet.soundFontReady && midiPlayback.synth) {
        const synthStartTime =
            midiPlayback.synth.currentTime + Math.max(0, startTime - now);
        midiPlayback.synth.noteOn(
            musicEngine.RHYTHM_SHEET_MIDI_CHANNEL,
            note.midi,
            musicEngine.RHYTHM_SHEET_NOTE_CUE_VELOCITY,
            { time: synthStartTime }
        );
        rhythmSheet.soundFontNoteOffs.push({
            midi: note.midi,
            time: startTime + duration,
        });
        return;
    }

    musicEngine.audio.playTransient(
        musicEngine.frequencyFromMidi(note.midi),
        'triangle',
        duration,
        musicEngine.RHYTHM_SHEET_NOTE_CUE_VOLUME,
        Math.max(0, startTime - now)
    );
}

function scheduleRhythmSheetNoteOffs(now) {
    if (!rhythmSheet.soundFontReady || !midiPlayback.synth) {
        return;
    }

    while (
        rhythmSheet.soundFontNoteOffs[0]?.time <
        now + musicEngine.PLAYBACK_SCHEDULE_AHEAD_SECONDS
    ) {
        const noteOff = rhythmSheet.soundFontNoteOffs.shift();
        midiPlayback.synth.noteOff(
            musicEngine.RHYTHM_SHEET_MIDI_CHANNEL,
            noteOff.midi,
            {
                time:
                    midiPlayback.synth.currentTime +
                    Math.max(0, noteOff.time - now),
            }
        );
    }
}

function scheduleRhythmSheetNoteCues(now) {
    if (!rhythmSheetEnabled() || !rhythmSheet.active) {
        return;
    }

    while (rhythmSheet.nextNoteIndex < rhythmSheet.phrase.length) {
        const note = rhythmSheet.phrase[rhythmSheet.nextNoteIndex];
        const startTime = rhythmSheet.origin + note.beat * rhythmSheet.interval;

        if (startTime >= now + musicEngine.PLAYBACK_SCHEDULE_AHEAD_SECONDS) {
            break;
        }

        if (!note.rest) {
            playRhythmSheetNoteCue(note, startTime, now);
        }

        rhythmSheet.nextNoteIndex += 1;
    }

    scheduleRhythmSheetNoteOffs(now);
}

function scheduleRhythm() {
    if (!rhythm.running) {
        return;
    }

    const bpm = rhythm.bpm;

    const signature = rhythm.signature;

    const pattern = musicEngine.METERS[signature] || musicEngine.METERS['4/4'];

    const secondsPerClick = rhythmClickInterval(signature, bpm);

    rhythmTiming.interval = secondsPerClick;
    const now = musicEngine.audio.currentTime();

    scheduleRhythmSheetNoteCues(now);

    while (
        rhythm.nextBeatTime <
        now + musicEngine.PLAYBACK_SCHEDULE_AHEAD_SECONDS
    ) {
        if (
            rhythmSheetEnabled() &&
            rhythm.nextBeatTime >=
                rhythmSheet.origin +
                    rhythmSheet.total * rhythmSheet.interval -
                    0.001
        ) {
            break;
        }
        const accent = pattern[rhythm.beatIndex];

        const frequency = musicEngine.RHYTHM_CLICK_FREQUENCIES[accent];

        const volume = accent === 2 ? 0.9 : accent === 1 ? 0.75 : 0.6;

        musicEngine.audio.playTransient(
            frequency,
            'sine',
            musicEngine.RHYTHM_CLICK_DURATION,
            volume,
            Math.max(0, rhythm.nextBeatTime - now)
        );

        rhythm.nextBeatTime += secondsPerClick;

        rhythm.beatIndex = (rhythm.beatIndex + 1) % pattern.length;
    }
}

async function startRhythm() {
    if (rhythm.running || rhythmSheet.starting) {
        return;
    }
    if (
        rhythmSheetEnabled() &&
        (!rhythmSheet.phrase.length ||
            rhythmSheet.signature !==
                musicEngine.getControl('shared-time-signature').value)
    ) {
        newRhythmPhrase();
    }

    if (rhythmSheetEnabled() && !rhythmSheet.phrase.length) {
        return;
    }

    stopAllAudio();
    rhythmSheet.starting = true;
    const soundFontRequest = rhythmSheetEnabled()
        ? ++rhythmSheet.soundFontRequest
        : null;
    const soundFontPromise = soundFontRequest
        ? prepareRhythmSheetSoundFont(soundFontRequest)
        : null;

    if (rhythmSheetEnabled()) {
        clearRhythmSheetResults();
        document.getElementById('rhythm-sheet-count-label').textContent =
            musicEngine.MICROPHONE_MESSAGES.REQUESTING;
        try {
            const started = await activateRhythmSheetMicrophone();
            if (
                !started ||
                !rhythmSheetEnabled() ||
                document.getElementById('rhythm-panel').hidden
            ) {
                rhythmSheet.starting = false;
                rhythmSheetMicrophoneInput.deactivate('activation-cancelled');
                stopRhythmSheetSoundFont();
                if (
                    musicEngine.microphoneState ===
                    musicEngine.MICROPHONE_STATES.DENIED
                ) {
                    document.getElementById(
                        'rhythm-sheet-count-label'
                    ).textContent = `${musicEngine.microphoneFailureMessage}.`;
                }
                return;
            }
        } catch {
            document.getElementById('rhythm-sheet-count-label').textContent =
                `${musicEngine.MICROPHONE_MESSAGES.FAILED}.`;
        }
    }

    if (soundFontPromise) {
        document.getElementById('rhythm-sheet-count-label').textContent =
            'Loading sound font...';
        await soundFontPromise;
        if (
            soundFontRequest !== rhythmSheet.soundFontRequest ||
            !rhythmSheetEnabled() ||
            document.getElementById('rhythm-panel').hidden
        ) {
            rhythmSheet.starting = false;
            stopRhythmSheetSoundFont();
            return;
        }
    }

    rhythm.bpm = musicEngine.clamp(
        musicEngine.readNumber(musicEngine.getControl('shared-bpm'), 100),
        30,
        240
    );
    rhythm.signature = musicEngine.getControl('shared-time-signature').value;
    rhythm.running = true;
    rhythmSheet.starting = false;
    rhythm.beatIndex = 0;
    const leadIn = rhythmSheetEnabled()
        ? rhythmClickInterval(rhythm.signature, rhythm.bpm)
        : rhythmTimingEnabled()
          ? 1
          : 0.05;
    rhythm.nextBeatTime = musicEngine.audio.currentTime() + leadIn;
    rhythmTiming.originMs =
        performance.now() +
        (rhythm.nextBeatTime - musicEngine.audio.currentTime()) * 1000;
    rhythmTiming.lastBeat = -1;
    rhythmTiming.errors = [];
    clearRhythmTimingMark();
    if (rhythmTimingEnabled()) {
        document.getElementById('rhythm-timing-result').textContent = '';
    }
    document.getElementById('rhythm-timing-tap').disabled =
        !rhythmTimingEnabled();

    if (rhythmSheetEnabled()) {
        startRhythmSheet();
    }
    scheduleRhythm();
    if (rhythmTimingEnabled()) {
        drawRhythmTiming();
        document.getElementById('rhythm-timing-tap').focus();
    } else if (rhythmMetronomeEnabled()) {
        drawRhythmMetronome();
    }

    rhythm.timer = window.setInterval(
        scheduleRhythm,
        musicEngine.PLAYBACK_LOOKAHEAD_MS
    );
}

function stopRhythm() {
    stopRhythmSheet();
    stopRhythmSheetSoundFont();
    cancelAnimationFrame(rhythm.frame);
    rhythm.frame = null;
    cancelAnimationFrame(rhythmTiming.frame);
    rhythmTiming.frame = null;
    document.getElementById('rhythm-timing-tap').disabled = true;
    rhythm.running = false;
    rhythmSheet.starting = false;
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

    const bpmInput = musicEngine.getControl('shared-bpm');

    const bpm = musicEngine.clamp(
        Math.round(60000 / averageInterval),
        Number(bpmInput.min),
        Number(bpmInput.max)
    );

    bpmInput.value = String(bpm);
    musicEngine.synchronizeSharedControl(bpmInput);
    restartRhythm();
}

// Events

function resetForReferenceChange() {
    stopAllAudio();
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
        musicEngine.synchronizeSharedControl(event.target);
    };
    document.addEventListener('input', synchronizeChangedSharedControl, true);
    document.addEventListener('change', synchronizeChangedSharedControl, true);

    for (const button of musicEngine.getModuleActions('midi', 'attach')) {
        button.addEventListener('click', () => {
            const fileInput = document.getElementById(
                button.getAttribute('aria-controls')
            );
            fileInput.value = '';
            fileInput.click();
        });
    }
    for (const fileInput of musicEngine.getControls('midi-file')) {
        fileInput.addEventListener('change', (event) => {
            const [file] = event.target.files;
            if (file) {
                void loadMidiVisualization(file);
            }
        });
    }
    for (const select of musicEngine.getControls('shared-midi-library')) {
        select.addEventListener('change', () => {
            if (select.value) {
                void loadIncludedMidi(select.value);
            }
        });
    }
    const fileDropZones = new Set(
        [...musicEngine.getControls('shared-soundfont')].map((control) =>
            control.closest('[data-mode-panel]')
        )
    );
    for (const dropZone of fileDropZones) {
        let dragDepth = 0;
        const hasFiles = (event) =>
            [...(event.dataTransfer?.types ?? [])].includes('Files');

        dropZone.addEventListener('dragenter', (event) => {
            if (!hasFiles(event)) {
                return;
            }
            event.preventDefault();
            dragDepth += 1;
            dropZone.classList.add('is-drag-over');
        });
        dropZone.addEventListener('dragover', (event) => {
            if (!hasFiles(event)) {
                return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        });
        dropZone.addEventListener('dragleave', () => {
            if (dragDepth === 0) {
                return;
            }
            dragDepth = Math.max(0, dragDepth - 1);
            dropZone.classList.toggle('is-drag-over', dragDepth > 0);
        });
        dropZone.addEventListener('drop', (event) => {
            if (!hasFiles(event)) {
                return;
            }
            event.preventDefault();
            dragDepth = 0;
            dropZone.classList.remove('is-drag-over');
            const files = [...event.dataTransfer.files];
            void loadDroppedFiles(dropZone, files);
        });
    }
    for (const control of musicEngine.getControls('shared-soundfont')) {
        control.addEventListener('change', () => {
            for (const peer of musicEngine.getControls('shared-soundfont')) {
                peer.setCustomValidity('');
            }
            void changeSoundFont(control);
        });
    }
    for (const seek of musicEngine.getControls('shared-midi-seek')) {
        seek.addEventListener('input', seekMidiVisualization);
    }
    for (const play of musicEngine.getModuleActions('midi', 'play')) {
        play.addEventListener('click', toggleMidiVisualization);
    }
    for (const stop of musicEngine.getModuleActions('midi', 'stop')) {
        stop.addEventListener('click', stopAllAudio);
    }

    for (const control of musicEngine.getControls('shared-note')) {
        control.addEventListener('change', () => {
            updateNoteReadouts();

            if (tunerTargetMidi !== null) {
                stopTuner();
                clearTunerTarget();
            }

            if (tunerVoice) {
                tunerVoice.setFrequency(
                    selectedNoteFrequency(musicEngine.getNoteControl('tuner'))
                );
            }

            newPitchPlacementTrial();
            newMatchTrial();
        });
    }

    for (const control of musicEngine.getControls(
        'shared-time-signature',
        'rhythm-sheet-bars',
        'rhythm-sheet-note-values',
        'rhythm-sheet-clef',
        'rhythm-sheet-pitches'
    )) {
        control.addEventListener('change', () => {
            if (rhythmSheetEnabled()) {
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
    for (const control of musicEngine.getControls('shared-bpm')) {
        control.addEventListener('change', restartRhythm);
    }
    const rhythmHold = document.getElementById('rhythm-sheet-hold');
    musicEngine
        .getAction('rhythm-sheet-new')
        .addEventListener('click', newTrial);
    const rhythmScore = document.querySelector(
        musicEngine.RHYTHM_SHEET_SCORE_SELECTOR
    );
    for (const target of [rhythmHold, rhythmScore]) {
        target.addEventListener('pointerdown', (event) => {
            if (
                event.button !== 0 ||
                event.pointerType !== 'mouse' ||
                !event.isPrimary ||
                !rhythmSheet.active
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
            if (rhythmSheet.active && rhythmSheet.input === event.pointerId) {
                stopAllAudio();
            }
        });
        target.addEventListener('lostpointercapture', (event) => {
            releaseRhythm(event.pointerId);
        });
    }
    document.addEventListener('keydown', (event) => {
        if (
            event.code !== 'Space' ||
            !rhythmSheetEnabled() ||
            !rhythmSheet.active ||
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
        if (event.code === 'Space' && rhythmSheet.input === 'keyboard') {
            event.preventDefault();
            releaseRhythm('keyboard');
        }
    });
    window.addEventListener('blur', () => {
        if (rhythmSheet.active) {
            stopAllAudio();
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
            stopAllAudio();
        }
    });

    for (const button of musicEngine.getModuleActions('rhythm', 'play')) {
        button.addEventListener('click', startRhythm);
    }
    for (const button of musicEngine.getModuleActions('rhythm', 'tempo-tap')) {
        button.addEventListener('click', tapTempo);
    }

    for (const control of musicEngine.getControls('shared-interval-set')) {
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
    for (const control of musicEngine.getControls(
        'shared-interval-direction'
    )) {
        control.addEventListener('change', newIntervalTrial);
    }

    for (const control of musicEngine.getControls(
        'pitch-placement-range-min',
        'pitch-placement-range-max',
        'pitch-placement-interval'
    )) {
        control.addEventListener('change', () => {
            resetAdaptiveProgress('pitch-placement');
            newPitchPlacementTrial();
        });
    }

    for (const control of musicEngine.getControls(
        'match-target-range-min',
        'match-target-range-max',
        'match-target-count'
    )) {
        control.addEventListener('change', () => {
            resetAdaptiveProgress('match-target');
            newMatchTrial();
        });
    }

    for (const control of musicEngine.getControls('shared-adaptive')) {
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
    musicEngine
        .getControl('global-volume')
        .addEventListener('input', musicEngine.updateVolume);
    musicEngine
        .getAction('global-volume-toggle')
        .addEventListener('click', musicEngine.toggleVolume);

    const referenceFrequencyInput = musicEngine.getControl(
        'global-reference-a4'
    );

    referenceFrequencyInput.addEventListener('input', () => {
        resetForReferenceChange();

        const referenceFrequency = Number(referenceFrequencyInput.value);

        if (
            Number.isFinite(referenceFrequency) &&
            referenceFrequency >= Number(referenceFrequencyInput.min) &&
            referenceFrequency <= Number(referenceFrequencyInput.max)
        ) {
            musicEngine.savePreferences();
        }
    });
    referenceFrequencyInput.addEventListener('change', () => {
        normalizeNumberInput(
            referenceFrequencyInput,
            musicEngine.DEFAULT_A4_FREQUENCY
        );
        resetForReferenceChange();
        musicEngine.savePreferences();
    });

    musicEngine
        .getControl('pitch-placement-duration')
        .addEventListener('change', (event) => {
            normalizeNumberInput(event.currentTarget, 1);
        });

    musicEngine
        .getControl('match-target-duration')
        .addEventListener('change', (event) => {
            normalizeNumberInput(event.currentTarget, 1);
        });

    for (const control of musicEngine.getControls('shared-interval-duration')) {
        control.addEventListener('change', (event) => {
            normalizeNumberInput(event.currentTarget, 0.7);
            musicEngine.synchronizeSharedControl(event.currentTarget);
        });
    }

    musicEngine
        .getAction('global-reference-reset')
        .addEventListener('click', () => {
            musicEngine.getControl('global-reference-a4').value =
                musicEngine.DEFAULT_A4_FREQUENCY.toFixed(3);

            resetForReferenceChange();
            musicEngine.savePreferences();
        });

    musicEngine
        .getControl('tuner-instrument')
        .addEventListener('change', updateTunerInstrument);
    musicEngine
        .getControl('tuner-variation')
        .addEventListener('change', updateTunerStrings);

    musicEngine.getAction('tuner-play').addEventListener('click', playTuner);
    musicEngine.getAction('tuner-stop').addEventListener('click', stopTuner);

    for (const button of musicEngine.getActions('global-microphone-toggle')) {
        button.addEventListener('click', toggleGlobalMicrophone);
    }

    musicEngine
        .getControl('match-identification-octave')
        .addEventListener('change', newMatchIdentificationTrial);
    musicEngine
        .getControl('match-identification-duration')
        .addEventListener('change', (event) =>
            normalizeNumberInput(event.currentTarget, 1)
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

    for (const button of musicEngine.getActions('pitch-placement-play')) {
        button.addEventListener('click', playPitchPlacementTrial);
    }

    musicEngine
        .getAction('match-identification-play')
        .addEventListener('click', playMatchTrial);

    for (const button of musicEngine.getModuleActions('pitch', 'new')) {
        button.addEventListener('click', newTrial);
    }

    for (const button of musicEngine.getModuleActions('match', 'new')) {
        button.addEventListener('click', newTrial);
    }

    for (const button of musicEngine.getModuleActions('interval', 'play')) {
        button.addEventListener('click', playIntervalTrial);
    }

    for (const button of musicEngine.getModuleActions('interval', 'new')) {
        button.addEventListener('click', newTrial);
    }

    musicEngine
        .getAction('chord-play')
        .addEventListener('click', playChordQualityTrial);

    musicEngine
        .getAction('chord-new')
        .addEventListener('click', () => newChordTrial(true));

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

    musicEngine
        .getControl('chord-playback')
        .addEventListener('change', stopAllAudio);

    for (const control of musicEngine.getControls(
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

    musicEngine
        .getAction('pitch-memory-start')
        .addEventListener('click', playPitchMemoryStimulus);

    musicEngine.getAction('pitch-memory-stop').addEventListener('click', () => {
        stopPitchMemoryAudio();
        musicEngine.stopMicrophone();
    });

    musicEngine
        .getAction('pitch-memory-response-play')
        .addEventListener('click', playPitchMemoryResponse);

    musicEngine
        .getAction('pitch-memory-response-stop')
        .addEventListener('click', stopPitchMemoryResponseTone);

    musicEngine
        .getControl('pitch-memory-pitch')
        .addEventListener('input', updatePitchMemoryResponseTone);

    for (const button of musicEngine.getActions('pitch-memory-submit')) {
        button.addEventListener('click', submitPitchMemoryResponse);
    }

    for (const button of document.querySelectorAll(
        '[data-pitch-placement-answers] [data-answer]'
    )) {
        button.addEventListener('click', () =>
            commitPitchPlacement(button.dataset.answer)
        );
    }

    for (const button of musicEngine.getActions('global-audio-stop')) {
        button.addEventListener('click', () => {
            stopAllAudio();
            musicEngine.stopMicrophone();
            cancelAdvance();
        });
    }

    for (const waveform of document.querySelectorAll('[data-waveform]')) {
        waveform.addEventListener('change', stopAllAudio);
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

    for (const button of musicEngine.getModuleActions('pitch', 'stats-clear')) {
        button.addEventListener('click', clearStats);
    }

    for (const button of musicEngine.getModuleActions('match', 'stats-clear')) {
        button.addEventListener('click', clearStats);
    }

    for (const button of musicEngine.getModuleActions(
        'interval',
        'stats-clear'
    )) {
        button.addEventListener('click', clearStats);
    }

    musicEngine
        .getAction('chord-stats-clear')
        .addEventListener('click', clearStats);
}

// Initialization

function initialize() {
    musicEngine.restorePreferences();
    musicEngine.updateVolume();
    initializePitchMemorySlider();
    initializeTooltips();
    initializeNotes();
    initializeTunerInstruments();
    initializeTunerHistory();
    initializeEvents();
    updateRhythmMode();
    updateMidiMode();
    updateNoteReadouts();
    initializeNavigation();

    resetTunerDetection();

    clearPitchPlacementResult();
    renderPitchStats();
    updatePitchMode();

    updateMatchMode();
    updateIntervalMode();
    newChordTrial();

    renderChordStats();
    musicEngine.renderMicrophoneState(musicEngine.MICROPHONE_STATES.UNPROMPTED);
    void musicEngine.setMicrophoneState(musicEngine.MICROPHONE_STATES.PAUSED);
    restorePitchMemoryTrial();
    renderPitchMemoryResponsePitch();
}

initialize();

window.addEventListener('beforeunload', () => {
    stopAllAudio();
    cancelAllAdvances();
    clearPitchMemoryTimers();

    if (pitchMemory.replayTimer !== null) {
        clearTimeout(pitchMemory.replayTimer);
    }

    stopPitchMemoryResponseTone();

    savePitchMemoryState();
});
