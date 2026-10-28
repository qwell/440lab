'use strict';

function newTrial() {
    switch (`${activeSection}/${activeView}`) {
        case 'rhythm/sheet':
            newRhythmPhrase();
            playRhythm();
            break;
        case 'pitch/placement':
            newPitchPlacementTrial(true);
            break;
        case 'pitch/memory':
            newPitchMemoryTrial();
            break;
        case 'match/target':
            newMatchTargetTrial();
            break;
        case 'match/identification':
            newMatchIdentificationTrial(true);
            break;
        case 'interval/recognition':
            newIntervalRecognitionTrial(true);
            break;
        case 'interval/construction':
            newIntervalConstructionTrial(true);
            break;
    }
}

function cancelAdvance() {
    switch (activeSection) {
        case 'pitch':
            cancelPitchAdvance();
            break;
        case 'match':
            cancelMatchAdvance();
            break;
        case 'interval':
            cancelIntervalAdvance();
            break;
        case 'chord':
            cancelChordAdvance();
            break;
    }
}

function cancelAllAdvances() {
    cancelPitchAdvance();
    cancelMatchAdvance();
    cancelIntervalAdvance();
    cancelChordAdvance();
}

function clearStats() {
    switch (activeSection) {
        case 'pitch':
            clearPitchStats();
            break;
        case 'match':
            clearMatchStats();
            break;
        case 'interval':
            clearIntervalStats();
            break;
        case 'chord':
            clearChordStats();
            break;
    }
}

function updateSectionMode() {
    switch (activeSection) {
        case 'rhythm':
            updateRhythmMode();
            break;
        case 'midi':
            updateMidiMode();
            break;
        case 'pitch':
            updatePitchMode();
            break;
        case 'match':
            updateMatchMode();
            break;
        case 'interval':
            updateIntervalMode();
            break;
    }
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
    const stored = musicEngine.loadStats('pitch');

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
    musicEngine.saveStats('pitch');
}

musicEngine.stats.pitch = loadPitchStats();

const pitchPlacement = {
    trial: null,
    adaptiveResults: [],
};

function newPitchTrial() {
    if (sectionView('pitch') === 'memory') {
        newPitchMemoryTrial();
    } else {
        newPitchPlacementTrial(true);
    }
}

const pitchAdvance = musicEngine.createAutoAdvance(
    musicEngine.getModuleActions('pitch', 'new'),
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
    const mode = sectionView('pitch');
    const type =
        mode === 'memory'
            ? musicEngine.getControl('pitch-memory-type').value
            : null;
    const { streak, trials, errorTotal, best } =
        musicEngine.stats.pitch[pitchStatsType(mode, type)];
    const meanError = trials > 0 ? errorTotal / trials : null;

    musicEngine.getOutput(`pitch-${mode}-streak`).textContent = String(streak);
    musicEngine.getOutput(`pitch-${mode}-mean-error`).textContent =
        meanError === null ? '--' : `${meanError.toFixed(1)} cents`;
    musicEngine.getOutput(`pitch-${mode}-best`).textContent =
        best === null ? '--' : `${best.toFixed(2)} cents`;
}

function clearPitchStats() {
    const mode = sectionView('pitch');
    const type =
        mode === 'memory'
            ? musicEngine.getControl('pitch-memory-type').value
            : null;

    musicEngine.stats.pitch[pitchStatsType(mode, type)] =
        defaultPitchTypeStats();

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
        musicEngine.setAnswerOptionState(
            button,
            button.dataset.answer,
            selected,
            correct
        );
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
    const value = musicEngine.readNumber(input, fallback);

    writeNumberIfChanged(input, value);

    return value;
}

function readRange(minimumInput, maximumInput, defaultMinimum, defaultMaximum) {
    let minimum = musicEngine.readNumber(minimumInput, defaultMinimum);
    let maximum = musicEngine.readNumber(maximumInput, defaultMaximum);

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
    const status = musicEngine.getOutput(`${exercise}-adaptive-status`);

    if (musicEngine.getControl('shared-adaptive').value !== 'on') {
        state.adaptiveResults.length = 0;
        return;
    }

    state.adaptiveResults.push(correct);

    if (state.adaptiveResults.length < musicEngine.ADAPTIVE_WINDOW_SIZE) {
        status.textContent =
            `${state.adaptiveResults.length} of ` +
            `${musicEngine.ADAPTIVE_WINDOW_SIZE} answers`;
        return;
    }

    const correctCount = state.adaptiveResults.filter(Boolean).length;
    state.adaptiveResults.length = 0;
    let factor = 1;
    let direction = '';

    if (correctCount >= 4) {
        factor = musicEngine.ADAPTIVE_NARROW_FACTOR;
        direction = 'Narrowed';
    } else if (correctCount <= 2) {
        factor = musicEngine.ADAPTIVE_WIDEN_FACTOR;
        direction = 'Widened';
    }

    if (factor === 1) {
        status.textContent = `Unchanged ${correctCount}/${musicEngine.ADAPTIVE_WINDOW_SIZE}`;
        return;
    }

    let result;

    if (
        exercise === 'interval-recognition' ||
        exercise === 'interval-construction'
    ) {
        const level = musicEngine.getControl('shared-interval-set');

        level.selectedIndex = musicEngine.clamp(
            level.selectedIndex + (factor < 1 ? 1 : -1),
            0,
            level.options.length - 1
        );
        musicEngine.synchronizeSharedControl(level);
        for (const intervalExercise of [
            'interval-recognition',
            'interval-construction',
        ]) {
            resetAdaptiveProgress(intervalExercise);
        }
        result = level.value;
    } else {
        const minimumInput = musicEngine.getControl(`${exercise}-range-min`);
        const maximumInput = musicEngine.getControl(`${exercise}-range-max`);
        const minimum = musicEngine.clamp(
            Math.round(Number(minimumInput.value) * factor * 10) / 10,
            Number(minimumInput.min),
            Number(minimumInput.max)
        );
        const maximum = musicEngine.clamp(
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
        'pitch-placement': pitchPlacement,
        'match-target': matchTarget,
        'interval-recognition': interval.recognition,
        'interval-construction': interval.construction,
    }[exercise];
}

function renderAdaptiveProgress(exercise) {
    const state = getAdaptiveState(exercise);
    const enabled = musicEngine.getControl('shared-adaptive').value === 'on';

    musicEngine.getOutput(`${exercise}-adaptive-status`).textContent = enabled
        ? `${state.adaptiveResults.length} of ${musicEngine.ADAPTIVE_WINDOW_SIZE} answers`
        : '';
}

function resetAdaptiveProgress(exercise) {
    const state = getAdaptiveState(exercise);

    state.adaptiveResults.length = 0;
    renderAdaptiveProgress(exercise);
}

// Pitch: placement

function clearPitchPlacementResult() {
    musicEngine.clearPracticeResult('pitch-placement-result');
}

function createPitchPlacementTrial() {
    const rootFrequency = selectedNoteFrequency(
        musicEngine.getNoteControl('pitch-placement')
    );

    const semitones = Number(
        musicEngine.getControl('pitch-placement-interval').value
    );

    const { minimum: minimumCents, maximum: maximumCents } = readRange(
        musicEngine.getControl('pitch-placement-range-min'),
        musicEngine.getControl('pitch-placement-range-max'),
        10,
        50
    );

    const magnitude =
        minimumCents + Math.random() * (maximumCents - minimumCents);

    const correctTargetFrequency =
        rootFrequency * 2 ** (semitones / musicEngine.SEMITONES_PER_OCTAVE);

    return {
        rootFrequency,
        correctTargetFrequency,

        mistuneCents: Math.random() < 0.5 ? -magnitude : magnitude,

        committed: false,
    };
}

function newPitchPlacementTrial(playImmediately = false) {
    cancelPitchAdvance();
    stopAllAudio();

    pitchPlacement.trial = createPitchPlacementTrial();

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

    if (!pitchPlacement.trial) {
        newPitchPlacementTrial();
    }

    stopAllAudio();

    if (!pitchPlacement.trial.committed) {
        setPitchPlacementAnswerState({
            disabled: false,
        });
    }

    const { rootFrequency, correctTargetFrequency, mistuneCents } =
        pitchPlacement.trial;

    const waveform = musicEngine.getWaveform('pitch-placement').value;

    const duration = musicEngine.readNumber(
        musicEngine.getControl('pitch-placement-duration'),
        1
    );

    const targetFrequency = musicEngine.frequencyFromCents(
        correctTargetFrequency,
        mistuneCents
    );

    musicEngine.audio.playTransient(rootFrequency, waveform, duration);

    musicEngine.audio.playTransient(
        targetFrequency,
        waveform,
        duration,
        1,
        duration + 0.1
    );
}

function commitPitchPlacement(answer) {
    const trial = pitchPlacement.trial;

    if (!trial || trial.committed) {
        return;
    }

    musicEngine.audio.stopTransient();

    trial.committed = true;

    const distance = Math.abs(trial.mistuneCents);

    const direction = trial.mistuneCents < 0 ? 'flat' : 'sharp';

    const correct = answer === direction;

    const mistunedFrequency = musicEngine.frequencyFromCents(
        trial.correctTargetFrequency,
        trial.mistuneCents
    );

    const frequencyError = mistunedFrequency - trial.correctTargetFrequency;

    setPitchPlacementAnswerState({
        disabled: true,
        selected: answer,
        correct: direction,
    });

    musicEngine.stats.pitch.placement.trials += 1;
    musicEngine.stats.pitch.placement.correct += correct ? 1 : 0;

    musicEngine.stats.pitch.placement.errorTotal += correct ? 0 : distance;

    musicEngine.stats.pitch.placement.streak = correct
        ? musicEngine.stats.pitch.placement.streak + 1
        : 0;

    if (
        correct &&
        (musicEngine.stats.pitch.placement.best === null ||
            distance < musicEngine.stats.pitch.placement.best)
    ) {
        musicEngine.stats.pitch.placement.best = distance;
    }

    savePitchStats();
    renderPitchStats();
    updateAdaptiveDifficulty('pitch-placement', correct);

    musicEngine.renderPracticeResult(
        'pitch-placement-result',
        correct,
        `${direction} - ` +
            `${musicEngine.signed(trial.mistuneCents, 2)} cents ` +
            `(${musicEngine.signed(frequencyError, 3)} Hz)`
    );

    schedulePitchAdvance();
}

// Pitch: memory

const pitchMemory = {
    trial: musicEngine.storage.load(musicEngine.TRIAL_KEYS.pitchMemory, null),
    timer: null,
    countdown: null,
    replayTimer: null,
    responseVoice: null,
    responseMethod: 'oscillator',
};

const pitchMemoryMicrophoneInput = musicEngine.createMicrophoneInput({
    minimumMidi: musicEngine.PITCH_MEMORY_MINIMUM_MIDI,
    maximumMidi: musicEngine.PITCH_MEMORY_MAXIMUM_MIDI,
    sampleIntervalMs: musicEngine.TUNER_ANALYSIS_INTERVAL_MS,
    processFrame: processPitchMemoryMicrophoneFrame,
    onDeactivate: handlePitchMemoryMicrophoneDeactivation,
    initialState: {
        detectedFrequencies: [],
        detectedFrequency: null,
    },
});

function savePitchMemoryState() {
    if (pitchMemory.trial && pitchMemory.trial.state !== 'complete') {
        musicEngine.storage.save(
            musicEngine.TRIAL_KEYS.pitchMemory,
            pitchMemory.trial
        );
    } else {
        musicEngine.storage.remove(musicEngine.TRIAL_KEYS.pitchMemory);
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
    const minimumFrequency = musicEngine.frequencyFromMidi(
        musicEngine.PITCH_MEMORY_MINIMUM_MIDI
    );
    const maximumFrequency = musicEngine.frequencyFromMidi(
        musicEngine.PITCH_MEMORY_MAXIMUM_MIDI
    );

    return minimumFrequency * (maximumFrequency / minimumFrequency) ** random();
}

function getPitchMemoryResponseFrequency() {
    const cents = Number(musicEngine.getControl('pitch-memory-pitch').value);

    return (
        musicEngine.frequencyFromMidi(musicEngine.PITCH_MEMORY_MINIMUM_MIDI) *
        2 ** (cents / musicEngine.CENTS_PER_OCTAVE)
    );
}

function getPitchMemoryRefreshButton() {
    return document.querySelector(
        '[data-mode-panel="memory"] [data-action="pitch-memory-new"]'
    );
}

function hidePitchMemoryResponses() {
    document.getElementById('pitch-memory-pitch-response').hidden =
        !pitchMemory.trial;
    const response = document.getElementById('pitch-memory-response-actions');

    response.hidden = true;
    musicEngine.getAction('pitch-memory-submit', response).disabled = true;
}

function pitchMemorySliderValueForFrequency(frequency) {
    return musicEngine.clamp(
        musicEngine.CENTS_PER_OCTAVE *
            Math.log2(
                frequency /
                    musicEngine.frequencyFromMidi(
                        musicEngine.PITCH_MEMORY_MINIMUM_MIDI
                    )
            ),
        0,
        musicEngine.PITCH_MEMORY_RANGE_CENTS
    );
}

function initializePitchMemorySlider() {
    const slider = musicEngine.getControl('pitch-memory-pitch');
    slider.min = '0';
    slider.max = String(musicEngine.PITCH_MEMORY_RANGE_CENTS);
    slider.value = String(musicEngine.PITCH_MEMORY_RANGE_CENTS / 2);
}

function formatPitchAndCents(frequency) {
    const note = nearestNoteFromFrequency(frequency);

    return `${musicEngine.noteNameFromMidi(note.midi, 'sharp')} ${musicEngine.signed(note.cents, 0)}¢`;
}

function renderPitchMemoryResponsePitch() {
    musicEngine.getOutput('pitch-memory-response-pitch').textContent =
        formatPitchAndCents(getPitchMemoryResponseFrequency());
}

function clearPitchMemoryPitchMarkers() {
    musicEngine.getControl('pitch-memory-pitch').classList.remove('has-result');

    for (const name of [
        'pitch-memory-target-marker',
        'pitch-memory-response-marker',
    ]) {
        const marker = musicEngine.getOutput(name);

        marker.hidden = true;
        marker.classList.remove('is-correct', 'is-incorrect');
    }
}

function showPitchMemoryPitchMarkers(result) {
    const targetMarker = musicEngine.getOutput('pitch-memory-target-marker');
    const responseMarker = musicEngine.getOutput(
        'pitch-memory-response-marker'
    );
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
    musicEngine.getControl('pitch-memory-pitch').classList.add('has-result');
    targetMarker.hidden = false;
    responseMarker.hidden = false;
}

function setPitchMemoryStatus(text) {
    musicEngine.getOutput('pitch-memory-status').textContent = text;
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

function handlePitchMemoryMicrophoneDeactivation({ reason }) {
    pitchMemoryMicrophoneInput.detectedFrequencies = [];
    pitchMemoryMicrophoneInput.detectedFrequency = null;

    if (
        reason === 'microphone-paused' &&
        pitchMemory.trial &&
        pitchMemory.trial.state !== 'complete'
    ) {
        stopPitchMemoryAudio();
    }
}

function processPitchMemoryMicrophoneFrame({
    samples,
    sampleRate,
    samplesUpdated,
}) {
    const microphone = pitchMemoryMicrophoneInput;

    if (samplesUpdated && pitchMemory.trial?.state === 'responding') {
        const frequency = detectPitchYin(
            samples,
            sampleRate,
            musicEngine.frequencyFromMidi(microphone.minimumMidi),
            musicEngine.frequencyFromMidi(microphone.maximumMidi)
        );

        if (frequency === null) {
            microphone.detectedFrequencies = [];
        } else {
            musicEngine.addRollingSample(
                microphone.detectedFrequencies,
                frequency,
                musicEngine.PITCH_MEMORY_FREQUENCY_SAMPLE_LIMIT
            );

            microphone.detectedFrequency = musicEngine.median(
                microphone.detectedFrequencies
            );
            pitchMemory.responseMethod = 'microphone';

            musicEngine.getOutput('pitch-memory-response-pitch').textContent =
                formatPitchAndCents(microphone.detectedFrequency);
            musicEngine.getControl('pitch-memory-pitch').value = String(
                pitchMemorySliderValueForFrequency(microphone.detectedFrequency)
            );
        }
    }
}

async function activatePitchMemoryMicrophone() {
    const refreshButton = getPitchMemoryRefreshButton();
    const active = pitchMemoryMicrophoneInput.active();

    refreshButton.disabled = false;
    if (!active) {
        setPitchMemoryStatus(musicEngine.MICROPHONE_MESSAGES.REQUESTING);
    }

    try {
        if (!(await pitchMemoryMicrophoneInput.activate())) {
            if (
                musicEngine.microphoneState ===
                musicEngine.MICROPHONE_STATES.DENIED
            ) {
                setPitchMemoryStatus(
                    `${musicEngine.microphoneFailureMessage}; adjust the tone manually.`
                );
            }
            return;
        }

        if (active) {
            refreshButton.disabled = false;
            setPitchMemoryStatus(musicEngine.MICROPHONE_MESSAGES.LISTENING);
            return;
        }

        pitchMemoryMicrophoneInput.detectedFrequencies = [];
        pitchMemoryMicrophoneInput.detectedFrequency = null;
        refreshButton.disabled = false;

        musicEngine.getOutput('pitch-memory-response-pitch').textContent =
            musicEngine.MICROPHONE_MESSAGES.NO_STABLE_PITCH;
        setPitchMemoryStatus(musicEngine.MICROPHONE_MESSAGES.LISTENING);
    } catch {
        refreshButton.disabled = false;
        setPitchMemoryStatus(
            `${musicEngine.MICROPHONE_MESSAGES.FAILED}; adjust the tone manually.`
        );
    }
}

function showPitchMemoryResponse() {
    if (!pitchMemory.trial || pitchMemory.trial.state === 'responding') {
        return;
    }

    clearPitchMemoryTimers();
    musicEngine.audio.stopTransient();

    pitchMemory.trial.state = 'responding';
    pitchMemory.trial.responseStartedAt = Date.now();

    const response = document.getElementById('pitch-memory-response-actions');

    hidePitchMemoryResponses();
    document.getElementById('pitch-memory-pitch-response').hidden = false;
    response.hidden = false;
    const random = seededRandom(pitchMemory.trial.seed ^ 0xa55a5aa5);
    const targetCents = pitchMemorySliderValueForFrequency(
        pitchMemory.trial.targetFrequency
    );
    const direction = random() < 0.5 ? -1 : 1;
    const offset = direction * (300 + random() * 900);

    pitchMemory.responseMethod = 'oscillator';
    pitchMemoryMicrophoneInput.detectedFrequency = null;
    pitchMemoryMicrophoneInput.detectedFrequencies = [];
    musicEngine.getControl('pitch-memory-pitch').value = String(
        musicEngine.clamp(
            targetCents + offset,
            0,
            musicEngine.PITCH_MEMORY_RANGE_CENTS
        )
    );
    renderPitchMemoryResponsePitch();
    clearPitchMemoryPitchMarkers();
    musicEngine.getControl('pitch-memory-pitch').disabled = false;
    musicEngine.getAction('pitch-memory-response-play').disabled = false;
    musicEngine.getAction('pitch-memory-response-stop').disabled = false;
    musicEngine.getAction('pitch-memory-submit', response).disabled = false;
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
        let frequency = randomPitchMemoryFrequency(random);

        while (
            Math.abs(
                musicEngine.centsBetween(
                    frequency,
                    pitchMemory.trial.targetFrequency
                )
            ) < 200
        ) {
            frequency = randomPitchMemoryFrequency(random);
        }

        musicEngine.audio.playTransient(
            frequency,
            'sine',
            0.12,
            0.7,
            1.45 + index * 0.18
        );
    }
}

function playNovelPitchMemoryMelody(random, startingFrequency) {
    const intervals = [0];
    let semitones = 0;

    for (let index = 1; index < 8; index += 1) {
        const steps = [-5, -3, -2, 2, 3, 5];
        const step = steps[Math.floor(random() * steps.length)];

        semitones = musicEngine.clamp(semitones + step, -7, 12);
        intervals.push(semitones);
    }

    intervals.forEach((interval, index) => {
        musicEngine.audio.playTransient(
            startingFrequency *
                2 ** (interval / musicEngine.SEMITONES_PER_OCTAVE),
            'sine',
            0.3,
            0.75,
            index * 0.38
        );
    });
}

function setPitchMemoryReplayEnabled(enabled) {
    musicEngine.getAction('pitch-memory-play').disabled = !enabled;
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

    musicEngine.audio.stopTransient();

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
    musicEngine.getAction('pitch-memory-stop').disabled = false;

    // Consume the value originally used to select targetFrequency.
    randomPitchMemoryFrequency(random);

    if (pitchMemory.trial.type === 'novel') {
        playNovelPitchMemoryMelody(random, pitchMemory.trial.targetFrequency);
    } else {
        musicEngine.audio.playTransient(
            pitchMemory.trial.targetFrequency,
            'sine',
            1.2,
            0.8
        );
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
        musicEngine.getAction('pitch-memory-stop').disabled = true;
        savePitchMemoryState();
    }, playbackSeconds * 1000);

    savePitchMemoryState();
    schedulePitchMemoryResponse();
}

function newPitchMemoryTrial() {
    cancelPitchAdvance();
    cancelPitchMemoryTrial(false);

    const type = musicEngine.getControl('pitch-memory-type').value;
    void activatePitchMemoryMicrophone();

    const seed = randomSeed();
    const random = seededRandom(seed);
    const distractors = Number(
        musicEngine.getControl('pitch-memory-distractors').value
    );
    const delaySeconds = Number(
        musicEngine.getControl('pitch-memory-delay').value
    );
    const sequenceSeconds = 1.45 + distractors * 0.18;

    pitchMemory.trial = {
        type,
        condition:
            type === 'novel'
                ? `${delaySeconds}s delay`
                : `${distractors} distractors`,
        targetFrequency: randomPitchMemoryFrequency(random),
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
    clearPitchMemoryPitchMarkers();
    musicEngine.getOutput('pitch-memory-result').textContent = '';
    setPitchMemoryReplayEnabled(true);
    musicEngine.getAction('pitch-memory-stop').disabled = false;

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
    musicEngine.audio.stopTransient();

    pitchMemory.trial = null;

    const playButton = musicEngine.getAction('pitch-memory-play');

    if (!playButton) {
        return;
    }

    playButton.disabled = true;
    musicEngine.getAction('pitch-memory-stop').disabled = true;
    hidePitchMemoryResponses();

    if (showStatus) {
        setPitchMemoryStatus('Trial cancelled.');
    }

    savePitchMemoryState();
}

function stopPitchMemoryAudio() {
    cancelPitchAdvance();
    clearPitchMemoryTimers();
    musicEngine.audio.stopTransient();
    stopPitchMemoryResponseTone();

    if (pitchMemory.replayTimer !== null) {
        clearTimeout(pitchMemory.replayTimer);
        pitchMemory.replayTimer = null;
    }

    if (pitchMemory.trial?.state !== 'complete') {
        pitchMemory.trial.state = 'stopped';
        musicEngine.getAction('pitch-memory-stop').disabled = true;
        hidePitchMemoryResponses();
        setPitchMemoryStatus('Trial stopped.');
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
    pitchMemory.responseVoice = musicEngine.audio.playContinuous(
        getPitchMemoryResponseFrequency(),
        'sine',
        0.8
    );
}

function updatePitchMemoryResponseTone() {
    const responseFrequency = getPitchMemoryResponseFrequency();
    const detectedFrequency = pitchMemoryMicrophoneInput.detectedFrequency;
    pitchMemory.responseMethod =
        Number.isFinite(detectedFrequency) &&
        Math.abs(
            musicEngine.centsBetween(responseFrequency, detectedFrequency)
        ) <= musicEngine.PITCH_MEMORY_MICROPHONE_ADJUSTMENT_CENTS
            ? 'microphone'
            : 'oscillator';
    renderPitchMemoryResponsePitch();
    pitchMemory.responseVoice?.setFrequency(responseFrequency);
}

function submitPitchMemoryResponse() {
    if (!pitchMemory.trial || pitchMemory.trial.state !== 'responding') {
        return;
    }

    const method = pitchMemory.responseMethod;
    const responseFrequency = getPitchMemoryResponseFrequency();

    if (!Number.isFinite(responseFrequency) || responseFrequency <= 0) {
        return;
    }

    const scoredResponseFrequency =
        method === 'microphone'
            ? musicEngine.nearestOctaveFrequency(
                  responseFrequency,
                  pitchMemory.trial.targetFrequency
              )
            : responseFrequency;
    const errorCents = musicEngine.centsBetween(
        scoredResponseFrequency,
        pitchMemory.trial.targetFrequency
    );
    const result = {
        timestamp: new Date().toISOString(),
        type: pitchMemory.trial.type,
        method,
        condition: pitchMemory.trial.condition,
        targetFrequency: pitchMemory.trial.targetFrequency,
        responseFrequency,
        scoredResponseFrequency,
        errorCents,
        absoluteErrorCents: Math.abs(errorCents),
        responseTimeMs: Date.now() - pitchMemory.trial.responseStartedAt,
        waveform: 'sine',
        seed: pitchMemory.trial.seed,
    };

    const correct =
        result.absoluteErrorCents < musicEngine.PITCH_MEMORY_CORRECT_CENTS;

    const typeStats =
        musicEngine.stats.pitch[pitchStatsType('memory', result.type)];

    typeStats.trials += 1;
    typeStats.correct += correct ? 1 : 0;
    typeStats.errorTotal += result.absoluteErrorCents;
    typeStats.streak = correct ? typeStats.streak + 1 : 0;

    if (typeStats.best === null || result.absoluteErrorCents < typeStats.best) {
        typeStats.best = result.absoluteErrorCents;
    }

    savePitchStats();
    stopPitchMemoryResponseTone();

    musicEngine.getOutput('pitch-memory-result').textContent =
        result.method === 'microphone'
            ? `Target ${formatPitchAndCents(result.targetFrequency)}; response ${formatPitchAndCents(result.responseFrequency)}; octave-adjusted ${formatPitchAndCents(result.scoredResponseFrequency)}; error ${musicEngine.signed(result.errorCents, 1)} cents.`
            : `Target ${formatPitchAndCents(result.targetFrequency)}; response ${formatPitchAndCents(result.responseFrequency)}; error ${musicEngine.signed(result.errorCents, 1)} cents.`;

    showPitchMemoryPitchMarkers(result);

    musicEngine.getControl('pitch-memory-pitch').disabled = true;
    musicEngine.getAction('pitch-memory-response-play').disabled = true;
    musicEngine.getAction('pitch-memory-response-stop').disabled = true;
    musicEngine.getAction(
        'pitch-memory-submit',
        document.getElementById('pitch-memory-response-actions')
    ).disabled = true;

    pitchMemory.trial.state = 'complete';

    setPitchMemoryReplayEnabled(true);
    musicEngine.getAction('pitch-memory-stop').disabled = false;

    savePitchMemoryState();
    renderPitchStats();
    setPitchMemoryStatus('Trial complete.');
    schedulePitchAdvance();
}

function updatePitchMemoryControls() {
    const novel = musicEngine.getControl('pitch-memory-type').value === 'novel';

    document.querySelector('[data-pitch-memory-type="novel"]').hidden = !novel;
    document.querySelector('[data-pitch-memory-type="interference"]').hidden =
        novel;
    renderPitchStats();
}

function updatePitchMode() {
    const mode = sectionView('pitch');
    updateModePanels('pitch');

    stopAllAudio();
    cancelPitchAdvance();

    if (mode === 'memory') {
        updatePitchMemoryControls();
        if (
            pitchMemory.trial &&
            musicEngine.microphoneRequestState ===
                musicEngine.MICROPHONE_STATES.LISTENING
        ) {
            void activatePitchMemoryMicrophone();
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

    pitchMemoryMicrophoneInput.deactivate('mode-changed');
    newPitchPlacementTrial();
    renderPitchStats();
}

function restorePitchMemoryTrial() {
    const trial = pitchMemory.trial;
    const minimumFrequency = musicEngine.frequencyFromMidi(
        musicEngine.PITCH_MEMORY_MINIMUM_MIDI
    );
    const maximumFrequency = musicEngine.frequencyFromMidi(
        musicEngine.PITCH_MEMORY_MAXIMUM_MIDI
    );

    if (
        !trial ||
        !['novel', 'interference'].includes(trial.type) ||
        !['waiting', 'responding'].includes(trial.state) ||
        !Number.isFinite(trial.targetFrequency) ||
        trial.targetFrequency < minimumFrequency ||
        trial.targetFrequency > maximumFrequency
    ) {
        pitchMemory.trial = null;
        musicEngine.storage.remove(musicEngine.TRIAL_KEYS.pitchMemory);
        updatePitchMemoryControls();
        return;
    }

    musicEngine.getControl('pitch-memory-type').value = trial.type;

    const conditionValue = String(Number.parseInt(trial.condition, 10));

    if (trial.type === 'novel') {
        musicEngine.getControl('pitch-memory-delay').value = conditionValue;
    } else {
        musicEngine.getControl('pitch-memory-distractors').value =
            conditionValue;
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
    musicEngine.getAction('pitch-memory-stop').disabled = true;
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
    const stored = musicEngine.loadStats('match');

    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        return defaultMatchStats();
    }

    return {
        identification: loadMatchIdentificationStats(stored.identification),
        target: loadMatchTargetStats(stored.target),
    };
}

function saveMatchStats() {
    musicEngine.saveStats('match');
}

musicEngine.stats.match = loadMatchStats();

function newMatchTrial(playImmediately = false) {
    if (sectionView('match') === 'identification') {
        newMatchIdentificationTrial(playImmediately);
    } else {
        newMatchTargetTrial();
    }
}

const matchAdvance = musicEngine.createAutoAdvance(
    musicEngine.getModuleActions('match', 'new'),
    () => newMatchTrial(true)
);

function cancelMatchAdvance() {
    matchAdvance.cancel();
}

function scheduleMatchAdvance() {
    matchAdvance.schedule();
}

function renderMatchStats() {
    if (sectionView('match') === 'identification') {
        renderMatchIdentificationStats();
    } else {
        renderMatchTargetStats();
    }
}

function clearMatchStats() {
    if (sectionView('match') === 'identification') {
        musicEngine.stats.match.identification =
            defaultMatchIdentificationStats();
    } else {
        musicEngine.stats.match.target = defaultMatchTargetStats();
    }

    saveMatchStats();
    renderMatchStats();
}

function updateMatchMode() {
    const mode = sectionView('match');
    updateModePanels('match');

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

    const targetFrequency = selectedNoteFrequency(
        musicEngine.getNoteControl('match-target')
    );

    const { minimum: minimumCents, maximum: maximumCents } = readRange(
        musicEngine.getControl('match-target-range-min'),
        musicEngine.getControl('match-target-range-max'),
        10,
        50
    );

    const count = Math.round(
        musicEngine.readNumber(musicEngine.getControl('match-target-count'), 7)
    );

    matchTarget.answers = musicEngine.shuffle(
        matchTargetAnswerOffsets(count, minimumCents, maximumCents).map(
            (cents) => ({
                cents,

                frequency: musicEngine.frequencyFromCents(
                    targetFrequency,
                    cents
                ),

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
    const className = musicEngine.answerStateClass(
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
            `${answer.frequency.toFixed(3)} Hz, ` +
                `${musicEngine.signed(answer.cents, 2)} cents`
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

    musicEngine.audio.playTransient(
        answer.frequency,

        musicEngine.getWaveform('match-target').value,

        musicEngine.readNumber(
            musicEngine.getControl('match-target-duration'),
            1
        )
    );

    if (matchTarget.committed) {
        return;
    }

    const row = document.querySelector(`[data-match-target-answer="${index}"]`);

    const chooseButton = row
        ? musicEngine.getAction('match-target-answer-select', row)
        : null;

    if (chooseButton) {
        chooseButton.disabled = false;
    }
}

function renderMatchTargetStats() {
    const { streak, trials, errorTotal, best } = musicEngine.stats.match.target;
    const meanError = trials > 0 ? errorTotal / trials : 0;

    musicEngine.getOutput('match-target-streak').textContent = String(streak);

    musicEngine.getOutput('match-target-mean-error').textContent =
        `${meanError.toFixed(1)} cents`;

    musicEngine.getOutput('match-target-best').textContent =
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

    musicEngine.audio.stopTransient();

    matchTarget.committed = true;
    matchTarget.selectedAnswerIndex = index;

    const correct = selected.isTarget;
    const errorCents = Math.abs(
        musicEngine.centsBetween(selected.frequency, target.frequency)
    );

    musicEngine.stats.match.target.trials += 1;
    musicEngine.stats.match.target.correct += correct ? 1 : 0;
    musicEngine.stats.match.target.errorTotal += errorCents;
    musicEngine.stats.match.target.streak = correct
        ? musicEngine.stats.match.target.streak + 1
        : 0;

    if (
        correct &&
        (musicEngine.stats.match.target.best === null ||
            musicEngine.stats.match.target.streak >
                musicEngine.stats.match.target.best)
    ) {
        musicEngine.stats.match.target.best =
            musicEngine.stats.match.target.streak;
    }

    saveMatchStats();

    renderMatchTargetAnswers();
    renderMatchTargetStats();
    updateAdaptiveDifficulty('match-target', correct);

    const newMatchButton = [
        ...musicEngine.getModuleActions('match', 'new'),
    ].find((button) => !button.closest('[hidden]'));

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
    const buttons = musicEngine.PITCH_CLASS_NAMES.map((_, pitchClass) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'answer-option';
        button.dataset.matchIdentificationAnswer = String(pitchClass);
        button.textContent = musicEngine.pitchClassName(pitchClass);
        button.disabled = !trial?.played || trial.committed;
        musicEngine.setAnswerOptionState(
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

function newMatchIdentificationTrial(playImmediately = false) {
    cancelMatchAdvance();
    stopAllAudio();
    const octaveValue = musicEngine.getControl(
        'match-identification-octave'
    ).value;
    const octave =
        octaveValue === 'random'
            ? 3 + Math.floor(Math.random() * 3)
            : Number(octaveValue);
    matchIdentification.trial = {
        midi:
            (octave + 1) * musicEngine.SEMITONES_PER_OCTAVE +
            Math.floor(Math.random() * musicEngine.SEMITONES_PER_OCTAVE),
        played: false,
        committed: false,
    };
    musicEngine.clearPracticeResult('match-identification-result');
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
    musicEngine.audio.playTransient(
        musicEngine.frequencyFromMidi(trial.midi),
        musicEngine.getWaveform('match-identification').value,
        musicEngine.readNumber(
            musicEngine.getControl('match-identification-duration'),
            1
        )
    );
    trial.played = true;
    if (!trial.committed) {
        renderMatchIdentificationAnswers();
    }
}

function renderMatchIdentificationStats() {
    const { streak, trials, correct, best } =
        musicEngine.stats.match.identification;
    const accuracy = trials > 0 ? (correct / trials) * 100 : 0;
    musicEngine.getOutput('match-identification-streak').textContent =
        String(streak);
    musicEngine.getOutput('match-identification-accuracy').textContent =
        `${accuracy.toFixed(0)}%`;
    musicEngine.getOutput('match-identification-best').textContent =
        best === null ? '--' : String(best);
}

function commitMatchIdentification(pitchClass) {
    const trial = matchIdentification.trial;
    if (
        !trial?.played ||
        trial.committed ||
        !Number.isInteger(pitchClass) ||
        pitchClass < 0 ||
        pitchClass >= musicEngine.PITCH_CLASS_NAMES.length
    ) {
        return;
    }
    musicEngine.audio.stopTransient();
    trial.committed = true;
    const correct =
        pitchClass === trial.midi % musicEngine.SEMITONES_PER_OCTAVE;
    const typeStats = musicEngine.stats.match.identification;
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
    musicEngine.renderPracticeResult(
        'match-identification-result',
        correct,
        musicEngine.noteNameFromMidi(trial.midi)
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
    const stored = musicEngine.loadStats('interval');

    if (!stored || typeof stored !== 'object') {
        return defaultIntervalStats();
    }

    return {
        recognition: loadIntervalTypeStats(stored.recognition),
        construction: loadIntervalTypeStats(stored.construction),
    };
}

function saveIntervalStats() {
    musicEngine.saveStats('interval');
}

musicEngine.stats.interval = loadIntervalStats();

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
    return `interval-${sectionView('interval')}`;
}

const intervalAdvance = musicEngine.createAutoAdvance(
    musicEngine.getModuleActions('interval', 'new'),
    () => newIntervalTrial(true)
);

function cancelIntervalAdvance() {
    intervalAdvance.cancel();
}

function scheduleIntervalAdvance() {
    intervalAdvance.schedule();
}

function enabledIntervals() {
    const levelName = musicEngine.getControl('shared-interval-set').value;
    const level =
        musicEngine.INTERVAL_LEVELS[levelName] ??
        musicEngine.INTERVAL_LEVELS['starter'];

    return musicEngine.INTERVALS.filter((interval) => interval.level <= level);
}

function updateIntervalMode() {
    updateModePanels('interval');

    renderAdaptiveProgress(getIntervalExercise());
    newIntervalTrial();
    renderIntervalStats();
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

        musicEngine.setAnswerOptionState(
            button,
            answer.semitones,
            selected,
            interval.trial.semitones
        );

        return button;
    });

    if (interval.trial?.mode === 'construction') {
        const prompt = musicEngine.getOutput('interval-construction-prompt');
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

function clearIntervalResult() {
    musicEngine.clearPracticeResult(`${getIntervalExercise()}-result`);
}

// Intervals: recognition and construction

function newIntervalTrial(playImmediately = false) {
    if (sectionView('interval') === 'construction') {
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
    const directionControl = musicEngine.getControl(
        'shared-interval-direction'
    ).value;
    const ascending =
        directionControl === 'random'
            ? Math.random() < 0.5
            : directionControl === 'ascending';

    const distractors = musicEngine
        .shuffle(choices.filter((candidate) => candidate !== target))
        .slice(0, 3);
    const answerSemitones =
        mode === 'construction'
            ? musicEngine
                  .shuffle(musicEngine.INTERVALS)
                  .map(({ semitones }) => semitones)
            : musicEngine
                  .shuffle([...distractors, target])
                  .map(({ semitones }) => semitones);
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
    const duration = musicEngine.readNumber(
        musicEngine.getControl('shared-interval-duration'),
        0.7
    );
    const waveform = musicEngine.getWaveform(
        `interval-${sectionView('interval')}`
    ).value;

    musicEngine.audio.playTransient(
        musicEngine.frequencyFromMidi(trial.rootMidi),
        waveform,
        duration
    );
    musicEngine.audio.playTransient(
        musicEngine.frequencyFromMidi(trial.targetMidi),
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
    const mode = sectionView('interval');
    const { streak, trials, correct, best } = musicEngine.stats.interval[mode];

    const accuracy = trials > 0 ? (correct / trials) * 100 : 0;
    musicEngine.getOutput(`interval-${mode}-streak`).textContent =
        String(streak);

    musicEngine.getOutput(`interval-${mode}-accuracy`).textContent =
        `${accuracy.toFixed(0)}%`;

    musicEngine.getOutput(`interval-${mode}-best`).textContent =
        best === null ? '--' : String(best);
}

function clearIntervalStats() {
    const mode = sectionView('interval');

    musicEngine.stats.interval[mode] = defaultIntervalTypeStats();
    saveIntervalStats();
    renderIntervalStats();
}

function commitInterval(semitones) {
    const trial = interval.trial;

    if (!trial || !trial.played || trial.committed) {
        return;
    }

    musicEngine.audio.stopTransient();
    trial.committed = true;

    const correct = semitones === trial.semitones;
    const correctInterval = musicEngine.INTERVALS.find(
        (candidate) => candidate.semitones === trial.semitones
    );

    musicEngine.stats.interval[trial.mode].trials += 1;
    musicEngine.stats.interval[trial.mode].correct += correct ? 1 : 0;
    musicEngine.stats.interval[trial.mode].streak = correct
        ? musicEngine.stats.interval[trial.mode].streak + 1
        : 0;

    if (
        correct &&
        (musicEngine.stats.interval[trial.mode].best === null ||
            musicEngine.stats.interval[trial.mode].streak >
                musicEngine.stats.interval[trial.mode].best)
    ) {
        musicEngine.stats.interval[trial.mode].best =
            musicEngine.stats.interval[trial.mode].streak;
    }

    saveIntervalStats();
    renderIntervalStats();
    renderIntervalAnswers(semitones, true);
    musicEngine.renderPracticeResult(
        `${getIntervalExercise()}-result`,
        correct,
        correctInterval.name
    );
    updateAdaptiveDifficulty(`interval-${trial.mode}`, correct);

    const playedNotes = document.createElement('div');

    playedNotes.className = 'played-notes';
    playedNotes.textContent =
        `${musicEngine.noteNameFromMidi(trial.rootMidi)} → ` +
        musicEngine.noteNameFromMidi(trial.targetMidi);
    musicEngine
        .getOutput(`${getIntervalExercise()}-result`)
        .append(playedNotes);

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
    const stored = musicEngine.loadStats('chord');

    if (!stored || typeof stored !== 'object') {
        return defaultChordStats();
    }

    return {
        quality: loadChordQualityStats(stored.quality ?? stored.recognition),
    };
}

function saveChordStats() {
    musicEngine.saveStats('chord');
}

musicEngine.stats.chord = loadChordStats();

const chord = {
    quality: null,
    rootMidi: null,
    committed: false,
    playedNotes: [],
};

const chordAdvance = musicEngine.createAutoAdvance(
    musicEngine.getModuleActions('chord', 'new'),
    () => newChordTrial(true)
);

function cancelChordAdvance() {
    chordAdvance.cancel();
}

function scheduleChordAdvance() {
    chordAdvance.schedule();
}

function renderChordAnswers(selected = null, answersEnabled = false) {
    const buttons = Object.keys(musicEngine.CHORD_QUALITIES).map((quality) => {
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'answer-option';
        button.dataset.chordAnswer = quality;
        button.textContent = quality[0].toUpperCase() + quality.slice(1);
        button.disabled = chord.committed || !answersEnabled;

        musicEngine.setAnswerOptionState(
            button,
            quality,
            selected,
            chord.quality
        );

        return button;
    });

    document.querySelector('[data-chord-answers]').replaceChildren(...buttons);
}

function clearChordResult() {
    musicEngine.clearPracticeResult('chord-result');
}

function newChordTrial(playImmediately = false) {
    cancelChordAdvance();
    stopAllAudio();

    const qualities = Object.keys(musicEngine.CHORD_QUALITIES);

    chord.quality = qualities[Math.floor(Math.random() * qualities.length)];
    chord.rootMidi =
        musicEngine.MIDI_NOTES.C3 +
        Math.floor(
            Math.random() *
                (musicEngine.MIDI_NOTES.C5 - musicEngine.MIDI_NOTES.C3)
        );
    chord.committed = false;
    chord.playedNotes = [];

    clearChordResult();
    renderChordAnswers();

    if (playImmediately) {
        playChordTrial();
    }
}

function playChordTrial() {
    if (!chord.quality) {
        newChordTrial();

        if (!chord.quality) {
            return;
        }
    }

    cancelChordAdvance();
    stopAllAudio();

    const waveform = musicEngine.getWaveform('chord').value;
    const playback = musicEngine.getControl('chord-playback').value;
    const sequential = playback !== 'together';
    const intervals = [...musicEngine.CHORD_QUALITIES[chord.quality]];

    if (playback === 'descending') {
        intervals.reverse();
    }

    chord.playedNotes = intervals.map(
        (semitones) => chord.rootMidi + semitones
    );

    intervals.forEach((semitones, index) => {
        musicEngine.audio.playTransient(
            musicEngine.frequencyFromMidi(chord.rootMidi + semitones),
            waveform,
            sequential ? 0.7 : 1.2,
            0.55,
            sequential ? index * 0.35 : 0
        );
    });

    if (!chord.committed) {
        renderChordAnswers(null, true);
    }
}

function renderChordStats() {
    const { streak, trials, correct, best } = musicEngine.stats.chord.quality;

    const accuracy = trials > 0 ? (correct / trials) * 100 : 0;

    musicEngine.getOutput('chord-streak').textContent = String(streak);

    musicEngine.getOutput('chord-accuracy').textContent =
        `${accuracy.toFixed(0)}%`;

    musicEngine.getOutput('chord-best').textContent =
        best === null ? '--' : String(best);
}

function clearChordStats() {
    musicEngine.stats.chord.quality = defaultChordQualityStats();

    saveChordStats();

    renderChordStats();
}

function commitChordQuality(quality) {
    if (chord.committed || !musicEngine.CHORD_QUALITIES[quality]) {
        return;
    }

    musicEngine.audio.stopTransient();
    chord.committed = true;

    const correct = quality === chord.quality;

    musicEngine.stats.chord.quality.trials += 1;
    musicEngine.stats.chord.quality.correct += correct ? 1 : 0;
    musicEngine.stats.chord.quality.streak = correct
        ? musicEngine.stats.chord.quality.streak + 1
        : 0;

    if (
        correct &&
        (musicEngine.stats.chord.quality.best === null ||
            musicEngine.stats.chord.quality.streak >
                musicEngine.stats.chord.quality.best)
    ) {
        musicEngine.stats.chord.quality.best =
            musicEngine.stats.chord.quality.streak;
    }

    saveChordStats();
    renderChordStats();
    renderChordAnswers(quality, true);

    musicEngine.renderPracticeResult(
        'chord-result',
        correct,
        `${chord.quality[0].toUpperCase()}${chord.quality.slice(1)}`
    );

    const playedNotes = document.createElement('div');

    playedNotes.className = 'played-notes';
    playedNotes.textContent = `Notes: ${chord.playedNotes
        .map(musicEngine.noteNameFromMidi)
        .join(', ')}`;
    musicEngine.getOutput('chord-result').append(playedNotes);

    scheduleChordAdvance();
}
