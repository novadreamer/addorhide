import asyncio, json, sys
import edge_tts
async def main(text, out):
    words = []
    com = edge_tts.Communicate(text, "en-US-AndrewMultilingualNeural", rate="+0%", boundary="WordBoundary")
    with open(out, "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"w": chunk["text"], "start": chunk["offset"] / 1e7, "end": (chunk["offset"] + chunk["duration"]) / 1e7})
    print(json.dumps(words))
asyncio.run(main(sys.argv[1], sys.argv[2]))
