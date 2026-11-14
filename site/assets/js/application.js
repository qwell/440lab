'use strict';

function tunerTargetNoteName() {
    const instrument = selectedTunerInstrument();
    const tuning = selectedTunerTuning(instrument);
    const accidental = tuning?.[2] ?? 'sharp';

    return musicEngine.noteNameFromMidi(tunerTargetMidi, accidental);
}

function selectedNoteFrequency(name) {
    return musicEngine.frequencyFromMidi(Number(readNoteValue(name)));
}

let volumeBeforeMute = musicEngine.DEFAULT_VOLUME;

function currentSettings() {
    return readSettings(musicEngine.loadSettings());
}

function saveCurrentSettings() {
    musicEngine.saveSettings(currentSettings());
}

function restoreSettings() {
    renderSettings(musicEngine.loadSettings());
    saveCurrentSettings();
}

function restoreSetting(name) {
    const separator = name.indexOf('-');
    const group = name.slice(0, separator);
    const setting = name.slice(separator + 1);
    const settings = musicEngine.loadSettings();

    if (Object.hasOwn(settings[group] ?? {}, setting)) {
        renderSetting(name, settings[group][setting]);
    }
    saveCurrentSettings();
}

function updateReferenceFrequency() {
    musicEngine.setReferenceFrequency(
        readNumberSetting(
            'global-reference-a4',
            musicEngine.DEFAULT_A4_FREQUENCY
        )
    );
}

function updateVolume() {
    const volume = musicEngine.clamp(
        Number(readSettingValue('global-volume')),
        0,
        1
    );
    const icon =
        volume === 0
            ? '🔇'
            : volume <= 0.2
              ? '🔈'
              : volume <= 0.6
                ? '🔉'
                : '🔊';
    if (volume > 0) {
        volumeBeforeMute = volume;
    }
    renderVolume(volume, icon);
    musicEngine.setVolume(volume);
    saveCurrentSettings();
}

function toggleVolume() {
    renderSettingValue(
        'global-volume',
        Number(readSettingValue('global-volume')) === 0 ? volumeBeforeMute : 0
    );
    updateVolume();
}

function toggleGlobalMicrophone() {
    if (
        musicEngine.microphoneRequestState ===
        musicEngine.MICROPHONE_STATES.LISTENING
    ) {
        musicEngine.setMicrophoneState(musicEngine.MICROPHONE_STATES.PAUSED);
        return;
    }

    activateCurrentPracticeMicrophone();
}

function resetForReferenceChange() {
    updateReferenceFrequency();
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

let tunerTargetMidi = null;

function selectedTunerInstrument() {
    const name = readSettingValue('tuner-tuning-instrument');
    return musicEngine.TUNER_INSTRUMENTS.find(
        (instrument) => instrument.name === name
    );
}

function selectedTunerTuning(instrument = selectedTunerInstrument()) {
    const name = readSettingValue('tuner-tuning-tuning');
    return instrument?.tunings.find(([tuning]) => tuning === name);
}

function initializeTunerInstruments() {
    renderTunerInstruments(musicEngine.TUNER_INSTRUMENTS);
}

function updateTunerInstrument() {
    renderTunerTunings(selectedTunerInstrument());
    updateTunerStrings();
}

function clearTunerTarget() {
    if (tunerTargetMidi === null) {
        return;
    }

    tunerTargetMidi = null;
    renderTunerTargetCleared();
    resetTunerTracking(true);
    tunerMicrophoneInput.lastValidTime = 0;
    resetTunerDetection(
        tunerMicrophoneInput.isActive()
            ? musicEngine.MICROPHONE_MESSAGES.LISTENING
            : musicEngine.MICROPHONE_MESSAGES.PAUSED
    );
}

function updateTunerStrings() {
    stopTuner();
    clearTunerTarget();
    const instrument = selectedTunerInstrument();
    if (!instrument) {
        renderTunerStrings();
        return;
    }
    const [, notes, accidental = 'sharp'] = selectedTunerTuning(instrument);
    renderTunerStrings(notes, accidental, playTunerString);
}

function playTunerString(midi, button) {
    const wasPlaying = tunerVoice !== null && tunerTargetMidi === midi;
    stopAllAudio();
    if (tunerTargetMidi !== midi) {
        tunerTargetMidi = midi;
        renderTunerStringSelection(button);
    }
    if (wasPlaying) {
        return;
    }
    tunerVoice = musicEngine.audio.playContinuous(
        musicEngine.frequencyFromMidi(midi),
        readWaveformValue('tuner-tuning')
    );
    renderTunerStringPlaying(button);
    resetTunerTracking(true);
    tunerMicrophoneInput.lastValidTime = 0;
    resetTunerDetection(
        tunerMicrophoneInput.isActive()
            ? musicEngine.MICROPHONE_MESSAGES.LISTENING
            : musicEngine.MICROPHONE_MESSAGES.PAUSED
    );
}

let tunerVoice = null;

function playTuner() {
    stopAllAudio();
    clearTunerTarget();

    tunerVoice = musicEngine.audio.playContinuous(
        selectedNoteFrequency('tuner-tuning'),
        readWaveformValue('tuner-tuning')
    );
}

function stopTuner() {
    if (!tunerVoice) {
        return;
    }

    tunerVoice.stop();
    tunerVoice = null;

    renderTunerStopped();

    if (tunerTargetMidi !== null) {
        setTunerStatus(
            tunerMicrophoneInput.isActive()
                ? musicEngine.MICROPHONE_MESSAGES.LISTENING
                : musicEngine.MICROPHONE_MESSAGES.PAUSED
        );
    }
}

function stopAuxiliaryAudio() {
    stopTuner();
    stopMidiPianoRollVoices();
    stopPitchMemoryResponseTone();
    musicEngine.audio.stopTransient();
}

function stopAllAudio() {
    stopRhythm();
    stopMidi();
    stopAuxiliaryAudio();
}

function stopAllActivity() {
    stopAllAudio();
    musicEngine.setMicrophoneState(musicEngine.MICROPHONE_STATES.PAUSED);
    cancelAdvance();
}

// Navigation

let activeSection = readActiveSection();

const sectionViewOptions = {
    tuner: ['tuning'],
    rhythm: ['metronome', 'sheet'],
    midi: ['sheet', 'piano-roll'],
    pitch: ['placement', 'memory'],
    match: ['target', 'identification'],
    interval: ['recognition', 'construction'],
    chord: ['quality'],
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
    } else if (activeSection === 'rhythm' && isRhythmSheetEnabled()) {
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
        case 'interval':
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
        loadMidiAssets().catch(() => {});
    } else if (sectionName === 'rhythm') {
        loadSoundFontCatalog().catch(() => {});
    }

    if (
        !pitchMemoryActive &&
        musicEngine.state.pitch.memory?.state === 'waiting' &&
        (musicEngine.state.pitch.memory.type === 'interference' ||
            Date.now() < musicEngine.state.pitch.memory.encodingEndsAt)
    ) {
        cancelPitchMemoryTrial();
    }

    renderActiveSection(button, sectionName);

    stopAllAudio();
    musicEngine.deactivateActiveMicrophoneInput('page-changed');

    if (
        pitchMemoryActive &&
        musicEngine.state.pitch.memory &&
        musicEngine.microphoneRequestState ===
            musicEngine.MICROPHONE_STATES.LISTENING
    ) {
        activatePitchMemoryMicrophone();
    } else if (
        sectionName === 'tuner' &&
        musicEngine.microphoneRequestState ===
            musicEngine.MICROPHONE_STATES.LISTENING
    ) {
        activateTunerMicrophone();
    } else if (
        sectionName === 'rhythm' &&
        isRhythmSheetEnabled() &&
        musicEngine.microphoneRequestState ===
            musicEngine.MICROPHONE_STATES.LISTENING
    ) {
        activateRhythmSheetMicrophone();
    }

    if (updateUrl) {
        pushUrlHash(sectionHash(sectionName));
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
    renderTunerReset(status);
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

function updateTunerDetection(frequency) {
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

    renderTunerDetection({
        cents: tunerMicrophoneInput.smoothedCents,
        frequency,
        nearest,
    });
}

function updateTunerHistory(time = performance.now()) {
    const cutoff = time - musicEngine.TUNER_PLOT_SECONDS * 1000;
    tunerMicrophoneInput.plotSamples = tunerMicrophoneInput.plotSamples.filter(
        (sample) => sample.time >= cutoff
    );
    renderTunerHistory(time);
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
                updateTunerDetection(detectedFrequency);
            }
        }

        if (time - tunerMicrophoneInput.lastValidTime > 400) {
            resetTunerTracking(frequency === null);

            resetTunerDetection(
                musicEngine.MICROPHONE_MESSAGES.NO_STABLE_PITCH
            );
        }
    }

    updateTunerHistory(time);
}

async function activateTunerMicrophone() {
    const active = tunerMicrophoneInput.isActive();
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
        updateTunerHistory();

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
const localMidiFiles = new Map();
const localSoundFonts = new Map();
const vendorScripts = new Map();
let midiAssetsPromise = null;
let soundFontCatalogPromise = null;
let soundFontStatusRequest = 0;
let playbackControlLoadingCount = 0;

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
    renderSoundFontOptions();
    restoreSetting('shared-soundfont');
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
    ])
        .then(restoreMidiPianoRollState)
        .catch((error) => {
            midiAssetsPromise = null;
            setMidiPlayerStatus(error.message);
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

function nextRiffChunkOffset(view, dataEnd, size, containerEnd) {
    if (size % 2 === 0 || dataEnd === containerEnd) {
        return dataEnd;
    }
    if (/^[\x20-\x7e]{4}$/u.test(readFourCC(view, dataEnd))) {
        return dataEnd;
    }
    return dataEnd + 1 <= containerEnd ? dataEnd + 1 : null;
}

function soundFontMetadata(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 12) {
        return null;
    }
    if (
        readFourCC(view, 0) !== 'RIFF' ||
        !['sfbk', 'sfpk', 'sfen'].includes(readFourCC(view, 8))
    ) {
        return null;
    }

    const riffEnd = view.getUint32(4, true) + 8;
    if (riffEnd < 12 || riffEnd > view.byteLength) {
        return null;
    }

    const lists = new Set();
    let name = null;
    for (let offset = 12; offset + 8 <= riffEnd;) {
        const chunkSize = view.getUint32(offset + 4, true);
        const chunkData = offset + 8;
        const chunkEnd = chunkData + chunkSize;
        if (chunkEnd > riffEnd) {
            return null;
        }

        if (readFourCC(view, offset) === 'LIST' && chunkSize >= 4) {
            const listType = readFourCC(view, chunkData);
            lists.add(listType);
            if (listType === 'INFO') {
                for (
                    let infoOffset = chunkData + 4;
                    infoOffset + 8 <= chunkEnd;
                ) {
                    const infoSize = view.getUint32(infoOffset + 4, true);
                    const infoData = infoOffset + 8;
                    const infoEnd = infoData + infoSize;
                    if (infoEnd > chunkEnd) {
                        return null;
                    }
                    if (readFourCC(view, infoOffset) === 'INAM') {
                        name = new TextDecoder()
                            .decode(new Uint8Array(buffer, infoData, infoSize))
                            .replace(/\0.*$/su, '')
                            .trim();
                    }
                    const nextInfoOffset = nextRiffChunkOffset(
                        view,
                        infoEnd,
                        infoSize,
                        chunkEnd
                    );
                    if (nextInfoOffset === null) {
                        return null;
                    }
                    infoOffset = nextInfoOffset;
                }
            }
        }
        const nextOffset = nextRiffChunkOffset(
            view,
            chunkEnd,
            chunkSize,
            riffEnd
        );
        if (nextOffset === null) {
            return null;
        }
        offset = nextOffset;
    }

    return ['INFO', 'sdta', 'pdta'].every((list) => lists.has(list))
        ? { name: name || null }
        : null;
}

// MIDI: player

const midiPlayer = {
    tracks: [],
    notes: [],
    total: 0,
    playing: false,
    loading: false,
    loadRequest: 0,
    playRequest: 0,
    frame: null,
    position: 0,
    elapsed: 0,
    duration: 0,
    fileName: '',
    source: null,
    summary: '',
    buffer: null,
    tempoMap: [],
    signatureMap: [],
    ticksPerQuarter: 0,
    unitsPerQuarter: 1,
    pianoRollPosition: 0,
    pianoRollSegments: [],
    pianoRollSegmentElements: new Map(),
    pianoRollKeyElements: new Map(),
    pianoRollMarkers: [],
    pianoRollMarkerElements: new Map(),
    pianoRollTrackElements: new Map(),
    pianoRollMaximumNote: 0,
    pianoRollSegmentPrefixEnds: [],
    pianoRollResizeObserver: null,
    pianoRollLegendResizeObserver: null,
    pianoRollTimeline: null,
    pianoRollVisibleDuration: 0,
    pianoRollWindowEnd: -Infinity,
    pianoRollWindowStart: Infinity,
    leadInStartedAt: null,
};
const midiSheetHighlightStates = new WeakMap();

function initializeMidiState() {
    musicEngine.getState('midi');
}

function restoreMidiPianoRollTracks(tracks, source) {
    const state = musicEngine.state.midi['piano-roll'];

    if (state?.file !== source || !state.tracks) {
        return;
    }

    for (const track of tracks) {
        const trackState = state.tracks[track.trackIndex];

        if (typeof trackState?.enabled === 'boolean') {
            track.enabled = trackState.enabled;
        }
        if (
            trackState?.instrument &&
            typeof trackState.instrument === 'object' &&
            !Array.isArray(trackState.instrument)
        ) {
            track.instrumentOverride = { ...trackState.instrument };
        }
    }
}

function restoreMidiPianoRollPosition(source) {
    const state = musicEngine.state.midi['piano-roll'];

    if (state?.file !== source || !Number.isFinite(state.position)) {
        return;
    }

    midiPlayer.elapsed = musicEngine.clamp(
        state.position,
        0,
        midiPlayer.duration
    );
    midiPlayer.position = musicEngine.clamp(
        midiPositionAtTime(midiPlayer.elapsed),
        0,
        midiPlayer.total
    );
    midiPlayer.pianoRollPosition = midiPlayer.position;
}

function saveMidiPianoRollState(position = midiPlayer.elapsed) {
    if (!midiPlayer.source) {
        musicEngine.removeState('midi', 'piano-roll');
        return;
    }

    musicEngine.state.midi['piano-roll'] = {
        file: midiPlayer.source,
        position,
        tracks: Object.fromEntries(
            midiPlayer.tracks.map((track) => [
                track.trackIndex,
                {
                    enabled: track.enabled,
                    instrument: track.instrumentOverride
                        ? { ...track.instrumentOverride }
                        : null,
                },
            ])
        ),
    };
    musicEngine.saveState();
}

async function restoreMidiPianoRollState() {
    const state = musicEngine.state.midi['piano-roll'];

    if (!state || !(globalThis.midiFiles ?? []).includes(state.file)) {
        return;
    }

    renderMidiPianoRollSelection(state);
    await loadIncludedMidi(state.file);
}

const soundFontSynthesizer = {
    initializePromise: null,
    synth: null,
    createSequencer: null,
    soundFontId: null,
    soundFontPromise: null,
};

const midiPlayback = {
    initializePromise: null,
    sequencer: null,
    loadedBuffer: null,
    generatedTones: false,
    generatedToneNotes: [],
    generatedToneIndex: 0,
};

const midiPianoRollVoices = new Map();

function updateMidiMode() {
    updateModePanels('midi');
}

function midiPresetForPatch(
    patch,
    presets = soundFontSynthesizer.synth?.presetList ?? []
) {
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
    return exact ?? fallback;
}

function midiPresetName(patch) {
    return midiPresetForPatch(patch)?.name;
}

function midiTrackLabel(track) {
    if (track.instrumentOverride) {
        return track.instrumentOverride.name.localeCompare(
            track.name,
            undefined,
            { sensitivity: 'accent' }
        ) === 0
            ? `*${track.name}`
            : `${track.name} (*${track.instrumentOverride.name})`;
    }
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

function midiPresetValue(preset) {
    return [
        Number(preset.isDrum),
        preset.bankMSB,
        preset.bankLSB,
        preset.program,
    ].join(':');
}

function midiInstrumentPresets(track) {
    const drumStates = new Set(track.patches.map((patch) => patch.isDrum));
    return (soundFontSynthesizer.synth?.presetList ?? []).filter(
        (preset) =>
            drumStates.size !== 1 || drumStates.has(Boolean(preset.isDrum))
    );
}

function midiOriginalPresetValue(
    track,
    presets = midiInstrumentPresets(track)
) {
    for (const patch of track.patches) {
        const preset = midiPresetForPatch(patch, presets);
        if (preset) {
            return midiPresetValue(preset);
        }
    }
    return '';
}

function updateMidiInstrumentControls() {
    const presetValues = new Set(
        (soundFontSynthesizer.synth?.presetList ?? []).map(midiPresetValue)
    );
    if (
        midiPlayer.tracks.some(
            (track) =>
                track.instrumentOverride &&
                !presetValues.has(midiPresetValue(track.instrumentOverride))
        )
    ) {
        for (const track of midiPlayer.tracks) {
            track.instrumentOverride = null;
        }
        applyMidiInstrumentOverrides();
        updateMidiTrackLabels();
    }
    for (const track of midiPlayer.tracks) {
        updateMidiInstrumentControl(track);
    }
    balanceMidiPianoRollLegends();
}

function midiTrackMuteGroup(selectedTrack) {
    const tracks = new Set([selectedTrack]);
    const channels = new Set(selectedTrack.channels);
    let changed = true;

    while (changed) {
        changed = false;
        for (const track of midiPlayer.tracks) {
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

function applyMidiInstrumentOverrides() {
    if (!soundFontSynthesizer.synth) {
        return;
    }
    const overrides = new Map();
    for (const track of midiPlayer.tracks) {
        if (!track.instrumentOverride) {
            continue;
        }
        for (const channel of track.channels) {
            overrides.set(channel, track.instrumentOverride);
        }
    }
    for (const [
        channel,
        midiChannel,
    ] of soundFontSynthesizer.synth.midiChannels.entries()) {
        midiChannel.setSystemParameter('presetLock', false);
        const override = overrides.get(channel);
        if (!override) {
            continue;
        }
        midiChannel.setDrums(Boolean(override.isDrum));
        soundFontSynthesizer.synth.controllerChange(
            channel,
            0,
            override.bankMSB
        );
        soundFontSynthesizer.synth.controllerChange(
            channel,
            32,
            override.bankLSB
        );
        soundFontSynthesizer.synth.programChange(channel, override.program);
        midiChannel.setSystemParameter('presetLock', true);
    }
}

function resetMidiInstrumentOverrides() {
    for (const track of midiPlayer.tracks) {
        track.instrumentOverride = null;
    }
    applyMidiInstrumentOverrides();
    updateMidiTrackLabels();
    updateMidiInstrumentControls();
    saveMidiPianoRollState();
}

async function changeMidiTrackInstrument(track, value) {
    const preset = value
        ? midiInstrumentPresets(track).find(
              (candidate) => midiPresetValue(candidate) === value
          )
        : null;
    if (value && !preset) {
        updateMidiInstrumentControl(track);
        return;
    }
    const group = midiTrackMuteGroup(track);
    const previous = new Map(
        [...group].map((candidate) => [candidate, candidate.instrumentOverride])
    );
    const reloadOriginal = !preset;
    const resumeMidi = reloadOriginal && midiPlayer.playing;
    if (resumeMidi) {
        stopMidi(true);
    }
    if (reloadOriginal) {
        soundFontSynthesizer.synth?.stopAll(true);
    }
    for (const candidate of group) {
        candidate.instrumentOverride = preset ? { ...preset } : null;
    }

    try {
        if (preset) {
            applyMidiInstrumentOverrides();
        } else {
            await reloadMidiSequence();
        }
        updateMidiTrackLabels();
        syncMidiInstrumentSelections();
        saveMidiPianoRollState();
    } catch (error) {
        for (const [candidate, override] of previous) {
            candidate.instrumentOverride = override;
        }
        applyMidiInstrumentOverrides();
        updateMidiTrackLabels();
        syncMidiInstrumentSelections();
        setMidiPlayerStatus(
            getErrorString(error, 'Unable to change the instrument.')
        );
    } finally {
        if (resumeMidi) {
            await playMidi();
        }
    }
}

function setMidiTrackEnabled(selectedTrack, enabled) {
    for (const track of midiTrackMuteGroup(selectedTrack)) {
        track.enabled = enabled;
        updateMidiTrackToggle(track);
    }
    syncMidiTrackMutes();
    if (midiPlayback.generatedTones) {
        musicEngine.audio.stopTransient();
        midiPlayback.generatedToneIndex = 0;
    }
    updateMidiPianoRoll();
    saveMidiPianoRollState();
}

function syncMidiTrackMutes() {
    if (!soundFontSynthesizer.synth) {
        return;
    }
    const usedChannels = new Set(
        midiPlayer.tracks.flatMap((track) => track.channels)
    );
    for (const [
        channel,
        midiChannel,
    ] of soundFontSynthesizer.synth.midiChannels.entries()) {
        const enabled =
            !midiPlayback.generatedTones &&
            midiPlayer.tracks.some(
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

// MIDI: piano roll

function midiPianoRollNoteTiming(note) {
    return {
        start: note.performanceBeat ?? note.beat,
        duration:
            note.soundingDuration ?? note.performanceDuration ?? note.duration,
    };
}

function midiPianoRollChannel() {
    const usedChannels = new Set(
        midiPlayer.tracks.flatMap((track) => track.channels)
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

function stopMidiPianoRollVoice(midi, voice) {
    window.clearTimeout(voice.timeout);
    voice.cancelled = true;
    voice.stop?.();
    if (midiPianoRollVoices.get(midi) === voice) {
        renderMidiPianoRollKey(voice.key, false);
        midiPianoRollVoices.delete(midi);
    }
}

function stopMidiPianoRollVoices() {
    for (const [midi, voice] of midiPianoRollVoices) {
        stopMidiPianoRollVoice(midi, voice);
    }
}

function scheduleMidiPianoRollRelease(midi, voice) {
    const heldMilliseconds = voice.releasedAt - voice.pressedAt;
    const delay =
        heldMilliseconds < musicEngine.MIDI_PIANO_ROLL_QUICK_PRESS_MS
            ? Math.max(
                  0,
                  voice.startedAt +
                      musicEngine.MIDI_PIANO_ROLL_QUICK_DURATION_MS -
                      performance.now()
              )
            : 0;
    voice.timeout = window.setTimeout(
        () => stopMidiPianoRollVoice(midi, voice),
        delay
    );
}

function releaseMidiPianoRollKey(midi) {
    const voice = midiPianoRollVoices.get(midi);
    if (!voice || voice.releasedAt !== null) {
        return;
    }
    voice.releasedAt = performance.now();
    if (!voice.stop) {
        return;
    }
    scheduleMidiPianoRollRelease(midi, voice);
}

async function startMidiPianoRollKey(midi, key) {
    const previousVoice = midiPianoRollVoices.get(midi);
    if (previousVoice) {
        stopMidiPianoRollVoice(midi, previousVoice);
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
    midiPianoRollVoices.set(midi, voice);
    renderMidiPianoRollKey(key, true);

    let soundFontChannel = null;
    try {
        const channel = midiPianoRollChannel();
        if ((await prepareSoundFontPlayback()) && channel !== null) {
            soundFontChannel = channel;
        }
    } catch {
        // Use a generated tone below.
    }

    if (voice.cancelled || midiPianoRollVoices.get(midi) !== voice) {
        return;
    }

    if (soundFontChannel !== null) {
        const synth = soundFontSynthesizer.synth;
        synth.midiChannels[soundFontChannel]?.setSystemParameter(
            'isMuted',
            false
        );
        synth.programChange(
            soundFontChannel,
            musicEngine.MIDI_PIANO_ROLL_PROGRAM
        );
        synth.noteOn(
            soundFontChannel,
            midi,
            musicEngine.MIDI_PIANO_ROLL_VELOCITY
        );
        voice.stop = () => synth.noteOff(soundFontChannel, midi);
    } else {
        const oscillator = musicEngine.audio.playContinuous(
            musicEngine.frequencyFromMidi(midi),
            'triangle',
            musicEngine.MIDI_PIANO_ROLL_VOLUME
        );
        voice.stop = () => oscillator.stop();
    }
    voice.startedAt = performance.now();

    if (voice.releasedAt !== null) {
        scheduleMidiPianoRollRelease(midi, voice);
    }
}

function strikeMidiPianoRollKey(key) {
    const midi = Number(key.dataset.midiPianoRollKey);
    startMidiPianoRollKey(midi, key);
}

function midiPianoRollSegments(notes) {
    const eventsByPitch = new Map();
    for (const note of notes) {
        const timing = midiPianoRollNoteTiming(note);
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

function midiPianoRollSegmentIndexAtOrAfter(position) {
    let low = 0;
    let high = midiPlayer.pianoRollSegments.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (midiPlayer.pianoRollSegments[middle].start < position) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
}

function midiPianoRollMarkerIndexAtOrAfter(position) {
    let low = 0;
    let high = midiPlayer.pianoRollMarkers.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (midiPlayer.pianoRollMarkers[middle].position < position) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
}

function midiMeasureDurationAtPosition(position) {
    let signature = midiPlayer.signatureMap[0];
    for (const candidate of midiPlayer.signatureMap) {
        if (candidate.position > position) {
            break;
        }
        signature = candidate;
    }
    return signature
        ? (signature.numerator * midiPlayer.unitsPerQuarter * 4) /
              signature.denominator
        : midiPlayer.unitsPerQuarter * 4;
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
            selector: `#midi-sheet-track-${trackIndex + 1}-${clef}`,
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
        selector: `#midi-sheet-track-${trackIndex + 1}-percussion`,
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
    for (const track of midiPlayer.tracks) {
        for (const score of track.scores) {
            destroySheetScore(score);
        }
    }
}

function setMidiPlayer(parsed, fileName, source = null) {
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
                instrumentOverride: null,
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
    restoreMidiPianoRollTracks(tracks, source);
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
    Object.assign(midiPlayer, {
        tracks,
        notes,
        total: playbackTotal,
        fileName,
        source,
        summary,
        position: 0,
        elapsed: 0,
        duration: parsed.durationSeconds,
        tempoMap: parsed.tempoMap,
        signatureMap,
        ticksPerQuarter: parsed.ticksPerQuarter,
        unitsPerQuarter,
        pianoRollPosition: 0,
        leadInStartedAt: null,
    });
    restoreMidiPianoRollPosition(source);
    syncMidiTrackMutes();
    renderMidiFile(hasSignatureChanges);
    updateMidiMode();
    updateMidiPlayerTransport();
    setMidiPlayerStatus(midiPlayer.summary);
}

function beginPlaybackControlLoading() {
    playbackControlLoadingCount += 1;
    updateScreenWakeLock();
    updatePlaybackControls();
    let loading = true;

    return () => {
        if (!loading) {
            return;
        }
        loading = false;
        playbackControlLoadingCount = Math.max(
            0,
            playbackControlLoadingCount - 1
        );
        updateScreenWakeLock();
        updatePlaybackControls();
    };
}

function seekMidiPlayer(event) {
    if (!midiPlayer.notes.length) {
        return;
    }

    midiPlayer.elapsed = musicEngine.clamp(
        Number(event.currentTarget.value),
        0,
        midiPlayer.duration
    );
    midiPlayer.position = musicEngine.clamp(
        midiPositionAtTime(midiPlayer.elapsed),
        0,
        midiPlayer.total
    );
    if (midiPlayback.loadedBuffer === midiPlayer.buffer) {
        midiPlayback.sequencer.currentTime = midiPlayer.elapsed;
    }
    if (midiPlayback.generatedTones) {
        musicEngine.audio.stopTransient();
        midiPlayback.generatedToneIndex = 0;
    }
    resetMidiPlayerViews(midiPlayer.position);
    updateMidiPlayerTimer();
    saveMidiPianoRollState();
}

function midiPositionAtTime(seconds) {
    let tempo = midiPlayer.tempoMap[0];
    for (const event of midiPlayer.tempoMap) {
        if (event.seconds > seconds) {
            break;
        }
        tempo = event;
    }

    const ticks =
        tempo.tick +
        ((seconds - tempo.seconds) * 1000000 * midiPlayer.ticksPerQuarter) /
            tempo.microseconds;
    return (ticks / midiPlayer.ticksPerQuarter) * midiPlayer.unitsPerQuarter;
}

function midiTimeAtPosition(position) {
    const tick =
        (position / midiPlayer.unitsPerQuarter) * midiPlayer.ticksPerQuarter;
    let tempo = midiPlayer.tempoMap[0];
    for (const event of midiPlayer.tempoMap) {
        if (event.tick > tick) {
            break;
        }
        tempo = event;
    }

    return (
        tempo.seconds +
        ((tick - tempo.tick) / midiPlayer.ticksPerQuarter) *
            (tempo.microseconds / 1000000)
    );
}

function midiSheetHighlightState(notation) {
    const existing = midiSheetHighlightStates.get(notation);
    if (existing) {
        return existing;
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
    const state = {
        active: new Set(),
        ends,
        nextEnd: 0,
        nextStart: 0,
        position: -Infinity,
        prefixEnds,
        starts,
    };
    midiSheetHighlightStates.set(notation, state);

    return state;
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

function resetMidiPlayerViews(position = 0) {
    const sheetPosition =
        position === 0 && !midiPlayer.playing
            ? -midiPlayer.unitsPerQuarter *
              musicEngine.MIDI_SHEET_LEAD_IN_QUARTERS
            : position;
    for (const track of midiPlayer.tracks) {
        for (const score of track.scores) {
            positionSheetLane(score, score.selector, sheetPosition);
            resetMidiSheetHighlights(score);
        }
    }
    updateMidiPianoRoll(position);
}

// MIDI: playback

async function initializeSoundFontSynthesizer() {
    if (!soundFontSynthesizer.initializePromise) {
        const finishLoading = beginPlaybackControlLoading();
        soundFontSynthesizer.initializePromise = (async () => {
            const context = musicEngine.audio.getContext();
            let spessaSynth;
            if (isFileProtocol()) {
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
            soundFontSynthesizer.synth = synth;
            soundFontSynthesizer.createSequencer = () =>
                new Sequencer(synth, { skipToFirstNoteOn: false });
        })()
            .catch((error) => {
                soundFontSynthesizer.initializePromise = null;
                throw error;
            })
            .finally(() => {
                finishLoading();
            });
    }

    await soundFontSynthesizer.initializePromise;
}

async function initializeMidiPlayback() {
    if (!midiPlayback.initializePromise) {
        midiPlayback.initializePromise = (async () => {
            await initializeSoundFontSynthesizer();
            const sequencer = soundFontSynthesizer.createSequencer();
            sequencer.eventHandler.addEvent('songEnded', 'midi-player', () => {
                if (midiPlayer.playing) {
                    stopMidi(true);
                }
            });
            midiPlayback.sequencer = sequencer;
            syncMidiTrackMutes();
        })().catch((error) => {
            midiPlayback.initializePromise = null;
            throw error;
        });
    }

    await midiPlayback.initializePromise;
}

function addSoundBank(soundBankManager, soundFontBuffer, soundFontId) {
    const eventId = 'soundfont-load';
    const failed = new Promise((_, reject) => {
        soundFontSynthesizer.synth.eventHandler.addEvent(
            'soundBankError',
            eventId,
            (error) => {
                const message = getErrorString(
                    error,
                    error?.message ?? String(error)
                );
                reject(new Error(message || `Unable to load ${soundFontId}.`));
            }
        );
    });

    return Promise.race([
        soundBankManager.addSoundBank(soundFontBuffer, soundFontId),
        failed,
    ]).finally(() => {
        soundFontSynthesizer.synth.eventHandler.removeEvent(
            'soundBankError',
            eventId
        );
    });
}

async function loadSoundFont() {
    const soundFontId = readSettingValue('shared-soundfont');
    if (soundFontSynthesizer.soundFontId === soundFontId) {
        return true;
    }
    if (soundFontSynthesizer.soundFontPromise) {
        const loaded = await soundFontSynthesizer.soundFontPromise;
        if (soundFontSynthesizer.soundFontId === soundFontId) {
            return loaded;
        }
        return loadSoundFont();
    }

    const name = readSettingSelectedText('shared-soundfont') ?? soundFontId;
    const hideLoading = showSoundFontLoading(name);
    const finishLoading = beginPlaybackControlLoading();
    soundFontSynthesizer.soundFontPromise = (async () => {
        const localSoundFont = localSoundFonts.get(soundFontId);
        if (!localSoundFont && !bundledSoundFonts.includes(soundFontId)) {
            return false;
        }

        let soundFontBuffer;
        if (localSoundFont) {
            soundFontBuffer = await localSoundFont.file.arrayBuffer();
        } else if (isFileProtocol()) {
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

        const metadata = soundFontMetadata(soundFontBuffer);
        if (!metadata) {
            throw new Error(`${name} is not a valid SoundFont.`);
        }
        if (localSoundFont) {
            localSoundFont.label = `Custom (${metadata.name ?? localSoundFont.file.name})`;
            setSharedSelectOption(
                'shared-soundfont',
                soundFontId,
                localSoundFont.label
            );
        }

        const soundBankManager = soundFontSynthesizer.synth.soundBankManager;
        const previousSoundFontId = soundFontSynthesizer.soundFontId;
        await addSoundBank(soundBankManager, soundFontBuffer, soundFontId);
        if (previousSoundFontId && previousSoundFontId !== soundFontId) {
            await soundBankManager.deleteSoundBank(previousSoundFontId);
        }
        soundBankManager.priorityOrder = [
            soundFontId,
            ...soundBankManager.priorityOrder.filter(
                (id) => id !== soundFontId
            ),
        ];
        soundFontSynthesizer.soundFontId = soundFontId;
        if (previousSoundFontId && previousSoundFontId !== soundFontId) {
            resetMidiInstrumentOverrides();
        } else {
            updateMidiTrackLabels();
            updateMidiInstrumentControls();
        }
        return true;
    })();

    try {
        return await soundFontSynthesizer.soundFontPromise;
    } finally {
        soundFontSynthesizer.soundFontPromise = null;
        finishLoading();
        hideLoading();
    }
}

async function prepareSoundFontPlayback() {
    const context = musicEngine.audio.getContext();
    if (context.state === 'suspended') {
        await context.resume();
    }
    await Promise.all([
        loadSoundFontCatalog(),
        initializeSoundFontSynthesizer(),
    ]);
    return loadSoundFont();
}

async function loadLocalSoundFont(file, reportControl) {
    const soundFontId = file.name;
    const previousSoundFontId = readSettingValue('shared-soundfont');
    const previousLocalSoundFont = localSoundFonts.get(soundFontId);
    const soundFont = {
        file,
        label: `Custom (${file.name})`,
    };
    const resumePlayback = stopPlaybackForSoundFontChange();
    const finishLoading = beginPlaybackControlLoading();

    localSoundFonts.set(soundFontId, soundFont);
    setSharedSelectOption('shared-soundfont', soundFontId, soundFont.label);
    midiPlayback.loadedBuffer = null;

    try {
        await prepareSoundFontPlayback();
        await reloadMidiSequence();
        saveMidiPianoRollState();
    } catch (error) {
        if (previousLocalSoundFont) {
            localSoundFonts.set(soundFontId, previousLocalSoundFont);
            setSharedSelectOption(
                'shared-soundfont',
                soundFontId,
                previousLocalSoundFont.label
            );
        } else {
            localSoundFonts.delete(soundFontId);
            removeSharedSelectOption('shared-soundfont', soundFontId);
        }
        renderSoundFontSelection(previousSoundFontId);
        try {
            await prepareSoundFontPlayback();
            await reloadMidiSequence();
        } catch {
            // Preserve the original SoundFont error below.
        }
        const message = getErrorString(error, 'Unable to load the SoundFont.');
        renderSettingError(reportControl, message);
    } finally {
        await resumePlayback?.();
        finishLoading();
    }
}

async function loadMidiSequence() {
    await initializeMidiPlayback();
    if (midiPlayback.loadedBuffer === midiPlayer.buffer) {
        return;
    }

    const buffer = midiPlayer.buffer;
    const sequencer = midiPlayback.sequencer;
    await new Promise((resolve) => {
        const eventId = 'midi-player-load';
        sequencer.eventHandler.addEvent('songChange', eventId, () => {
            sequencer.eventHandler.removeEvent('songChange', eventId);
            resolve();
        });
        sequencer.loadNewSongList([
            {
                binary: buffer.slice(0),
                fileName: midiPlayer.fileName,
            },
        ]);
    });
    midiPlayback.loadedBuffer = buffer;
}

async function reloadMidiSequence() {
    if (!midiPlayer.buffer) {
        return;
    }
    midiPlayback.loadedBuffer = null;
    await loadMidiSequence();
    syncMidiTrackMutes();
    applyMidiInstrumentOverrides();
}

function stopPlaybackForSoundFontChange() {
    let resumePlayback = null;
    if (midiPlayer.playing) {
        resumePlayback = playMidi;
        stopMidi(true);
    }
    const resumeRhythmSheet = rhythmPlayer.playing && isRhythmSheetEnabled();
    if (resumeRhythmSheet) {
        resumePlayback = playRhythm;
    }
    stopRhythm(resumeRhythmSheet);
    stopAuxiliaryAudio();
    return resumePlayback;
}

async function changeSoundFont(setting) {
    const resumePlayback = stopPlaybackForSoundFontChange();
    const finishLoading = beginPlaybackControlLoading();
    midiPlayback.loadedBuffer = null;

    try {
        await prepareSoundFontPlayback();
        await reloadMidiSequence();
        saveMidiPianoRollState();
    } catch (error) {
        const message = getErrorString(error, 'Unable to load the SoundFont.');
        renderSettingError(setting, message);
    } finally {
        await resumePlayback?.();
        finishLoading();
    }
}

async function prepareMidiPlayback() {
    const [, , soundFontLoaded] = await Promise.all([
        loadMidiAssets(),
        initializeMidiPlayback(),
        prepareSoundFontPlayback(),
    ]);
    midiPlayback.generatedTones = !soundFontLoaded;
    midiPlayback.generatedToneNotes = midiPlayback.generatedTones
        ? midiPlayer.notes
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
    syncMidiTrackMutes();
    applyMidiInstrumentOverrides();
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
        const track = midiPlayer.tracks.find(
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

function drawMidiPlayer() {
    if (!midiPlayer.playing) {
        return;
    }

    if (midiPlayer.leadInStartedAt !== null) {
        const leadInSeconds =
            (midiPlayer.tempoMap[0].microseconds / 1000000) *
            musicEngine.MIDI_SHEET_LEAD_IN_QUARTERS;
        const progress = musicEngine.clamp(
            (performance.now() - midiPlayer.leadInStartedAt) /
                (leadInSeconds * 1000),
            0,
            1
        );
        const position =
            (progress - 1) *
            midiPlayer.unitsPerQuarter *
            musicEngine.MIDI_SHEET_LEAD_IN_QUARTERS;
        renderMidiPlayerLeadIn(position);
        if (progress < 1) {
            midiPlayer.frame = requestAnimationFrame(drawMidiPlayer);
            return;
        }
        midiPlayer.leadInStartedAt = null;
        midiPlayback.sequencer.play();
    }

    midiPlayer.elapsed = musicEngine.clamp(
        midiPlayback.sequencer.currentHighResolutionTime,
        0,
        midiPlayer.duration
    );
    const position = midiPositionAtTime(midiPlayer.elapsed);
    midiPlayer.position = position;
    scheduleMidiGeneratedTones(midiPlayer.elapsed);
    updateMidiPlayerTimer();
    renderMidiPlayer(position);

    if (midiPlayback.sequencer.isFinished) {
        stopMidi(true);
        return;
    }
    midiPlayer.frame = requestAnimationFrame(drawMidiPlayer);
}

async function playMidi() {
    if (!midiPlayer.notes.length || midiPlayer.loading) {
        return;
    }

    stopRhythm();
    stopAuxiliaryAudio();
    midiPlayer.loading = true;
    const playRequest = ++midiPlayer.playRequest;
    updateMidiPlayerTransport();

    try {
        const buffer = midiPlayer.buffer;
        const sequencer = await prepareMidiPlayback();
        if (
            buffer !== midiPlayer.buffer ||
            playRequest !== midiPlayer.playRequest
        ) {
            return;
        }

        if (sequencer.isFinished || midiPlayer.elapsed >= midiPlayer.duration) {
            sequencer.currentTime = 0;
            midiPlayer.position = 0;
            midiPlayer.elapsed = 0;
            resetMidiPlayerViews();
        } else if (midiPlayer.elapsed > 0) {
            sequencer.currentTime = midiPlayer.elapsed;
        }
        midiPlayback.generatedToneIndex = 0;
        midiPlayer.leadInStartedAt =
            midiPlayer.elapsed === 0 && sectionView('midi') === 'sheet'
                ? performance.now()
                : null;
        if (midiPlayer.leadInStartedAt === null) {
            sequencer.play();
        }
        midiPlayer.playing = true;
        updateScreenWakeLock();
        setMidiPlayerStatus(midiPlayer.summary);
        drawMidiPlayer();
    } catch (error) {
        setMidiPlayerStatus(
            getErrorString(error, 'Unable to start MIDI playback.')
        );
    } finally {
        midiPlayer.loading = false;
        updateMidiPlayerTransport();
    }
}

function stopMidi(preservePosition = false) {
    if (preservePosition && !midiPlayer.playing) {
        return;
    }

    const hadPosition = midiPlayer.playing || midiPlayer.position > 0;
    if (!preservePosition) {
        midiPlayer.playRequest += 1;
    }
    midiPlayback.sequencer?.pause();
    if (preservePosition) {
        midiPlayer.position = musicEngine.clamp(
            midiPlayback.sequencer
                ? midiPositionAtTime(
                      midiPlayback.sequencer.currentHighResolutionTime
                  )
                : midiPlayer.position,
            0,
            midiPlayer.total
        );
        midiPlayer.elapsed = musicEngine.clamp(
            midiPlayback.sequencer?.currentHighResolutionTime ??
                midiPlayer.elapsed,
            0,
            midiPlayer.duration
        );
        if (midiPlayback.sequencer?.isFinished) {
            midiPlayer.position = midiPlayer.total;
            midiPlayer.elapsed = midiPlayer.duration;
        }
    }
    midiPlayer.playing = false;
    updateScreenWakeLock();
    midiPlayer.leadInStartedAt = null;
    cancelAnimationFrame(midiPlayer.frame);
    midiPlayer.frame = null;
    if (midiPlayback.sequencer && !preservePosition) {
        midiPlayback.sequencer.currentTime = 0;
    }
    if (midiPlayback.generatedTones) {
        musicEngine.audio.stopTransient();
        midiPlayback.generatedToneIndex = 0;
    }
    if (!midiPlayer.notes.length) {
        return;
    }

    if (!preservePosition) {
        midiPlayer.position = 0;
        midiPlayer.elapsed = 0;
    }
    resetMidiPlayerViews(midiPlayer.position);
    updateMidiPlayerTransport();
    if (hadPosition) {
        setMidiPlayerStatus(midiPlayer.summary);
    }
    saveMidiPianoRollState();
}

async function loadMidiPlayer(file, source = null) {
    stopAllAudio();
    const loadRequest = ++midiPlayer.loadRequest;
    const finishLoading = beginPlaybackControlLoading();
    setMidiPlayerStatus(`Loading ${file.name}...`, true);

    try {
        const buffer = await file.arrayBuffer();
        if (loadRequest !== midiPlayer.loadRequest) {
            return;
        }
        const parsed = parseMidiFile(buffer);
        if (!source) {
            localMidiFiles.set(file.name, file);
            setSharedSelectOption(
                'shared-midi-library',
                file.name,
                `Custom (${file.name})`
            );
        }
        midiPlayer.buffer = buffer;
        midiPlayback.loadedBuffer = null;
        setMidiPlayer(parsed, file.name, source);
        saveMidiPianoRollState();
        prepareSoundFontPlayback().catch((error) => {
            setMidiPlayerStatus(
                getErrorString(error, 'Unable to load the SoundFont.')
            );
        });
    } catch (error) {
        if (loadRequest !== midiPlayer.loadRequest) {
            return;
        }
        destroyMidiSheetViews();
        midiPlayer.notes = [];
        midiPlayer.tracks = [];
        clearMidiFile();
        midiPlayer.position = 0;
        midiPlayer.total = 0;
        midiPlayer.pianoRollPosition = 0;
        midiPlayer.elapsed = 0;
        midiPlayer.duration = 0;
        midiPlayer.playing = false;
        midiPlayer.buffer = null;
        midiPlayer.signatureMap = [];
        updateMidiMode();
        updateMidiPlayerTransport();
        setMidiPlayerStatus(
            getErrorString(error, 'Unable to read the MIDI file.')
        );
    } finally {
        finishLoading();
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
            if (isFileProtocol()) {
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
    await loadMidiPlayer(file, filePath);
}

function isSoundFontFile(file) {
    return /\.(?:sf2|sf3)$/i.test(file.name);
}

async function loadDroppedFiles(dropZone, files) {
    const { isMidi, soundFontControl } = readDropZoneContext(dropZone);
    const soundFontFile = files.find(isSoundFontFile);
    const midiFile = isMidi ? files.find(isMidiFile) : null;

    if (!soundFontFile && !midiFile) {
        if (isMidi) {
            setMidiPlayerStatus(
                'Drop a MIDI file (.mid or .midi) or SoundFont (.sf2 or .sf3).'
            );
        } else {
            renderSettingError(
                soundFontControl,
                'Drop a SoundFont file (.sf2 or .sf3).'
            );
        }
        return;
    }

    clearSettingError(soundFontControl);
    if (soundFontFile) {
        await loadLocalSoundFont(soundFontFile, soundFontControl);
    }
    if (midiFile) {
        await loadMidiPlayer(midiFile);
    }
}

// Rhythm

const RHYTHM_METRONOME_RESPONSE_LIMIT = 20;

const rhythmPlayer = {
    playing: false,
    timer: null,
    clickInterval: 0.6,
    nextBeatTime: 0,
    beatIndex: 0,
    tapTimes: [],
};

const rhythmMetronome = {
    originMs: 0,
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
    paused: false,
    position: 0,
    held: null,
    input: null,
    extra: 0,
    holdSpans: [],
    currentHold: null,
    countMarkerElements: [],
    noteElements: [],
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

function isRhythmSheetEnabled() {
    return sectionView('rhythm') === 'sheet';
}

function rhythmSheetInitialPosition() {
    return (
        -rhythmSheet.meter.units - musicEngine.RHYTHM_SHEET_COUNT_IN_LEAD_UNITS
    );
}

function rhythmSheetClef() {
    return musicEngine.CLEFS[readSettingValue('rhythm-sheet-clef')];
}

function randomRhythmSheetMidi(previousMidi = null) {
    const clef = rhythmSheetClef();
    const chromatic = readSettingValue('rhythm-sheet-pitches') === 'chromatic';
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
    rhythmSheet.signature = readSettingValue('shared-rhythm-time-signature');
    rhythmSheet.meter = musicEngine.sheetMeter(rhythmSheet.signature);
    const { units, denominator } = rhythmSheet.meter;
    rhythmSheet.bars = Number(readSettingValue('rhythm-sheet-bars'));
    rhythmSheet.clef = readSettingValue('rhythm-sheet-clef');
    rhythmSheet.total = units * rhythmSheet.bars;
    rhythmSheet.paused = false;
    rhythmSheet.position = rhythmSheetInitialPosition();
    rhythmSheet.phrase = [];
    const includeDots =
        readSettingValue('rhythm-sheet-note-values') === 'all-dotted';
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

function playMetronomeTapSound() {
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

    if (reason === 'microphone-paused' && rhythmPlayer.playing) {
        stopRhythm();
    }
}

function addRhythmSheetPitchSample(frequency) {
    if (!rhythmSheet.held || !Number.isFinite(frequency)) {
        return;
    }

    rhythmSheet.held.pitchSamples.push(frequency);
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
    updateModePanels('rhythm');
    stopAllAudio();
    if (!isRhythmSheetEnabled()) {
        rhythmSheetMicrophoneInput.deactivate('mode-changed');
    } else if (
        musicEngine.microphoneRequestState ===
        musicEngine.MICROPHONE_STATES.LISTENING
    ) {
        activateRhythmSheetMicrophone();
    }
    if (
        isRhythmSheetEnabled() &&
        (!rhythmSheet.phrase.length ||
            rhythmSheet.signature !==
                readSettingValue('shared-rhythm-time-signature'))
    ) {
        newRhythmPhrase();
    }
}

function playRhythmSheet(resumePosition = null) {
    const resuming = resumePosition !== null;
    if (!resuming) {
        renderRhythmSheet();
    }
    rhythmSheet.interval = rhythmClickInterval(
        rhythmPlayer.signature,
        rhythmPlayer.bpm
    );
    if (!resuming) {
        rhythmSheet.origin =
            rhythmPlayer.nextBeatTime +
            rhythmSheet.meter.units * rhythmSheet.interval;
        rhythmSheet.nextNoteIndex = 0;
        rhythmSheet.extra = 0;
        rhythmSheet.position = rhythmSheetInitialPosition();
    } else {
        rhythmSheet.position = resumePosition;
        const nextNoteIndex = rhythmSheet.phrase.findIndex(
            (note) => note.beat >= resumePosition
        );
        rhythmSheet.nextNoteIndex =
            nextNoteIndex < 0 ? rhythmSheet.phrase.length : nextNoteIndex;
    }
    rhythmSheet.active = true;
    rhythmSheet.paused = false;
    if (!resuming) {
        for (const note of rhythmSheet.phrase) {
            note.attack = null;
            note.release = null;
            note.pitchFrequency = null;
            note.pitchError = null;
            note.pitchSamples = [];
        }
    }
    renderRhythmSheetActive(true);
    drawRhythmSheet();
}

function rhythmOffset(value) {
    const rounded = Math.round(value);
    return `${rounded >= 0 ? '+' : ''}${rounded} ms`;
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
    renderRhythmHold(true);
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
    renderRhythmHold(false);
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

    renderRhythmSheetReport(notes, attacks, releases, pitched, average, bias);
    clearRhythmFeedback();
    rhythmSheet.active = false;
    renderRhythmSheetPitch();
    stopAllAudio();
    const { units } = rhythmSheet.meter;
    positionSheetLane(
        rhythmSheet,
        musicEngine.RHYTHM_SHEET_SCORE_SELECTOR,
        -units - musicEngine.RHYTHM_SHEET_COUNT_IN_LEAD_UNITS
    );
    renderRhythmSheetStatus('Complete');
}

function drawRhythmSheet() {
    const position =
        (musicEngine.audio.currentTime() - rhythmSheet.origin) /
        rhythmSheet.interval;
    rhythmSheet.position = position;
    updateRhythmHold(position);
    renderRhythmSheetPosition(position);
    if (position >= rhythmSheet.total + 0.5) {
        finishRhythmSheet();
        return;
    }
    rhythmSheet.frame = requestAnimationFrame(drawRhythmSheet);
}

function stopRhythmSheet(preservePosition = false) {
    const wasActive = rhythmSheet.active;
    const wasPaused = rhythmSheet.paused;
    if (rhythmSheet.currentHold) {
        updateRhythmHold(
            (musicEngine.audio.currentTime() - rhythmSheet.origin) /
                rhythmSheet.interval,
            true
        );
    }
    if (wasActive) {
        rhythmSheet.position =
            (musicEngine.audio.currentTime() - rhythmSheet.origin) /
            rhythmSheet.interval;
    }
    rhythmSheetMicrophoneInput.deactivate('exercise-stopped');
    cancelAnimationFrame(rhythmSheet.frame);
    rhythmSheet.frame = null;
    if (wasActive || (wasPaused && !preservePosition)) {
        renderRhythmSheetStatus(preservePosition ? 'Paused' : 'Stopped');
    }
    rhythmSheet.active = false;
    rhythmSheet.paused = preservePosition;
    if (!preservePosition && rhythmSheet.meter) {
        rhythmSheet.position = rhythmSheetInitialPosition();
        positionSheetLane(
            rhythmSheet,
            musicEngine.RHYTHM_SHEET_SCORE_SELECTOR,
            rhythmSheet.position
        );
        clearRhythmFeedback();
        clearRhythmSheetCurrentNotes();
    }
    renderRhythmSheetPitch();
    rhythmSheet.input = null;
    rhythmSheet.held = null;
    renderRhythmSheetActive(false);
}

// Rhythm: metronome

function isRhythmMetronomeEnabled() {
    return sectionView('rhythm') === 'metronome';
}

function rhythmMetronomeVisualPosition() {
    const phase = Math.max(
        -0.5,
        (performance.now() - rhythmMetronome.originMs) /
            (rhythmPlayer.clickInterval * 1000)
    );

    return {
        phase,
        position: (((phase + 0.5) % 1) + 1) % 1,
    };
}

function drawRhythmMetronome() {
    const { phase, position } = rhythmMetronomeVisualPosition();
    renderRhythmMetronome(position);
    if (
        rhythmMetronome.markBeat !== null &&
        phase >= rhythmMetronome.markBeat + 0.5
    ) {
        clearRhythmMetronomeMark();
    }
    rhythmMetronome.frame = requestAnimationFrame(drawRhythmMetronome);
}

function clearRhythmMetronomeMark() {
    renderRhythmMetronomeMark();
    rhythmMetronome.markBeat = null;
}

function recordRhythmMetronomeTap() {
    if (!rhythmPlayer.playing || !isRhythmMetronomeEnabled()) {
        return;
    }
    const now = performance.now();
    const beat = Math.round(
        (now - rhythmMetronome.originMs) / (rhythmPlayer.clickInterval * 1000)
    );
    if (beat < 0 || beat <= rhythmMetronome.lastBeat) {
        return;
    }
    rhythmMetronome.lastBeat = beat;
    playMetronomeTapSound();
    const error =
        now -
        (rhythmMetronome.originMs + beat * rhythmPlayer.clickInterval * 1000);
    const absoluteError = Math.abs(error);
    const correct = absoluteError <= 20;

    musicEngine.updateStats(musicEngine.stats.rhythm.metronome, {
        correct,
        error: absoluteError,
    });
    renderStats();

    rhythmMetronome.errors.push(error);
    rhythmMetronome.errors = rhythmMetronome.errors.slice(
        -RHYTHM_METRONOME_RESPONSE_LIMIT
    );
    const signed = (value) => `${value > 0 ? '+' : ''}${Math.round(value)}`;
    const count = rhythmMetronome.errors.length;
    const average =
        rhythmMetronome.errors.reduce(
            (sum, value) => sum + Math.abs(value),
            0
        ) / count;
    const bias =
        rhythmMetronome.errors.reduce((sum, value) => sum + value, 0) / count;
    renderRhythmMetronomeTap({ error, correct, count, average, bias, signed });
    rhythmMetronome.markBeat = beat;
}

// Rhythm: playback

function newRhythmTrial() {
    newRhythmPhrase();
    playRhythm();
}

function restartRhythm() {
    if (rhythmPlayer.playing) {
        stopAllAudio();
        playRhythm();
    }
}

function resetRhythmSheetSoundFont() {
    const synth = soundFontSynthesizer.synth;
    if (!synth || !soundFontSynthesizer.soundFontId) {
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
        if (!(await prepareSoundFontPlayback())) {
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
    const synth = soundFontSynthesizer.synth;
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
    if (rhythmSheet.soundFontReady && soundFontSynthesizer.synth) {
        const synthStartTime =
            soundFontSynthesizer.synth.currentTime +
            Math.max(0, startTime - now);
        soundFontSynthesizer.synth.noteOn(
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
    if (!rhythmSheet.soundFontReady || !soundFontSynthesizer.synth) {
        return;
    }

    while (
        rhythmSheet.soundFontNoteOffs[0]?.time <
        now + musicEngine.PLAYBACK_SCHEDULE_AHEAD_SECONDS
    ) {
        const noteOff = rhythmSheet.soundFontNoteOffs.shift();
        soundFontSynthesizer.synth.noteOff(
            musicEngine.RHYTHM_SHEET_MIDI_CHANNEL,
            noteOff.midi,
            {
                time:
                    soundFontSynthesizer.synth.currentTime +
                    Math.max(0, noteOff.time - now),
            }
        );
    }
}

function scheduleRhythmSheetNoteCues(now) {
    if (!isRhythmSheetEnabled() || !rhythmSheet.active) {
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
    if (!rhythmPlayer.playing) {
        return;
    }

    const bpm = rhythmPlayer.bpm;

    const signature = rhythmPlayer.signature;

    const pattern = musicEngine.METERS[signature] || musicEngine.METERS['4/4'];

    const secondsPerClick = rhythmClickInterval(signature, bpm);

    rhythmPlayer.clickInterval = secondsPerClick;
    const now = musicEngine.audio.currentTime();

    scheduleRhythmSheetNoteCues(now);

    while (
        rhythmPlayer.nextBeatTime <
        now + musicEngine.PLAYBACK_SCHEDULE_AHEAD_SECONDS
    ) {
        if (
            isRhythmSheetEnabled() &&
            rhythmPlayer.nextBeatTime >=
                rhythmSheet.origin +
                    rhythmSheet.total * rhythmSheet.interval -
                    0.001
        ) {
            break;
        }
        const accent = pattern[rhythmPlayer.beatIndex];

        const frequency = musicEngine.RHYTHM_CLICK_FREQUENCIES[accent];

        const volume = accent === 2 ? 0.9 : accent === 1 ? 0.75 : 0.6;

        musicEngine.audio.playTransient(
            frequency,
            'sine',
            musicEngine.RHYTHM_CLICK_DURATION,
            volume,
            Math.max(0, rhythmPlayer.nextBeatTime - now)
        );

        rhythmPlayer.nextBeatTime += secondsPerClick;

        rhythmPlayer.beatIndex = (rhythmPlayer.beatIndex + 1) % pattern.length;
    }
}

async function playRhythm() {
    if (rhythmPlayer.playing || rhythmSheet.starting) {
        return;
    }
    if (
        isRhythmSheetEnabled() &&
        (!rhythmSheet.phrase.length ||
            rhythmSheet.signature !==
                readSettingValue('shared-rhythm-time-signature'))
    ) {
        newRhythmPhrase();
    }

    if (isRhythmSheetEnabled() && !rhythmSheet.phrase.length) {
        return;
    }

    const resumePosition =
        isRhythmSheetEnabled() && rhythmSheet.paused
            ? rhythmSheet.position
            : null;
    stopMidi();
    stopAuxiliaryAudio();
    rhythmSheet.starting = true;
    const soundFontRequest = isRhythmSheetEnabled()
        ? ++rhythmSheet.soundFontRequest
        : null;
    const soundFontPromise = soundFontRequest
        ? prepareRhythmSheetSoundFont(soundFontRequest)
        : null;

    if (isRhythmSheetEnabled() && resumePosition === null) {
        clearRhythmSheetResults();
    }
    if (isRhythmSheetEnabled()) {
        renderRhythmSheetMessage(musicEngine.MICROPHONE_MESSAGES.REQUESTING);
        try {
            const started = await activateRhythmSheetMicrophone();
            if (
                !started ||
                !isRhythmSheetEnabled() ||
                isPanelHidden('rhythm')
            ) {
                rhythmSheet.starting = false;
                rhythmSheetMicrophoneInput.deactivate('activation-cancelled');
                stopRhythmSheetSoundFont();
                if (
                    musicEngine.microphoneState ===
                    musicEngine.MICROPHONE_STATES.DENIED
                ) {
                    renderRhythmSheetMessage(
                        `${musicEngine.microphoneFailureMessage}.`
                    );
                }
                return;
            }
        } catch {
            renderRhythmSheetMessage(
                `${musicEngine.MICROPHONE_MESSAGES.FAILED}.`
            );
        }
    }

    if (soundFontPromise) {
        renderRhythmSheetMessage('Loading sound font...', true);
        await soundFontPromise;
        renderRhythmSheetMessageLoading(false);
        if (
            soundFontRequest !== rhythmSheet.soundFontRequest ||
            !isRhythmSheetEnabled() ||
            isPanelHidden('rhythm')
        ) {
            rhythmSheet.starting = false;
            stopRhythmSheetSoundFont();
            return;
        }
    }

    const sheetEnabled = isRhythmSheetEnabled();
    const metronomeEnabled = isRhythmMetronomeEnabled();

    rhythmPlayer.bpm = musicEngine.clamp(
        readNumberSetting('shared-rhythm-bpm', 100),
        30,
        240
    );
    rhythmPlayer.signature = readSettingValue('shared-rhythm-time-signature');
    rhythmPlayer.playing = true;
    rhythmSheet.starting = false;
    updateScreenWakeLock();
    updateRhythmSheetTransport();
    rhythmPlayer.beatIndex = 0;
    const now = musicEngine.audio.currentTime();
    if (resumePosition !== null) {
        rhythmSheet.interval = rhythmClickInterval(
            rhythmPlayer.signature,
            rhythmPlayer.bpm
        );
        rhythmSheet.origin = now - resumePosition * rhythmSheet.interval;
        const nextBeatPosition = Math.ceil(resumePosition);
        rhythmPlayer.nextBeatTime =
            rhythmSheet.origin + nextBeatPosition * rhythmSheet.interval;
        const pattern =
            musicEngine.METERS[rhythmPlayer.signature] ||
            musicEngine.METERS['4/4'];
        rhythmPlayer.beatIndex =
            ((nextBeatPosition % pattern.length) + pattern.length) %
            pattern.length;
    } else {
        const leadIn = sheetEnabled
            ? rhythmClickInterval(rhythmPlayer.signature, rhythmPlayer.bpm) *
              musicEngine.RHYTHM_SHEET_COUNT_IN_LEAD_UNITS
            : 1;
        rhythmPlayer.nextBeatTime = now + leadIn;
    }
    rhythmMetronome.originMs =
        performance.now() +
        (rhythmPlayer.nextBeatTime - musicEngine.audio.currentTime()) * 1000;
    rhythmMetronome.lastBeat = -1;
    rhythmMetronome.errors = [];
    clearRhythmMetronomeMark();
    renderRhythmMetronomeStarted(metronomeEnabled);

    if (sheetEnabled) {
        playRhythmSheet(resumePosition);
    }
    scheduleRhythm();
    if (metronomeEnabled) {
        drawRhythmMetronome();
        focusRhythmMetronomeTap();
    }

    rhythmPlayer.timer = window.setInterval(
        scheduleRhythm,
        musicEngine.PLAYBACK_LOOKAHEAD_MS
    );
}

function stopRhythm(preserveSheetPosition = false) {
    stopRhythmSheet(preserveSheetPosition);
    stopRhythmSheetSoundFont();
    musicEngine.audio.stopTransient();
    cancelAnimationFrame(rhythmMetronome.frame);
    rhythmMetronome.frame = null;
    renderRhythmMetronomeStopped();
    rhythmPlayer.playing = false;
    rhythmSheet.starting = false;
    updateScreenWakeLock();
    rhythmPlayer.beatIndex = 0;

    if (rhythmPlayer.timer !== null) {
        clearInterval(rhythmPlayer.timer);
        rhythmPlayer.timer = null;
    }
    updateRhythmSheetTransport();
}

function tapTempo() {
    const now = performance.now();
    const previous = rhythmPlayer.tapTimes.at(-1);

    if (previous !== undefined && now - previous > 2000) {
        rhythmPlayer.tapTimes = [];
    }

    rhythmPlayer.tapTimes.push(now);
    rhythmPlayer.tapTimes = rhythmPlayer.tapTimes.slice(-5);

    if (rhythmPlayer.tapTimes.length < 3) {
        return;
    }

    const intervals = [];

    for (let index = 1; index < rhythmPlayer.tapTimes.length; index += 1) {
        intervals.push(
            rhythmPlayer.tapTimes[index] - rhythmPlayer.tapTimes[index - 1]
        );
    }

    const averageInterval =
        intervals.reduce((total, interval) => total + interval, 0) /
        intervals.length;

    const bpmBounds = readSettingBounds('shared-rhythm-bpm');

    const bpm = musicEngine.clamp(
        Math.round(60000 / averageInterval),
        bpmBounds.minimum,
        bpmBounds.maximum
    );

    renderSettingValue('shared-rhythm-bpm', bpm);
    restartRhythm();
    saveCurrentSettings();
}

// Initialization

function initialize() {
    initializeMidiState();
    initializePitchMemorySlider();
    initializeTooltips();
    initializeNotes();
    configurePractice(() =>
        readPracticeConfiguration({
            interval: sectionView('interval'),
            match: sectionView('match'),
            pitch: sectionView('pitch'),
        })
    );
    initializeTunerInstruments();
    restoreSettings();
    updateTunerInstrument();
    restoreSetting('tuner-tuning-tuning');
    updateTunerStrings();
    updateReferenceFrequency();
    updateVolume();
    initializeTunerHistory();
    initializeEvents();
    updateRhythmMode();
    updateMidiMode();
    updateNoteReadouts();
    initializeNavigation();

    resetTunerDetection();

    clearPitchPlacementResult();
    updatePitchMode();

    updateMatchMode();
    updateIntervalMode();
    newChordTrial();
    renderStats();

    musicEngine.setMicrophoneState(musicEngine.MICROPHONE_STATES.PAUSED);
    restorePitchMemoryState();
    renderPitchMemoryResponsePitch(getPitchMemoryResponseFrequency());
}

initialize();
