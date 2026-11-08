#!/usr/bin/env bash
# Builds output/attempt47_short.mp4 from code only: three.js scene -> frames, numpy -> audio, ffmpeg -> mp4.
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules/three ] || npm install
rm -rf build/frames && mkdir -p build output
# render the 885 frames (29.5 s @ 30 fps) in 3 parallel workers
node src/render.mjs --from 0 --to 295 & node src/render.mjs --from 295 --to 590 & node src/render.mjs --from 590 --to 885 & wait
python3 src/audio.py
ffmpeg -loglevel error -y -framerate 30 -i build/frames/%05d.jpg -i build/audio.wav \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart \
  output/attempt47_short.mp4
echo "-> output/attempt47_short.mp4"
