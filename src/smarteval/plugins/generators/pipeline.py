from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from smarteval.core.models import Artifact, ArtifactRef, Case, PipelineManifest
from smarteval.plugins.base import Generator
from smarteval.plugins.registry import load_callable


class PipelineManifestError(ValueError):
    """Raised when an external pipeline returns an invalid manifest."""


class PipelineGenerator(Generator):
    name = "pipeline"

    def generate(self, case: Case, params: dict[str, Any]) -> Artifact:
        target = params.get("callable", self.settings.get("callable"))
        if target is None:
            raise ValueError("pipeline generator requires a callable")

        primary_output = params.get("primary_output")
        if not primary_output:
            raise ValueError("pipeline generator requires params['primary_output']")

        runner = load_callable(target)
        manifest_result = runner(case=case, params=params)
        manifest, manifest_path = self._coerce_manifest(manifest_result)

        if manifest.status != "success":
            raise PipelineManifestError(manifest.error or "pipeline run failed")

        if primary_output not in manifest.outputs:
            raise PipelineManifestError(
                f"manifest is missing configured primary output {primary_output!r}"
            )

        selected_ref = manifest.outputs[primary_output]
        payload = self._materialize_ref(selected_ref, manifest, manifest_path)
        attachments = {
            name: ref for name, ref in manifest.outputs.items() if name != primary_output
        }

        return Artifact(
            kind=selected_ref.kind,
            payload=payload,
            attachments=attachments,
            source_manifest=str(manifest_path) if manifest_path else None,
            source_run_dir=manifest.source_run_dir,
            metadata={"pipeline_name": manifest.pipeline_name, **manifest.metadata},
        )

    def _coerce_manifest(
        self, manifest_result: PipelineManifest | dict[str, Any] | str | Path
    ) -> tuple[PipelineManifest, Path | None]:
        if isinstance(manifest_result, PipelineManifest):
            return manifest_result, None
        if isinstance(manifest_result, dict):
            return PipelineManifest.model_validate(manifest_result), None
        if isinstance(manifest_result, (str, Path)):
            manifest_path = Path(manifest_result)
            with manifest_path.open("r", encoding="utf-8") as handle:
                raw = json.load(handle)
            return PipelineManifest.model_validate(raw), manifest_path.resolve()
        raise TypeError("pipeline callable must return a manifest dict, model, or JSON path")

    def _materialize_ref(
        self,
        ref: ArtifactRef,
        manifest: PipelineManifest,
        manifest_path: Path | None,
    ) -> Any:
        resolved_path = self._resolve_path(ref.uri, manifest_path, manifest.source_run_dir)
        if ref.kind == "path":
            return str(resolved_path)
        if ref.kind == "text":
            return resolved_path.read_text(encoding="utf-8")
        if ref.kind == "json":
            with resolved_path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        raise PipelineManifestError(f"unsupported artifact ref kind {ref.kind!r}")

    def _resolve_path(
        self,
        uri: str,
        manifest_path: Path | None,
        source_run_dir: str | None,
    ) -> Path:
        path = Path(uri)
        if path.is_absolute():
            return path
        if manifest_path is None:
            if source_run_dir is not None:
                return (Path(source_run_dir) / path).resolve()
            return path
        return (manifest_path.parent / path).resolve()
