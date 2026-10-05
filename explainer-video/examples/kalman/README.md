# Worked example: Kalman filters (10.2 min, 9 scenes)

The video this skill was distilled from. Read a scene or two for style before writing your own.

To render it:
```
cp -R ~/.claude/skills/explainer-video/examples/kalman ~/Videos/kalman && cd ~/Videos/kalman
cp ~/.claude/skills/explainer-video/kit/{vkit.py,tts.py,render.sh,qa.py,assemble.py} . && chmod +x render.sh
./render.sh          # preview; ./render.sh h for 1080p60
```
- `sim.py` simulates the cart and runs the scalar filter; the demo's statistics come from it (seed 25 was chosen
  because its truth-in-2σ rate is the expected 95%).
- Highlights: s3 (pointwise product scan), s7 (shearing point cloud with identity-preserving refactorisation),
  s8 (1-D twin table).
