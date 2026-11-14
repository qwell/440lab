'use strict';

function readNumber(input, fallback) {
    const rawValue = input.value.trim();

    if (rawValue === '') {
        return fallback;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
        return fallback;
    }

    const minimum = input.hasAttribute('min')
        ? Number(input.getAttribute('min'))
        : -Infinity;

    const maximum = input.hasAttribute('max')
        ? Number(input.getAttribute('max'))
        : Infinity;

    return clamp(value, minimum, maximum);
}

function getSetting(name, root = document) {
    return root.querySelector(`[data-setting="${name}"]`);
}

function getSettings(names, root = document) {
    const settingNames = Array.isArray(names) ? names : [names];
    const selector = settingNames
        .map((name) => `[data-setting="${name}"]`)
        .join(', ');
    return root.querySelectorAll(selector);
}

function getInput(name, root = document) {
    return root.querySelector(`[data-input="${name}"]`);
}

function getInputs(name, root = document) {
    return root.querySelectorAll(`[data-input="${name}"]`);
}

function getFields(name, root = document) {
    return root.querySelectorAll(
        `[data-setting="${name}"], [data-input="${name}"]`
    );
}

function getOutput(name, root = document) {
    return root.querySelector(`[data-output="${name}"]`);
}

function getOutputs(name, root = document) {
    return root.querySelectorAll(`[data-output="${name}"]`);
}

function getAction(name, root = document) {
    return root.querySelector(`[data-action="${name}"]`);
}

function getActions(name, root = document) {
    return root.querySelectorAll(`[data-action="${name}"]`);
}

function getModuleActions(module, action, root = document) {
    return root.querySelectorAll(
        `[data-action^="${module}-"][data-action$="-${action}"]`
    );
}

function getNoteSetting(name) {
    return document.querySelector(`[data-note="${name}"]`);
}

function getWaveform(name) {
    return document.querySelector(`[data-waveform="${name}"]`);
}

function readSettingValue(name) {
    return getSetting(name).value;
}

function readInputValue(name) {
    return getInput(name).value;
}

function readWaveformValue(name) {
    return getWaveform(name).value;
}

function readNoteValue(name) {
    return getNoteSetting(name).value;
}

function readSettingOptions(name) {
    const setting = getSetting(name);
    return {
        index: setting.selectedIndex,
        values: [...setting.options].map((option) => option.value),
    };
}

function readSettingSelectedText(name) {
    return getSetting(name).selectedOptions[0]?.textContent;
}

function isSetting(element) {
    return isElement(element) && element.matches('[data-setting]');
}

function readSettings(storedSettings = {}) {
    const settings = {};
    const readNames = new Set();

    for (const element of document.querySelectorAll('[data-setting]')) {
        const name = element.dataset.setting;
        const separator = name.indexOf('-');
        const group = name.slice(0, separator);
        const setting = name.slice(separator + 1);

        settings[group] ??= {};

        if (readNames.has(name)) {
            continue;
        }

        if (isHtmlSelectElement(element) && !element.options.length) {
            if (Object.hasOwn(storedSettings[group] ?? {}, setting)) {
                settings[group][setting] = storedSettings[group][setting];
            }
            continue;
        }

        readNames.add(name);
        settings[group][setting] =
            isHtmlInputElement(element) &&
            ['checkbox', 'radio'].includes(element.type)
                ? element.checked
                : element.value;
    }

    return settings;
}

function readStatsType(module, mode) {
    return getSetting(`${module}-${mode}-type`)?.value;
}

function readActiveSection() {
    return (
        document.querySelector('.nav-item.is-active')?.dataset.section ??
        'about'
    );
}

function readDropZoneContext(dropZone) {
    const activeModePanel = dropZone.querySelector(
        '[data-mode-panel]:not([hidden])'
    );

    return {
        isMidi: Boolean(dropZone.closest('[data-panel="midi"]')),
        soundFontControl: (activeModePanel ?? dropZone).querySelector(
            '[data-setting="shared-soundfont"]'
        ),
    };
}

function isPanelHidden(name) {
    return document.getElementById(`${name}-panel`).hidden;
}

function isFileProtocol() {
    return window.location.protocol === 'file:';
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

function bindPlaybackTransport(
    rewindButtons,
    playButtons,
    isPlaying,
    rewind,
    play,
    pause
) {
    for (const button of rewindButtons) {
        button.addEventListener('click', () => rewind());
    }
    for (const button of playButtons) {
        button.addEventListener('click', () => {
            if (isPlaying()) {
                pause();
            } else {
                play();
            }
        });
    }
}

function readNumberSetting(name, fallback) {
    return readNumber(getSetting(name), fallback);
}

function readSettingBounds(name) {
    const setting = getSetting(name);
    return {
        maximum: Number(setting.max),
        minimum: Number(setting.min),
    };
}

function normalizeNumberInput(input, fallback) {
    const value = readNumber(input, fallback);
    setNumberIfChanged(input, value);
    return value;
}

function readRange(minimumName, maximumName, defaultMinimum, defaultMaximum) {
    let minimum = readNumberSetting(minimumName, defaultMinimum);
    let maximum = readNumberSetting(maximumName, defaultMaximum);

    if (minimum > maximum) {
        [minimum, maximum] = [maximum, minimum];
    }

    renderSettingValue(minimumName, minimum);
    renderSettingValue(maximumName, maximum);
    return { minimum, maximum };
}

function readPracticeRange(prefix, defaultMinimum, defaultMaximum) {
    const minimumBounds = readSettingBounds(`${prefix}-range-min`);
    const maximumBounds = readSettingBounds(`${prefix}-range-max`);
    return {
        ...readRange(
            `${prefix}-range-min`,
            `${prefix}-range-max`,
            defaultMinimum,
            defaultMaximum
        ),
        minimumLimit: minimumBounds.minimum,
        maximumLimit: maximumBounds.maximum,
    };
}

function readPracticeConfiguration(modes) {
    return {
        adaptive: readSettingValue('shared-adaptive') === 'on',
        modes,
        pitch: {
            placement: {
                duration: readNumberSetting('pitch-placement-duration', 1),
                interval: Number(readSettingValue('pitch-placement-interval')),
                range: readPracticeRange('pitch-placement', 10, 50),
                rootMidi: Number(readNoteValue('pitch-placement')),
                waveform: readWaveformValue('pitch-placement'),
            },
            memory: {
                delay: Number(readSettingValue('pitch-memory-delay')),
                distractors: Number(
                    readSettingValue('pitch-memory-distractors')
                ),
                responseCents: Number(readInputValue('pitch-memory-pitch')),
                type: readSettingValue('pitch-memory-type'),
            },
        },
        match: {
            target: {
                count: Math.round(readNumberSetting('match-target-count', 7)),
                duration: readNumberSetting('match-target-duration', 1),
                range: readPracticeRange('match-target', 10, 50),
                targetMidi: Number(readNoteValue('match-target')),
                waveform: readWaveformValue('match-target'),
            },
            identification: {
                duration: readNumberSetting('match-identification-duration', 1),
                octave: readSettingValue('match-identification-octave'),
                waveform: readWaveformValue('match-identification'),
            },
        },
        interval: {
            direction: readSettingValue('shared-interval-direction'),
            duration: readNumberSetting('shared-interval-duration', 0.7),
            level: readSettingValue('shared-interval-set'),
            levels: readSettingOptions('shared-interval-set'),
            waveform: {
                construction: readWaveformValue('interval-construction'),
                recognition: readWaveformValue('interval-recognition'),
            },
        },
        chord: {
            quality: {
                playback: readSettingValue('chord-quality-playback'),
                waveform: readWaveformValue('chord-quality'),
            },
        },
    };
}

function initializeTunerHistory() {
    const canvas = getOutput('tuner-tuning-history');
    const observer = new ResizeObserver(() => updateTunerHistory());
    observer.observe(canvas);
}

function getModePanels(name) {
    return document.querySelectorAll(
        `[data-panel="${name}"] > [data-mode-panel]`
    );
}

// Navigation events

function initializeNavigation() {
    const navItems = [...document.querySelectorAll('.nav-item')];
    const siteNavigation = document.querySelector('.site-nav');
    const navToggle = document.querySelector('.nav-toggle');

    renderNavigationInitialized(siteNavigation);

    function closeNavigation(restoreFocus = false) {
        renderNavigationOpen(siteNavigation, navToggle, false, restoreFocus);
    }

    function openNavigation() {
        renderNavigationOpen(siteNavigation, navToggle, true);
    }

    function syncModeNavigation() {
        renderModeNavigation(navItems);
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

        updateSectionMode();

        saveCurrentSettings();
        syncModeNavigation();
    }

    navItems.forEach((navItem) => {
        navItem.addEventListener('click', () => {
            activateSection(navItem);
            updateSectionMode();
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
            updateSectionMode();
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

function syncSharedField(field) {
    const name = field?.dataset?.setting ?? field?.dataset?.input;
    if (!name?.startsWith('shared-')) {
        return;
    }
    const peers = field.dataset.setting ? getSettings(name) : getInputs(name);
    for (const peer of peers) {
        if (isHtmlInputElement(field) && field.type === 'radio') {
            peer.checked = peer.value === field.value;
        } else if (isHtmlInputElement(field) && field.type === 'checkbox') {
            peer.checked = field.checked;
        } else {
            peer.value = field.value;
        }
    }
}

// Application events

function initializeEvents() {
    engine.audio.addPlaybackStateListener(updateScreenWakeLock);
    engine.addMicrophoneStateListener(updateScreenWakeLock);
    engine.addMicrophoneStateListener(renderMicrophoneState);
    addPitchMemoryDelayStateListener(updateScreenWakeLock);

    const syncSharedFieldEvent = (event) => {
        syncSharedField(event.target);
    };
    const saveChangedSetting = (event) => {
        if (isSetting(event.target)) {
            saveCurrentSettings();
        }
    };
    const hasFiles = (event) =>
        [...(event.dataTransfer?.types ?? [])].includes('Files') ||
        [...(event.dataTransfer?.items ?? [])].some(
            (item) => item.kind === 'file'
        ) ||
        (event.dataTransfer?.files.length ?? 0) > 0;
    const preventFileNavigation = (event) => {
        if (hasFiles(event)) {
            event.preventDefault();
        }
    };
    document.addEventListener('input', syncSharedFieldEvent, true);
    document.addEventListener('change', syncSharedFieldEvent, true);
    document.addEventListener('change', saveChangedSetting);
    document.addEventListener('dragover', preventFileNavigation, true);
    document.addEventListener('drop', preventFileNavigation, true);

    for (const button of getActions('midi-attach')) {
        button.addEventListener('click', () => {
            const fileInput = document.getElementById(
                button.getAttribute('aria-controls')
            );
            renderInputValue(fileInput.dataset.input, '');
            fileInput.click();
        });
    }
    for (const fileInput of getInputs('midi-file-input')) {
        fileInput.addEventListener('change', (event) => {
            const [file] = event.target.files;
            if (file) {
                loadMidiPlayer(file);
            }
        });
    }
    for (const select of getInputs('shared-midi-library')) {
        select.addEventListener('change', () => {
            const file = localMidiFiles.get(select.value);
            if (file) {
                loadMidiPlayer(file);
            } else if (select.value) {
                loadIncludedMidi(select.value);
            }
        });
    }
    getSetting('midi-piano-roll-orientation').addEventListener(
        'change',
        renderMidiPianoRoll
    );
    const dropSurface = document.querySelector('main');
    const activeFileDropPanel = () => {
        const panel = dropSurface.querySelector('.section-panel:not([hidden])');
        if (panel?.dataset.panel === 'midi') {
            return panel;
        }
        if (
            panel?.dataset.panel === 'rhythm' &&
            !panel.querySelector('[data-mode-panel="sheet"]')?.hidden
        ) {
            return panel;
        }
        return null;
    };

    {
        let dragDepth = 0;

        dropSurface.addEventListener(
            'dragenter',
            (event) => {
                if (!activeFileDropPanel()) {
                    return;
                }
                event.preventDefault();
                dragDepth += 1;
                renderFileDragSurface(dropSurface, true);
            },
            true
        );
        dropSurface.addEventListener(
            'dragover',
            (event) => {
                if (!activeFileDropPanel()) {
                    return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
            },
            true
        );
        dropSurface.addEventListener(
            'dragleave',
            () => {
                if (dragDepth === 0) {
                    return;
                }
                dragDepth = Math.max(0, dragDepth - 1);
                renderFileDragSurface(dropSurface, dragDepth > 0);
            },
            true
        );
        dropSurface.addEventListener(
            'drop',
            (event) => {
                const panel = activeFileDropPanel();
                if (!panel) {
                    return;
                }
                event.preventDefault();
                dragDepth = 0;
                renderFileDragSurface(dropSurface, false);
                const files = [...event.dataTransfer.files];
                if (files.length) {
                    loadDroppedFiles(panel, files);
                }
            },
            true
        );
    }
    for (const control of getSettings('shared-soundfont')) {
        control.addEventListener('change', () => {
            clearSettingErrors(getSettings('shared-soundfont'));
            changeSoundFont(control);
        });
    }
    for (const seek of getInputs('shared-midi-seek')) {
        seek.addEventListener('input', seekMidiPlayer);
    }
    bindPlaybackTransport(
        getActions('midi-rewind'),
        getActions('midi-play'),
        () => midiPlayer.playing,
        stopMidi,
        playMidi,
        () => stopMidi(true)
    );

    for (const control of getSettings('shared-note')) {
        control.addEventListener('change', () => {
            updateNoteReadouts();

            if (tunerTargetMidi !== null) {
                stopTuner();
                clearTunerTarget();
            }

            if (tunerVoice) {
                tunerVoice.setFrequency(selectedNoteFrequency('tuner-tuning'));
            }

            newPitchPlacementTrial();
            newMatchTrial();
        });
    }

    for (const control of getSettings([
        'shared-rhythm-time-signature',
        'rhythm-sheet-bars',
        'rhythm-sheet-note-values',
        'rhythm-sheet-clef',
        'rhythm-sheet-pitches',
    ])) {
        control.addEventListener('change', () => {
            if (isRhythmSheetEnabled()) {
                const wasPlaying = rhythmPlayer.playing;
                newRhythmPhrase();
                if (wasPlaying) {
                    playRhythm();
                }
            } else {
                restartRhythm();
            }
        });
    }
    for (const control of getSettings('shared-rhythm-bpm')) {
        control.addEventListener('change', restartRhythm);
    }
    const rhythmHold = document.getElementById('rhythm-sheet-hold');
    getAction('rhythm-sheet-new').addEventListener('click', newTrial);
    const rhythmScore = document.querySelector(RHYTHM_SHEET_SCORE_SELECTOR);
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
            !isRhythmSheetEnabled() ||
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
    const rhythmMetronomeTap = document.getElementById('rhythm-metronome-tap');
    rhythmMetronomeTap.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || !event.isPrimary) {
            return;
        }
        event.preventDefault();
        recordRhythmMetronomeTap();
    });
    rhythmMetronomeTap.addEventListener('click', (event) => {
        if (event.detail === 0) {
            recordRhythmMetronomeTap();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (
            event.code !== 'Space' ||
            !isRhythmMetronomeEnabled() ||
            !rhythmPlayer.playing ||
            document.getElementById('rhythm-panel').hidden ||
            event.target.closest(
                'input, select, textarea, [contenteditable="true"]'
            ) ||
            (event.target.closest('button, a') &&
                event.target !== rhythmMetronomeTap)
        ) {
            return;
        }
        event.preventDefault();
        if (!event.repeat) {
            recordRhythmMetronomeTap();
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && rhythmPlayer.playing) {
            stopAllAudio();
        }
        updateScreenWakeLock();
    });

    const rhythmSheetRewind = getAction('rhythm-sheet-rewind');
    const rhythmSheetPlay = getAction('rhythm-sheet-play');
    bindPlaybackTransport(
        [rhythmSheetRewind],
        [rhythmSheetPlay],
        () => rhythmPlayer.playing,
        stopRhythm,
        playRhythm,
        () => stopRhythm(true)
    );
    for (const button of getModuleActions('rhythm', 'play')) {
        if (button !== rhythmSheetPlay) {
            button.addEventListener('click', () => playRhythm());
        }
    }
    for (const button of getActions('rhythm-tempo-tap')) {
        button.addEventListener('click', tapTempo);
    }

    for (const control of getSettings('shared-interval-set')) {
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
    for (const control of getSettings('shared-interval-direction')) {
        control.addEventListener('change', newIntervalTrial);
    }

    for (const control of getSettings([
        'pitch-placement-range-min',
        'pitch-placement-range-max',
        'pitch-placement-interval',
    ])) {
        control.addEventListener('change', () => {
            resetAdaptiveProgress('pitch-placement');
            newPitchPlacementTrial();
        });
    }

    for (const control of getSettings([
        'match-target-range-min',
        'match-target-range-max',
        'match-target-count',
    ])) {
        control.addEventListener('change', () => {
            resetAdaptiveProgress('match-target');
            newMatchTrial();
        });
    }

    for (const control of getSettings('shared-adaptive')) {
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
    getSetting('global-volume').addEventListener('input', updateVolume);
    getAction('global-volume-toggle').addEventListener('click', toggleVolume);

    const referenceFrequencyInput = getSetting('global-reference-a4');

    referenceFrequencyInput.addEventListener('input', () => {
        resetForReferenceChange();

        const referenceFrequency = Number(
            readSettingValue('global-reference-a4')
        );

        if (
            Number.isFinite(referenceFrequency) &&
            referenceFrequency >= Number(referenceFrequencyInput.min) &&
            referenceFrequency <= Number(referenceFrequencyInput.max)
        ) {
            saveCurrentSettings();
        }
    });
    referenceFrequencyInput.addEventListener('change', () => {
        normalizeNumberInput(
            referenceFrequencyInput,
            music.DEFAULT_A4_FREQUENCY
        );
        resetForReferenceChange();
        saveCurrentSettings();
    });

    getSetting('pitch-placement-duration').addEventListener(
        'change',
        (event) => {
            normalizeNumberInput(event.currentTarget, 1);
        }
    );

    getSetting('match-target-duration').addEventListener('change', (event) => {
        normalizeNumberInput(event.currentTarget, 1);
    });

    for (const control of getSettings('shared-interval-duration')) {
        control.addEventListener('change', (event) => {
            normalizeNumberInput(event.currentTarget, 0.7);
            syncSharedField(event.currentTarget);
        });
    }

    getAction('global-settings-reset').addEventListener('click', () => {
        engine.removeSettings();
        engine.clearState();
        window.location.reload();
    });

    getSetting('tuner-tuning-instrument').addEventListener(
        'change',
        updateTunerInstrument
    );
    getSetting('tuner-tuning-tuning').addEventListener(
        'change',
        updateTunerStrings
    );

    getAction('tuner-tuning-play').addEventListener('click', playTuner);
    getAction('tuner-tuning-stop').addEventListener('click', stopTuner);

    for (const button of getActions('global-microphone-toggle')) {
        button.addEventListener('click', toggleGlobalMicrophone);
    }

    getSetting('match-identification-octave').addEventListener(
        'change',
        newMatchIdentificationTrial
    );
    getSetting('match-identification-duration').addEventListener(
        'change',
        (event) => normalizeNumberInput(event.currentTarget, 1)
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

    getAction('pitch-placement-play').addEventListener(
        'click',
        playPitchPlacementTrial
    );

    getAction('match-identification-play').addEventListener(
        'click',
        playMatchIdentificationTrial
    );

    for (const button of getModuleActions('pitch', 'new')) {
        button.addEventListener('click', newTrial);
    }

    for (const button of getModuleActions('match', 'new')) {
        button.addEventListener('click', newTrial);
    }

    for (const button of getModuleActions('interval', 'play')) {
        button.addEventListener('click', playIntervalTrial);
    }

    for (const button of getModuleActions('interval', 'new')) {
        button.addEventListener('click', newTrial);
    }

    getAction('chord-quality-play').addEventListener('click', playChordTrial);

    getAction('chord-quality-new').addEventListener('click', () =>
        newChordTrial(true)
    );

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
        .querySelector('[data-chord-quality-answers]')
        .addEventListener('click', (event) => {
            const button = event.target.closest('[data-chord-quality-answer]');

            if (button) {
                commitChordQuality(button.dataset.chordQualityAnswer);
            }
        });

    getSetting('chord-quality-playback').addEventListener(
        'change',
        stopAllAudio
    );

    for (const control of getSettings([
        'pitch-memory-type',
        'pitch-memory-delay',
        'pitch-memory-distractors',
    ])) {
        control.addEventListener('change', () => {
            if (engine.state.pitch.memory) {
                cancelPitchMemoryTrial();
            }

            updatePitchMemoryControls();
        });
    }

    getAction('pitch-memory-play').addEventListener(
        'click',
        playPitchMemoryStimulus
    );

    getAction('pitch-memory-stop').addEventListener(
        'click',
        stopPitchMemoryAudio
    );

    getAction('pitch-memory-response-play').addEventListener(
        'click',
        playPitchMemoryResponse
    );

    getAction('pitch-memory-response-stop').addEventListener(
        'click',
        stopPitchMemoryResponseTone
    );

    getInput('pitch-memory-pitch').addEventListener(
        'input',
        updatePitchMemoryResponseTone
    );

    getAction('pitch-memory-submit').addEventListener(
        'click',
        submitPitchMemoryResponse
    );

    for (const button of document.querySelectorAll(
        '[data-pitch-placement-answers] [data-answer]'
    )) {
        button.addEventListener('click', () =>
            commitPitchPlacement(button.dataset.answer)
        );
    }

    for (const button of getActions('global-stop')) {
        button.addEventListener('click', stopAllActivity);
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

    for (const module of Object.keys(engine.stats)) {
        for (const button of getModuleActions(module, 'stats-clear')) {
            button.addEventListener('click', () => {
                const mode = sectionView(module);
                const modeStats = engine.stats[module][mode];
                const type = !Object.hasOwn(modeStats, 'trials')
                    ? readSettingValue(`${module}-${mode}-type`)
                    : null;

                clearStats(mode, type);
            });
        }
    }
}

// Browser wake lock

let screenWakeLock = null;
let screenWakeLockRequest = null;
let screenWakeLockUpdateQueued = false;

function isScreenWakeLockNeeded() {
    return (
        engine.audio.isPlaying() ||
        midiPlayer.playing ||
        rhythmPlayer.playing ||
        playbackControlLoadingCount > 0 ||
        isPitchMemoryDelayActive() ||
        engine.microphoneRequestState === engine.MICROPHONE_STATES.LISTENING
    );
}

function updateScreenWakeLock() {
    const shouldHold =
        isScreenWakeLockNeeded() && document.visibilityState === 'visible';

    if (!shouldHold) {
        screenWakeLockUpdateQueued = false;
    }

    if (shouldHold && navigator.wakeLock?.request) {
        if (screenWakeLock) {
            return;
        }
        if (screenWakeLockRequest) {
            screenWakeLockUpdateQueued = true;
            return;
        }

        screenWakeLockRequest = navigator.wakeLock
            .request('screen')
            .then((lock) => {
                screenWakeLockRequest = null;
                screenWakeLockUpdateQueued = false;

                if (
                    !isScreenWakeLockNeeded() ||
                    document.visibilityState !== 'visible'
                ) {
                    lock.release();
                    return;
                }

                screenWakeLock = lock;
                lock.addEventListener('release', () => {
                    if (screenWakeLock === lock) {
                        screenWakeLock = null;
                        updateScreenWakeLock();
                    }
                });
            })
            .catch(() => {
                const updateQueued = screenWakeLockUpdateQueued;
                screenWakeLockRequest = null;
                screenWakeLockUpdateQueued = false;

                if (updateQueued) {
                    updateScreenWakeLock();
                }
            });

        return;
    }

    if (screenWakeLock) {
        const lock = screenWakeLock;
        screenWakeLock = null;
        lock.release();
    }
}

// Dynamic scripts

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

// Piano roll input

function initializeMidiPianoRollKeyboard(keyboard) {
    const activePointers = new Set();
    const pointerKeys = new Map();
    const keyAtPointer = (event) => {
        const key = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest('.midi-piano-roll-key');
        return key && keyboard.contains(key) ? key : null;
    };
    const movePointerToKey = (event, key) => {
        const previousKey = pointerKeys.get(event.pointerId);
        if (key === previousKey) {
            return;
        }
        if (previousKey) {
            releaseMidiPianoRollKey(
                Number(previousKey.dataset.midiPianoRollKey)
            );
        }
        if (key) {
            strikeMidiPianoRollKey(key);
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

// Unload

window.addEventListener('beforeunload', () => {
    const midiPosition = midiPlayer.elapsed;

    stopAllAudio();
    cancelAllAdvances();
    clearPitchMemoryTimers();

    if (pitchMemory.replayTimer !== null) {
        clearTimeout(pitchMemory.replayTimer);
    }

    stopPitchMemoryResponseTone();

    saveMidiPianoRollState(midiPosition);
    savePitchMemoryState();
});
