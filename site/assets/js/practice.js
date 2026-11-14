'use strict';

const TRIAL_ADVANCE_DELAY = 3000;
const ADAPTIVE_NARROW_FACTOR = 0.8;
const ADAPTIVE_WIDEN_FACTOR = 1.25;
const ADAPTIVE_WINDOW_SIZE = 5;
const INTERVAL_LEVELS = {
    starter: new Set([2, 4, 5, 7]),
    common: new Set([0, 1, 2, 3, 4, 5, 6, 7]),
    all: new Set(music.INTERVALS.map(({ semitones }) => semitones)),
};
const PITCH_MEMORY_ANALYSIS_INTERVAL_MS = 50;
const PITCH_MEMORY_CORRECT_CENTS = 25;
const PITCH_MEMORY_FREQUENCY_SAMPLE_LIMIT = 9;
const PITCH_MEMORY_MAXIMUM_MIDI = music.MIDI_NOTES.B6;
const PITCH_MEMORY_MICROPHONE_ADJUSTMENT_CENTS = 50;
const PITCH_MEMORY_MINIMUM_MIDI = music.MIDI_NOTES.C3;
const PITCH_MEMORY_RANGE_CENTS =
    (PITCH_MEMORY_MAXIMUM_MIDI - PITCH_MEMORY_MINIMUM_MIDI) * 100;

function shuffle(items) {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));

        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }

    return result;
}

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

let practiceConfigurationProvider = null;

function configurePractice(provider) {
    practiceConfigurationProvider = provider;
}

function practiceConfiguration() {
    if (!practiceConfigurationProvider) {
        throw new Error('Practice is not configured.');
    }
    return practiceConfigurationProvider();
}

function renderStats() {
    renderStatsView(engine.stats);
}

function newTrial() {
    switch (`${activeSection}/${activeView}`) {
        case 'rhythm/sheet':
            newRhythmTrial();
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

function clearStats(mode, type = null) {
    engine.resetStats(activeSection, mode, type);
    renderStats();
}

function updateSectionMode() {
    switch (activeSection) {
        case 'tuner':
        case 'chord':
            updateModePanels(activeSection);
            break;
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

const pitchPlacement = {
    trial: null,
    adaptiveResults: [],
};

function newPitchTrial() {
    if (practiceConfiguration().modes.pitch === 'memory') {
        newPitchMemoryTrial();
    } else {
        newPitchPlacementTrial(true);
    }
}

const pitchAdvance = createAutoAdvance('pitch', newPitchTrial);

function cancelPitchAdvance() {
    pitchAdvance.cancel();
}

function schedulePitchAdvance() {
    pitchAdvance.schedule();
}

function updateAdaptiveDifficulty(exercise, correct) {
    const state = getAdaptiveState(exercise);
    const configuration = practiceConfiguration();
    if (!configuration.adaptive) {
        state.adaptiveResults.length = 0;
        return;
    }

    state.adaptiveResults.push(correct);

    if (state.adaptiveResults.length < ADAPTIVE_WINDOW_SIZE) {
        renderAdaptiveStatus(
            exercise,
            `${state.adaptiveResults.length} of ` +
                `${ADAPTIVE_WINDOW_SIZE} answers`
        );
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
        renderAdaptiveStatus(
            exercise,
            `Unchanged ${correctCount}/${ADAPTIVE_WINDOW_SIZE}`
        );
        return;
    }

    let result;

    if (
        exercise === 'interval-recognition' ||
        exercise === 'interval-construction'
    ) {
        const level = configuration.interval.levels;
        const selectedIndex = clamp(
            level.index + (factor < 1 ? 1 : -1),
            0,
            level.values.length - 1
        );
        result = level.values[selectedIndex];
        renderSettingSelectedIndex('shared-interval-set', selectedIndex);
        for (const intervalExercise of [
            'interval-recognition',
            'interval-construction',
        ]) {
            resetAdaptiveProgress(intervalExercise);
        }
    } else {
        const range = {
            'pitch-placement': configuration.pitch.placement.range,
            'match-target': configuration.match.target.range,
        }[exercise];
        const minimum = clamp(
            Math.round(range.minimum * factor * 10) / 10,
            range.minimumLimit,
            range.maximumLimit
        );
        const maximum = clamp(
            Math.round(range.maximum * factor * 10) / 10,
            range.minimumLimit,
            range.maximumLimit
        );

        renderSettingValue(`${exercise}-range-min`, minimum);
        renderSettingValue(`${exercise}-range-max`, maximum);

        result = `${minimum} - ${maximum}¢`;
    }

    saveCurrentSettings();
    renderAdaptiveStatus(exercise, `${direction} to ${result}`);
}

function getAdaptiveState(exercise) {
    return {
        'pitch-placement': pitchPlacement,
        'match-target': matchTarget,
        'interval-recognition': interval.recognition,
        'interval-construction': interval.construction,
    }[exercise];
}

function resetAdaptiveProgress(exercise) {
    const state = getAdaptiveState(exercise);

    state.adaptiveResults.length = 0;
    renderAdaptiveProgress(
        exercise,
        state.adaptiveResults.length,
        practiceConfiguration().adaptive
    );
}

// Pitch: placement

function clearPitchPlacementResult() {
    clearPracticeResult('pitch-placement-result');
}

function createPitchPlacementTrial() {
    const configuration = practiceConfiguration().pitch.placement;
    const rootFrequency = engine.frequencyFromMidi(configuration.rootMidi);
    const semitones = configuration.interval;
    const { minimum: minimumCents, maximum: maximumCents } =
        configuration.range;

    const magnitude =
        minimumCents + Math.random() * (maximumCents - minimumCents);

    const correctTargetFrequency =
        rootFrequency * 2 ** (semitones / music.SEMITONES_PER_OCTAVE);

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

    const { waveform, duration } = practiceConfiguration().pitch.placement;

    const targetFrequency = music.frequencyFromCents(
        correctTargetFrequency,
        mistuneCents
    );

    engine.audio.playTransient(rootFrequency, waveform, duration);

    engine.audio.playTransient(
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

    engine.audio.stopTransient();

    trial.committed = true;

    const distance = Math.abs(trial.mistuneCents);

    const direction = trial.mistuneCents < 0 ? 'flat' : 'sharp';

    const correct = answer === direction;

    const mistunedFrequency = music.frequencyFromCents(
        trial.correctTargetFrequency,
        trial.mistuneCents
    );

    const frequencyError = mistunedFrequency - trial.correctTargetFrequency;

    setPitchPlacementAnswerState({
        disabled: true,
        selected: answer,
        correct: direction,
    });

    engine.updateStats(engine.stats.pitch.placement, {
        correct,
        error: correct ? 0 : distance,
        bestError: correct ? distance : null,
    });
    renderStats();
    updateAdaptiveDifficulty('pitch-placement', correct);

    renderPracticeResult(
        'pitch-placement-result',
        correct,
        `${direction} - ` +
            `${signed(trial.mistuneCents, 2)} cents ` +
            `(${signed(frequencyError, 3)} Hz)`
    );

    schedulePitchAdvance();
}

// Pitch: memory

const pitchMemory = {
    timer: null,
    countdown: null,
    replayTimer: null,
    responseVoice: null,
    responseMethod: 'oscillator',
};
const pitchMemoryDelayStateListeners = new Set();

function isPitchMemoryDelayActive() {
    return engine.state.pitch.memory?.state === 'waiting';
}

function addPitchMemoryDelayStateListener(listener) {
    pitchMemoryDelayStateListeners.add(listener);
    listener(isPitchMemoryDelayActive());
    return () => pitchMemoryDelayStateListeners.delete(listener);
}

function notifyPitchMemoryDelayStateChange() {
    const active = isPitchMemoryDelayActive();
    for (const listener of pitchMemoryDelayStateListeners) {
        listener(active);
    }
}

const pitchMemoryMicrophoneInput = engine.createMicrophoneInput({
    minimumMidi: PITCH_MEMORY_MINIMUM_MIDI,
    maximumMidi: PITCH_MEMORY_MAXIMUM_MIDI,
    sampleIntervalMs: PITCH_MEMORY_ANALYSIS_INTERVAL_MS,
    processFrame: processPitchMemoryMicrophoneFrame,
    onDeactivate: handlePitchMemoryMicrophoneDeactivation,
    initialState: {
        detectedFrequencies: [],
        detectedFrequency: null,
    },
});

function savePitchMemoryState() {
    if (
        engine.state.pitch.memory &&
        engine.state.pitch.memory.state !== 'complete'
    ) {
        engine.saveState();
    } else {
        engine.removeState('pitch', 'memory');
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
    const minimumFrequency = engine.frequencyFromMidi(
        PITCH_MEMORY_MINIMUM_MIDI
    );
    const maximumFrequency = engine.frequencyFromMidi(
        PITCH_MEMORY_MAXIMUM_MIDI
    );

    return minimumFrequency * (maximumFrequency / minimumFrequency) ** random();
}

function pitchMemoryResponseFrequency(cents) {
    return (
        engine.frequencyFromMidi(PITCH_MEMORY_MINIMUM_MIDI) *
        2 ** (cents / music.CENTS_PER_OCTAVE)
    );
}

function getPitchMemoryResponseFrequency() {
    return pitchMemoryResponseFrequency(
        practiceConfiguration().pitch.memory.responseCents
    );
}

function pitchMemorySliderValueForFrequency(frequency) {
    return clamp(
        music.CENTS_PER_OCTAVE *
            Math.log2(
                frequency / engine.frequencyFromMidi(PITCH_MEMORY_MINIMUM_MIDI)
            ),
        0,
        PITCH_MEMORY_RANGE_CENTS
    );
}

function initializePitchMemorySlider() {
    engine.getState('pitch');
    renderPitchMemorySliderInitialized();
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
        engine.state.pitch.memory &&
        engine.state.pitch.memory.state !== 'complete'
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

    if (samplesUpdated && engine.state.pitch.memory?.state === 'responding') {
        const frequency = engine.audio.detectPitchYin(
            samples,
            sampleRate,
            engine.frequencyFromMidi(microphone.minimumMidi),
            engine.frequencyFromMidi(microphone.maximumMidi)
        );

        if (frequency === null) {
            microphone.detectedFrequencies = [];
        } else {
            addRollingSample(
                microphone.detectedFrequencies,
                frequency,
                PITCH_MEMORY_FREQUENCY_SAMPLE_LIMIT
            );

            microphone.detectedFrequency = median(
                microphone.detectedFrequencies
            );
            pitchMemory.responseMethod = 'microphone';
            renderPitchMemoryDetectedFrequency(microphone.detectedFrequency);
        }
    }
}

async function activatePitchMemoryMicrophone() {
    const active = pitchMemoryMicrophoneInput.isActive();

    setPitchMemoryRefreshEnabled(true);
    if (!active) {
        setPitchMemoryStatus(engine.MICROPHONE_MESSAGES.REQUESTING);
    }

    try {
        if (!(await pitchMemoryMicrophoneInput.activate())) {
            if (engine.microphoneState === engine.MICROPHONE_STATES.DENIED) {
                setPitchMemoryStatus(
                    `${engine.microphoneFailureMessage}; adjust the tone manually.`
                );
            }
            return;
        }

        if (active) {
            setPitchMemoryRefreshEnabled(true);
            setPitchMemoryStatus(engine.MICROPHONE_MESSAGES.LISTENING);
            return;
        }

        pitchMemoryMicrophoneInput.detectedFrequencies = [];
        pitchMemoryMicrophoneInput.detectedFrequency = null;
        setPitchMemoryRefreshEnabled(true);
        renderPitchMemoryNoStablePitch();
        setPitchMemoryStatus(engine.MICROPHONE_MESSAGES.LISTENING);
    } catch {
        setPitchMemoryRefreshEnabled(true);
        setPitchMemoryStatus(
            `${engine.MICROPHONE_MESSAGES.FAILED}; adjust the tone manually.`
        );
    }
}

function showPitchMemoryResponse() {
    if (
        !engine.state.pitch.memory ||
        engine.state.pitch.memory.state === 'responding'
    ) {
        return;
    }

    clearPitchMemoryTimers();
    engine.audio.stopTransient();

    engine.state.pitch.memory.state = 'responding';
    notifyPitchMemoryDelayStateChange();
    engine.state.pitch.memory.responseStartedAt = Date.now();

    const random = seededRandom(engine.state.pitch.memory.seed ^ 0xa55a5aa5);
    const targetCents = pitchMemorySliderValueForFrequency(
        engine.state.pitch.memory.targetFrequency
    );
    const direction = random() < 0.5 ? -1 : 1;
    const offset = direction * (300 + random() * 900);

    pitchMemory.responseMethod = 'oscillator';
    pitchMemoryMicrophoneInput.detectedFrequency = null;
    pitchMemoryMicrophoneInput.detectedFrequencies = [];
    const sliderValue = clamp(
        targetCents + offset,
        0,
        PITCH_MEMORY_RANGE_CENTS
    );
    renderPitchMemoryResponse(
        sliderValue,
        pitchMemoryResponseFrequency(sliderValue)
    );

    savePitchMemoryState();
}

function updatePitchMemoryCountdown() {
    if (
        !engine.state.pitch.memory ||
        engine.state.pitch.memory.state !== 'waiting'
    ) {
        return;
    }

    const remaining = Math.max(
        0,
        engine.state.pitch.memory.availableAt - Date.now()
    );

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
    updatePitchMemoryCountdown();

    if (
        !engine.state.pitch.memory ||
        engine.state.pitch.memory.state !== 'waiting'
    ) {
        return;
    }

    const remaining = Math.max(
        0,
        engine.state.pitch.memory.availableAt - Date.now()
    );

    pitchMemory.timer = window.setTimeout(showPitchMemoryResponse, remaining);
    pitchMemory.countdown = window.setInterval(
        updatePitchMemoryCountdown,
        1000
    );
}

function playInterferenceSequence(random, count) {
    for (let index = 0; index < count; index += 1) {
        let frequency = randomPitchMemoryFrequency(random);

        while (
            Math.abs(
                music.centsBetween(
                    frequency,
                    engine.state.pitch.memory.targetFrequency
                )
            ) < 200
        ) {
            frequency = randomPitchMemoryFrequency(random);
        }

        engine.audio.playTransient(
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

        semitones = clamp(semitones + step, -7, 12);
        intervals.push(semitones);
    }

    intervals.forEach((interval, index) => {
        engine.audio.playTransient(
            startingFrequency * 2 ** (interval / music.SEMITONES_PER_OCTAVE),
            'sine',
            0.3,
            0.75,
            index * 0.38
        );
    });
}

function playPitchMemoryStimulus() {
    cancelPitchAdvance();

    if (
        !engine.state.pitch.memory ||
        engine.state.pitch.memory.state === 'complete' ||
        engine.state.pitch.memory.stimulusPlayed
    ) {
        return;
    }

    engine.audio.stopTransient();

    const random = seededRandom(engine.state.pitch.memory.seed);
    const startedAt = Date.now();
    const conditionValue = Number.parseInt(
        engine.state.pitch.memory.condition,
        10
    );
    const sequenceSeconds = 1.45 + conditionValue * 0.18;

    engine.state.pitch.memory.state = 'waiting';
    notifyPitchMemoryDelayStateChange();
    engine.state.pitch.memory.encodedAt = startedAt;
    engine.state.pitch.memory.encodingEndsAt =
        startedAt + (engine.state.pitch.memory.type === 'novel' ? 3000 : 1200);
    engine.state.pitch.memory.availableAt =
        startedAt +
        (engine.state.pitch.memory.type === 'novel'
            ? conditionValue + 3
            : sequenceSeconds) *
            1000;
    setPitchMemoryStopEnabled(true);

    // Consume the value originally used to select targetFrequency.
    randomPitchMemoryFrequency(random);

    if (engine.state.pitch.memory.type === 'novel') {
        playNovelPitchMemoryMelody(
            random,
            engine.state.pitch.memory.targetFrequency
        );
    } else {
        engine.audio.playTransient(
            engine.state.pitch.memory.targetFrequency,
            'sine',
            1.2,
            0.8
        );
        playInterferenceSequence(random, conditionValue);
    }

    const trialSeed = engine.state.pitch.memory.seed;
    const playbackSeconds =
        engine.state.pitch.memory.type === 'novel'
            ? 3
            : Math.max(1.2, 1.45 + conditionValue * 0.18);

    if (pitchMemory.replayTimer !== null) {
        clearTimeout(pitchMemory.replayTimer);
    }

    pitchMemory.replayTimer = window.setTimeout(() => {
        pitchMemory.replayTimer = null;

        if (engine.state.pitch.memory?.seed !== trialSeed) {
            return;
        }

        engine.state.pitch.memory.stimulusPlayed = true;
        setPitchMemoryReplayEnabled(false);
        setPitchMemoryStopEnabled(false);
        savePitchMemoryState();
    }, playbackSeconds * 1000);

    savePitchMemoryState();
    schedulePitchMemoryResponse();
}

function newPitchMemoryTrial() {
    cancelPitchAdvance();
    activatePitchMemoryMicrophone();
    cancelPitchMemoryTrial(false);

    const configuration = practiceConfiguration().pitch.memory;
    const type = configuration.type;

    const seed = randomSeed();
    const random = seededRandom(seed);
    const distractors = configuration.distractors;
    const delaySeconds = configuration.delay;
    const sequenceSeconds = 1.45 + distractors * 0.18;

    engine.state.pitch.memory = {
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
    notifyPitchMemoryDelayStateChange();

    renderPitchMemoryTrialStarted();

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
    engine.audio.stopTransient();

    engine.state.pitch.memory = null;
    notifyPitchMemoryDelayStateChange();

    renderPitchMemoryTrialCancelled(showStatus);

    savePitchMemoryState();
}

function stopPitchMemoryAudio() {
    cancelPitchAdvance();
    clearPitchMemoryTimers();
    engine.audio.stopTransient();
    stopPitchMemoryResponseTone();

    if (pitchMemory.replayTimer !== null) {
        clearTimeout(pitchMemory.replayTimer);
        pitchMemory.replayTimer = null;
    }

    if (
        engine.state.pitch.memory &&
        engine.state.pitch.memory.state !== 'complete'
    ) {
        engine.state.pitch.memory.state = 'stopped';
        notifyPitchMemoryDelayStateChange();
        renderPitchMemoryTrialStopped();
        savePitchMemoryState();
    }
}

function playPitchMemoryResponse() {
    if (
        !isPitchMemoryResponseVisible() ||
        !engine.state.pitch.memory ||
        engine.state.pitch.memory.state !== 'responding'
    ) {
        return;
    }

    stopPitchMemoryResponseTone();
    pitchMemory.responseMethod = 'oscillator';
    pitchMemory.responseVoice = engine.audio.playContinuous(
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
        Math.abs(music.centsBetween(responseFrequency, detectedFrequency)) <=
            PITCH_MEMORY_MICROPHONE_ADJUSTMENT_CENTS
            ? 'microphone'
            : 'oscillator';
    renderPitchMemoryResponsePitch(responseFrequency);
    pitchMemory.responseVoice?.setFrequency(responseFrequency);
}

function submitPitchMemoryResponse() {
    if (
        !engine.state.pitch.memory ||
        engine.state.pitch.memory.state !== 'responding'
    ) {
        return;
    }

    const method = pitchMemory.responseMethod;
    const responseFrequency = getPitchMemoryResponseFrequency();

    if (!Number.isFinite(responseFrequency) || responseFrequency <= 0) {
        return;
    }

    const scoredResponseFrequency =
        method === 'microphone'
            ? music.nearestOctaveFrequency(
                  responseFrequency,
                  engine.state.pitch.memory.targetFrequency
              )
            : responseFrequency;
    const errorCents = music.centsBetween(
        scoredResponseFrequency,
        engine.state.pitch.memory.targetFrequency
    );
    const result = {
        timestamp: new Date().toISOString(),
        type: engine.state.pitch.memory.type,
        method,
        condition: engine.state.pitch.memory.condition,
        targetFrequency: engine.state.pitch.memory.targetFrequency,
        responseFrequency,
        scoredResponseFrequency,
        errorCents,
        absoluteErrorCents: Math.abs(errorCents),
        responseTimeMs:
            Date.now() - engine.state.pitch.memory.responseStartedAt,
        waveform: 'sine',
        seed: engine.state.pitch.memory.seed,
    };

    const correct = result.absoluteErrorCents < PITCH_MEMORY_CORRECT_CENTS;

    engine.updateStats(engine.stats.pitch.memory[result.type], {
        correct,
        error: result.absoluteErrorCents,
    });
    stopPitchMemoryResponseTone();

    renderPitchMemoryResult(result);

    engine.state.pitch.memory.state = 'complete';
    notifyPitchMemoryDelayStateChange();

    setPitchMemoryReplayEnabled(true);
    setPitchMemoryStopEnabled(true);

    savePitchMemoryState();
    renderStats();
    setPitchMemoryStatus('Trial complete.');
    schedulePitchAdvance();
}

function updatePitchMemoryControls() {
    const novel = practiceConfiguration().pitch.memory.type === 'novel';

    renderPitchMemoryType(novel);
    renderStats();
}

function updatePitchMode() {
    const mode = practiceConfiguration().modes.pitch;
    updateModePanels('pitch');

    stopAllAudio();
    cancelPitchAdvance();

    if (mode === 'memory') {
        updatePitchMemoryControls();
        if (
            engine.state.pitch.memory &&
            engine.microphoneRequestState === engine.MICROPHONE_STATES.LISTENING
        ) {
            activatePitchMemoryMicrophone();
        }
        return;
    }

    if (
        engine.state.pitch.memory?.state === 'waiting' &&
        (engine.state.pitch.memory.type === 'interference' ||
            Date.now() < engine.state.pitch.memory.encodingEndsAt)
    ) {
        cancelPitchMemoryTrial();
    }

    pitchMemoryMicrophoneInput.deactivate('mode-changed');
    newPitchPlacementTrial();
}

function restorePitchMemoryState() {
    const state = engine.state.pitch.memory;
    const minimumFrequency = engine.frequencyFromMidi(
        PITCH_MEMORY_MINIMUM_MIDI
    );
    const maximumFrequency = engine.frequencyFromMidi(
        PITCH_MEMORY_MAXIMUM_MIDI
    );

    if (
        !state ||
        !['novel', 'interference'].includes(state.type) ||
        !['waiting', 'responding'].includes(state.state) ||
        !Number.isFinite(state.targetFrequency) ||
        state.targetFrequency < minimumFrequency ||
        state.targetFrequency > maximumFrequency
    ) {
        notifyPitchMemoryDelayStateChange();
        engine.removeState('pitch', 'memory');
        updatePitchMemoryControls();
        return;
    }

    const conditionValue = String(Number.parseInt(state.condition, 10));
    renderPitchMemoryStoredSettings(state.type, conditionValue);

    updatePitchMemoryControls();

    if (state.state === 'responding') {
        state.state = 'waiting';
        showPitchMemoryResponse();
        return;
    }

    if (!state.stimulusPlayed) {
        state.state = 'ready';
        playPitchMemoryStimulus();
        return;
    }

    setPitchMemoryReplayEnabled(!state.stimulusPlayed);
    setPitchMemoryStopEnabled(false);
    schedulePitchMemoryResponse();
}

// Match

function newMatchTrial(playImmediately = false) {
    if (practiceConfiguration().modes.match === 'identification') {
        newMatchIdentificationTrial(playImmediately);
    } else {
        newMatchTargetTrial();
    }
}

const matchAdvance = createAutoAdvance('match', () => newMatchTrial(true));

function cancelMatchAdvance() {
    matchAdvance.cancel();
}

function scheduleMatchAdvance() {
    matchAdvance.schedule();
}

function updateMatchMode() {
    const mode = practiceConfiguration().modes.match;
    updateModePanels('match');

    stopAllAudio();
    cancelMatchAdvance();

    if (mode === 'identification') {
        newMatchIdentificationTrial();
    } else {
        newMatchTargetTrial();
    }
}

// Match: target

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

    const configuration = practiceConfiguration().match.target;
    const targetFrequency = engine.frequencyFromMidi(configuration.targetMidi);
    const { minimum: minimumCents, maximum: maximumCents } =
        configuration.range;
    const count = configuration.count;

    matchTarget.answers = shuffle(
        matchTargetAnswerOffsets(count, minimumCents, maximumCents).map(
            (cents) => ({
                cents,

                frequency: music.frequencyFromCents(targetFrequency, cents),

                isTarget: Math.abs(cents) < 0.000001,

                played: false,
            })
        )
    );

    matchTarget.committed = false;
    matchTarget.selectedAnswerIndex = null;

    renderMatchTargetAnswers();
}

function playMatchTargetAnswer(index) {
    const answer = matchTarget.answers[index];

    if (!answer) {
        return;
    }

    cancelMatchAdvance();
    stopAllAudio();

    answer.played = true;
    const configuration = practiceConfiguration().match.target;

    engine.audio.playTransient(
        answer.frequency,
        configuration.waveform,
        configuration.duration
    );

    if (matchTarget.committed) {
        return;
    }

    enableMatchTargetAnswer(index);
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

    engine.audio.stopTransient();

    matchTarget.committed = true;
    matchTarget.selectedAnswerIndex = index;

    const correct = selected.isTarget;
    const errorCents = Math.abs(
        music.centsBetween(selected.frequency, target.frequency)
    );

    engine.updateStats(engine.stats.match.target, {
        correct,
        error: errorCents,
    });

    renderMatchTargetAnswers();
    renderStats();
    updateAdaptiveDifficulty('match-target', correct);

    focusVisibleModuleAction('match', 'new');

    scheduleMatchAdvance();
}

// Match: identification

const matchIdentification = { trial: null };

function playMatchIdentificationNote(midi) {
    const configuration = practiceConfiguration().match.identification;
    engine.audio.playTransient(
        engine.frequencyFromMidi(midi),
        configuration.waveform,
        configuration.duration
    );
}

function newMatchIdentificationTrial(playImmediately = false) {
    cancelMatchAdvance();
    stopAllAudio();
    const octaveValue = practiceConfiguration().match.identification.octave;
    const octave =
        octaveValue === 'random'
            ? 3 + Math.floor(Math.random() * 3)
            : Number(octaveValue);
    matchIdentification.trial = {
        midi:
            (octave + 1) * music.SEMITONES_PER_OCTAVE +
            Math.floor(Math.random() * music.SEMITONES_PER_OCTAVE),
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
    playMatchIdentificationNote(trial.midi);
    trial.played = true;
    if (!trial.committed) {
        renderMatchIdentificationAnswers();
    }
}

function commitMatchIdentification(pitchClass) {
    const trial = matchIdentification.trial;
    if (
        !trial?.played ||
        trial.committed ||
        !Number.isInteger(pitchClass) ||
        pitchClass < 0 ||
        pitchClass >= music.PITCH_CLASS_NAMES.length
    ) {
        return;
    }
    engine.audio.stopTransient();
    trial.committed = true;
    const correct = pitchClass === trial.midi % music.SEMITONES_PER_OCTAVE;
    engine.updateStats(engine.stats.match.identification, {
        correct,
    });
    renderStats();
    renderMatchIdentificationAnswers(pitchClass);
    renderPracticeResult(
        'match-identification-result',
        correct,
        music.noteNameFromMidi(trial.midi)
    );
    const selectedMidi =
        trial.midi - (trial.midi % music.SEMITONES_PER_OCTAVE) + pitchClass;
    playMatchIdentificationNote(selectedMidi);
    scheduleMatchAdvance();
}

// Intervals

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
    return `interval-${practiceConfiguration().modes.interval}`;
}

const intervalAdvance = createAutoAdvance('interval', () =>
    newIntervalTrial(true)
);

function cancelIntervalAdvance() {
    intervalAdvance.cancel();
}

function scheduleIntervalAdvance() {
    intervalAdvance.schedule();
}

function enabledIntervals() {
    const levelName = practiceConfiguration().interval.level;
    const level = INTERVAL_LEVELS[levelName] ?? INTERVAL_LEVELS['starter'];

    return music.INTERVALS.filter(({ semitones }) => level.has(semitones));
}

function updateIntervalMode() {
    updateModePanels('interval');

    const exercise = getIntervalExercise();
    renderAdaptiveProgress(
        exercise,
        getAdaptiveState(exercise).adaptiveResults.length,
        practiceConfiguration().adaptive
    );
    newIntervalTrial();
}

function clearIntervalResult() {
    clearPracticeResult(`${getIntervalExercise()}-result`);
}

// Intervals: recognition and construction

function newIntervalTrial(playImmediately = false) {
    if (practiceConfiguration().modes.interval === 'construction') {
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
    const directionControl = practiceConfiguration().interval.direction;
    const ascending =
        directionControl === 'random'
            ? Math.random() < 0.5
            : directionControl === 'ascending';

    const distractors = shuffle(
        choices.filter((candidate) => candidate !== target)
    ).slice(0, 3);
    const answerSemitones =
        mode === 'construction'
            ? shuffle(music.INTERVALS).map(({ semitones }) => semitones)
            : shuffle([...distractors, target]).map(
                  ({ semitones }) => semitones
              );
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
    const configuration = practiceConfiguration();
    const duration = configuration.interval.duration;
    const waveform =
        configuration.interval.waveform[configuration.modes.interval];

    engine.audio.playTransient(
        engine.frequencyFromMidi(trial.rootMidi),
        waveform,
        duration
    );
    engine.audio.playTransient(
        engine.frequencyFromMidi(trial.targetMidi),
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

function commitInterval(semitones) {
    const trial = interval.trial;

    if (!trial || !trial.played || trial.committed) {
        return;
    }

    engine.audio.stopTransient();
    trial.committed = true;

    const correct = semitones === trial.semitones;
    const correctInterval = music.INTERVALS.find(
        (candidate) => candidate.semitones === trial.semitones
    );

    engine.updateStats(engine.stats.interval[trial.mode], {
        correct,
    });
    renderStats();
    renderIntervalAnswers(semitones, true);
    renderPracticeResult(
        `${getIntervalExercise()}-result`,
        correct,
        correctInterval.name
    );
    updateAdaptiveDifficulty(`interval-${trial.mode}`, correct);

    renderPlayedNotes(
        `${getIntervalExercise()}-result`,
        `${music.noteNameFromMidi(trial.rootMidi)} → ` +
            music.noteNameFromMidi(trial.targetMidi)
    );

    scheduleIntervalAdvance();
}

// Chords: quality

const chord = {
    quality: null,
    rootMidi: null,
    committed: false,
    playedNotes: [],
};

const chordAdvance = createAutoAdvance('chord', () => newChordTrial(true));

function cancelChordAdvance() {
    chordAdvance.cancel();
}

function scheduleChordAdvance() {
    chordAdvance.schedule();
}

function clearChordResult() {
    clearPracticeResult('chord-quality-result');
}

function newChordTrial(playImmediately = false) {
    cancelChordAdvance();
    stopAllAudio();

    const qualities = Object.keys(music.CHORD_QUALITIES);

    chord.quality = qualities[Math.floor(Math.random() * qualities.length)];
    chord.rootMidi =
        music.MIDI_NOTES.C3 +
        Math.floor(Math.random() * (music.MIDI_NOTES.C5 - music.MIDI_NOTES.C3));
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

    const { waveform, playback } = practiceConfiguration().chord.quality;
    const sequential = playback !== 'together';
    const intervals = [...music.CHORD_QUALITIES[chord.quality]];

    if (playback === 'descending') {
        intervals.reverse();
    }

    chord.playedNotes = intervals.map(
        (semitones) => chord.rootMidi + semitones
    );

    intervals.forEach((semitones, index) => {
        engine.audio.playTransient(
            engine.frequencyFromMidi(chord.rootMidi + semitones),
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

function commitChordQuality(quality) {
    if (chord.committed || !music.CHORD_QUALITIES[quality]) {
        return;
    }

    engine.audio.stopTransient();
    chord.committed = true;

    const correct = quality === chord.quality;

    engine.updateStats(engine.stats.chord.quality, { correct });
    renderStats();
    renderChordAnswers(quality, true);

    renderPracticeResult(
        'chord-quality-result',
        correct,
        `${chord.quality[0].toUpperCase()}${chord.quality.slice(1)}`
    );

    renderPlayedNotes(
        'chord-quality-result',
        `Notes: ${chord.playedNotes.map(music.noteNameFromMidi).join(', ')}`
    );

    scheduleChordAdvance();
}
