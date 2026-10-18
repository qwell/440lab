# 440 Lab

A small browser-based music and ear-training tool for MIDI playback and visualization, practicing absolute and relative pitch, intervals, intonation, tuning, rhythm, chord quality, and pitch memory using the Web Audio API.

Live demo: [https://440lab.com/](https://440lab.com/)

## Table of Contents

- [Features](#features)
- [Usage](#usage)
- [Files](#files)
- [Technologies](#technologies)
- [License](#license)

## Features

- Play reference notes with adjustable A4 tuning
- Chromatic microphone tuner
    - Detects the nearest musical note
    - Shows detected and target frequencies
    - Shows pitch deviation in cents on a tuning meter
    - Uses the adjustable A4 reference
- Global output volume control
- Metronome with adjustable BPM and time signature
- Tap tempo
- Play Standard MIDI files with a selectable SoundFont
    - Choose an included file, attach a local file, or drag and drop it anywhere in the active MIDI view
    - Drop an SF2 or SF3 SoundFont into a MIDI or rhythm sheet view to use it for the current session
    - View synchronized multi-track sheet music or a color-coded scrolling piano roll
    - Follow tempo and time-signature changes in the piano-roll tracker; sheet music currently requires a single meter
    - Seek through playback and mute individual tracks
- Practice identifying flat vs. sharp pitch
- Identify chromatic notes by name without a reference
- Pick the correctly tuned target from multiple candidates
- Identify melodic intervals in ascending or descending note pairs
- Identify major, minor, diminished, and augmented chord qualities
- Test pitch memory after a delay or interfering tones
    - Respond with an adjustable oscillator or microphone input
    - Compare the target and response on a continuous frequency slider
    - Track streak, mean error, and best result
- Adjustable waveform, duration, interval, range, and candidate count
- Streak and error statistics for ear-training exercises
- Direct links to individual tools using URL fragments
- No dependencies or build step

## Usage

Open `site/index.html` in a modern browser.

Most features can run directly from a `file://` path without a web server, including MIDI files and dropped SF2 or SF3 SoundFonts. Some modules require microphone permission and may require HTTPS or localhost, depending on the browser.

To serve the site locally instead, install the dependencies and run:

```sh
yarn serve
```

The site will be available at [http://localhost:3000/](http://localhost:3000/).

For an nginx deployment with HTTPS, run `yarn deploy <host>` or follow the deployment instructions at the top of `nginx.conf.example`. Use `yarn deploy --http-only <host>` to serve without TLS; IP addresses imply `--http-only`.

Use the global A4 reference to change the tuning standard used throughout the application. The global volume control adjusts generated audio output.

The Tuning tab can play a selected reference note, detect live pitches through the microphone, or do both at the same time. Pitch Memory microphone responses have the same permission and secure-context requirements as the tuner.

The MIDI tab includes a selection of MIDI files and parses local files in the browser. It can display them as multi-track sheet music or as a scrolling piano-roll tracker. The tracker follows tempo and time-signature changes; sheet music currently supports files with a single meter. Dropped SF2 and SF3 SoundFonts can also be used for the current session, including when the site is opened through `file://`. MIDI and SoundFont files are not uploaded.

## Files

- `nginx.conf.example` - optional nginx HTTPS configuration template with deployment and Certbot instructions
- `scripts/deploy.js` - deploys the site and nginx configuration
- `scripts/serve.js` - optional local static-file server
- `scripts/generate.js` - copies third-party browser files and generates `file://`-compatible SoundFont and MIDI data scripts
- `site/index.html` - interface and application metadata
- `site/assets/css/base.css` - shared variables and base element styles
- `site/assets/css/controls.css` - shared settings, form control, tooltip, and icon button styles
- `site/assets/css/tools.css` - tool-specific tuner, rhythm, MIDI, pitch, and interval displays
- `site/assets/css/layout.css` - page and panel layout
- `site/assets/css/practice.css` - practice-tool styles
- `site/assets/js/index.js` - audio, MIDI playback and visualization, microphone pitch detection, exercises, and application logic
- `site/assets/midi/` - included MIDI files and their generated `file://` data wrappers
- `site/assets/vendor/` - checked-in third-party files organized by package and asset type

Generated browser assets are committed with the site. Run `yarn generate` after
adding a file to `site/assets/midi/` or updating a SoundFont or source
dependency. The generator discovers MIDI and SoundFont files automatically,
converts SF2 files to SF3 with `sf3convert -z -q 0.8 -a -1`, creates their
JavaScript data wrappers, and generates both dropdown catalogs.
The SpessaSynth module files and worklet are copied directly from its packages.
`browser.js` and `processor.js` are a pinned pair retained for opening the site
directly through `file://` and must be updated together.

## Technologies

HTML, CSS, and JavaScript using browser APIs including:

- Web Audio API
- MediaDevices / `getUserMedia()`
- `requestAnimationFrame()`
- Local storage for practice statistics
- SpessaSynth for MIDI and SoundFont playback

No frameworks, build step, or external runtime services are required.

## License

440 Lab is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.en.html) or later.
