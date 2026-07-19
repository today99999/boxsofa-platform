# Real Unboxing Social Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, review-first pipeline that analyzes BoxSofa unboxing videos and creates three 9:16 no-face candidate content packages with video, cover, captions, copy, and an audit report.

**Architecture:** A small Python package orchestrates FFprobe, FFmpeg, and OpenCV. It treats `D:\压缩沙发\沙发视频\mp4` as read-only, stores all state as JSON and Markdown under `D:\压缩沙发\沙发视频\自动化素材`, and separates analysis, edit decisions, rendering, and review packaging so each stage can be rerun independently.

**Tech Stack:** Python 3.12 standard library, OpenCV headless for face-risk detection, FFmpeg/FFprobe 8.x, unittest, JSON, Markdown.

## Global Constraints

- Never modify, move, rename, or delete files under `D:\压缩沙发\沙发视频\mp4`.
- Never replace a real person's face or identity.
- Generated work must remain in `review`; no task may publish to AiToEarn.
- Default output is H.264/AAC MP4 at 1080 x 1920, 30 fps, and 10 to 18 seconds.
- Every package must preserve source provenance and declare whether AI was used.
- Unknown source music is not presumed commercially licensed; trial renders use muted source audio.
- A platform-specific failure must not block outputs for compatible platforms.

---

## File Structure

- Create `scripts/social-assets/requirements.txt`: pinned media-analysis dependency.
- Create `scripts/social-assets/config.json`: source, output, branding, caption, and render defaults.
- Create `scripts/social-assets/social_assets/__init__.py`: package marker and version.
- Create `scripts/social-assets/social_assets/models.py`: typed records shared by all stages.
- Create `scripts/social-assets/social_assets/media.py`: FFprobe, frame extraction, fingerprinting, and command execution.
- Create `scripts/social-assets/social_assets/analyze.py`: technical and face-risk analysis.
- Create `scripts/social-assets/social_assets/edit.py`: deterministic segment selection and edit-plan generation.
- Create `scripts/social-assets/social_assets/render.py`: FFmpeg filter graph and final render.
- Create `scripts/social-assets/social_assets/package.py`: cover, SRT, `post.json`, and `report.md` creation.
- Create `scripts/social-assets/social_assets/cli.py`: `scan`, `analyze`, `render`, and `trial` commands.
- Create `scripts/social-assets/tests/`: unittest coverage for every module.
- Create `docs/SOCIAL-ASSET-OPERATIONS.md`: nontechnical operating instructions.

### Task 1: Configuration, Models, and Read-Only Scanner

**Files:**
- Create: `scripts/social-assets/config.json`
- Create: `scripts/social-assets/social_assets/__init__.py`
- Create: `scripts/social-assets/social_assets/models.py`
- Create: `scripts/social-assets/social_assets/media.py`
- Test: `scripts/social-assets/tests/test_media.py`

**Interfaces:**
- Produces: `load_config(path: Path) -> PipelineConfig`
- Produces: `probe_video(path: Path, ffprobe: str) -> VideoInfo`
- Produces: `fingerprint(path: Path) -> str`
- Produces: `scan_sources(config: PipelineConfig) -> list[VideoInfo]`

- [ ] **Step 1: Write scanner tests**

Create tests that use a temporary directory and a mocked command runner:

```python
def test_scan_sources_only_returns_mp4_and_sorts_by_name():
    config = make_config(source_dir=temp_dir)
    (temp_dir / "b.mp4").write_bytes(b"b")
    (temp_dir / "a.mp4").write_bytes(b"a")
    (temp_dir / "ignore.mov").write_bytes(b"x")
    with patch("social_assets.media.probe_video", side_effect=fake_probe):
        result = scan_sources(config)
    assert [item.source.name for item in result] == ["a.mp4", "b.mp4"]

def test_fingerprint_is_stable_and_changes_with_content():
    first = temp_dir / "first.mp4"
    second = temp_dir / "second.mp4"
    first.write_bytes(b"same")
    second.write_bytes(b"same")
    assert fingerprint(first) == fingerprint(second)
    second.write_bytes(b"different")
    assert fingerprint(first) != fingerprint(second)
```

- [ ] **Step 2: Run scanner tests and verify failure**

Run: `python -m unittest discover -s scripts/social-assets/tests -p "test_media.py" -v`

Expected: FAIL because `social_assets.media` does not exist.

- [ ] **Step 3: Implement configuration and scanner**

Use frozen dataclasses and JSON-safe conversion:

```python
@dataclass(frozen=True)
class PipelineConfig:
    source_dir: Path
    output_dir: Path
    ffmpeg: str
    ffprobe: str
    width: int = 1080
    height: int = 1920
    fps: int = 30
    min_duration: float = 10.0
    max_duration: float = 18.0

@dataclass(frozen=True)
class VideoInfo:
    asset_id: str
    source: Path
    fingerprint: str
    width: int
    height: int
    duration: float
    fps: float
    video_codec: str
    has_audio: bool
```

`probe_video` must invoke FFprobe with JSON output, validate that one video stream exists, and raise `MediaError` with the source filename on invalid media. `scan_sources` must use `Path.glob("*.mp4")`, sorted case-insensitively, and never open a source for writing.

- [ ] **Step 4: Run scanner tests and full source scan**

Run: `python -m unittest discover -s scripts/social-assets/tests -p "test_media.py" -v`

Expected: PASS.

Run: `python -m social_assets.cli scan --config scripts/social-assets/config.json`

Expected: reports 20 MP4 sources, 19 at 1080 x 1920 and one at 1080 x 1440.

- [ ] **Step 5: Commit scanner**

```powershell
git add scripts/social-assets/config.json scripts/social-assets/social_assets scripts/social-assets/tests/test_media.py
git commit -m "Add social video source scanner"
```

### Task 2: Frame Sampling and Face-Risk Analysis

**Files:**
- Create: `scripts/social-assets/requirements.txt`
- Create: `scripts/social-assets/social_assets/analyze.py`
- Test: `scripts/social-assets/tests/test_analyze.py`

**Interfaces:**
- Consumes: `PipelineConfig`, `VideoInfo`, `fingerprint`
- Produces: `sample_timestamps(duration: float, interval: float = 0.5) -> list[float]`
- Produces: `detect_face_risk(image_path: Path) -> list[FaceBox]`
- Produces: `analyze_video(info: VideoInfo, config: PipelineConfig) -> AnalysisResult`
- Produces: `write_analysis(result: AnalysisResult, root: Path) -> Path`

- [ ] **Step 1: Add failing timestamp and risk tests**

```python
def test_sample_timestamps_never_uses_first_or_last_half_second():
    assert sample_timestamps(3.0, 1.0) == [0.5, 1.5, 2.5]

def test_face_risk_marks_large_central_face_high():
    risk = classify_face_risk(
        frame_width=1080,
        frame_height=1920,
        faces=[FaceBox(x=390, y=500, width=300, height=300)],
    )
    assert risk == "high"

def test_no_faces_is_low_risk():
    assert classify_face_risk(1080, 1920, []) == "low"
```

- [ ] **Step 2: Run analysis tests and verify failure**

Run: `python -m unittest discover -s scripts/social-assets/tests -p "test_analyze.py" -v`

Expected: FAIL because `social_assets.analyze` does not exist.

- [ ] **Step 3: Implement frame and risk analysis**

Pin `opencv-python-headless==4.12.0.88`. Extract JPEG samples at 360-pixel width with FFmpeg. Use OpenCV's bundled frontal-face Haar cascade as a conservative risk signal. Store each sample as:

```python
@dataclass(frozen=True)
class FrameRisk:
    timestamp: float
    image: Path
    faces: tuple[FaceBox, ...]
    level: Literal["low", "medium", "high"]
```

Classify a frame as high when a detected face occupies at least 2 percent of the image or intersects the central 60 percent of the frame. Classify small edge faces as medium. Treat no detections as low, while the report explicitly states that detection is advisory and requires human review.

- [ ] **Step 4: Write analysis JSON and contact sheet**

`write_analysis` must create `analysis/<asset-id>/analysis.json`, sampled JPEGs, `contact-sheet.jpg`, and `report.md`. It must write to a temporary file and atomically replace only pipeline-owned outputs.

- [ ] **Step 5: Run tests and analyze three trial sources**

Run: `python -m unittest discover -s scripts/social-assets/tests -p "test_analyze.py" -v`

Expected: PASS.

Run: `python -m social_assets.cli analyze --config scripts/social-assets/config.json --files "3月23日.mp4" "5月12日.mp4" "5月28日.mp4"`

Expected: three analysis directories with JSON, contact sheets, and face-risk reports.

- [ ] **Step 6: Commit analyzer**

```powershell
git add scripts/social-assets/requirements.txt scripts/social-assets/social_assets/analyze.py scripts/social-assets/tests/test_analyze.py
git commit -m "Add social video risk analysis"
```

### Task 3: No-Face Edit Planner and Renderer

**Files:**
- Create: `scripts/social-assets/social_assets/edit.py`
- Create: `scripts/social-assets/social_assets/render.py`
- Test: `scripts/social-assets/tests/test_edit.py`
- Test: `scripts/social-assets/tests/test_render.py`

**Interfaces:**
- Consumes: `VideoInfo`, `AnalysisResult`, `PipelineConfig`
- Produces: `build_edit_plan(info: VideoInfo, analysis: AnalysisResult, config: PipelineConfig) -> EditPlan`
- Produces: `build_filter_graph(plan: EditPlan, config: PipelineConfig) -> str`
- Produces: `render_candidate(plan: EditPlan, config: PipelineConfig, output: Path) -> RenderResult`

- [ ] **Step 1: Write failing edit-plan tests**

```python
def test_plan_uses_only_low_risk_ranges_when_enough_exist():
    analysis = analysis_with_ranges(low=[(0.5, 4.0), (6.0, 12.5)], high=[(4.0, 6.0)])
    plan = build_edit_plan(video_info(duration=13.0), analysis, config())
    assert all(segment.risk == "low" for segment in plan.segments)
    assert 10.0 <= plan.output_duration <= 18.0

def test_plan_requires_review_when_face_free_ranges_are_too_short():
    analysis = analysis_with_ranges(low=[(0.5, 2.0)], high=[(2.0, 12.0)])
    plan = build_edit_plan(video_info(duration=12.5), analysis, config())
    assert plan.status == "manual_review"
    assert plan.segments == ()
```

- [ ] **Step 2: Run planner tests and verify failure**

Run: `python -m unittest discover -s scripts/social-assets/tests -p "test_edit.py" -v`

Expected: FAIL because `social_assets.edit` does not exist.

- [ ] **Step 3: Implement conservative segment planning**

Group adjacent low-risk samples into ranges, trim 0.15 seconds from each boundary, discard ranges shorter than 0.8 seconds, and preserve chronological order. Prefer one opening range, one expansion range from the middle, and one finished-product range from the final third. Do not use medium or high-risk ranges automatically. Return `manual_review` if selected duration is below 8 seconds.

- [ ] **Step 4: Write failing renderer tests**

```python
def test_vertical_source_uses_cover_crop_without_stretching():
    graph = build_filter_graph(vertical_plan(), config())
    assert "scale=1080:1920:force_original_aspect_ratio=increase" in graph
    assert "crop=1080:1920" in graph
    assert "setsar=1" in graph

def test_renderer_mutes_unknown_source_audio():
    command = build_ffmpeg_command(plan(), config(), Path("video.mp4"))
    assert "-an" in command
```

- [ ] **Step 5: Implement FFmpeg rendering**

For each selected segment, trim and reset timestamps, apply aspect-preserving scale and center crop, concatenate segments, render burned-in English text within the safe middle 70 percent, and append a 1.8-second BoxSofa end card. Encode with `libx264`, `-crf 20`, `-preset medium`, `yuv420p`, 30 fps, faststart, and no source audio.

- [ ] **Step 6: Run edit and render tests**

Run: `python -m unittest discover -s scripts/social-assets/tests -p "test_edit.py" -v`

Expected: PASS.

Run: `python -m unittest discover -s scripts/social-assets/tests -p "test_render.py" -v`

Expected: PASS.

- [ ] **Step 7: Commit planner and renderer**

```powershell
git add scripts/social-assets/social_assets/edit.py scripts/social-assets/social_assets/render.py scripts/social-assets/tests/test_edit.py scripts/social-assets/tests/test_render.py
git commit -m "Render review-first unboxing videos"
```

### Task 4: Review Package, CLI, and Three-Video Trial

**Files:**
- Create: `scripts/social-assets/social_assets/package.py`
- Create: `scripts/social-assets/social_assets/cli.py`
- Create: `scripts/social-assets/tests/test_package.py`
- Create: `scripts/social-assets/tests/test_cli.py`
- Create: `docs/SOCIAL-ASSET-OPERATIONS.md`
- Modify: `docs/PROJECT-CONTEXT-COMPACT.md`

**Interfaces:**
- Consumes: all prior stage interfaces.
- Produces: `create_review_package(render: RenderResult, plan: EditPlan, config: PipelineConfig) -> ReviewPackage`
- Produces CLI commands: `scan`, `analyze`, `render`, `trial`.

- [ ] **Step 1: Write failing package tests**

```python
def test_review_package_contains_required_files():
    package = create_review_package(render_result(), edit_plan(), config())
    assert {p.name for p in package.directory.iterdir()} == {
        "video.mp4", "cover.jpg", "captions.srt", "post.json", "report.md"
    }

def test_post_json_is_review_only_and_preserves_source():
    data = json.loads((package.directory / "post.json").read_text(encoding="utf-8"))
    assert data["status"] == "review"
    assert data["source"]["path"].endswith("3月23日.mp4")
    assert data["ai_used"] is False
```

- [ ] **Step 2: Run package tests and verify failure**

Run: `python -m unittest discover -s scripts/social-assets/tests -p "test_package.py" -v`

Expected: FAIL because `social_assets.package` does not exist.

- [ ] **Step 3: Implement review package creation**

Create a cover from the final product segment, write an SRT containing the same claims used in the burned-in text, and generate this default organic copy:

```json
{
  "status": "review",
  "route": "real",
  "ai_used": false,
  "title": "From Compact Package to Full-Size Comfort",
  "body": "Unwrap it, let it expand, and enjoy full-size comfort without bulky delivery. Discover more at boxsofa.eu.",
  "hashtags": ["#BoxSofa", "#CompressedSofa", "#SofaInABox", "#ModernLiving"],
  "recommended_platforms": ["instagram", "tiktok", "youtube"]
}
```

The report must state source, duration, output specs, face-risk result, muted-audio decision, product consistency check required, and a three-choice review result: approve, revise, or reject.

- [ ] **Step 4: Implement CLI and idempotency tests**

`trial` accepts exact filenames and refuses to regenerate an existing package unless `--force` is supplied. It returns exit code 0 when all packages are created, 2 when any source needs manual review, and 1 for technical failures.

Run: `python -m unittest discover -s scripts/social-assets/tests -p "test_cli.py" -v`

Expected: PASS.

- [ ] **Step 5: Run complete test suite**

Run: `python -m unittest discover -s scripts/social-assets/tests -v`

Expected: all tests PASS.

- [ ] **Step 6: Generate three trial review packages**

Run:

```powershell
python -m social_assets.cli trial --config scripts/social-assets/config.json --files "3月23日.mp4" "5月12日.mp4" "5月28日.mp4"
```

Expected: three package directories under `D:\压缩沙发\沙发视频\自动化素材\review`, or a clearly documented `manual_review` result for any source that cannot provide at least 8 seconds of low-risk footage.

- [ ] **Step 7: Verify rendered media**

For every generated `video.mp4`, run FFprobe and assert H.264, 1080 x 1920, 30 fps, and 10 to 18 seconds. Extract first, middle, and final frames and visually verify no black frames, stretching, face exposure, subtitle overlap, or product mismatch.

- [ ] **Step 8: Write operating guide and update project context**

Document where to add sources, how to run a trial, how to read reports, how to approve or reject packages, and that publishing remains separate. Record the three trial results in `PROJECT-CONTEXT-COMPACT.md`.

- [ ] **Step 9: Commit trial pipeline**

```powershell
git add scripts/social-assets docs/SOCIAL-ASSET-OPERATIONS.md docs/PROJECT-CONTEXT-COMPACT.md
git commit -m "Add review-first social asset pipeline"
```
