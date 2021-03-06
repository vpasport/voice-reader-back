'use strict';

const chalk = require('chalk');
const { Writable } = require('stream');
const recorder = require('node-record-lpcm16');

const speech = require('@google-cloud/speech').v1p1beta1;

const client = new speech.SpeechClient({
    keyFile: './key.json'
});

const options = {
    languageCode: 'ru-RU',
    audioChannelCount: 2,
    sampleRateHertz: 48000,
    encoding: 'OGG_OPUS'
}

const config = {
    encoding: options.encoding,
    sampleRateHertz: options.sampleRateHertz,
    languageCode: options.languageCode,
    audioChannelCount: options.audioChannelCount
};

const request = {
    config,
    interimResults: true,
};

let streamingLimit = 290000;
let recognizeStream = null;
let restartCounter = 0;
let audioInput = [];
let lastAudioInput = [];
let resultEndTime = 0;
let isFinalEndTime = 0;
let finalRequestEndTime = 0;
let newStream = true;
let bridgingOffset = 0;
let lastTranscriptWasFinal = false;

function startStream() {
    // Clear current audioInput
    audioInput = [];
    // Initiate (Reinitiate) a recognize stream
    recognizeStream = client
        .streamingRecognize(request)
        .on('error', err => {
            if (err.code === 11) {
                restartStream();
            } else {
                console.error('API request error ' + err);
            }
        })
        .on('data', speechCallback);

    // Restart stream when streamingLimit expires
    setTimeout(restartStream, streamingLimit);
}

const speechCallback = stream => {
    console.log(stream)
    // Convert API result end time from seconds + nanoseconds to milliseconds
    resultEndTime =
        stream.results[0].resultEndTime.seconds * 1000 +
        Math.round(stream.results[0].resultEndTime.nanos / 1000000);

    // Calculate correct time based on offset from audio sent twice
    const correctedTime =
        resultEndTime - bridgingOffset + streamingLimit * restartCounter;

    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    let stdoutText = '';
    if (stream.results[0] && stream.results[0].alternatives[0]) {
        stdoutText =
            correctedTime + ': ' + stream.results[0].alternatives[0].transcript;
    }

    if (stream.results[0].isFinal) {
        process.stdout.write(chalk.green(`${stdoutText}\n`));

        isFinalEndTime = resultEndTime;
        lastTranscriptWasFinal = true;
    } else {
        // Make sure transcript does not exceed console character length
        if (stdoutText.length > process.stdout.columns) {
            stdoutText =
                stdoutText.substring(0, process.stdout.columns - 4) + '...';
        }
        process.stdout.write(chalk.red(`${stdoutText}`));

        lastTranscriptWasFinal = false;
    }
};

const audioInputStreamTransform = new Writable({
    write(chunk, _, next) {
        if (newStream && lastAudioInput.length !== 0) {
            // Approximate math to calculate time of chunks
            const chunkTime = streamingLimit / lastAudioInput.length;
            if (chunkTime !== 0) {
                if (bridgingOffset < 0) {
                    bridgingOffset = 0;
                }
                if (bridgingOffset > finalRequestEndTime) {
                    bridgingOffset = finalRequestEndTime;
                }
                const chunksFromMS = Math.floor(
                    (finalRequestEndTime - bridgingOffset) / chunkTime
                );
                bridgingOffset = Math.floor(
                    (lastAudioInput.length - chunksFromMS) * chunkTime
                );

                for (let i = chunksFromMS; i < lastAudioInput.length; i++) {
                    recognizeStream.write(lastAudioInput[i]);
                }
            }
            newStream = false;
        }

        audioInput.push(chunk);

        if (recognizeStream) {
            recognizeStream.write(chunk);
        }

        next();
    },

    final() {
        if (recognizeStream) {
            recognizeStream.end();
        }
    },
});

function restartStream() {
    if (recognizeStream) {
        recognizeStream.end();
        recognizeStream.removeListener('data', speechCallback);
        recognizeStream = null;
    }
    if (resultEndTime > 0) {
        finalRequestEndTime = isFinalEndTime;
    }
    resultEndTime = 0;

    lastAudioInput = [];
    lastAudioInput = audioInput;

    restartCounter++;

    if (!lastTranscriptWasFinal) {
        process.stdout.write('\n');
    }
    process.stdout.write(
        chalk.yellow(`${streamingLimit * restartCounter}: RESTARTING REQUEST\n`)
    );

    newStream = true;

    startStream();
}

// startStream();

module.exports = {
    client
}