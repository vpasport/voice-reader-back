"use strict";

require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const { Server } = require('socket.io');
const { appendFileSync } = require('fs');
const speech = require('@google-cloud/speech').v1p1beta1;

const { speechToText } = require('./src/utils/speechToText');

const server = express();

server.use(
    cors({
        origin: true,
        credentials: true
    })
)
server.use(bodyParser.urlencoded({ extended: false }))
server.use(bodyParser.json());


server.post('/translate', multer().single('audio'), async (
    {
        file,
        body: {
            languageCode,
            audioChannelCount,
            sampleRateHertz,
            encoding
        }
    },
    res
) => {
    const results = await speechToText(file, {
        languageCode,
        audioChannelCount,
        sampleRateHertz,
        encoding
    });

    res.json({ results });
})

const httpServer = http.createServer(server).listen(process.env.PORT, () => {
    console.log(`Server starting on port ${process.env.PORT}`);
})

const io = new Server(httpServer);

const client = new speech.SpeechClient({
    keyFile: './key.json'
});

const options = {
    config: {
        languageCode: 'ru-RU',
        audioChannelCount: 1,
        sampleRateHertz: 48000,
        encoding: 'WEBM_OPUS',
        enableAutomaticPunctuation: true,
        model: 'default'
    },
    interimResults: true
}

const streamingLimit = 29000;

io.on('connection', (socket) => {
    console.log(`connected with ${socket.id}`);
    let recognizeStream = client.streamingRecognize(options);

    recognizeStream.addListener("data", (response) => socket.emit('voice-response', response));
    recognizeStream.addListener("error", () => {
        if (err.code === 11) restartStream();
        console.error("err:", err);
    });
    recognizeStream.addListener("end", () => console.info("[EVENT] End connection"));
    recognizeStream.addListener("close", () => console.info("[EVENT] Close connection"));

    const createStream = () => {
        console.info(`create steam for ${socket.id}`);
        recognizeStream = client.streamingRecognize(options);
    };

    const closeStream = () => {
        console.info(`close stream for ${socket.id}`);
        recognizeStream.end(createStream);
        recognizeStream = null;
    };

    const restartStream = () => {
        console.info(`restarting stream for ${socket.id}`);
        closeStream();
    };

    const intervalId = setInterval(restartStream, streamingLimit);

    socket.on('disconnect', () => {
        console.log(`disonnected with ${socket.id}`);
        closeStream();
        clearInterval(intervalId);
    });

    socket.on('voice', (options) => {
        if (recognizeStream) {
            recognizeStream.write(options.blob, undefined, (err) => {
                if (err) console.error(err);
            });
        }
    })
})