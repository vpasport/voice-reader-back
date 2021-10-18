const speech = require('@google-cloud/speech').v1p1beta1;

const client = new speech.SpeechClient({
    keyFile: './key.json'
});

speechToText = async (
    file,
    options = {
        languageCode: 'ru-RU',
        audioChannelCount: 2,
        sampleRateHertz: 44100,
        encoding: 'ENCODING_UNSPECIFIED'
    }
) => {
    const [response] = await client.recognize({
        audio: {
            content: file.buffer.toString('base64')
        },
        config: {
            encoding: options.encoding,
            sampleRateHertz: options.sampleRateHertz,
            languageCode: options.languageCode,
            audioChannelCount: options.audioChannelCount,
            enableAutomaticPunctuation: true,
            model: 'default'
        }
    });
    
    return response;
}

module.exports = {
    speechToText
}