"""Speak one line for the promo video and report when each word is spoken.

usage: python tools/store-tts.py "<text>" <out.mp3>

Prints a JSON list of {"w", "start", "end"} (seconds into the clip). Uses Microsoft's Azure Speech service, which
licenses its voices for commercial use, when AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set (pip install
azure-cognitiveservices-speech). Without them it falls back to edge-tts, the Edge Read Aloud voice, whose terms do not
clearly cover commercial use.
"""
import json
import os
import sys

VOICE = "en-US-AndrewMultilingualNeural"


def azure(text, out):
    import azure.cognitiveservices.speech as speechsdk

    config = speechsdk.SpeechConfig(subscription=os.environ["AZURE_SPEECH_KEY"], region=os.environ["AZURE_SPEECH_REGION"])
    config.speech_synthesis_voice_name = VOICE
    config.set_speech_synthesis_output_format(speechsdk.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3)
    synth = speechsdk.SpeechSynthesizer(speech_config=config, audio_config=None)
    words = []

    def on_boundary(evt):
        if evt.boundary_type == speechsdk.SpeechSynthesisBoundaryType.Word:
            start = evt.audio_offset / 1e7
            words.append({"w": evt.text, "start": start, "end": start + evt.duration.total_seconds()})

    synth.synthesis_word_boundary.connect(on_boundary)
    result = synth.speak_text_async(text).get()
    if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
        details = result.cancellation_details
        sys.exit(f"Azure Speech failed: {details.reason} {details.error_details}")
    with open(out, "wb") as f:
        f.write(result.audio_data)
    return words


def edge(text, out):
    import asyncio
    import edge_tts

    async def run():
        words = []
        com = edge_tts.Communicate(text, VOICE, rate="+0%", boundary="WordBoundary")
        with open(out, "wb") as f:
            async for chunk in com.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    start = chunk["offset"] / 1e7
                    words.append({"w": chunk["text"], "start": start, "end": start + chunk["duration"] / 1e7})
        return words

    return asyncio.run(run())


if __name__ == "__main__":
    text, out = sys.argv[1], sys.argv[2]
    use_azure = os.environ.get("AZURE_SPEECH_KEY") and os.environ.get("AZURE_SPEECH_REGION")
    print(json.dumps((azure if use_azure else edge)(text, out)))
