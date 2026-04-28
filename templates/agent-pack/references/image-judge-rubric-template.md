# Image Judge Rubric Template

Use multimodal judges for quality dimensions that deterministic image checks cannot capture. Keep deterministic gates for file existence, MIME type, dimensions, file size, blankness, and duplicate detection.

Provider notes:

- Codex SDK receives generated/reference images as `local_image` input entries.
- Claude Agent SDK receives generated/reference image paths and can inspect them with the `Read` tool.
- OpenRouter receives generated/reference images as base64 `image_url` content parts when API-backed judging is explicitly configured.

## Prompt Adherence

- High: The image clearly follows the requested subject, attributes, setting, and constraints.
- Medium: The main subject is correct, but one or two secondary details are missing or weak.
- Low: The subject, requested attributes, or main instruction are materially wrong.

## Subject Correctness

- High: People, products, UI states, text objects, or scene elements are recognizable and consistent with the dataset example.
- Medium: The subject is recognizable but has minor distortions or missing details.
- Low: The subject is unrecognizable, swapped, or inconsistent with the prompt/reference.

## Composition

- High: Framing, scale, hierarchy, and negative space support the intended use.
- Medium: Composition is usable but awkward, crowded, or slightly off-center.
- Low: Important content is cropped, occluded, tiny, or visually incoherent.

## Style Match

- High: Style, palette, lighting, and rendering match the requested direction or reference image.
- Medium: Style is close but inconsistent in some visible areas.
- Low: Style is unrelated to the request or reference.

## Visual Defects

- High: No obvious artifacts, malformed anatomy, warped objects, or texture failures.
- Medium: Minor artifacts are visible but do not block use.
- Low: Defects are prominent enough to make the image unsuitable.

## Text Rendering

- High: Required text is present, legible, spelled correctly, and placed appropriately.
- Medium: Text is mostly legible with small errors or layout issues.
- Low: Required text is absent, unreadable, misspelled, or nonsensical.

## Safety And Content Fit

- High: The image avoids unsafe, disallowed, misleading, or off-brand content.
- Medium: Mild concerns need human review before use.
- Low: The image should be rejected for safety, policy, or brand-fit reasons.

## Reference Similarity

- High: Preserves the reference image's required identity, layout, product details, or visual constraints.
- Medium: Similar at a high level but misses some required reference details.
- Low: Does not meaningfully match the reference.

## Output Contract

Return only JSON:

```json
{
  "score": 0.0,
  "passed": false,
  "rationale": "One concise paragraph explaining the score.",
  "confidence": 0.0,
  "metadata": {
    "prompt_adherence": 0.0,
    "subject_correctness": 0.0,
    "composition": 0.0,
    "style_match": 0.0,
    "visual_defects": 0.0,
    "text_rendering": 0.0,
    "safety_content_fit": 0.0,
    "reference_similarity": 0.0
  }
}
```
